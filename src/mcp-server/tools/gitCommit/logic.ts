import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger } from '../../../utils/logger.js';
import { RequestContext } from '../../../utils/requestContext.js';
import { sanitization } from '../../../utils/sanitization.js';

const execAsync = promisify(exec);

// Define the input schema for the git_commit tool using Zod
export const GitCommitInputSchema = z.object({
  path: z.string().min(1).optional().default('.').describe("Path to the Git repository. Defaults to the session's working directory if set via `git_set_working_dir`, otherwise defaults to the server's current working directory (`.`)."),
  message: z.string().min(1).describe('Commit message. Follow Conventional Commits format: `type(scope): subject`. Example: `feat(api): add user signup endpoint`'),
  author: z.object({
    name: z.string().describe('Author name for the commit'),
    email: z.string().email().describe('Author email for the commit'),
  }).optional().describe('Overrides the commit author information (name and email). Use only when necessary (e.g., applying external patches).'),
  allowEmpty: z.boolean().default(false).describe('Allow creating empty commits'),
  amend: z.boolean().default(false).describe('Amend the previous commit instead of creating a new one'),
});

// Infer the TypeScript type from the Zod schema
export type GitCommitInput = z.infer<typeof GitCommitInputSchema>;

// Define the structure for the JSON output
export interface GitCommitResult {
  success: boolean;
  statusMessage: string; // Renamed from 'message' for clarity
  commitHash?: string; // Include hash on success
  nothingToCommit?: boolean; // Flag for specific non-error cases
}

/**
 * Executes the 'git commit' command and returns structured JSON output.
 *
 * @param {GitCommitInput} input - The validated input object.
 * @param {RequestContext} context - The request context for logging and error handling.
 * @returns {Promise<GitCommitResult>} A promise that resolves with the structured commit result.
 * @throws {McpError} Throws an McpError if path resolution or validation fails, or if the git command fails unexpectedly.
 */
export async function commitGitChanges(
  input: GitCommitInput,
  context: RequestContext & { sessionId?: string; getWorkingDirectory: () => string | undefined } // Add getter to context
): Promise<GitCommitResult> {
  const operation = 'commitGitChanges';
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
    logger.debug('Sanitized path', { ...context, operation, sanitizedPath });
    targetPath = sanitizedPath; // Use the sanitized path going forward

  } catch (error) {
    logger.error('Path resolution or sanitization failed', { ...context, operation, error });
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Invalid path: ${error instanceof Error ? error.message : String(error)}`, { context, operation, originalError: error });
  }

  try {
    // Construct the git commit command using the resolved targetPath
    let command = `git -C "${targetPath}" commit -m "${input.message.replace(/"/g, '\\"')}"`; // Escape double quotes

    if (input.allowEmpty) {
      command += ' --allow-empty';
    }
    if (input.amend) {
      command += ' --amend --no-edit';
    }
    if (input.author) {
      // Ensure author details are properly escaped if needed, though exec usually handles this
      command = `git -C "${targetPath}" -c user.name="${input.author.name.replace(/"/g, '\\"')}" -c user.email="${input.author.email.replace(/"/g, '\\"')}" commit -m "${input.message.replace(/"/g, '\\"')}"`;
      if (input.allowEmpty) command += ' --allow-empty';
      if (input.amend) command += ' --amend --no-edit';
    }

    logger.debug(`Executing command: ${command}`, { ...context, operation });

    const { stdout, stderr } = await execAsync(command);

    // Check stderr first for common non-error messages
    if (stderr) {
      if (stderr.includes('nothing to commit, working tree clean') || stderr.includes('no changes added to commit')) {
         const msg = stderr.includes('nothing to commit') ? 'Nothing to commit, working tree clean.' : 'No changes added to commit.';
         logger.info(msg, { ...context, operation, path: targetPath });
         // Use statusMessage
         return { success: true, statusMessage: msg, nothingToCommit: true };
      }
      // Log other stderr as warning but continue, as commit might still succeed
      logger.warning(`Git commit command produced stderr`, { ...context, operation, stderr });
    }

    // Extract commit hash (more robustly)
    let commitHash: string | undefined = undefined;
    const hashMatch = stdout.match(/([a-f0-9]{7,40})/); // Look for typical short or long hash
    if (hashMatch) {
        commitHash = hashMatch[1];
    } else {
        // Fallback parsing if needed, or rely on success message
        logger.warning('Could not parse commit hash from stdout', { ...context, operation, stdout });
    }

    // Use statusMessage
    const statusMsg = commitHash
        ? `Commit successful: ${commitHash}`
        : `Commit successful (stdout: ${stdout.trim()})`;

    logger.info(`${operation} executed successfully`, { ...context, operation, path: targetPath, commitHash });
    return {
        success: true,
        statusMessage: statusMsg,
        commitHash: commitHash
    };

  } catch (error: any) {
    logger.error(`Failed to execute git commit command`, { ...context, operation, path: targetPath, error: error.message, stderr: error.stderr });

    const errorMessage = error.stderr || error.message || '';

    // Handle specific error cases first
    if (errorMessage.toLowerCase().includes('not a git repository')) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`, { context, operation, originalError: error });
    }
    if (errorMessage.includes('nothing to commit') || errorMessage.includes('no changes added to commit')) {
       // This might happen if git exits with error despite these messages
       const msg = errorMessage.includes('nothing to commit') ? 'Nothing to commit, working tree clean.' : 'No changes added to commit.';
       logger.info(msg + ' (caught as error)', { ...context, operation, path: targetPath, errorMessage });
       // Return success=false but indicate the reason using statusMessage
       return { success: false, statusMessage: msg, nothingToCommit: true };
    }
    if (errorMessage.includes('conflicts')) {
       throw new McpError(BaseErrorCode.CONFLICT, `Commit failed due to unresolved conflicts in ${targetPath}`, { context, operation, originalError: error });
    }

    // Generic internal error for other failures
    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Failed to commit changes for path: ${targetPath}. Error: ${errorMessage}`, { context, operation, originalError: error });
  }
}
