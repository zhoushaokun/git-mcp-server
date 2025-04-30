import { z } from 'zod';
import { promisify } from 'util';
import { exec } from 'child_process';
import { logger } from '../../../utils/logger.js';
import { RequestContext } from '../../../utils/requestContext.js';
import { McpError, BaseErrorCode } from '../../../types-global/errors.js';
import { sanitization } from '../../../utils/sanitization.js';
import path from 'path'; // Import path module

const execAsync = promisify(exec);

// Define the input schema for the git_add tool using Zod
export const GitAddInputSchema = z.object({
  path: z.string().min(1).optional().default('.').describe("Path to the Git repository. Defaults to the session's working directory if set via `git_set_working_dir`, otherwise defaults to the server's current working directory (`.`)."),
  files: z.union([
    z.string().min(1),
    z.array(z.string().min(1))
  ]).default('.').describe('Files or patterns to stage, defaults to all changes (\'.\')'),
});

// Infer the TypeScript type from the Zod schema
export type GitAddInput = z.infer<typeof GitAddInputSchema>;

// Define the structure for the JSON output
export interface GitAddResult {
  success: boolean;
  statusMessage: string; // Renamed from 'message' for consistency
  filesStaged: string[] | string; // Record what was attempted to be staged
}


/**
 * Executes the 'git add' command and returns structured JSON output.
 *
 * @param {GitAddInput} input - The validated input object.
 * @param {RequestContext} context - The request context for logging and error handling.
 * @returns {Promise<GitAddResult>} A promise that resolves with the structured add result.
 * @throws {McpError} Throws an McpError if path resolution or validation fails, or if the git command fails unexpectedly.
 */
export async function addGitFiles(
  input: GitAddInput,
  context: RequestContext & { sessionId?: string; getWorkingDirectory: () => string | undefined } // Add getter to context
): Promise<GitAddResult> {
  const operation = 'addGitFiles';
  logger.debug(`Executing ${operation}`, { ...context, input });

  let targetPath: string;
  try {
    // Resolve the target path
    if (input.path && input.path !== '.') {
      targetPath = input.path;
      logger.debug(`Using provided path: ${targetPath}`, { ...context, operation });
    } else {
      const workingDir = context.getWorkingDirectory();
      if (!workingDir) {
        throw new McpError(BaseErrorCode.VALIDATION_ERROR, "No path provided and no working directory set for the session.", { context, operation });
      }
      targetPath = workingDir;
      logger.debug(`Using session working directory: ${targetPath}`, { ...context, operation, sessionId: context.sessionId });
    }

    // Sanitize the resolved path
    const sanitizedPath = sanitization.sanitizePath(targetPath);
    logger.debug('Sanitized repository path', { ...context, operation, sanitizedPath });
    targetPath = sanitizedPath; // Use the sanitized path going forward

  } catch (error) {
    logger.error('Path resolution or sanitization failed', { ...context, operation, error });
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Invalid path: ${error instanceof Error ? error.message : String(error)}`, { context, operation, originalError: error });
  }

  // Prepare the files argument for the command, ensuring proper quoting
  let filesArg: string;
  const filesToStage = input.files; // Keep original for reporting
  try {
    if (Array.isArray(filesToStage)) {
      if (filesToStage.length === 0) {
        logger.warning('Empty array provided for files, defaulting to staging all changes.', { ...context, operation });
        filesArg = '.'; // Default to staging all if array is empty
      } else {
        // Quote each file path individually
        filesArg = filesToStage.map(file => {
          const sanitizedFile = file.startsWith('-') ? `./${file}` : file; // Prefix with './' if it starts with a dash
          return `"${sanitizedFile.replace(/"/g, '\\"')}"`; // Escape quotes within path
        }).join(' ');
      }
    } else { // Single string case
      const sanitizedFile = filesToStage.startsWith('-') ? `./${filesToStage}` : filesToStage; // Prefix with './' if it starts with a dash
      filesArg = `"${sanitizedFile.replace(/"/g, '\\"')}"`;
    }
  } catch (err) {
     logger.error('File path validation/quoting failed', { ...context, operation, files: filesToStage, error: err });
     throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Invalid file path/pattern provided: ${err instanceof Error ? err.message : String(err)}`, { context, operation, originalError: err });
  }

  // This check should ideally not be needed now due to the logic above
  if (!filesArg) {
     logger.error('Internal error: filesArg is unexpectedly empty after processing.', { ...context, operation });
     throw new McpError(BaseErrorCode.INTERNAL_ERROR, 'Internal error preparing git add command.', { context, operation });
  }


  try {
    // Use the resolved targetPath
    const command = `git -C "${targetPath}" add -- ${filesArg}`;
    logger.debug(`Executing command: ${command}`, { ...context, operation });

    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      // Log stderr as warning, as 'git add' can produce warnings but still succeed.
      logger.warning(`Git add command produced stderr`, { ...context, operation, stderr });
    }

    logger.info(`${operation} executed successfully`, { ...context, operation, path: targetPath, files: filesToStage });
    const filesAddedDesc = Array.isArray(filesToStage) ? filesToStage.join(', ') : filesToStage;
    const reminder = "Remember to write clear, concise commit messages using the Conventional Commits format (e.g., 'feat(scope): subject').";
    // Use statusMessage and add reminder
    return {
        success: true,
        statusMessage: `Successfully staged: ${filesAddedDesc}. ${reminder}`,
        filesStaged: filesToStage
    };
  } catch (error: any) {
    logger.error(`Failed to execute git add command`, { ...context, operation, path: targetPath, error: error.message, stderr: error.stderr });

    const errorMessage = error.stderr || error.message || '';
    if (errorMessage.toLowerCase().includes('not a git repository')) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`, { context, operation, originalError: error });
    }
    if (errorMessage.toLowerCase().includes('did not match any files')) {
       // Still throw an error, but return structured info in the catch block of the registration
       throw new McpError(BaseErrorCode.NOT_FOUND, `Specified files/patterns did not match any files in ${targetPath}: ${filesArg}`, { context, operation, originalError: error, filesStaged: filesToStage });
    }

    // Throw generic error for other cases
     throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Failed to stage files for path: ${targetPath}. Error: ${errorMessage}`, { context, operation, originalError: error, filesStaged: filesToStage });
  }
}
