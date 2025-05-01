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

// Define the structure for a single commit entry
export const CommitEntrySchema = z.object({
  hash: z.string().describe("Full commit hash"),
  authorName: z.string().describe("Author's name"),
  authorEmail: z.string().email().describe("Author's email"),
  timestamp: z.number().int().positive().describe("Commit timestamp (Unix epoch seconds)"),
  subject: z.string().describe("Commit subject line"),
  body: z.string().optional().describe("Commit body (optional)"),
});
export type CommitEntry = z.infer<typeof CommitEntrySchema>;

// Define the input schema for the git_log tool using Zod
export const GitLogInputSchema = z.object({
  path: z.string().min(1).optional().default('.').describe("Path to the Git repository. Defaults to the session's working directory if set."),
  maxCount: z.number().int().positive().optional().describe("Limit the number of commits to output."),
  author: z.string().optional().describe("Limit commits to those matching the specified author pattern."),
  since: z.string().optional().describe("Show commits more recent than a specific date (e.g., '2 weeks ago', '2023-01-01')."),
  until: z.string().optional().describe("Show commits older than a specific date."),
  branchOrFile: z.string().optional().describe("Show logs for a specific branch, tag, or file path."),
  // Note: We use a fixed pretty format for reliable parsing. Custom formats are not directly supported via input.
});

// Infer the TypeScript type from the Zod schema
export type GitLogInput = z.infer<typeof GitLogInputSchema>;

// Define the structure for the JSON output
export interface GitLogResult {
  success: boolean;
  commits: CommitEntry[];
  message?: string; // Optional message, e.g., if no commits found
}

// Delimiters for parsing the custom format
const FIELD_SEP = '\x1f'; // Unit Separator
const RECORD_SEP = '\x1e'; // Record Separator
const GIT_LOG_FORMAT = `--pretty=format:%H${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%at${FIELD_SEP}%s${FIELD_SEP}%b${RECORD_SEP}`; // %H=hash, %an=author name, %ae=author email, %at=timestamp, %s=subject, %b=body

/**
 * Executes the 'git log' command with a specific format and returns structured JSON output.
 *
 * @param {GitLogInput} input - The validated input object.
 * @param {RequestContext} context - The request context for logging and error handling.
 * @returns {Promise<GitLogResult>} A promise that resolves with the structured log result.
 * @throws {McpError} Throws an McpError if path resolution, validation, or the git command fails unexpectedly.
 */
export async function logGitHistory(
  input: GitLogInput,
  context: RequestContext & { sessionId?: string; getWorkingDirectory: () => string | undefined }
): Promise<GitLogResult> {
  const operation = 'logGitHistory';
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

  try {
    // Construct the git log command
    // Use a specific format for reliable parsing
    let command = `git -C "${targetPath}" log ${GIT_LOG_FORMAT}`;

    if (input.maxCount) {
      command += ` -n ${input.maxCount}`;
    }
    if (input.author) {
      // Basic sanitization for author string
      const safeAuthor = input.author.replace(/[`"$&;*()|<>]/g, '');
      command += ` --author="${safeAuthor}"`;
    }
    if (input.since) {
      const safeSince = input.since.replace(/[`"$&;*()|<>]/g, '');
      command += ` --since="${safeSince}"`;
    }
    if (input.until) {
      const safeUntil = input.until.replace(/[`"$&;*()|<>]/g, '');
      command += ` --until="${safeUntil}"`;
    }
    if (input.branchOrFile) {
      const safeBranchOrFile = input.branchOrFile.replace(/[`"$&;*()|<>]/g, '');
      command += ` ${safeBranchOrFile}`; // Add branch or file path at the end
    }

    logger.debug(`Executing command: ${command}`, { ...context, operation });

    // Increase maxBuffer if logs can be large
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer

    if (stderr) {
      // Log stderr as warning, as git log might sometimes use it for non-fatal info
      logger.warning(`Git log stderr: ${stderr}`, { ...context, operation });
    }

    // Parse the output
    const commits: CommitEntry[] = [];
    const commitRecords = stdout.split(RECORD_SEP).filter(record => record.trim() !== ''); // Split records and remove empty ones

    for (const record of commitRecords) {
      const fields = record.split(FIELD_SEP);
      if (fields.length >= 5) { // Need at least hash, name, email, timestamp, subject
        try {
          const commitEntry: CommitEntry = {
            hash: fields[0],
            authorName: fields[1],
            authorEmail: fields[2],
            timestamp: parseInt(fields[3], 10), // Unix timestamp
            subject: fields[4],
            body: fields[5] || undefined, // Body might be empty
          };
          // Validate parsed entry (optional but recommended)
          CommitEntrySchema.parse(commitEntry);
          commits.push(commitEntry);
        } catch (parseError) {
            logger.warning(`Failed to parse commit record field`, { ...context, operation, fieldIndex: fields.findIndex((_, i) => i > 5), recordFragment: record.substring(0, 100), parseError });
            // Decide whether to skip the commit or throw an error
        }
      } else {
         logger.warning(`Skipping commit record due to unexpected number of fields (${fields.length})`, { ...context, operation, recordFragment: record.substring(0, 100) });
      }
    }

    const message = commits.length > 0 ? `${commits.length} commit(s) found.` : 'No commits found matching criteria.';
    logger.info(`${operation} completed successfully. ${message}`, { ...context, operation, path: targetPath, commitCount: commits.length });
    return { success: true, commits, message };

  } catch (error: any) {
    logger.error(`Failed to execute git log command`, { ...context, operation, path: targetPath, error: error.message, stderr: error.stderr, stdout: error.stdout });

    const errorMessage = error.stderr || error.stdout || error.message || '';

    // Handle specific error cases
    if (errorMessage.toLowerCase().includes('not a git repository')) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`, { context, operation, originalError: error });
    }
     if (errorMessage.includes('fatal: bad revision')) {
        throw new McpError(BaseErrorCode.NOT_FOUND, `Invalid branch, tag, or revision specified: '${input.branchOrFile}'. Error: ${errorMessage}`, { context, operation, originalError: error });
    }
     if (errorMessage.includes('fatal: ambiguous argument')) {
        throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Ambiguous argument provided (e.g., branch/tag/file conflict): '${input.branchOrFile}'. Error: ${errorMessage}`, { context, operation, originalError: error });
    }

    // Check if it's just that no commits were found (which git might treat as an error in some cases, though usually not for log)
    if (errorMessage.includes('does not have any commits yet')) {
        logger.info('Repository has no commits yet.', { ...context, operation, path: targetPath });
        return { success: true, commits: [], message: 'Repository has no commits yet.' };
    }


    // Generic internal error for other failures
    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Failed to get git log for path: ${targetPath}. Error: ${errorMessage}`, { context, operation, originalError: error });
  }
}
