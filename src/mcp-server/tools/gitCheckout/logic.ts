/**
 * @fileoverview Defines the core logic, schemas, and types for the git_checkout tool.
 * @module src/mcp-server/tools/gitCheckout/logic
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { logger, type RequestContext, sanitization } from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitCheckoutInputSchema = z.object({
  path: z.string().default(".").describe("Path to the Git repository."),
  branchOrPath: z.string().min(1).describe("The branch, commit, tag, or file path to checkout."),
  newBranch: z.string().optional().describe("Create a new branch with this name before checking out."),
  force: z.boolean().default(false).describe("Force checkout, discarding local changes."),
});

// 2. DEFINE the Zod response schema.
export const GitCheckoutOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  currentBranch: z.string().optional().describe("The name of the current branch after the operation."),
  newBranchCreated: z.boolean().optional().describe("Indicates if a new branch was created."),
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
  context: RequestContext & { getWorkingDirectory: () => string | undefined }
): Promise<GitCheckoutOutput> {
  const operation = "checkoutGit";
  logger.debug(`Executing ${operation}`, { ...context, params });

  const workingDir = context.getWorkingDirectory();
  const targetPath = sanitization.sanitizePath(params.path === "." ? (workingDir || process.cwd()) : params.path, { allowAbsolute: true }).sanitizedPath;

  const args = ["checkout"];
  if (params.force) args.push("--force");
  if (params.newBranch) args.push("-b", params.newBranch);
  args.push(params.branchOrPath);

  try {
    logger.debug(`Executing command: git ${args.join(" ")} in ${targetPath}`, { ...context, operation });
    const { stdout, stderr } = await execFileAsync("git", args, { cwd: targetPath });

    const message = stderr.trim() || stdout.trim();
    logger.info("git checkout executed successfully", { ...context, operation, message });

    let currentBranch: string | undefined;
    try {
      const { stdout: branchStdout } = await execFileAsync("git", ["branch", "--show-current"], { cwd: targetPath });
      currentBranch = branchStdout.trim();
    } catch {
      currentBranch = "Detached HEAD";
    }

    return {
      success: true,
      message,
      currentBranch,
      newBranchCreated: !!params.newBranch,
    };
  } catch (error: any) {
    const errorMessage = error.stderr || error.stdout || error.message || "";
    logger.error(`Failed to execute git checkout command`, { ...context, operation, errorMessage });

    if (errorMessage.toLowerCase().includes("not a git repository")) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`);
    }
    if (errorMessage.match(/pathspec '.*?' did not match/)) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Branch or pathspec not found: ${params.branchOrPath}.`);
    }
    if (errorMessage.includes("already exists")) {
      throw new McpError(BaseErrorCode.CONFLICT, `Cannot create new branch '${params.newBranch}': it already exists.`);
    }
    if (errorMessage.includes("overwritten by checkout")) {
      throw new McpError(BaseErrorCode.CONFLICT, "Checkout failed due to uncommitted local changes. Stash or commit them, or use --force.");
    }
    if (errorMessage.includes("invalid reference")) {
      throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Invalid branch name or reference: ${params.branchOrPath}.`);
    }

    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Git checkout failed: ${errorMessage}`);
  }
}
