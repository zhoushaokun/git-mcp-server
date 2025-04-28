import { z } from 'zod';
import { promisify } from 'util';
import { exec } from 'child_process';
import { logger } from '../../../utils/logger.js';
import { RequestContext } from '../../../utils/requestContext.js';
import { McpError, BaseErrorCode } from '../../../types-global/errors.js';
import { sanitization } from '../../../utils/sanitization.js';

const execAsync = promisify(exec);

// Define the input schema for the git_push tool using Zod
export const GitPushInputSchema = z.object({
  path: z.string().min(1).optional().default('.').describe("Path to the Git repository. Defaults to the session's working directory if set."),
  remote: z.string().optional().describe("The remote repository to push to (e.g., 'origin'). Defaults to the tracked upstream or 'origin'."),
  branch: z.string().optional().describe("The local branch to push. Defaults to the current branch."),
  remoteBranch: z.string().optional().describe("The remote branch to push to. Defaults to the same name as the local branch."),
  force: z.boolean().optional().default(false).describe("Force the push (use with caution: `--force-with-lease` is generally safer)."),
  forceWithLease: z.boolean().optional().default(false).describe("Force the push only if the remote ref is the expected value (`--force-with-lease`). Safer than --force."),
  setUpstream: z.boolean().optional().default(false).describe("Set the upstream tracking configuration (`-u` or `--set-upstream`)."),
  tags: z.boolean().optional().default(false).describe("Push all tags (`--tags`)."),
  delete: z.boolean().optional().default(false).describe("Delete the remote branch (`--delete`). Requires `branch` to be specified."),
  // Add other relevant git push options as needed (e.g., --prune, --all)
});

// Infer the TypeScript type from the Zod schema
export type GitPushInput = z.infer<typeof GitPushInputSchema>;

// Define the structure for the JSON output
export interface GitPushResult {
  success: boolean;
  message: string; // General status message (e.g., "Everything up-to-date", "Branch pushed", "Push rejected")
  summary?: string; // More detailed summary if available (e.g., commit range, objects pushed)
  rejected?: boolean; // Flag if the push was rejected (e.g., non-fast-forward, hooks)
  deleted?: boolean; // Flag if a remote branch was deleted
}

/**
 * Executes the 'git push' command and returns structured JSON output.
 *
 * @param {GitPushInput} input - The validated input object.
 * @param {RequestContext} context - The request context for logging and error handling.
 * @returns {Promise<GitPushResult>} A promise that resolves with the structured push result.
 * @throws {McpError} Throws an McpError if path resolution, validation, or the git command fails unexpectedly.
 */
export async function pushGitChanges(
  input: GitPushInput,
  context: RequestContext & { sessionId?: string; getWorkingDirectory: () => string | undefined }
): Promise<GitPushResult> {
  const operation = 'pushGitChanges';
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

  // Validate specific input combinations
  if (input.delete && !input.branch) {
      throw new McpError(BaseErrorCode.VALIDATION_ERROR, "Cannot use --delete without specifying a branch to delete.", { context, operation });
  }
  if (input.force && input.forceWithLease) {
      throw new McpError(BaseErrorCode.VALIDATION_ERROR, "Cannot use --force and --force-with-lease together.", { context, operation });
  }
  if (input.delete && (input.force || input.forceWithLease || input.setUpstream || input.tags)) {
      throw new McpError(BaseErrorCode.VALIDATION_ERROR, "Cannot combine --delete with --force, --force-with-lease, --set-upstream, or --tags.", { context, operation });
  }

  try {
    // Construct the git push command
    let command = `git -C "${targetPath}" push`;

    if (input.force) {
      command += ' --force';
    } else if (input.forceWithLease) {
      command += ' --force-with-lease';
    }

    if (input.setUpstream) {
      command += ' --set-upstream';
    }
    if (input.tags) {
      command += ' --tags';
    }
    if (input.delete) {
        command += ' --delete';
    }

    // Add remote and branch specification
    const remote = input.remote ? input.remote.replace(/[^a-zA-Z0-9_.\-/]/g, '') : 'origin'; // Default to origin
    command += ` ${remote}`;

    if (input.branch) {
        const localBranch = input.branch.replace(/[^a-zA-Z0-9_.\-/]/g, '');
        command += ` ${localBranch}`;
        if (input.remoteBranch && !input.delete) { // remoteBranch only makes sense if not deleting
            const remoteBranch = input.remoteBranch.replace(/[^a-zA-Z0-9_.\-/]/g, '');
            command += `:${remoteBranch}`;
        }
    } else if (!input.tags && !input.delete) {
        // If no branch, tags, or delete specified, push the current branch by default
        // Git might handle this automatically, but being explicit can be clearer
        // command += ' HEAD'; // Or let git figure out the default push behavior
        logger.debug('No specific branch, tags, or delete specified. Relying on default git push behavior for current branch.', { ...context, operation });
    }


    logger.debug(`Executing command: ${command}`, { ...context, operation });

    // Execute command. Note: Git push often uses stderr for progress and success messages.
    const { stdout, stderr } = await execAsync(command);

    logger.info(`Git push stdout: ${stdout}`, { ...context, operation });
    logger.info(`Git push stderr: ${stderr}`, { ...context, operation }); // Log stderr as info as it's commonly used

    // Analyze stderr primarily, fallback to stdout
    let message = stderr.trim() || stdout.trim();
    let success = true;
    let rejected = false;
    let deleted = false;
    let summary: string | undefined = undefined;

    // Check for common success/status messages in stderr
    if (message.includes('Everything up-to-date')) {
      message = 'Everything up-to-date.';
    } else if (message.match(/->\s+\[new branch\]/) || message.match(/->\s+\[new tag\]/)) {
      message = 'Push successful (new branch/tag created).';
      // Extract summary if possible (e.g., commit range)
      const summaryMatch = message.match(/([a-f0-9]+\.\.[a-f0-9]+)\s+\S+\s+->\s+\S+/);
      if (summaryMatch) summary = summaryMatch[1];
    } else if (message.includes('Done.')) { // Common part of successful push output
        // Try to find a more specific message
        if (stderr.includes('updating') || stdout.includes('updating')) {
             message = 'Push successful.';
             const summaryMatch = message.match(/([a-f0-9]+\.\.[a-f0-9]+)\s+\S+\s+->\s+\S+/);
             if (summaryMatch) summary = summaryMatch[1];
        } else {
            message = 'Push completed (check logs for details).'; // Generic success if specific pattern not found
        }
    } else if (message.includes('[rejected]')) {
      message = 'Push rejected.';
      success = false;
      rejected = true;
      // Extract reason if possible
      const reasonMatch = message.match(/\[rejected\].*->.*?\((.*?)\)/);
      if (reasonMatch) {
        message += ` Reason: ${reasonMatch[1]}.`;
        if (reasonMatch[1].includes('non-fast-forward')) {
            message += ' Hint: Try pulling first or use force options if necessary.';
        }
      }
    } else if (message.includes('[deleted]')) {
        message = 'Remote branch deleted successfully.';
        deleted = true;
    } else if (message.includes('fatal:')) {
      // If a fatal error wasn't caught by execAsync but is in stderr/stdout
      success = false;
      message = `Push failed: ${message}`;
      logger.error(`Git push command indicated failure: ${message}`, { ...context, operation, stdout, stderr });
    } else if (!message && !stdout && !stderr) {
        // If command succeeds with no output (can happen in some cases)
        message = 'Push command executed, but no output received.';
        logger.warning(message, { ...context, operation });
    }

    logger.info(`${operation} completed`, { ...context, operation, path: targetPath, success, message, rejected, deleted });
    return { success, message, summary, rejected, deleted };

  } catch (error: any) {
    logger.error(`Failed to execute git push command`, { ...context, operation, path: targetPath, error: error.message, stderr: error.stderr, stdout: error.stdout });

    const errorMessage = error.stderr || error.stdout || error.message || '';

    // Handle specific error cases
    if (errorMessage.toLowerCase().includes('not a git repository')) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`, { context, operation, originalError: error });
    }
    if (errorMessage.includes('resolve host') || errorMessage.includes('Could not read from remote repository') || errorMessage.includes('Connection timed out')) {
      throw new McpError(BaseErrorCode.NETWORK_ERROR, `Failed to connect to remote repository. Error: ${errorMessage}`, { context, operation, originalError: error });
    }
    if (errorMessage.includes('rejected') || errorMessage.includes('failed to push some refs')) {
       // This might be caught here if execAsync throws due to non-zero exit code on rejection
       logger.warning('Push rejected (caught as error)', { ...context, operation, path: targetPath, errorMessage });
       return { success: false, message: `Push rejected: ${errorMessage}`, rejected: true };
    }
    if (errorMessage.includes('Authentication failed') || errorMessage.includes('Permission denied')) {
        throw new McpError(BaseErrorCode.UNAUTHORIZED, `Authentication failed for remote repository. Error: ${errorMessage}`, { context, operation, originalError: error });
    }
     if (errorMessage.includes('src refspec') && errorMessage.includes('does not match any')) {
        throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Push failed: Source branch/refspec does not exist locally. Error: ${errorMessage}`, { context, operation, originalError: error });
    }

    // Generic internal error for other failures
    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Failed to push changes for path: ${targetPath}. Error: ${errorMessage}`, { context, operation, originalError: error });
  }
}
