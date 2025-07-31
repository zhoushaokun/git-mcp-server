/**
 * @fileoverview Defines the core logic, schemas, and types for the git_clean tool.
 * @module src/mcp-server/tools/gitClean/logic
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
export const GitCleanInputSchema = z.object({
  path: z
    .string()
    .default(".")
    .describe(
      "Path to the Git repository. Defaults to the directory set via `git_set_working_dir` for the session; set 'git_set_working_dir' if not set.",
    ),
  force: z
    .boolean()
    .describe(
      "REQUIRED confirmation. Must be true to run the destructive clean operation.",
    ),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Show what would be deleted without actually deleting."),
  directories: z
    .boolean()
    .default(false)
    .describe("Remove untracked directories in addition to files."),
  ignored: z
    .boolean()
    .default(false)
    .describe("Remove ignored files as well. Use with extreme caution."),
});

// 2. DEFINE the Zod response schema.
export const GitCleanOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  filesAffected: z
    .array(z.string())
    .describe("A list of files that were or would be affected."),
  dryRun: z.boolean().describe("Indicates if the operation was a dry run."),
  status: GitStatusOutputSchema.optional().describe(
    "The status of the repository after the clean operation.",
  ),
});

// 3. INFER and export TypeScript types.
export type GitCleanInput = z.infer<typeof GitCleanInputSchema>;
export type GitCleanOutput = z.infer<typeof GitCleanOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitCleanLogic(
  params: GitCleanInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitCleanOutput> {
  const operation = "gitCleanLogic";
  logger.debug(`Executing ${operation}`, { ...context, params });

  if (!params.force) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      "Operation aborted: 'force' must be true to execute 'git clean'.",
    );
  }
  logger.warning(
    "Executing 'git clean' with force=true. This is a destructive operation.",
    { ...context, operation },
  );

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

  const args = ["-C", targetPath, "clean", "-f"];
  if (params.dryRun) args.push("-n");
  if (params.directories) args.push("-d");
  if (params.ignored) args.push("-x");

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  const { stdout, stderr } = await execFileAsync("git", args);

  if (stderr) {
    logger.warning(`Git clean command produced stderr`, {
      ...context,
      operation,
      stderr,
    });
  }

  const filesAffected = stdout
    .trim()
    .split("\n")
    .map((line) => line.replace(/^Would remove |^Removing /i, "").trim())
    .filter(Boolean);
  const message = params.dryRun
    ? `Dry run complete. Files that would be removed: ${filesAffected.length}`
    : `Clean operation complete. Files removed: ${filesAffected.length}`;

  const status = await getGitStatus({ path: targetPath }, context);

  return {
    success: true,
    message,
    filesAffected,
    dryRun: params.dryRun,
    status,
  };
}
