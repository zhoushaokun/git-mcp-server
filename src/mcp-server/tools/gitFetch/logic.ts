import { z } from 'zod';
import { promisify } from 'util';
import { exec } from 'child_process';
import { logger } from '../../../utils/logger.js';
import { RequestContext } from '../../../utils/requestContext.js';
import { McpError, BaseErrorCode } from '../../../types-global/errors.js';
import { sanitization } from '../../../utils/sanitization.js';

const execAsync = promisify(exec);

// Define the input schema for the git_fetch tool using Zod
export const GitFetchInputSchema = z.object({
  path: z.string().min(1).optional().default('.').describe("Path to the Git repository. Defaults to the session's working directory if set."),
  remote: z.string().optional().describe("The remote repository to fetch from (e.g., 'origin'). If omitted, fetches from 'origin' or the default configured remote."),
  prune: z.boolean().optional().default(false).describe("Before fetching, remove any remote-tracking references that no longer exist on the remote."),
  tags: z.boolean().optional().default(false).describe("Fetch all tags from the remote (in addition to whatever else is fetched)."),
  all: z.boolean().optional().default(false).describe("Fetch all remotes."),
  // Add options like --depth, specific refspecs if needed
});

// Infer the TypeScript type from the Zod schema
export type GitFetchInput = z.infer<typeof GitFetchInputSchema>;

// Define the structure for the JSON output
export interface GitFetchResult {
  success: boolean;
  message: string; // Status message (e.g., "Fetch successful", "Fetched N objects")
  summary?: string; // More detailed summary if available (e.g., branch updates)
}

/**
 * Executes the 'git fetch' command and returns structured JSON output.
 *
 * @param {GitFetchInput} input - The validated input object.
 * @param {RequestContext} context - The request context for logging and error handling.
 * @returns {Promise<GitFetchResult>} A promise that resolves with the structured fetch result.
 * @throws {McpError} Throws an McpError if path resolution, validation, or the git command fails unexpectedly.
 */
export async function fetchGitRemote(
  input: GitFetchInput,
  context: RequestContext & { sessionId?: string; getWorkingDirectory: () => string | undefined }
): Promise<GitFetchResult> {
  const operation = 'fetchGitRemote';
  logger.debug(`Executing ${operation}`, { ...context, input });

  let targetPath: string;
  try {
    // Resolve and sanitize the target path
    if (input.path && input.path !== '.') {
      targetPath = input.path;
    } else {
      const workingDir = context.getWorkingDirectory();
      if (!workingDir) {
        throw new McpError(BaseErrorCode.VALIDATION_ERROR, "No path provided and no working directory set for the session.", { context, operation });
      }
      targetPath = workingDir;
    }
    targetPath = sanitization.sanitizePath(targetPath);
    logger.debug('Sanitized path', { ...context, operation, sanitizedPath: targetPath });

  } catch (error) {
    logger.error('Path resolution or sanitization failed', { ...context, operation, error });
    if (error instanceof McpError) throw error;
    throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Invalid path: ${error instanceof Error ? error.message : String(error)}`, { context, operation, originalError: error });
  }

  // Basic sanitization for remote name
  const safeRemote = input.remote?.replace(/[^a-zA-Z0-9_.\-/]/g, '');

  try {
    // Construct the git fetch command
    let command = `git -C "${targetPath}" fetch`;

    if (input.prune) {
      command += ' --prune';
    }
    if (input.tags) {
      command += ' --tags';
    }
    if (input.all) {
        command += ' --all';
    } else if (safeRemote) {
        command += ` ${safeRemote}`; // Fetch specific remote if 'all' is not used
    }
    // If neither 'all' nor 'remote' is specified, git fetch defaults to 'origin' or configured upstream.

    logger.debug(`Executing command: ${command}`, { ...context, operation });

    // Execute command. Fetch output is primarily on stderr.
    const { stdout, stderr } = await execAsync(command);

    logger.info(`Git fetch stdout: ${stdout}`, { ...context, operation }); // stdout is usually empty
    logger.info(`Git fetch stderr: ${stderr}`, { ...context, operation }); // stderr contains fetch details

    // Analyze stderr for success/summary
    let message = stderr.trim() || 'Fetch command executed.'; // Use stderr as the primary message
    let summary: string | undefined = undefined;

    // Check for common patterns in stderr
    if (stderr.includes('Updating') || stderr.includes('->') || stderr.includes('new tag') || stderr.includes('new branch')) {
        message = 'Fetch successful.';
        summary = stderr.trim(); // Use the full stderr as summary
    } else if (stderr.trim() === '') {
        // Sometimes fetch completes successfully with no output if nothing changed
        message = 'Fetch successful (no changes detected).';
    } else if (message.includes('fatal:')) {
        // Should be caught by catch block, but double-check
         logger.error(`Git fetch command indicated failure: ${message}`, { ...context, operation, stdout, stderr });
         // Re-throw as an internal error if not caught below
         throw new Error(`Fetch failed: ${message}`);
    }

    logger.info(`${operation} completed successfully. ${message}`, { ...context, operation, path: targetPath });
    return { success: true, message, summary };

  } catch (error: any) {
    logger.error(`Failed to execute git fetch command`, { ...context, operation, path: targetPath, error: error.message, stderr: error.stderr, stdout: error.stdout });

    const errorMessage = error.stderr || error.stdout || error.message || '';

    // Handle specific error cases
    if (errorMessage.toLowerCase().includes('not a git repository')) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`, { context, operation, originalError: error });
    }
    if (errorMessage.includes('resolve host') || errorMessage.includes('Could not read from remote repository') || errorMessage.includes('Connection timed out')) {
      throw new McpError(BaseErrorCode.NETWORK_ERROR, `Failed to connect to remote repository '${input.remote || 'default'}'. Error: ${errorMessage}`, { context, operation, originalError: error });
    }
    if (errorMessage.includes('fatal: ') && errorMessage.includes('couldn\'t find remote ref')) {
        throw new McpError(BaseErrorCode.NOT_FOUND, `Remote ref not found. Error: ${errorMessage}`, { context, operation, originalError: error });
    }
     if (errorMessage.includes('Authentication failed') || errorMessage.includes('Permission denied')) {
        throw new McpError(BaseErrorCode.UNAUTHORIZED, `Authentication failed for remote repository '${input.remote || 'default'}'. Error: ${errorMessage}`, { context, operation, originalError: error });
    }
     if (errorMessage.includes('does not appear to be a git repository')) {
         throw new McpError(BaseErrorCode.NOT_FOUND, `Remote '${input.remote || 'default'}' does not appear to be a git repository. Error: ${errorMessage}`, { context, operation, originalError: error });
     }


    // Generic internal error for other failures
    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Failed to git fetch for path: ${targetPath}. Error: ${errorMessage}`, { context, operation, originalError: error });
  }
}
