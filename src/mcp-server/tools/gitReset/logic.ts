/**
 * @fileoverview Defines the core logic, schemas, and types for the git_reset tool.
 * @module src/mcp-server/tools/gitReset/logic
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
export const GitResetInputSchema = z.object({
  path: z.string().default(".").describe("Path to the Git repository."),
  mode: z
    .enum(["soft", "mixed", "hard", "merge", "keep"])
    .default("mixed")
    .describe("Reset mode."),
  commit: z
    .string()
    .optional()
    .describe("Commit, branch, or ref to reset to. Defaults to HEAD."),
});

// 2. DEFINE the Zod response schema.
export const GitResetOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  changesSummary: z.string().optional().describe("Summary of changes, if any."),
  status: GitStatusOutputSchema.optional().describe(
    "The status of the repository after the reset operation.",
  ),
});

// 3. INFER and export TypeScript types.
export type GitResetInput = z.infer<typeof GitResetInputSchema>;
export type GitResetOutput = z.infer<typeof GitResetOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function resetGitState(
  params: GitResetInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitResetOutput> {
  const operation = "resetGitState";
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

  const args = ["-C", targetPath, "reset"];
  args.push(`--${params.mode}`);
  if (params.commit) args.push(params.commit);

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  const { stdout, stderr } = await execFileAsync("git", args);

  const message =
    stderr.trim() ||
    stdout.trim() ||
    `Reset successful (mode: ${params.mode}).`;
  const changesSummary = stderr.includes("Unstaged changes after reset")
    ? stderr
    : undefined;

  const status = await getGitStatus({ path: targetPath }, context);

  return { success: true, message, changesSummary, status };
}
