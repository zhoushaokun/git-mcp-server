/**
 * @fileoverview Defines the core logic, schemas, and types for the git_checkout tool.
 * @module src/mcp-server/tools/gitCheckout/logic
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
export const GitCheckoutInputSchema = z.object({
  path: z
    .string()
    .default(".")
    .describe(
      "Path to the Git repository. Defaults to the directory set via `git_set_working_dir` for the session; set 'git_set_working_dir' if not set.",
    ),
  branchOrPath: z
    .string()
    .min(1)
    .describe("The branch, commit, tag, or file path to checkout."),
  newBranch: z
    .string()
    .optional()
    .describe("Create a new branch with this name before checking out."),
  force: z
    .boolean()
    .default(false)
    .describe("Force checkout, discarding local changes."),
});

// 2. DEFINE the Zod response schema.
export const GitCheckoutOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  currentBranch: z
    .string()
    .optional()
    .describe("The name of the current branch after the operation."),
  newBranchCreated: z
    .boolean()
    .optional()
    .describe("Indicates if a new branch was created."),
  status: GitStatusOutputSchema.optional().describe(
    "The status of the repository after the checkout operation.",
  ),
});

// 3. INFER and export TypeScript types.
export type GitCheckoutInput = z.infer<typeof GitCheckoutInputSchema>;
export type GitCheckoutOutput = z.infer<typeof GitCheckoutOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function checkoutGit(
  params: GitCheckoutInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitCheckoutOutput> {
  const operation = "checkoutGit";
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

  const args = ["-C", targetPath, "checkout"];
  if (params.force) args.push("--force");
  if (params.newBranch) args.push("-b", params.newBranch);
  args.push(params.branchOrPath);

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  const { stdout, stderr } = await execFileAsync("git", args);

  const message = stderr.trim() || stdout.trim();
  logger.info("git checkout executed successfully", {
    ...context,
    operation,
    message,
  });

  let currentBranch: string | undefined;
  try {
    const { stdout: branchStdout } = await execFileAsync("git", [
      "-C",
      targetPath,
      "branch",
      "--show-current",
    ]);
    currentBranch = branchStdout.trim();
  } catch {
    currentBranch = "Detached HEAD";
  }

  const status = await getGitStatus({ path: targetPath }, context);

  return {
    success: true,
    message,
    currentBranch,
    newBranchCreated: !!params.newBranch,
    status,
  };
}
