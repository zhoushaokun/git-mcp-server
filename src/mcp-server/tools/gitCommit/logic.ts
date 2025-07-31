/**
 * @fileoverview Defines the core logic, schemas, and types for the git_commit tool.
 * @module src/mcp-server/tools/gitCommit/logic
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
import { config } from "../../../config/index.js";
import { getGitStatus, GitStatusOutputSchema } from "../gitStatus/logic.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitCommitInputSchema = z.object({
  path: z.string().default(".").describe("Path to the Git repository."),
  message: z
    .string()
    .min(1)
    .describe(
      "Commit message, preferably following Conventional Commits format.",
    ),
  author: z
    .object({ name: z.string(), email: z.string().email() })
    .optional()
    .describe("Override the commit author."),
  allowEmpty: z
    .boolean()
    .default(false)
    .describe("Allow creating a commit with no changes."),
  amend: z.boolean().default(false).describe("Amend the previous commit."),
  forceUnsignedOnFailure: z
    .boolean()
    .default(false)
    .describe("If signing fails, attempt the commit without a signature."),
  filesToStage: z
    .array(z.string().min(1))
    .optional()
    .describe("An array of file paths to stage before committing."),
});

// 2. DEFINE the Zod response schema.
export const GitCommitOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  commitHash: z.string().optional().describe("The hash of the new commit."),
  committedFiles: z
    .array(z.string())
    .optional()
    .describe("A list of files included in the commit."),
  nothingToCommit: z
    .boolean()
    .optional()
    .describe("True if there were no changes to commit."),
  status: GitStatusOutputSchema.optional().describe(
    "The status of the repository after the commit.",
  ),
});

// 3. INFER and export TypeScript types.
export type GitCommitInput = z.infer<typeof GitCommitInputSchema>;
export type GitCommitOutput = z.infer<typeof GitCommitOutputSchema>;

async function stageFiles(
  targetPath: string,
  files: string[],
  context: RequestContext,
) {
  const operation = "stageFilesForCommit";
  logger.debug(`Staging files: ${files.join(", ")}`, { ...context, operation });
  const sanitizedFiles = files.map(
    (file) =>
      sanitization.sanitizePath(file, { rootDir: targetPath }).sanitizedPath,
  );
  await execFileAsync("git", [
    "-C",
    targetPath,
    "add",
    "--",
    ...sanitizedFiles,
  ]);
}

async function getCommittedFiles(
  targetPath: string,
  commitHash: string,
  context: RequestContext,
): Promise<string[]> {
  const operation = "getCommittedFiles";
  const args = [
    "-C",
    targetPath,
    "show",
    "--pretty=",
    "--name-only",
    commitHash,
  ];
  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  const { stdout } = await execFileAsync("git", args);
  return stdout.trim().split("\n").filter(Boolean);
}

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function commitGitChanges(
  params: GitCommitInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitCommitOutput> {
  const operation = "commitGitChanges";
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

  if (params.filesToStage && params.filesToStage.length > 0) {
    await stageFiles(targetPath, params.filesToStage, context);
  }

  const args: string[] = ["-C", targetPath];
  if (params.author)
    args.push(
      "-c",
      `user.name=${params.author.name}`,
      "-c",
      `user.email=${params.author.email}`,
    );
  args.push("commit", "-m", params.message);
  if (params.allowEmpty) args.push("--allow-empty");
  if (params.amend) args.push("--amend", "--no-edit");

  const attemptCommit = async (
    withSigning: boolean,
  ): Promise<{ stdout: string; stderr: string }> => {
    const finalArgs = [...args];
    if (withSigning) finalArgs.push("-S");
    logger.debug(`Executing command: git ${finalArgs.join(" ")}`, {
      ...context,
      operation,
    });
    return await execFileAsync("git", finalArgs);
  };

  let result;
  const shouldSign = config.gitSignCommits;
  try {
    result = await attemptCommit(shouldSign || false);
  } catch (error: unknown) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr)
        : "";
    const isSigningError = stderr.includes("gpg failed to sign");
    if (shouldSign && isSigningError && params.forceUnsignedOnFailure) {
      logger.warning(
        "Commit with signing failed. Retrying without signature.",
        { ...context, operation },
      );
      result = await attemptCommit(false);
    } else {
      throw error;
    }
  }

  const commitHashMatch = result.stdout.match(/([a-f0-9]{7,40})/);
  const commitHash = commitHashMatch ? commitHashMatch[1] : undefined;
  const committedFiles = commitHash
    ? await getCommittedFiles(targetPath, commitHash, context)
    : [];

  const status = await getGitStatus({ path: targetPath }, context);

  return {
    success: true,
    message: `Commit successful: ${commitHash}`,
    commitHash,
    committedFiles,
    status,
  };
}
