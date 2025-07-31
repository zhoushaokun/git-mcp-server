/**
 * @fileoverview Defines the core logic, schemas, and types for the git_init tool.
 * @module src/mcp-server/tools/gitInit/logic
 */

import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
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
export const GitInitInputSchema = z.object({
  path: z
    .string()
    .default(".")
    .describe("Path where the new Git repository should be initialized."),
  initialBranch: z
    .string()
    .optional()
    .describe("The name for the initial branch (e.g., 'main')."),
  bare: z
    .boolean()
    .default(false)
    .describe("Create a bare repository with no working directory."),
  quiet: z
    .boolean()
    .default(false)
    .describe("Suppress all output except for errors and warnings."),
});

// 2. DEFINE the Zod response schema.
export const GitInitOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  path: z.string().describe("The path where the repository was initialized."),
  gitDirExists: z
    .boolean()
    .describe("Confirms the .git directory was created."),
});

// 3. INFER and export TypeScript types.
export type GitInitInput = z.infer<typeof GitInitInputSchema>;
export type GitInitOutput = z.infer<typeof GitInitOutputSchema>;

/**
 * Executes the `git init` command and handles its output.
 * @private
 */
async function _executeGitInit(
  params: GitInitInput,
  targetPath: string,
  context: RequestContext,
): Promise<GitInitOutput> {
  const args = ["init"];
  if (params.quiet) args.push("--quiet");
  if (params.bare) args.push("--bare");
  args.push(`--initial-branch=${params.initialBranch || "main"}`);
  args.push(targetPath);

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation: "gitInit",
  });
  const { stdout, stderr } = await execFileAsync("git", args);

  if (
    (stderr || stdout)
      .toLowerCase()
      .includes("reinitialized existing git repository")
  ) {
    return {
      success: true,
      message: `Reinitialized existing Git repository in ${targetPath}`,
      path: targetPath,
      gitDirExists: true,
    };
  }

  const gitDirPath = params.bare ? targetPath : path.join(targetPath, ".git");
  const gitDirExists = await fs
    .access(gitDirPath)
    .then(() => true)
    .catch(() => false);

  const successMessage =
    stdout.trim() || `Successfully initialized Git repository in ${targetPath}`;
  return {
    success: true,
    message: successMessage,
    path: targetPath,
    gitDirExists,
  };
}

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitInitLogic(
  params: GitInitInput,
  context: RequestContext,
): Promise<GitInitOutput> {
  const operation = "gitInitLogic";
  logger.debug(`Executing ${operation}`, { ...context, params });

  const targetPath = sanitization.sanitizePath(params.path, {
    allowAbsolute: true,
  }).sanitizedPath;
  const parentDir = path.dirname(targetPath);

  try {
    await fs.access(parentDir, fs.constants.W_OK);
    return await _executeGitInit(params, targetPath, context);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("EACCES") ||
      errorMessage.includes("permission denied")
    ) {
      throw new McpError(
        BaseErrorCode.FORBIDDEN,
        `Permission denied: Unable to write to the directory '${parentDir}'.`,
        { originalError: errorMessage },
      );
    }
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Failed to initialize Git repository at '${targetPath}'.`,
      { originalError: errorMessage },
    );
  }
}
