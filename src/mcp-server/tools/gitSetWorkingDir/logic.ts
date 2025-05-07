import { exec } from 'child_process';
import fs from 'fs/promises';
import { promisify } from 'util';
import { z } from 'zod';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js'; // Direct import for types-global
import { RequestContext, logger, sanitization } from '../../../utils/index.js'; // RequestContext (./utils/internal/requestContext.js), logger (./utils/internal/logger.js), sanitization (./utils/security/sanitization.js)

const execAsync = promisify(exec);

// Define the Zod schema for input validation
export const GitSetWorkingDirInputSchema = z.object({
  path: z.string().min(1, "Path cannot be empty.").describe("The absolute path to set as the default working directory for the current session. Set this before using other git_* tools."),
  validateGitRepo: z.boolean().default(true).describe("Whether to validate that the path is a Git repository"),
});

// Infer the TypeScript type from the Zod schema
export type GitSetWorkingDirInput = z.infer<typeof GitSetWorkingDirInputSchema>;

// Define the TypeScript interface for the result
export interface GitSetWorkingDirResult {
  success: boolean;
  message: string;
  path: string;
}

/**
 * Logic for the git_set_working_dir tool.
 * Sets a global working directory path for the current session.
 * Validates the path and optionally checks if it's a Git repository.
 *
 * @param {GitSetWorkingDirInput} input - The validated input arguments.
 * @param {RequestContext} context - The request context, potentially containing session ID.
 * @returns {Promise<GitSetWorkingDirResult>} The result of the operation.
 * @throws {McpError} Throws McpError for validation failures or operational errors.
 */
export async function gitSetWorkingDirLogic(
  input: GitSetWorkingDirInput,
  context: RequestContext & { sessionId?: string; setWorkingDirectory: (path: string) => void } // Assuming context provides session info and setter
): Promise<GitSetWorkingDirResult> {
  const operation = 'gitSetWorkingDirLogic';
  logger.info('Executing git_set_working_dir logic', { ...context, operation, inputPath: input.path });

  let sanitizedPath: string;
  try {
    // Sanitize the path. Must explicitly allow absolute paths for this tool.
    // It normalizes and checks for traversal issues.
    sanitizedPath = sanitization.sanitizePath(input.path, { allowAbsolute: true });
    logger.debug(`Sanitized path: ${sanitizedPath}`, { ...context, operation });
  } catch (error: any) {
    logger.error('Path sanitization failed', error, { ...context, operation });
    if (error instanceof McpError) throw error;
    throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Invalid path provided: ${error.message}`, { context, operation });
  }

  // Check if the directory exists
  try {
    const stats = await fs.stat(sanitizedPath);
    if (!stats.isDirectory()) {
      throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Path is not a directory: ${sanitizedPath}`, { context, operation });
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Directory does not exist: ${sanitizedPath}`, { context, operation });
    }
    logger.error('Failed to stat directory', error, { ...context, operation, path: sanitizedPath });
    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Failed to access path: ${error.message}`, { context, operation });
  }

  // Optionally validate if it's a Git repository
  if (input.validateGitRepo) {
    logger.debug('Validating if path is a Git repository', { ...context, operation, path: sanitizedPath });
    try {
      // A common way to check is using 'git rev-parse --is-inside-work-tree'
      // or checking for the existence of a .git directory/file.
      // Using rev-parse is generally more robust.
      const { stdout } = await execAsync('git rev-parse --is-inside-work-tree', { cwd: sanitizedPath });
      if (stdout.trim() !== 'true') {
        // This case should ideally not happen if rev-parse succeeds, but good to check.
        throw new Error('Not a Git repository (rev-parse returned non-true)');
      }
      logger.debug('Path validated as Git repository', { ...context, operation, path: sanitizedPath });
    } catch (error: any) {
      logger.warning('Path is not a valid Git repository', { ...context, operation, path: sanitizedPath, error: error.message });
      throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Path is not a valid Git repository: ${sanitizedPath}. Error: ${error.message}`, { context, operation });
    }
  }

  // --- Update Session State ---
  // This part needs access to the session state mechanism defined in server.ts
  // We assume the context provides a way to set the working directory for the current session.
  try {
    context.setWorkingDirectory(sanitizedPath);
    logger.info(`Working directory set for session ${context.sessionId || 'stdio'} to: ${sanitizedPath}`, { ...context, operation });
  } catch (error: any) {
     logger.error('Failed to set working directory in session state', error, { ...context, operation });
     // This indicates an internal logic error in how state is passed/managed.
     throw new McpError(BaseErrorCode.INTERNAL_ERROR, 'Failed to update session state.', { context, operation });
  }


  return {
    success: true,
    message: `Working directory set to: ${sanitizedPath}`,
    path: sanitizedPath,
  };
}
