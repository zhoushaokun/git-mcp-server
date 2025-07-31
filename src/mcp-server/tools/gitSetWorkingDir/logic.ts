/**
 * @fileoverview Defines the core logic, schemas, and types for the git_set_working_dir tool.
 * @module src/mcp-server/tools/gitSetWorkingDir/logic
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
export const GitSetWorkingDirInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe("The absolute path to set as the default working directory."),
  validateGitRepo: z
    .boolean()
    .default(true)
    .describe("Validate that the path is a Git repository."),
  initializeIfNotPresent: z
    .boolean()
    .default(false)
    .describe("If not a Git repository, initialize it with 'git init'."),
});

// 2. DEFINE the Zod response schema.
export const GitSetWorkingDirOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  path: z.string().describe("The path that was set as the working directory."),
  initialized: z
    .boolean()
    .describe("Indicates if a new repository was initialized."),
});

// 3. INFER and export TypeScript types.
export type GitSetWorkingDirInput = z.infer<typeof GitSetWorkingDirInputSchema>;
export type GitSetWorkingDirOutput = z.infer<
  typeof GitSetWorkingDirOutputSchema
>;

async function checkIsGitRepo(path: string): Promise<boolean> {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--is-inside-work-tree"],
    { cwd: path },
  ).catch(() => ({ stdout: "false" }));
  return stdout.trim() === "true";
}

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitSetWorkingDirLogic(
  params: GitSetWorkingDirInput,
  context: RequestContext & { setWorkingDirectory: (path: string) => void },
): Promise<GitSetWorkingDirOutput> {
  const operation = "gitSetWorkingDirLogic";
  logger.debug(`Executing ${operation}`, { ...context, params });

  const sanitizedPath = sanitization.sanitizePath(params.path, {
    allowAbsolute: true,
  }).sanitizedPath;

  const stats = await fs.stat(sanitizedPath);
  if (!stats.isDirectory()) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Path is not a directory: ${sanitizedPath}`,
    );
  }

  let isGitRepo = await checkIsGitRepo(sanitizedPath);
  let initializedRepo = false;

  if (!isGitRepo && params.initializeIfNotPresent) {
    await execFileAsync("git", ["init", "--initial-branch=main"], {
      cwd: sanitizedPath,
    });
    initializedRepo = true;
    isGitRepo = true;
  }

  if (params.validateGitRepo && !isGitRepo) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Path is not a valid Git repository: ${sanitizedPath}.`,
    );
  }

  context.setWorkingDirectory(sanitizedPath);

  const message = `Working directory set to: ${sanitizedPath}${initializedRepo ? " (New repository initialized)." : ""}`;
  return {
    success: true,
    message,
    path: sanitizedPath,
    initialized: initializedRepo,
  };
}
