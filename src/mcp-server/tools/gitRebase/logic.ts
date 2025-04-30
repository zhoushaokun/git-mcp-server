import { z } from 'zod';
import { promisify } from 'util';
import { exec, ExecException } from 'child_process';
import { logger } from '../../../utils/logger.js';
import { RequestContext } from '../../../utils/requestContext.js';
import { McpError, BaseErrorCode } from '../../../types-global/errors.js';
import { sanitization } from '../../../utils/sanitization.js';

const execAsync = promisify(exec);

// Define the BASE input schema for the git_rebase tool using Zod
export const GitRebaseBaseSchema = z.object({
  path: z.string().min(1).optional().default('.').describe("Path to the local Git repository. If omitted, defaults to the path set by `git_set_working_dir` for the current session, or the server's CWD if no session path is set."),
  mode: z.enum(['start', 'continue', 'abort', 'skip']).default('start').describe("Rebase operation mode: 'start' (initiate rebase), 'continue', 'abort', 'skip' (manage ongoing rebase)."),
  upstream: z.string().min(1).optional().describe("The upstream branch or commit to rebase onto. Required for 'start' mode unless 'interactive' is true with default base."),
  branch: z.string().min(1).optional().describe("The branch to rebase. Defaults to the current branch if omitted."),
  interactive: z.boolean().default(false).describe("Perform an interactive rebase (`-i`). 'upstream' can be omitted to rebase current branch's tracked upstream or use fork-point."),
  strategy: z.enum(['recursive', 'resolve', 'ours', 'theirs', 'octopus', 'subtree']).optional().describe("Specifies the merge strategy to use during rebase."),
  strategyOption: z.string().optional().describe("Pass a specific option to the merge strategy (e.g., 'ours', 'theirs' for recursive). Use with -X."),
  onto: z.string().min(1).optional().describe("Rebase onto a specific commit/branch instead of the upstream's base. Requires 'upstream' to be specified."),
  // TODO: Add options like --preserve-merges, --autosquash, --autostash?
});

// Apply refinements and export the FINAL schema for validation within the handler
export const GitRebaseInputSchema = GitRebaseBaseSchema.refine(data => !(data.mode === 'start' && !data.interactive && !data.upstream), {
    message: "An 'upstream' branch/commit is required for 'start' mode unless 'interactive' is true.", path: ["upstream"],
}).refine(data => !(data.mode !== 'start' && (data.upstream || data.branch || data.interactive || data.strategy || data.onto)), {
    message: "Parameters like 'upstream', 'branch', 'interactive', 'strategy', 'onto' are only applicable for 'start' mode.", path: ["mode"],
});


// Infer the TypeScript type from the Zod schema
export type GitRebaseInput = z.infer<typeof GitRebaseInputSchema>;

// Define the structure for the result
interface GitRebaseSuccessResult {
  success: true;
  mode: GitRebaseInput['mode'];
  message: string;
  rebaseCompleted?: boolean; // True if the rebase finished successfully (relevant for start/continue)
  needsManualAction?: boolean; // True if conflicts or interactive steps require user input
}

interface GitRebaseFailureResult {
    success: false;
    mode: GitRebaseInput['mode'];
    message: string;
    error?: string; // Detailed error message
    conflicts?: boolean; // Specifically for failures due to conflicts
}

export type GitRebaseResult = GitRebaseSuccessResult | GitRebaseFailureResult;


/**
 * Executes the 'git rebase' command based on the specified mode.
 *
 * @param {GitRebaseInput} input - The validated input object.
 * @param {RequestContext} context - The request context for logging and error handling.
 * @returns {Promise<GitRebaseResult>} A promise that resolves with the structured result.
 * @throws {McpError} Throws an McpError for path resolution/validation failures or unexpected errors.
 */
export async function gitRebaseLogic(
  input: GitRebaseInput,
  context: RequestContext & { sessionId?: string; getWorkingDirectory: () => string | undefined }
): Promise<GitRebaseResult> {
  const operation = `gitRebaseLogic:${input.mode}`;
  logger.debug(`Executing ${operation}`, { ...context, input });

  let targetPath: string;
  try {
    // Resolve and sanitize the target path
    const workingDir = context.getWorkingDirectory();
    targetPath = (input.path && input.path !== '.')
      ? input.path
      : workingDir ?? '.';

    if (targetPath === '.' && !workingDir) {
         logger.warning("Executing git rebase in server's CWD as no path provided and no session WD set.", { ...context, operation });
         targetPath = process.cwd();
    } else if (targetPath === '.' && workingDir) {
        targetPath = workingDir;
        logger.debug(`Using session working directory: ${targetPath}`, { ...context, operation, sessionId: context.sessionId });
    } else {
         logger.debug(`Using provided path: ${targetPath}`, { ...context, operation });
    }

    targetPath = sanitization.sanitizePath(targetPath);
    logger.debug('Sanitized path', { ...context, operation, sanitizedPath: targetPath });

  } catch (error) {
    logger.error('Path resolution or sanitization failed', { ...context, operation, error });
    if (error instanceof McpError) throw error;
    throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Invalid path: ${error instanceof Error ? error.message : String(error)}`, { context, operation, originalError: error });
  }

  try {
    let command = `git -C "${targetPath}" rebase`;

    switch (input.mode) {
        case 'start':
            if (input.interactive) command += ' -i';
            if (input.strategy) command += ` --strategy=${input.strategy}`;
            if (input.strategyOption) command += ` -X${input.strategyOption}`; // Note: -X for strategy options
            if (input.onto) command += ` --onto "${input.onto.replace(/"/g, '\\"')}"`;
            // Upstream is required by refine unless interactive
            if (input.upstream) command += ` "${input.upstream.replace(/"/g, '\\"')}"`;
            if (input.branch) command += ` "${input.branch.replace(/"/g, '\\"')}"`;
            break;
        case 'continue':
            command += ' --continue';
            break;
        case 'abort':
            command += ' --abort';
            break;
        case 'skip':
            command += ' --skip';
            break;
        default:
             // Should not happen due to Zod validation
            throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Invalid mode: ${input.mode}`, { context, operation });
    }

    logger.debug(`Executing command: ${command}`, { ...context, operation });

    try {
        const { stdout, stderr } = await execAsync(command);
        const output = stdout + stderr;

        // Check for common success messages
        if (/successfully rebased and updated/i.test(output) || (input.mode === 'abort' && !stderr) || (input.mode === 'skip' && !stderr) || (input.mode === 'continue' && /applying/i.test(stdout))) {
            const message = input.mode === 'start'
                ? `Rebase started successfully. Output: ${output.trim()}`
                : `Rebase ${input.mode} executed successfully. Output: ${output.trim()}`;
            logger.info(message, { ...context, operation, path: targetPath });
            return { success: true, mode: input.mode, message, rebaseCompleted: /successfully rebased/.test(output), needsManualAction: false };
        }

        // Check for interactive rebase start
        if (input.mode === 'start' && input.interactive && /noop/i.test(stderr) && /hint: use 'git rebase --edit-todo'/i.test(stderr)) {
             const message = `Interactive rebase started. Edit the todo list in your editor. Output: ${output.trim()}`;
             logger.info(message, { ...context, operation, path: targetPath });
             return { success: true, mode: input.mode, message, rebaseCompleted: false, needsManualAction: true };
        }
         if (input.mode === 'start' && input.interactive && /applying/i.test(stdout)) {
             const message = `Interactive rebase started and processing commits. Output: ${output.trim()}`;
             logger.info(message, { ...context, operation, path: targetPath });
             return { success: true, mode: input.mode, message, rebaseCompleted: false, needsManualAction: false }; // Might complete or hit conflict/edit
        }


        // Check for conflicts even if exit code is 0 (can happen with --continue sometimes)
        if (/conflict/i.test(output)) {
            const message = `Rebase ${input.mode} resulted in conflicts. Resolve conflicts and use 'git rebase --continue'. Output: ${output.trim()}`;
            logger.warning(message, { ...context, operation, path: targetPath });
            return { success: true, mode: input.mode, message, rebaseCompleted: false, needsManualAction: true };
        }

        // Default success message if no specific pattern matched but no error thrown
        const defaultMessage = `Rebase ${input.mode} command finished. Output: ${output.trim()}`;
        logger.info(defaultMessage, { ...context, operation, path: targetPath });
        return { success: true, mode: input.mode, message: defaultMessage, rebaseCompleted: !/applying|stopped/i.test(output), needsManualAction: /stopped at|edit/.test(output) };


    } catch (rebaseError: any) {
        const errorMessage = rebaseError.stderr || rebaseError.stdout || rebaseError.message || '';
        logger.error(`Git rebase ${input.mode} command failed`, { ...context, operation, path: targetPath, error: errorMessage, stderr: rebaseError.stderr, stdout: rebaseError.stdout });

        // Handle specific error cases
        if (/conflict/i.test(errorMessage)) {
             return { success: false, mode: input.mode, message: `Rebase ${input.mode} failed due to conflicts. Resolve conflicts and use 'git rebase --continue'.`, error: errorMessage, conflicts: true };
        }
        if (/no rebase in progress/i.test(errorMessage)) {
            return { success: false, mode: input.mode, message: `Failed to ${input.mode} rebase: No rebase is currently in progress.`, error: errorMessage };
        }
        if (/cannot rebase onto multiple branches/i.test(errorMessage)) {
             return { success: false, mode: 'start', message: `Failed to start rebase: Cannot rebase onto multiple branches. Check your 'upstream' parameter.`, error: errorMessage };
        }
        if (/does not point to a valid commit/i.test(errorMessage)) {
             return { success: false, mode: 'start', message: `Failed to start rebase: Invalid upstream, branch, or onto reference provided.`, error: errorMessage };
        }
        if (/your local changes would be overwritten/i.test(errorMessage)) {
            return { success: false, mode: input.mode, message: `Failed to ${input.mode} rebase: Your local changes to tracked files would be overwritten. Please commit or stash them.`, error: errorMessage };
        }
        if (/interactive rebase already started/i.test(errorMessage)) {
             return { success: false, mode: 'start', message: `Failed to start rebase: An interactive rebase is already in progress. Use 'continue', 'abort', or 'skip'.`, error: errorMessage };
        }


        // Throw McpError for critical issues like non-existent repo
        if (errorMessage.toLowerCase().includes('not a git repository')) {
          throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`, { context, operation, originalError: rebaseError });
        }

        // Return structured failure for other git errors
        return {
            success: false,
            mode: input.mode,
            message: `Git rebase ${input.mode} failed for path: ${targetPath}.`,
            error: errorMessage
        };
    }

  } catch (error: any) {
     // Catch errors from path resolution or unexpected issues before command execution
     logger.error(`Unexpected error during git rebase setup or execution`, { ...context, operation, path: targetPath, error: error.message });
     if (error instanceof McpError) throw error;
     throw new McpError(BaseErrorCode.INTERNAL_ERROR, `An unexpected error occurred during git rebase ${input.mode}: ${error.message}`, { context, operation, originalError: error });
  }
}
