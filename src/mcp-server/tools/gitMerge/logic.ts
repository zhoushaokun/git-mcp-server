/**
 * @fileoverview Defines the core logic, schemas, and types for the git_merge tool.
 * @module src/mcp-server/tools/gitMerge/logic
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
import { config } from "../../../config/index.js";
import { getGitStatus, GitStatusOutputSchema } from "../gitStatus/logic.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitMergeInputSchema = z.object({
  path: z.string().default(".").describe("Path to the Git repository."),
  branch: z
    .string()
    .min(1)
    .describe("The name of the branch to merge into the current branch."),
  commitMessage: z
    .string()
    .optional()
    .describe("Commit message for the merge commit."),
  noFf: z
    .boolean()
    .default(false)
    .describe("Create a merge commit even if a fast-forward is possible."),
  squash: z
    .boolean()
    .default(false)
    .describe(
      "Combine merged changes into a single commit (requires manual commit).",
    ),
  abort: z
    .boolean()
    .default(false)
    .describe("Abort the current merge process."),
});

// 2. DEFINE the Zod response schema.
export const GitMergeOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  conflict: z
    .boolean()
    .optional()
    .describe("True if the merge resulted in conflicts."),
  fastForward: z
    .boolean()
    .optional()
    .describe("True if the merge was a fast-forward."),
  aborted: z.boolean().optional().describe("True if the merge was aborted."),
  needsManualCommit: z
    .boolean()
    .optional()
    .describe("True if --squash was used."),
  status: GitStatusOutputSchema.optional().describe(
    "The status of the repository after the merge operation.",
  ),
});

// 3. INFER and export TypeScript types.
export type GitMergeInput = z.infer<typeof GitMergeInputSchema>;
export type GitMergeOutput = z.infer<typeof GitMergeOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitMergeLogic(
  params: GitMergeInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitMergeOutput> {
  const operation = "gitMergeLogic";
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

  const attemptMerge = async (withSigning: boolean) => {
    const args = ["-C", targetPath, "merge"];
    if (params.abort) {
      args.push("--abort");
    } else {
      if (withSigning) args.push("-S");
      if (params.noFf) args.push("--no-ff");
      if (params.squash) args.push("--squash");
      if (params.commitMessage && !params.squash)
        args.push("-m", params.commitMessage);
      args.push(params.branch);
    }
    logger.debug(`Executing command: git ${args.join(" ")}`, {
      ...context,
      operation,
    });
    return await execFileAsync("git", args);
  };

  // A merge commit is only created if it's not a fast-forward (or --no-ff is used)
  // and we are not squashing or aborting.
  const createsMergeCommit = !params.squash && !params.abort;
  const shouldSign = !!config.gitSignCommits && createsMergeCommit;

  let stdout: string;
  try {
    const result = await attemptMerge(shouldSign);
    stdout = result.stdout;
  } catch (error: unknown) {
    const err = error as { stderr?: string }; // Cast to a type that might have stderr
    const isSigningError = (err.stderr || "").includes("gpg failed to sign");
    if (shouldSign && isSigningError) {
      logger.warning(
        "Merge with signing failed. Retrying automatically without signature.",
        { ...context, operation },
      );
      const result = await attemptMerge(false);
      stdout = result.stdout;
    } else {
      throw error;
    }
  }

  const status = await getGitStatus({ path: targetPath }, context);

  return {
    success: true,
    message: stdout.trim() || "Merge command executed successfully.",
    fastForward: stdout.includes("Fast-forward"),
    needsManualCommit: params.squash,
    aborted: params.abort,
    status,
  };
}
