import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";
// Import utils from barrel (logger from ../utils/internal/logger.js)
import { logger } from "../../../utils/index.js";
// Import utils from barrel (RequestContext from ../utils/internal/requestContext.js)
import { BaseErrorCode, McpError } from "../../../types-global/errors.js"; // Keep direct import for types-global
import { RequestContext } from "../../../utils/index.js";
// Import utils from barrel (sanitization from ../utils/security/sanitization.js)
import { sanitization } from "../../../utils/index.js";

const execAsync = promisify(exec);

// Define the input schema for the git_checkout tool using Zod
export const GitCheckoutInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .optional()
    .default(".")
    .describe(
      "Path to the Git repository. Defaults to the directory set via `git_set_working_dir` for the session; set 'git_set_working_dir' if not set.",
    ),
  branchOrPath: z
    .string()
    .min(1)
    .describe(
      "The branch name (e.g., 'main'), commit hash, tag, or file path(s) (e.g., './src/file.ts') to checkout.",
    ),
  newBranch: z
    .string()
    .optional()
    .describe(
      "Create a new branch named <new_branch> (e.g., 'feat/new-feature') and start it at <branchOrPath>.",
    ),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Force checkout even if there are uncommitted changes (use with caution, discards local changes).",
    ),
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
  context: RequestContext & {
    sessionId?: string;
    getWorkingDirectory: () => string | undefined;
  },
): Promise<GitCheckoutResult> {
  const operation = "checkoutGit";
  logger.debug(`Executing ${operation}`, { ...context, input });

  let targetPath: string;
  try {
    // Resolve and sanitize the target path
    if (input.path && input.path !== ".") {
      targetPath = input.path;
    } else {
      const workingDir = context.getWorkingDirectory();
      if (!workingDir) {
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          "No path provided and no working directory set for the session.",
          { context, operation },
        );
      }
      targetPath = workingDir;
    }
    targetPath = sanitization.sanitizePath(targetPath, {
      allowAbsolute: true,
    }).sanitizedPath;
    logger.debug("Sanitized path", {
      ...context,
      operation,
      sanitizedPath: targetPath,
    });
  } catch (error) {
    logger.error("Path resolution or sanitization failed", {
      ...context,
      operation,
      error,
    });
    if (error instanceof McpError) throw error;
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Invalid path: ${error instanceof Error ? error.message : String(error)}`,
      { context, operation, originalError: error },
    );
  }

  // Basic sanitization for branch/path argument
  const safeBranchOrPath = input.branchOrPath.replace(/[`$&;*()|<>]/g, ""); // Remove potentially dangerous characters

  try {
    // Construct the git checkout command
    let command = `git -C "${targetPath}" checkout`;

    if (input.force) {
      command += " --force";
    }
    if (input.newBranch) {
      const safeNewBranch = input.newBranch.replace(/[^a-zA-Z0-9_.\-/]/g, ""); // Sanitize new branch name
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
    let isDetachedHead = false;
    let isFileCheckout = false;

    // --- Initial analysis of checkout output ---
    // Extract previous branch if available
    const prevBranchMatch = stderr.match(/Switched to.*? from ['"]?(.*?)['"]?/);
    if (prevBranchMatch) {
      previousBranch = prevBranchMatch[1];
    }

    // Determine primary outcome from stderr/stdout
    if (stderr.includes("Switched to a new branch")) {
      const currentBranchMatch = stderr.match(
        /Switched to a new branch ['"]?(.*?)['"]?/,
      );
      currentBranch = currentBranchMatch
        ? currentBranchMatch[1]
        : input.newBranch; // Use matched or input
      message = `Switched to new branch '${currentBranch}'.`;
      newBranchCreated = true;
    } else if (stderr.includes("Switched to branch")) {
      const currentBranchMatch = stderr.match(
        /Switched to branch ['"]?(.*?)['"]?/,
      );
      currentBranch = currentBranchMatch
        ? currentBranchMatch[1]
        : input.branchOrPath; // Use matched or input
      message = `Switched to branch '${currentBranch}'.`;
    } else if (stderr.includes("Already on")) {
      const currentBranchMatch = stderr.match(/Already on ['"]?(.*?)['"]?/);
      currentBranch = currentBranchMatch
        ? currentBranchMatch[1]
        : input.branchOrPath; // Use matched or input
      message = `Already on '${currentBranch}'.`;
    } else if (
      stderr.includes("Updated N path") ||
      stdout.includes("Updated N path") ||
      stderr.includes("Your branch is up to date with")
    ) {
      // Checking out files or confirming current state
      // Check if the input looks like file paths rather than a branch/commit
      // This is heuristic - might need refinement if branch names look like paths
      if (
        input.branchOrPath.includes("/") ||
        input.branchOrPath.includes(".")
      ) {
        isFileCheckout = true;
        message = `Restored or checked path(s): ${input.branchOrPath}`;
        filesRestored = input.branchOrPath
          .split("\n")
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
      } else {
        // Assume it was just confirming the current branch state
        message =
          stderr.trim() ||
          stdout.trim() ||
          `Checked out ${input.branchOrPath}.`;
      }
    } else if (
      stderr.includes("Previous HEAD position was") &&
      stderr.includes("HEAD is now at")
    ) {
      // Detached HEAD
      message = `Checked out commit ${input.branchOrPath} (Detached HEAD state).`;
      currentBranch = "Detached HEAD";
      isDetachedHead = true;
    } else if (
      stderr.includes("Note: switching to") ||
      stderr.includes("Note: checking out")
    ) {
      // Other detached HEAD variants
      message = `Checked out ${input.branchOrPath} (Detached HEAD state).`;
      currentBranch = "Detached HEAD";
      isDetachedHead = true;
    } else if (message.includes("fatal:")) {
      success = false;
      message = `Checkout failed: ${message}`;
      logger.error(`Git checkout command indicated failure: ${message}`, {
        ...context,
        operation,
        stdout,
        stderr,
      });
    } else if (!message && !stdout && !stderr) {
      message = "Checkout command executed silently."; // Assume success, will verify branch below
      logger.info(message, { ...context, operation });
    } else {
      // Some other message, treat as informational for now
      message = stderr.trim() || stdout.trim();
      logger.info(`Git checkout produced message: ${message}`, {
        ...context,
        operation,
      });
    }

    // --- Get definitive current branch IF checkout was successful AND not file checkout/detached HEAD ---
    if (success && !isFileCheckout && !isDetachedHead) {
      try {
        logger.debug(
          "Attempting to get current branch via git branch --show-current",
          { ...context, operation },
        );
        const statusResult = await execAsync(
          `git -C "${targetPath}" branch --show-current`,
        );
        const definitiveCurrentBranch = statusResult.stdout.trim();
        if (definitiveCurrentBranch) {
          currentBranch = definitiveCurrentBranch;
          logger.info(`Confirmed current branch: ${currentBranch}`, {
            ...context,
            operation,
          });
          // Refine message if it wasn't specific before
          if (
            message.startsWith("Checkout command executed silently") ||
            message.startsWith("Checked out ")
          ) {
            message = `Checked out '${currentBranch}'.`;
          } else if (
            message.startsWith("Already on") &&
            !message.includes(`'${currentBranch}'`)
          ) {
            message = `Already on '${currentBranch}'.`; // Update if initial parse was wrong
          } else if (
            message.startsWith("Switched to branch") &&
            !message.includes(`'${currentBranch}'`)
          ) {
            message = `Switched to branch '${currentBranch}'.`; // Update if initial parse was wrong
          }
        } else {
          // Command succeeded but returned empty - might be detached HEAD after all?
          logger.warning(
            "git branch --show-current returned empty, possibly detached HEAD?",
            { ...context, operation },
          );
          // Keep potentially parsed 'Detached HEAD' or fallback to input if needed
          currentBranch = currentBranch || "Unknown (possibly detached)";
          if (!message.includes("Detached HEAD"))
            message += " (Could not confirm branch name).";
        }
      } catch (statusError: any) {
        logger.warning("Could not determine current branch after checkout", {
          ...context,
          operation,
          error: statusError.message,
        });
        // Keep potentially parsed 'Detached HEAD' or fallback to input if needed
        currentBranch = currentBranch || "Unknown (error checking)";
        if (!message.includes("Detached HEAD"))
          message += " (Error checking branch name).";
      }
    } else if (success && isFileCheckout) {
      // If it was a file checkout, still try to get the branch name for context
      try {
        const statusResult = await execAsync(
          `git -C "${targetPath}" branch --show-current`,
        );
        currentBranch =
          statusResult.stdout.trim() || "Unknown (possibly detached)";
      } catch {
        currentBranch = "Unknown (error checking)";
      }
      logger.info(`Current branch after file checkout: ${currentBranch}`, {
        ...context,
        operation,
      });
    }

    logger.info(`${operation} completed`, {
      ...context,
      operation,
      path: targetPath,
      success,
      message,
      currentBranch,
    });
    return {
      success,
      message,
      previousBranch,
      currentBranch,
      newBranchCreated,
      filesRestored,
    };
  } catch (error: any) {
    logger.error(`Failed to execute git checkout command`, {
      ...context,
      operation,
      path: targetPath,
      error: error.message,
      stderr: error.stderr,
      stdout: error.stdout,
    });

    const errorMessage = error.stderr || error.stdout || error.message || "";

    // Handle specific error cases
    if (errorMessage.toLowerCase().includes("not a git repository")) {
      throw new McpError(
        BaseErrorCode.NOT_FOUND,
        `Path is not a Git repository: ${targetPath}`,
        { context, operation, originalError: error },
      );
    }
    if (
      errorMessage.match(
        /pathspec '.*?' did not match any file\(s\) known to git/,
      )
    ) {
      throw new McpError(
        BaseErrorCode.NOT_FOUND,
        `Branch or pathspec not found: ${input.branchOrPath}. Error: ${errorMessage}`,
        { context, operation, originalError: error },
      );
    }
    if (errorMessage.includes("already exists")) {
      // e.g., trying -b with existing branch name
      throw new McpError(
        BaseErrorCode.CONFLICT,
        `Cannot create new branch '${input.newBranch}': it already exists. Error: ${errorMessage}`,
        { context, operation, originalError: error },
      );
    }
    if (
      errorMessage.includes(
        "Your local changes to the following files would be overwritten by checkout",
      )
    ) {
      throw new McpError(
        BaseErrorCode.CONFLICT,
        `Checkout failed due to uncommitted local changes that would be overwritten. Please commit or stash them first, or use --force. Error: ${errorMessage}`,
        { context, operation, originalError: error },
      );
    }
    if (errorMessage.includes("invalid reference")) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Invalid branch name or reference: ${input.branchOrPath}. Error: ${errorMessage}`,
        { context, operation, originalError: error },
      );
    }

    // Generic internal error for other failures
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Failed to checkout for path: ${targetPath}. Error: ${errorMessage}`,
      { context, operation, originalError: error },
    );
  }
}
