import { z } from 'zod';
import { promisify } from 'util';
import { exec } from 'child_process';
import { logger } from '../../../utils/logger.js';
import { RequestContext } from '../../../utils/requestContext.js';
import { McpError, BaseErrorCode } from '../../../types-global/errors.js';
import { sanitization } from '../../../utils/sanitization.js';

const execAsync = promisify(exec);

// Define the input schema for the git_checkout tool using Zod
export const GitCheckoutInputSchema = z.object({
  path: z.string().min(1).optional().default('.').describe("Path to the Git repository. Defaults to the session's working directory if set."),
  branchOrPath: z.string().min(1).describe("The branch name, commit hash, tag, or file path(s) to checkout."),
  newBranch: z.string().optional().describe("Create a new branch named <new_branch> and start it at <branchOrPath>."),
  force: z.boolean().optional().default(false).describe("Force checkout even if there are uncommitted changes (use with caution, discards local changes)."),
  // Add other relevant git checkout options as needed (e.g., --track, -b for new branch shorthand)
});

// Infer the TypeScript type from the Zod schema
export type GitCheckoutInput = z.infer<typeof GitCheckoutInputSchema>;

// Define the structure for the JSON output
export interface GitCheckoutResult {
  success: boolean;
  message: string; // General status message (e.g., "Switched to branch 'main'", "Updated 1 path from...")
  previousBranch?: string; // Previous branch name if switched
  currentBranch?: string; // Current branch name after checkout
  newBranchCreated?: boolean; // Flag if a new branch was created
  filesRestored?: string[]; // List of files restored if checking out paths
}

/**
 * Executes the 'git checkout' command and returns structured JSON output.
 * Handles switching branches, creating new branches, and restoring files.
 *
 * @param {GitCheckoutInput} input - The validated input object.
 * @param {RequestContext} context - The request context for logging and error handling.
 * @returns {Promise<GitCheckoutResult>} A promise that resolves with the structured checkout result.
 * @throws {McpError} Throws an McpError if path resolution, validation, or the git command fails unexpectedly.
 */
export async function checkoutGit(
  input: GitCheckoutInput,
  context: RequestContext & { sessionId?: string; getWorkingDirectory: () => string | undefined }
): Promise<GitCheckoutResult> {
  const operation = 'checkoutGit';
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

  // Basic sanitization for branch/path argument
  const safeBranchOrPath = input.branchOrPath.replace(/[`$&;*()|<>]/g, ''); // Remove potentially dangerous characters

  try {
    // Construct the git checkout command
    let command = `git -C "${targetPath}" checkout`;

    if (input.force) {
      command += ' --force';
    }
    if (input.newBranch) {
      const safeNewBranch = input.newBranch.replace(/[^a-zA-Z0-9_.\-/]/g, ''); // Sanitize new branch name
      command += ` -b ${safeNewBranch}`;
    }

    command += ` ${safeBranchOrPath}`; // Add the target branch/path

    logger.debug(`Executing command: ${command}`, { ...context, operation });

    // Execute command. Checkout often uses stderr for status messages.
    const { stdout, stderr } = await execAsync(command);

    logger.info(`Git checkout stdout: ${stdout}`, { ...context, operation });
    logger.info(`Git checkout stderr: ${stderr}`, { ...context, operation }); // Log stderr as info

    // Analyze stderr primarily, fallback to stdout
    let message = stderr.trim() || stdout.trim();
    let success = true;
    let previousBranch: string | undefined = undefined;
    let currentBranch: string | undefined = undefined;
    let newBranchCreated = !!input.newBranch;
    let filesRestored: string[] | undefined = undefined;

    // Extract previous branch if available
    const prevBranchMatch = stderr.match(/Switched to.*? from ['"]?(.*?)['"]?/);
    if (prevBranchMatch) {
      previousBranch = prevBranchMatch[1];
    }

    // Extract current branch/state
    if (stderr.includes('Switched to branch')) {
      const currentBranchMatch = stderr.match(/Switched to branch ['"]?(.*?)['"]?/);
      if (currentBranchMatch) currentBranch = currentBranchMatch[1];
      message = `Switched to branch '${currentBranch || input.branchOrPath}'.`;
    } else if (stderr.includes('Switched to a new branch')) {
      const currentBranchMatch = stderr.match(/Switched to a new branch ['"]?(.*?)['"]?/);
      if (currentBranchMatch) currentBranch = currentBranchMatch[1];
      message = `Switched to new branch '${currentBranch || input.newBranch}'.`;
      newBranchCreated = true; // Confirm creation
    } else if (stderr.includes('Already on')) {
      const currentBranchMatch = stderr.match(/Already on ['"]?(.*?)['"]?/);
      if (currentBranchMatch) currentBranch = currentBranchMatch[1];
      message = `Already on '${currentBranch || input.branchOrPath}'.`;
    } else if (stderr.includes('Updated N path') || stdout.includes('Updated N path')) { // Checking out files
        message = `Restored path(s): ${input.branchOrPath}`;
        // Potentially list the files if input.branchOrPath was specific enough
        // Assume input.branchOrPath contains file paths separated by newlines
        filesRestored = input.branchOrPath.split('\n').filter(p => p.trim().length > 0); // Split by newline and filter out empty entries
        // Try to get current branch after file checkout
        try {
            const statusResult = await execAsync(`git -C "${targetPath}" branch --show-current`);
            currentBranch = statusResult.stdout.trim();
        } catch (statusError) {
            logger.warning('Could not determine current branch after file checkout', { ...context, operation, statusError });
        }
    } else if (stderr.includes('Previous HEAD position was') && stderr.includes('HEAD is now at')) { // Detached HEAD
        message = `Checked out commit ${input.branchOrPath} (Detached HEAD state).`;
        currentBranch = 'Detached HEAD'; // Indicate detached state
    } else if (stderr.includes('Note: switching to')) { // Another detached HEAD message variant
        message = `Checked out ${input.branchOrPath} (Detached HEAD state).`;
        currentBranch = 'Detached HEAD';
    } else if (message.includes('fatal:')) {
        success = false;
        message = `Checkout failed: ${message}`;
        logger.error(`Git checkout command indicated failure: ${message}`, { ...context, operation, stdout, stderr });
    } else if (!message && !stdout && !stderr) {
        message = 'Checkout command executed, but no output received.';
        logger.warning(message, { ...context, operation });
        // Attempt to get current branch as confirmation
         try {
            const statusResult = await execAsync(`git -C "${targetPath}" branch --show-current`);
            currentBranch = statusResult.stdout.trim();
            message += ` Current branch is '${currentBranch}'.`;
        } catch (statusError) {
            logger.warning('Could not determine current branch after silent checkout', { ...context, operation, statusError });
        }
    }


    logger.info(`${operation} completed`, { ...context, operation, path: targetPath, success, message });
    return { success, message, previousBranch, currentBranch, newBranchCreated, filesRestored };

  } catch (error: any) {
    logger.error(`Failed to execute git checkout command`, { ...context, operation, path: targetPath, error: error.message, stderr: error.stderr, stdout: error.stdout });

    const errorMessage = error.stderr || error.stdout || error.message || '';

    // Handle specific error cases
    if (errorMessage.toLowerCase().includes('not a git repository')) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`, { context, operation, originalError: error });
    }
    if (errorMessage.match(/pathspec '.*?' did not match any file\(s\) known to git/)) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Branch or pathspec not found: ${input.branchOrPath}. Error: ${errorMessage}`, { context, operation, originalError: error });
    }
    if (errorMessage.includes('already exists')) { // e.g., trying -b with existing branch name
        throw new McpError(BaseErrorCode.CONFLICT, `Cannot create new branch '${input.newBranch}': it already exists. Error: ${errorMessage}`, { context, operation, originalError: error });
    }
    if (errorMessage.includes('Your local changes to the following files would be overwritten by checkout')) {
        throw new McpError(BaseErrorCode.CONFLICT, `Checkout failed due to uncommitted local changes that would be overwritten. Please commit or stash them first, or use --force. Error: ${errorMessage}`, { context, operation, originalError: error });
    }
     if (errorMessage.includes('invalid reference')) {
        throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Invalid branch name or reference: ${input.branchOrPath}. Error: ${errorMessage}`, { context, operation, originalError: error });
    }

    // Generic internal error for other failures
    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Failed to checkout for path: ${targetPath}. Error: ${errorMessage}`, { context, operation, originalError: error });
  }
}
