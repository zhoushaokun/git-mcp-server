/**
 * @fileoverview Defines the core logic, schemas, and types for the git_show tool.
 * @module src/mcp-server/tools/gitShow/logic
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { logger, type RequestContext, sanitization } from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitShowInputSchema = z.object({
  path: z.string().default(".").describe("Path to the local Git repository."),
  ref: z.string().min(1).describe("The object reference (commit hash, tag, branch, etc.) to show."),
  filePath: z.string().optional().describe("Optional specific file path within the ref to show."),
});

// 2. DEFINE the Zod response schema.
export const GitShowOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  content: z.string().describe("Raw output from the git show command."),
});

// 3. INFER and export TypeScript types.
export type GitShowInput = z.infer<typeof GitShowInputSchema>;
export type GitShowOutput = z.infer<typeof GitShowOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitShowLogic(
  params: GitShowInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined }
): Promise<GitShowOutput> {
  const operation = "gitShowLogic";
  logger.debug(`Executing ${operation}`, { ...context, params });

  const workingDir = context.getWorkingDirectory();
  const targetPath = sanitization.sanitizePath(params.path === "." ? (workingDir || process.cwd()) : params.path, { allowAbsolute: true }).sanitizedPath;

  const refSpec = params.filePath ? `${params.ref}:${params.filePath}` : params.ref;
  const args = ["-C", targetPath, "show", refSpec];

  try {
    logger.debug(`Executing command: git ${args.join(" ")}`, { ...context, operation });
    const { stdout } = await execFileAsync("git", args);
    return { success: true, content: stdout };
  } catch (error: any) {
    const errorMessage = error.stderr || error.message || "";
    logger.error(`Failed to execute git show command`, { ...context, operation, errorMessage });

    if (errorMessage.toLowerCase().includes("not a git repository")) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`);
    }
    if (/unknown revision or path not in the working tree/i.test(errorMessage)) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Reference or pathspec not found: '${refSpec}'.`);
    }
    if (/ambiguous argument/i.test(errorMessage)) {
      throw new McpError(BaseErrorCode.VALIDATION_ERROR, `Reference '${params.ref}' is ambiguous.`);
    }

    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Git show failed: ${errorMessage}`);
  }
}
