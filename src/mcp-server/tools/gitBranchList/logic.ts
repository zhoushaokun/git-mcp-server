import { z } from 'zod';
import { promisify } from 'util';
import { exec } from 'child_process';
import { logger } from '../../../utils/logger.js';
import { RequestContext } from '../../../utils/requestContext.js';
import { McpError, BaseErrorCode } from '../../../types-global/errors.js';
import { sanitization } from '../../../utils/sanitization.js';
import path from 'path'; // Import path module

const execAsync = promisify(exec);

// Define the input schema for the git_branch_list tool using Zod
export const GitBranchListInputSchema = z.object({
  path: z.string().min(1).optional().default('.').describe("Path to the Git repository (defaults to '.' which uses the session's working directory if set)"),
  all: z.boolean().default(false).describe('Whether to include remote branches in the list'),
});

// Infer the TypeScript type from the Zod schema
export type GitBranchListInput = z.infer<typeof GitBranchListInputSchema>;

// Define the structure for the JSON output
export interface GitBranchListResult {
  currentBranch: string | null;
  branches: string[];
}

/**
 * Parses the output of 'git branch [-a]'.
 * Identifies the current branch (marked with '*') and lists all branches.
 *
 * @param {string} branchOutput - The raw output from the git branch command.
 * @returns {GitBranchListResult} - Structured branch information.
 */
function parseGitBranchOutput(branchOutput: string): GitBranchListResult {
  const lines = branchOutput.trim().split('\n');
  const result: GitBranchListResult = {
    currentBranch: null,
    branches: [],
  };

  if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
    return result; // No branches found or empty output
  }

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    let branchName = trimmedLine;
    if (trimmedLine.startsWith('* ')) {
      // Found the current branch
      branchName = trimmedLine.substring(2).trim();
      // Handle detached HEAD state reported by 'git branch'
      if (branchName.startsWith('(HEAD detached at')) {
         result.currentBranch = 'HEAD (detached)';
         // Extract the actual commit hash or tag if needed, or just keep it simple
         // Example: Extract commit: branchName.match(/\(HEAD detached at (\w+)\)/)?.[1]
      } else {
         result.currentBranch = branchName;
      }
    }
     // Clean up potential remote prefixes like 'remotes/origin/' if listing all branches
     // This might need adjustment based on desired output format for remotes
     // branchName = branchName.replace(/^remotes\/[^\/]+\//, '');

    // Avoid adding duplicates if parsing detached HEAD description
    if (branchName !== result.currentBranch || !result.currentBranch?.startsWith('HEAD (detached')) {
       result.branches.push(branchName);
    }
  }

   // If currentBranch is still null after parsing, it might be an empty repo
   // or some other edge case. The caller might need to handle this.

  return result;
}


/**
 * Executes the 'git branch' command and returns structured JSON output.
 *
 * @param {GitBranchListInput} input - The validated input object.
 * @param {RequestContext} context - The request context for logging and error handling.
 * @returns {Promise<GitBranchListResult>} A promise that resolves with the structured branch list.
 * @throws {McpError} Throws an McpError if path resolution or validation fails, or if the git command fails.
 */
export async function getGitBranchList(
  input: GitBranchListInput,
  context: RequestContext & { sessionId?: string; getWorkingDirectory: () => string | undefined } // Add getter to context
): Promise<GitBranchListResult> {
  const operation = 'getGitBranchList';
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
    const commandOptions = input.all ? '-a' : ''; // Use '-a' for all branches
    // Ensure the path passed to -C is correctly quoted for the shell
    const command = `git -C "${targetPath}" branch ${commandOptions}`;
    logger.debug(`Executing command: ${command}`, { ...context, operation });

    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      logger.warning(`Git branch command produced stderr`, { ...context, operation, stderr });
    }

    logger.info(`${operation} command executed, parsing output...`, { ...context, operation, path: targetPath });

    // Parse the command output
    const structuredResult = parseGitBranchOutput(stdout);

    logger.info(`${operation} parsed successfully`, { ...context, operation, path: targetPath });
    return structuredResult; // Return the structured JSON object

  } catch (error: any) {
    logger.error(`Failed to execute or parse git branch command`, { ...context, operation, path: targetPath, error: error.message, stderr: error.stderr });

    const errorMessage = error.stderr || error.message || '';
    if (errorMessage.toLowerCase().includes('not a git repository')) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`, { context, operation, originalError: error });
    }

    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Failed to list branches for path: ${targetPath}. Error: ${errorMessage}`, { context, operation, originalError: error });
  }
}
