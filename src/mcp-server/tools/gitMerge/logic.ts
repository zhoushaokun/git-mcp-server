/**
 * @fileoverview Defines the core logic, schemas, and types for the git_merge tool.
 * @module src/mcp-server/tools/gitMerge/logic
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { logger, type RequestContext, sanitization } from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitMergeInputSchema = z.object({
  path: z.string().default(".").describe("Path to the Git repository."),
  branch: z.string().min(1).describe("The name of the branch to merge into the current branch."),
  commitMessage: z.string().optional().describe("Commit message for the merge commit."),
  noFf: z.boolean().default(false).describe("Create a merge commit even if a fast-forward is possible."),
  squash: z.boolean().default(false).describe("Combine merged changes into a single commit (requires manual commit)."),
  abort: z.boolean().default(false).describe("Abort the current merge process."),
});

// 2. DEFINE the Zod response schema.
export const GitMergeOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  conflict: z.boolean().optional().describe("True if the merge resulted in conflicts."),
  fastForward: z.boolean().optional().describe("True if the merge was a fast-forward."),
  aborted: z.boolean().optional().describe("True if the merge was aborted."),
  needsManualCommit: z.boolean().optional().describe("True if --squash was used."),
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
  context: RequestContext & { getWorkingDirectory: () => string | undefined }
): Promise<GitMergeOutput> {
  const operation = "gitMergeLogic";
  logger.debug(`Executing ${operation}`, { ...context, params });

  const workingDir = context.getWorkingDirectory();
  const targetPath = sanitization.sanitizePath(params.path === "." ? (workingDir || process.cwd()) : params.path, { allowAbsolute: true }).sanitizedPath;

  const args = ["-C", targetPath, "merge"];
  if (params.abort) {
    args.push("--abort");
  } else {
    if (params.noFf) args.push("--no-ff");
    if (params.squash) args.push("--squash");
    if (params.commitMessage && !params.squash) args.push("-m", params.commitMessage);
    args.push(params.branch);
  }

  try {
    logger.debug(`Executing command: git ${args.join(" ")}`, { ...context, operation });
    const { stdout } = await execFileAsync("git", args);

    return {
      success: true,
      message: stdout.trim() || "Merge command executed successfully.",
      fastForward: stdout.includes("Fast-forward"),
      needsManualCommit: params.squash,
      aborted: params.abort,
    };

  } catch (error: any) {
    const errorMessage = error.stderr || error.stdout || error.message || "";
    logger.error(`Git merge command failed`, { ...context, operation, errorMessage });

    if (errorMessage.includes("CONFLICT")) {
      throw new McpError(BaseErrorCode.CONFLICT, "Merge failed due to conflicts. Please resolve them and commit.");
    }
    if (errorMessage.includes("unrelated histories")) {
      throw new McpError(BaseErrorCode.VALIDATION_ERROR, "Merge failed: Refusing to merge unrelated histories.");
    }
    if (errorMessage.includes("not a git repository")) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`);
    }
    if (errorMessage.match(/fatal: '.*?' does not point to a commit/)) {
        throw new McpError(BaseErrorCode.NOT_FOUND, `Merge failed: Branch '${params.branch}' not found.`);
    }

    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Git merge failed: ${errorMessage}`);
  }
}
