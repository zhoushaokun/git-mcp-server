/**
 * @fileoverview Defines the core logic, schemas, and types for the git_pull tool.
 * @module src/mcp-server/tools/gitPull/logic
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
import { getGitStatus, GitStatusOutputSchema } from "../gitStatus/logic.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitPullInputSchema = z.object({
  path: z.string().default(".").describe("Path to the Git repository."),
  remote: z
    .string()
    .optional()
    .describe("The remote repository to pull from (e.g., 'origin')."),
  branch: z.string().optional().describe("The remote branch to pull."),
  rebase: z
    .boolean()
    .default(false)
    .describe("Use 'git pull --rebase' instead of merge."),
  ffOnly: z
    .boolean()
    .default(false)
    .describe("Only allow fast-forward merges."),
});

// 2. DEFINE the Zod response schema.
export const GitPullOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  conflict: z
    .boolean()
    .optional()
    .describe("True if a merge conflict occurred."),
  status: GitStatusOutputSchema.optional().describe(
    "The status of the repository after the pull operation.",
  ),
});

// 3. INFER and export TypeScript types.
export type GitPullInput = z.infer<typeof GitPullInputSchema>;
export type GitPullOutput = z.infer<typeof GitPullOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function pullGitChanges(
  params: GitPullInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitPullOutput> {
  const operation = "pullGitChanges";
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

  const args = ["-C", targetPath, "pull"];
  if (params.rebase) args.push("--rebase");
  if (params.ffOnly) args.push("--ff-only");
  if (params.remote) args.push(params.remote);
  if (params.branch) args.push(params.branch);

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  const { stdout, stderr } = await execFileAsync("git", args);

  const message =
    stdout.trim() || stderr.trim() || "Pull command executed successfully.";

  const status = await getGitStatus({ path: targetPath }, context);

  return {
    success: true,
    message,
    conflict: message.includes("CONFLICT"),
    status,
  };
}
