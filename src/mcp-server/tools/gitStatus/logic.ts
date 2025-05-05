import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js'; // Direct import for types-global
import { logger, RequestContext, sanitization } from '../../../utils/index.js'; // logger (./utils/internal/logger.js), RequestContext (./utils/internal/requestContext.js), sanitization (./utils/security/sanitization.js)

const execAsync = promisify(exec);

// Define the input schema for the git_status tool using Zod
export const GitStatusInputSchema = z.object({
  path: z.string().min(1).optional().default('.').describe("Path to the Git repository. Defaults to the directory set via `git_set_working_dir` for the session; set 'git_set_working_dir' if not set."),
});

// Infer the TypeScript type from the Zod schema
export type GitStatusInput = z.infer<typeof GitStatusInputSchema>;

// Define the structure for the JSON output
export interface GitStatusResult {
  currentBranch: string | null;
  staged: { status: string; file: string }[];
  modified: { status: string; file: string }[];
  untracked: string[];
  conflicted: string[];
  isClean: boolean;
}

/**
 * Parses the output of 'git status --porcelain=v1 -b'.
 * See: https://git-scm.com/docs/git-status#_porcelain_format_version_1
 *
 * @param {string} porcelainOutput - The raw output from the git command.
 * @returns {GitStatusResult} - Structured status information.
 */
function parseGitStatusPorcelainV1(porcelainOutput: string): GitStatusResult {
  const lines = porcelainOutput.trim().split('\n');
  const result: GitStatusResult = {
    currentBranch: null,
    staged: [],
    modified: [],
    untracked: [],
    conflicted: [],
    isClean: true, // Assume clean initially
  };

  if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
    // If output is empty, it might mean no branch yet or truly clean
    // We'll refine branch detection below if possible
    return result;
  }

  // First line often contains branch info (e.g., ## master...origin/master)
  if (lines[0].startsWith('## ')) {
    const branchLine = lines.shift()!; // Remove and process the branch line
    // Try matching standard branch format first (e.g., ## master...origin/master [ahead 1])
    // Make regex more specific: look for '...' or '[' after branch name, or end of line for simple branch name
    const standardBranchMatch = branchLine.match(/^## ([^ ]+?)(?:\.\.\.| \[.*\]|$)/);
    // Try matching the 'No commits yet' format (e.g., ## No commits yet on master)
    const noCommitsMatch = branchLine.match(/^## No commits yet on (.+)/);
    // Try matching detached HEAD format (e.g., ## HEAD (no branch))
    const detachedMatch = branchLine.match(/^## HEAD \(no branch\)/);

    if (standardBranchMatch) {
      result.currentBranch = standardBranchMatch[1];
      // TODO: Optionally parse ahead/behind counts if needed from the full match
    } else if (noCommitsMatch) {
      // More descriptive state: Branch exists but has no commits
      result.currentBranch = `${noCommitsMatch[1]} (no commits yet)`;
    } else if (detachedMatch) { // Handle detached HEAD
       result.currentBranch = 'HEAD (detached)';
    } else {
       // Fallback if branch line format is unexpected
       logger.warning('Could not parse branch information from line:', { branchLine });
       result.currentBranch = '(unknown)';
    }
  }


  for (const line of lines) {
    if (!line) continue; // Skip empty lines if any

    result.isClean = false; // Any line indicates non-clean state

    const xy = line.substring(0, 2);
    const file = line.substring(3); // Path starts after 'XY '

    const stagedStatus = xy[0];
    const unstagedStatus = xy[1];

    // Handle untracked files
    if (xy === '??') {
      result.untracked.push(file);
      continue;
    }

    // Handle conflicted files (complex statuses)
    if (stagedStatus === 'U' || unstagedStatus === 'U' || (stagedStatus === 'A' && unstagedStatus === 'A') || (stagedStatus === 'D' && unstagedStatus === 'D')) {
       result.conflicted.push(file);
       // Decide how to represent conflicts (could be more granular)
       if (!result.staged.some(f => f.file === file)) result.staged.push({ status: 'Conflicted', file });
       if (!result.modified.some(f => f.file === file)) result.modified.push({ status: 'Conflicted', file });
       continue;
    }


    // Handle staged changes (index status)
    if (stagedStatus !== ' ' && stagedStatus !== '?') {
       let statusDesc = 'Unknown Staged';
       switch (stagedStatus) {
           case 'M': statusDesc = 'Modified'; break;
           case 'A': statusDesc = 'Added'; break;
           case 'D': statusDesc = 'Deleted'; break;
           case 'R': statusDesc = 'Renamed'; break; // Often includes ' -> new_name' in file path
           case 'C': statusDesc = 'Copied'; break; // Often includes ' -> new_name' in file path
           case 'T': statusDesc = 'Type Changed'; break;
       }
       result.staged.push({ status: statusDesc, file });
    }

    // Handle unstaged changes (worktree status)
    if (unstagedStatus !== ' ' && unstagedStatus !== '?') {
       let statusDesc = 'Unknown Unstaged';
        switch (unstagedStatus) {
           case 'M': statusDesc = 'Modified'; break;
           case 'D': statusDesc = 'Deleted'; break;
           case 'T': statusDesc = 'Type Changed'; break;
           // Note: 'A' (Added) in unstaged usually means untracked ('??') handled above
       }
       // Avoid duplicating if already marked as conflicted
       if (!result.modified.some(f => f.file === file && f.status === 'Conflicted')) {
           result.modified.push({ status: statusDesc, file });
       }
    }
  }

  // Final check for cleanliness
  result.isClean = result.staged.length === 0 && result.modified.length === 0 && result.untracked.length === 0 && result.conflicted.length === 0;

  return result;
}


/**
 * Executes the 'git status --porcelain=v1 -b' command and returns structured JSON output.
 *
 * @param {GitStatusInput} input - The validated input object containing the repository path.
 * @param {RequestContext} context - The request context for logging and error handling.
 * @returns {Promise<GitStatusResult>} A promise that resolves with the structured git status.
 * @throws {McpError} Throws an McpError if path resolution or validation fails, or if the git command fails.
 */
export async function getGitStatus(
  input: GitStatusInput,
  context: RequestContext & { sessionId?: string; getWorkingDirectory: () => string | undefined } // Add getter to context
): Promise<GitStatusResult> {
  const operation = 'getGitStatus';
  logger.debug(`Executing ${operation}`, { ...context, input });

  let targetPath: string;
  try {
    // Resolve the target path
    if (input.path && input.path !== '.') {
      // Use the provided path directly
      targetPath = input.path;
      logger.debug(`Using provided path: ${targetPath}`, { ...context, operation });
    } else {
      // Path is '.' or undefined, try to get the session's working directory
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
    // Using --porcelain=v1 for stable, scriptable output and -b for branch info
    // Ensure the path passed to -C is correctly quoted for the shell
    const command = `git -C "${targetPath}" status --porcelain=v1 -b`;
    logger.debug(`Executing command: ${command}`, { ...context, operation });

    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      // Log stderr as warning but proceed to parse stdout
      logger.warning(`Git status command produced stderr (may be informational)`, { ...context, operation, stderr });
    }

    logger.info(`${operation} command executed, parsing output...`, { ...context, operation, path: targetPath });

    // Parse the porcelain output
    const structuredResult = parseGitStatusPorcelainV1(stdout);

    // If parsing resulted in clean state but no branch, re-check branch explicitly
    // This handles the case of an empty repo after init but before first commit
    if (structuredResult.isClean && !structuredResult.currentBranch) {
        try {
            const branchCommand = `git -C "${targetPath}" rev-parse --abbrev-ref HEAD`;
            const { stdout: branchStdout } = await execAsync(branchCommand);
            const currentBranch = branchStdout.trim();
            if (currentBranch && currentBranch !== 'HEAD') {
                structuredResult.currentBranch = currentBranch;
            }
        } catch (branchError) {
            // Ignore error if rev-parse fails (e.g., still no commits)
            logger.debug('Could not determine branch via rev-parse, likely no commits yet.', { ...context, operation, branchError });
        }
    }


    logger.info(`${operation} parsed successfully`, { ...context, operation, path: targetPath });
    return structuredResult; // Return the structured JSON object

  } catch (error: any) {
    logger.error(`Failed to execute or parse git status command`, { ...context, operation, path: targetPath, error: error.message, stderr: error.stderr });

    const errorMessage = error.stderr || error.message || '';
    if (errorMessage.toLowerCase().includes('not a git repository')) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`, { context, operation, originalError: error });
    }

    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Failed to get git status for path: ${targetPath}. Error: ${errorMessage}`, { context, operation, originalError: error });
  }
}
