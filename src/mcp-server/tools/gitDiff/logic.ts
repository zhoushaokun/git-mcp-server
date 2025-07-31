/**
 * @fileoverview Defines the core logic, schemas, and types for the git_diff tool.
 * @module src/mcp-server/tools/gitDiff/logic
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
export const GitDiffBaseSchema = z.object({
  path: z
    .string()
    .default(".")
    .describe(
      "Path to the Git repository. Defaults to the directory set via `git_set_working_dir` for the session; set 'git_set_working_dir' if not set.",
    ),
  commit1: z
    .string()
    .optional()
    .describe("First commit, branch, or ref for comparison."),
  commit2: z
    .string()
    .optional()
    .describe("Second commit, branch, or ref for comparison."),
  staged: z
    .boolean()
    .default(false)
    .describe("Show diff of changes staged for the next commit."),
  file: z
    .string()
    .optional()
    .describe("Limit the diff output to a specific file path."),
  includeUntracked: z
    .boolean()
    .default(false)
    .describe("Include untracked files in the diff output."),
});

export const GitDiffInputSchema = GitDiffBaseSchema.refine(
  (data) => !(data.staged && (data.commit1 || data.commit2)),
  {
    message: "Cannot use 'staged' option with specific commit references.",
    path: ["staged"],
  },
);

// 2. DEFINE the Zod response schema.
export const GitDiffOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  diff: z
    .string()
    .describe(
      "The diff output. Will be 'No changes found.' if there are no differences.",
    ),
  message: z.string().describe("A summary message of the result."),
});

// 3. INFER and export TypeScript types.
export type GitDiffInput = z.infer<typeof GitDiffInputSchema>;
export type GitDiffOutput = z.infer<typeof GitDiffOutputSchema>;

async function getUntrackedFilesDiff(
  targetPath: string,
  context: RequestContext,
): Promise<string> {
  const { stdout } = await execFileAsync("git", [
    "-C",
    targetPath,
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);
  const untrackedFiles = stdout.trim().split("\n").filter(Boolean);
  if (untrackedFiles.length === 0) return "";

  let diffs = "";
  for (const file of untrackedFiles) {
    const { stdout: diffOut } = await execFileAsync("git", [
      "-C",
      targetPath,
      "diff",
      "--no-index",
      "/dev/null",
      file,
    ]).catch((err) => {
      if (err.stdout) return { stdout: err.stdout };
      logger.warning(`Failed to diff untracked file: ${file}`, {
        ...context,
        error: err.message,
      });
      return { stdout: "" };
    });
    diffs += diffOut;
  }
  return diffs;
}

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function diffGitChanges(
  params: GitDiffInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitDiffOutput> {
  const operation = "diffGitChanges";
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

  const args = ["-C", targetPath, "diff"];
  if (params.staged) {
    args.push("--staged");
  } else {
    if (params.commit1) args.push(params.commit1);
    if (params.commit2) args.push(params.commit2);
  }
  if (params.file) args.push("--", params.file);

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  const { stdout } = await execFileAsync("git", args, {
    maxBuffer: 1024 * 1024 * 20,
  });
  let combinedDiff = stdout;

  if (params.includeUntracked) {
    const untrackedDiff = await getUntrackedFilesDiff(targetPath, context);
    if (untrackedDiff) {
      combinedDiff += (combinedDiff ? "\n" : "") + untrackedDiff;
    }
  }

  const noChanges = combinedDiff.trim() === "";
  const message = noChanges
    ? "No changes found."
    : `Diff generated successfully.${params.includeUntracked ? " Untracked files included." : ""}`;

  return {
    success: true,
    diff: noChanges ? "No changes found." : combinedDiff,
    message,
  };
}
