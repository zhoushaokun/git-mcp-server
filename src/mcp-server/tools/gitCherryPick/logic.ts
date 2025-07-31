/**
 * @fileoverview Defines the core logic, schemas, and types for the git_cherry-pick tool.
 * @module src/mcp-server/tools/gitCherryPick/logic
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
export const GitCherryPickInputSchema = z.object({
  path: z
    .string()
    .default(".")
    .describe(
      "Path to the Git repository. Defaults to the directory set via `git_set_working_dir` for the session; set 'git_set_working_dir' if not set.",
    ),
  commitRef: z
    .string()
    .min(1)
    .describe("The commit reference(s) to cherry-pick."),
  mainline: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("The parent number (1-based) for a merge commit."),
  strategy: z
    .enum(["recursive", "resolve", "ours", "theirs", "octopus", "subtree"])
    .optional()
    .describe("The merge strategy to use."),
  noCommit: z
    .boolean()
    .default(false)
    .describe("Apply changes but do not create a commit."),
  signoff: z
    .boolean()
    .default(false)
    .describe("Add a 'Signed-off-by' line to the commit message."),
});

// 2. DEFINE the Zod response schema.
export const GitCherryPickOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  commitCreated: z.boolean().describe("Indicates if a new commit was created."),
  conflicts: z.boolean().describe("Indicates if conflicts occurred."),
  status: GitStatusOutputSchema.optional().describe(
    "The status of the repository after the cherry-pick operation.",
  ),
});

// 3. INFER and export TypeScript types.
export type GitCherryPickInput = z.infer<typeof GitCherryPickInputSchema>;
export type GitCherryPickOutput = z.infer<typeof GitCherryPickOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitCherryPickLogic(
  params: GitCherryPickInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitCherryPickOutput> {
  const operation = "gitCherryPickLogic";
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

  const attemptCherryPick = async (withSigning: boolean) => {
    const args = ["-C", targetPath, "cherry-pick"];
    if (withSigning) args.push("-S");
    if (params.mainline) args.push("-m", String(params.mainline));
    if (params.strategy) args.push(`-X${params.strategy}`);
    if (params.noCommit) args.push("--no-commit");
    if (params.signoff) args.push("--signoff");
    args.push(params.commitRef);
    logger.debug(`Executing command: git ${args.join(" ")}`, {
      ...context,
      operation,
    });
    return await execFileAsync("git", args);
  };

  const createsCommit = !params.noCommit;
  const shouldSign = !!config.gitSignCommits && createsCommit;

  let stdout: string;
  let stderr: string;
  try {
    const result = await attemptCherryPick(shouldSign);
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error: unknown) {
    const execError = error as { stderr?: string };
    const isSigningError = (execError.stderr || "").includes(
      "gpg failed to sign",
    );
    if (shouldSign && isSigningError) {
      logger.warning(
        "Cherry-pick with signing failed. Retrying automatically without signature.",
        { ...context, operation },
      );
      const result = await attemptCherryPick(false);
      stdout = result.stdout;
      stderr = result.stderr;
    } else {
      throw error;
    }
  }

  const output = stdout + stderr;
  const conflicts = /conflict/i.test(output);
  const commitCreated = createsCommit && !conflicts;

  const message = conflicts
    ? `Cherry-pick resulted in conflicts for commit(s) '${params.commitRef}'. Manual resolution required.`
    : `Successfully cherry-picked commit(s) '${params.commitRef}'.`;

  const status = await getGitStatus({ path: targetPath }, context);

  return { success: true, message, commitCreated, conflicts, status };
}
