import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
// Import utils from barrel (logger from ../utils/internal/logger.js)
import { logger } from '../../../utils/index.js';
// Import utils from barrel (RequestContext from ../utils/internal/requestContext.js)
import { BaseErrorCode, McpError } from '../../../types-global/errors.js'; // Keep direct import for types-global
import { RequestContext } from '../../../utils/index.js';
// Import utils from barrel (sanitization from ../utils/security/sanitization.js)
import { sanitization } from '../../../utils/index.js';

const execAsync = promisify(exec);

// Define the base input schema without refinement
const GitDiffInputBaseSchema = z.object({
  path: z.string().min(1).optional().default('.').describe("Path to the Git repository. Defaults to the session's working directory if set."),
  commit1: z.string().optional().describe("First commit, branch, or ref for comparison. If omitted, compares against the working tree or index (depending on 'staged')."),
  commit2: z.string().optional().describe("Second commit, branch, or ref for comparison. If omitted, compares commit1 against the working tree or index."),
  staged: z.boolean().optional().default(false).describe("Show diff of changes staged for the next commit (compares index against HEAD). Overrides commit1/commit2 if true."),
  file: z.string().optional().describe("Limit the diff output to a specific file path."),
  // Add options like --name-only, --stat, context lines (-U<n>) if needed
});

// Export the shape for registration
export const GitDiffInputShape = GitDiffInputBaseSchema.shape;

// Define the final schema with refinement for validation during execution
export const GitDiffInputSchema = GitDiffInputBaseSchema.refine(data => !(data.staged && (data.commit1 || data.commit2)), {
  message: "Cannot use 'staged' option with specific commit references (commit1 or commit2).",
  path: ["staged", "commit1", "commit2"], // Indicate related fields
});


// Infer the TypeScript type from the *final* refined Zod schema
export type GitDiffInput = z.infer<typeof GitDiffInputSchema>;

// Define the structure for the JSON output
export interface GitDiffResult {
  success: boolean;
  diff: string; // The diff output
  message?: string; // Optional status message (e.g., "No changes found")
}

/**
 * Executes the 'git diff' command and returns the diff output.
 *
 * @param {GitDiffInput} input - The validated input object.
 * @param {RequestContext} context - The request context for logging and error handling.
 * @returns {Promise<GitDiffResult>} A promise that resolves with the structured diff result.
 * @throws {McpError} Throws an McpError if path resolution, validation, or the git command fails unexpectedly.
 */
export async function diffGitChanges(
  input: GitDiffInput,
  context: RequestContext & { sessionId?: string; getWorkingDirectory: () => string | undefined }
): Promise<GitDiffResult> {
  const operation = 'diffGitChanges';
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

  // Basic sanitization for refs and file path
  const safeCommit1 = input.commit1?.replace(/[`$&;*()|<>]/g, '');
  const safeCommit2 = input.commit2?.replace(/[`$&;*()|<>]/g, '');
  const safeFile = input.file?.replace(/[`$&;*()|<>]/g, '');

  try {
    // Construct the git diff command
    let command = `git -C "${targetPath}" diff`;

    if (input.staged) {
      command += ' --staged'; // Or --cached
    } else {
      // Add commit references if not doing staged diff
      if (safeCommit1) {
        command += ` ${safeCommit1}`;
      }
      if (safeCommit2) {
        command += ` ${safeCommit2}`;
      }
    }

    // Add file path limiter if provided
    if (safeFile) {
      command += ` -- "${safeFile}"`; // Use '--' to separate paths from revisions
    }

    logger.debug(`Executing command: ${command}`, { ...context, operation });

    // Execute command. Diff output is primarily on stdout.
    // Increase maxBuffer as diffs can be large.
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 1024 * 1024 * 20 }); // 20MB buffer

    if (stderr) {
      // Log stderr as warning, as it might contain non-fatal info
      logger.warning(`Git diff stderr: ${stderr}`, { ...context, operation });
    }

    const diffOutput = stdout;
    const message = diffOutput.trim() === '' ? 'No changes found.' : 'Diff generated successfully.';

    logger.info(`${operation} completed successfully. ${message}`, { ...context, operation, path: targetPath });
    return { success: true, diff: diffOutput, message };

  } catch (error: any) {
    logger.error(`Failed to execute git diff command`, { ...context, operation, path: targetPath, error: error.message, stderr: error.stderr, stdout: error.stdout });

    const errorMessage = error.stderr || error.stdout || error.message || '';

    // Handle specific error cases
    if (errorMessage.toLowerCase().includes('not a git repository')) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`, { context, operation, originalError: error });
    }
    if (errorMessage.includes('fatal: bad object') || errorMessage.includes('unknown revision or path not in the working tree')) {
        const invalidRef = input.commit1 || input.commit2 || input.file;
        throw new McpError(BaseErrorCode.NOT_FOUND, `Invalid commit reference or file path specified: '${invalidRef}'. Error: ${errorMessage}`, { context, operation, originalError: error });
    }
    if (errorMessage.includes('ambiguous argument')) {
        const ambiguousArg = input.commit1 || input.commit2 || input.file;
        throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Ambiguous argument provided: '${ambiguousArg}'. Error: ${errorMessage}`, { context, operation, originalError: error });
    }

    // If the command exits with an error but stdout has content, it might still be useful (e.g., diff with conflicts)
    // However, standard 'git diff' usually exits 0 even with differences. Errors typically mean invalid input/repo state.
    // We'll treat most exec errors as failures.

    // Generic internal error for other failures
    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Failed to get git diff for path: ${targetPath}. Error: ${errorMessage}`, { context, operation, originalError: error });
  }
}
