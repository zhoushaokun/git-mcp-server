/**
 * @fileoverview Defines the core logic, schemas, and types for the git_push tool.
 * @module src/mcp-server/tools/gitPush/logic
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
export const GitPushBaseSchema = z.object({
  path: z.string().default(".").describe("Path to the Git repository."),
  remote: z
    .string()
    .optional()
    .describe("The remote repository to push to (e.g., 'origin')."),
  branch: z.string().optional().describe("The local branch to push."),
  remoteBranch: z.string().optional().describe("The remote branch to push to."),
  force: z
    .boolean()
    .default(false)
    .describe("Force the push (use with caution)."),
  forceWithLease: z
    .boolean()
    .default(false)
    .describe("Force the push only if the remote ref is as expected."),
  setUpstream: z
    .boolean()
    .default(false)
    .describe("Set the upstream tracking configuration."),
  tags: z.boolean().default(false).describe("Push all tags."),
  delete: z.boolean().default(false).describe("Delete the remote branch."),
});

export const GitPushInputSchema = GitPushBaseSchema.refine(
  (data) => !(data.delete && !data.branch),
  {
    message: "Cannot use --delete without specifying a branch to delete.",
    path: ["delete", "branch"],
  },
).refine((data) => !(data.force && data.forceWithLease), {
  message: "Cannot use --force and --force-with-lease together.",
  path: ["force", "forceWithLease"],
});

// 2. DEFINE the Zod response schema.
export const GitPushOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  rejected: z.boolean().optional().describe("True if the push was rejected."),
  deleted: z
    .boolean()
    .optional()
    .describe("True if a remote branch was deleted."),
});

// 3. INFER and export TypeScript types.
export type GitPushInput = z.infer<typeof GitPushInputSchema>;
export type GitPushOutput = z.infer<typeof GitPushOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function pushGitChanges(
  params: GitPushInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitPushOutput> {
  const operation = "pushGitChanges";
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

  const args = ["-C", targetPath, "push"];
  if (params.force) args.push("--force");
  else if (params.forceWithLease) args.push("--force-with-lease");
  if (params.setUpstream) args.push("--set-upstream");
  if (params.tags) args.push("--tags");
  if (params.delete) args.push("--delete");

  args.push(params.remote || "origin");
  if (params.branch) {
    if (params.remoteBranch && !params.delete) {
      args.push(`${params.branch}:${params.remoteBranch}`);
    } else {
      args.push(params.branch);
    }
  }

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  const { stdout, stderr } = await execFileAsync("git", args);

  const message =
    stderr.trim() || stdout.trim() || "Push command executed successfully.";
  return {
    success: true,
    message,
    rejected: message.includes("[rejected]"),
    deleted: message.includes("[deleted]"),
  };
}
