/**
 * @fileoverview Defines the core logic, schemas, and types for the git_log tool.
 * @module src/mcp-server/tools/gitLog/logic
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import {
  logger,
  type RequestContext,
  sanitization,
} from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitLogInputSchema = z.object({
  path: z.string().default(".").describe("Path to the Git repository."),
  maxCount: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Limit the number of commits to output."),
  author: z
    .string()
    .optional()
    .describe("Limit commits to those by a specific author."),
  since: z
    .string()
    .optional()
    .describe(
      "Show commits more recent than a specific date (e.g., '2 weeks ago').",
    ),
  until: z
    .string()
    .optional()
    .describe("Show commits older than a specific date."),
  branchOrFile: z
    .string()
    .optional()
    .describe("Show logs for a specific branch, tag, or file path."),
  showSignature: z
    .boolean()
    .default(false)
    .describe("Show signature verification status for commits."),
});

// 2. DEFINE the Zod response schema.
const CommitEntrySchema = z.object({
  hash: z.string().describe("Full commit hash"),
  authorName: z.string().describe("Author's name"),
  authorEmail: z.string().email().describe("Author's email"),
  timestamp: z
    .number()
    .int()
    .positive()
    .describe("Commit timestamp (Unix epoch seconds)"),
  subject: z.string().describe("Commit subject line"),
  body: z.string().optional().describe("Commit body"),
});

export const GitLogOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  commits: z.array(CommitEntrySchema).optional().describe("A list of commits."),
  rawOutput: z
    .string()
    .optional()
    .describe(
      "Raw output from the git log command, used when showSignature is true.",
    ),
});

// 3. INFER and export TypeScript types.
export type GitLogInput = z.infer<typeof GitLogInputSchema>;
export type GitLogOutput = z.infer<typeof GitLogOutputSchema>;
type CommitEntry = z.infer<typeof CommitEntrySchema>;

const FIELD_SEP = "\x1f";
const RECORD_SEP = "\x1e";
const GIT_LOG_FORMAT = `--pretty=format:%H${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%at${FIELD_SEP}%s${FIELD_SEP}%b${RECORD_SEP}`;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function logGitHistory(
  params: GitLogInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitLogOutput> {
  const operation = "logGitHistory";
  logger.debug(`Executing ${operation}`, { ...context, params });

  const workingDir = context.getWorkingDirectory();
  if (params.path === "." && !workingDir) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      "No session working directory set. Please specify a 'path' or use 'git_set_working_dir' first.",
    );
  }
  const targetPath = sanitization.sanitizePath(
    params.path === "." ? workingDir! : params.path,
    { allowAbsolute: true },
  ).sanitizedPath;

  const args = ["-C", targetPath, "log"];
  if (params.showSignature) {
    args.push("--show-signature");
  } else {
    args.push(GIT_LOG_FORMAT);
  }
  if (params.maxCount) args.push(`-n${params.maxCount}`);
  if (params.author) args.push(`--author=${params.author}`);
  if (params.since) args.push(`--since=${params.since}`);
  if (params.until) args.push(`--until=${params.until}`);
  if (params.branchOrFile) args.push(params.branchOrFile);

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  const { stdout, stderr } = await execFileAsync("git", args, {
    maxBuffer: 1024 * 1024 * 10,
  });

  if (
    stderr &&
    stderr.toLowerCase().includes("does not have any commits yet")
  ) {
    return {
      success: true,
      message: "Repository has no commits yet.",
      commits: [],
    };
  }

  if (params.showSignature) {
    return {
      success: true,
      message: "Raw log output with signature status.",
      rawOutput: stdout,
    };
  }

  const commitRecords = stdout.split(RECORD_SEP).filter((r) => r.trim());
  const commits = commitRecords
    .map((record): CommitEntry | null => {
      const fields = record.trim().split(FIELD_SEP);
      if (fields.length < 5) {
        return null; // Skip records with insufficient fields
      }
      const [
        hash,
        authorName,
        authorEmail,
        timestampStr,
        subject,
        body = undefined,
      ] = fields;

      if (hash && authorName && authorEmail && timestampStr && subject) {
        const timestamp = parseInt(timestampStr, 10);
        if (!isNaN(timestamp)) {
          return {
            hash,
            authorName,
            authorEmail,
            timestamp,
            subject,
            body: body || undefined,
          };
        }
      }
      return null;
    })
    .filter((item): item is CommitEntry => item !== null);

  return {
    success: true,
    message: `Found ${commits.length} commit(s).`,
    commits,
  };
}
