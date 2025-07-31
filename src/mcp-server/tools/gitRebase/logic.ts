/**
 * @fileoverview Defines the core logic, schemas, and types for the git_rebase tool.
 * @module src/mcp-server/tools/gitRebase/logic
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
export const GitRebaseBaseSchema = z.object({
  path: z.string().default(".").describe("Path to the local Git repository."),
  mode: z
    .enum(["start", "continue", "abort", "skip"])
    .default("start")
    .describe("Rebase operation mode."),
  upstream: z
    .string()
    .min(1)
    .optional()
    .describe("The upstream branch or commit to rebase onto."),
  branch: z.string().min(1).optional().describe("The branch to rebase."),
  interactive: z
    .boolean()
    .default(false)
    .describe("Perform an interactive rebase."),
  strategy: z
    .enum(["recursive", "resolve", "ours", "theirs", "octopus", "subtree"])
    .optional()
    .describe("The merge strategy to use."),
  strategyOption: z
    .string()
    .optional()
    .describe("Pass a specific option to the merge strategy."),
  onto: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Rebase onto a specific commit/branch instead of the upstream's base.",
    ),
});

export const GitRebaseInputSchema = GitRebaseBaseSchema.refine(
  (data) => !(data.mode === "start" && !data.interactive && !data.upstream),
  {
    message:
      "An 'upstream' branch/commit is required for 'start' mode unless 'interactive' is true.",
    path: ["upstream"],
  },
);

// 2. DEFINE the Zod response schema.
export const GitRebaseOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
  rebaseCompleted: z
    .boolean()
    .optional()
    .describe("True if the rebase finished successfully."),
  needsManualAction: z
    .boolean()
    .optional()
    .describe("True if conflicts or interactive steps require user input."),
  status: GitStatusOutputSchema.optional().describe(
    "The status of the repository after the rebase operation.",
  ),
});

// 3. INFER and export TypeScript types.
export type GitRebaseInput = z.infer<typeof GitRebaseInputSchema>;
export type GitRebaseOutput = z.infer<typeof GitRebaseOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitRebaseLogic(
  params: GitRebaseInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitRebaseOutput> {
  const operation = `gitRebaseLogic:${params.mode}`;
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

  const args = ["-C", targetPath, "rebase"];
  switch (params.mode) {
    case "start":
      if (params.interactive) args.push("-i");
      if (params.strategy) args.push(`--strategy=${params.strategy}`);
      if (params.strategyOption) args.push(`-X${params.strategyOption}`);
      if (params.onto) args.push("--onto", params.onto);
      if (params.upstream) args.push(params.upstream);
      if (params.branch) args.push(params.branch);
      break;
    default:
      args.push(`--${params.mode}`);
      break;
  }

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  const { stdout, stderr } = await execFileAsync("git", args);
  const output = stdout + stderr;

  const status = await getGitStatus({ path: targetPath }, context);

  return {
    success: true,
    message: `Rebase ${params.mode} executed successfully.`,
    rebaseCompleted: /successfully rebased/i.test(output),
    needsManualAction: /conflict|stopped at|edit/i.test(output),
    status,
  };
}
