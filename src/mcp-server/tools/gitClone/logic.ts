/**
 * @fileoverview Defines the core logic, schemas, and types for the git_clone tool.
 * @module src/mcp-server/tools/gitClone/logic
 */

import { execFile } from "child_process";
import fs from "fs/promises";
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
export const GitCloneInputSchema = z.object({
  repositoryUrl: z
    .string()
    .url("Invalid repository URL format.")
    .describe("The URL of the repository to clone."),
  targetPath: z
    .string()
    .min(1)
    .describe("The absolute path where the repository should be cloned."),
  branch: z
    .string()
    .optional()
    .describe("The specific branch to checkout after cloning."),
  depth: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Create a shallow clone with a truncated history."),
  quiet: z
    .boolean()
    .default(false)
    .describe("Operate quietly, suppressing progress output."),
});

// 2. DEFINE the Zod response schema.
export const GitCloneOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  path: z.string().describe("The path where the repository was cloned."),
});

// 3. INFER and export TypeScript types.
export type GitCloneInput = z.infer<typeof GitCloneInputSchema>;
export type GitCloneOutput = z.infer<typeof GitCloneOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitCloneLogic(
  params: GitCloneInput,
  context: RequestContext,
): Promise<GitCloneOutput> {
  const operation = "gitCloneLogic";
  logger.debug(`Executing ${operation}`, { ...context, params });

  const sanitizedTargetPath = sanitization.sanitizePath(params.targetPath, {
    allowAbsolute: true,
  }).sanitizedPath;

  const stats = await fs.stat(sanitizedTargetPath).catch((err) => {
    if (err.code === "ENOENT") return null;
    throw err;
  });

  if (stats) {
    if (stats.isDirectory()) {
      const files = await fs.readdir(sanitizedTargetPath);
      if (files.length > 0) {
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          `Target directory already exists and is not empty: ${sanitizedTargetPath}`,
        );
      }
    } else {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Target path exists but is not a directory: ${sanitizedTargetPath}`,
      );
    }
  }

  const args = ["clone"];
  if (params.quiet) args.push("--quiet");
  if (params.branch) args.push("--branch", params.branch);
  if (params.depth) args.push("--depth", String(params.depth));
  args.push(params.repositoryUrl, sanitizedTargetPath);

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  await execFileAsync("git", args, { timeout: 300000 }); // 5 minutes timeout

  const successMessage = `Repository cloned successfully into ${sanitizedTargetPath}`;
  return { success: true, message: successMessage, path: sanitizedTargetPath };
}
