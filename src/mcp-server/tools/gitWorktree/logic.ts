/**
 * @fileoverview Defines the core logic, schemas, and types for the git_worktree tool.
 * @module src/mcp-server/tools/gitWorktree/logic
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
export const GitWorktreeBaseSchema = z.object({
  path: z.string().default(".").describe("Path to the local Git repository."),
  mode: z
    .enum(["list", "add", "remove", "move", "prune"])
    .describe("The worktree operation to perform."),
  worktreePath: z.string().min(1).optional().describe("Path of the worktree."),
  commitish: z
    .string()
    .min(1)
    .optional()
    .describe("Branch or commit to checkout in the new worktree."),
  newBranch: z
    .string()
    .min(1)
    .optional()
    .describe("Create a new branch in the worktree."),
  force: z.boolean().default(false).describe("Force the operation."),
  detach: z
    .boolean()
    .default(false)
    .describe("Detach HEAD in the new worktree."),
  newPath: z
    .string()
    .min(1)
    .optional()
    .describe("The new path for the worktree."),
  verbose: z.boolean().default(false).describe("Provide more detailed output."),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Show what would be done without actually doing it."),
  expire: z
    .string()
    .min(1)
    .optional()
    .describe("Prune entries older than this time (e.g., '1.month.ago')."),
});

export const GitWorktreeInputSchema = GitWorktreeBaseSchema.refine(
  (data) => !(data.mode === "add" && !data.worktreePath),
  {
    message: "A 'worktreePath' is required for 'add' mode.",
    path: ["worktreePath"],
  },
)
  .refine((data) => !(data.mode === "remove" && !data.worktreePath), {
    message: "A 'worktreePath' is required for 'remove' mode.",
    path: ["worktreePath"],
  })
  .refine(
    (data) => !(data.mode === "move" && (!data.worktreePath || !data.newPath)),
    {
      message:
        "Both 'worktreePath' (old path) and 'newPath' are required for 'move' mode.",
      path: ["worktreePath", "newPath"],
    },
  );

// 2. DEFINE the Zod response schema.
const WorktreeInfoSchema = z.object({
  path: z.string(),
  head: z.string(),
  branch: z.string().optional(),
  isBare: z.boolean(),
  isLocked: z.boolean(),
  isPrunable: z.boolean(),
  prunableReason: z.string().optional(),
});

export const GitWorktreeOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  mode: z.string().describe("The mode of operation that was performed."),
  message: z.string().optional().describe("A summary message of the result."),
  worktrees: z
    .array(WorktreeInfoSchema)
    .optional()
    .describe("A list of worktrees for the 'list' mode."),
});

// 3. INFER and export TypeScript types.
export type GitWorktreeInput = z.infer<typeof GitWorktreeInputSchema>;
export type GitWorktreeOutput = z.infer<typeof GitWorktreeOutputSchema>;
type WorktreeInfo = z.infer<typeof WorktreeInfoSchema>;

function parsePorcelainWorktreeList(stdout: string): WorktreeInfo[] {
  return stdout
    .trim()
    .split("\n\n")
    .map((entry) => {
      const lines = entry.trim().split("\n");
      const info: Partial<WorktreeInfo> = {
        isBare: false,
        isLocked: false,
        isPrunable: false,
      };
      lines.forEach((line) => {
        if (line.startsWith("worktree ")) info.path = line.substring(9);
        else if (line.startsWith("HEAD ")) info.head = line.substring(5);
        else if (line.startsWith("branch ")) info.branch = line.substring(7);
        else if (line.startsWith("bare")) info.isBare = true;
        else if (line.startsWith("locked")) info.isLocked = true;
        else if (line.startsWith("prunable")) info.isPrunable = true;
      });
      return info as WorktreeInfo;
    })
    .filter((wt) => wt.path);
}

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitWorktreeLogic(
  params: GitWorktreeInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitWorktreeOutput> {
  const operation = `gitWorktreeLogic:${params.mode}`;
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

  const buildArgs = () => {
    const baseArgs = ["-C", targetPath, "worktree", params.mode];
    switch (params.mode) {
      case "list":
        if (params.verbose) baseArgs.push("--verbose");
        break;
      case "add":
        if (params.force) baseArgs.push("--force");
        if (params.detach) baseArgs.push("--detach");
        if (params.newBranch) baseArgs.push("-b", params.newBranch);
        if (params.worktreePath) baseArgs.push(params.worktreePath);
        if (params.commitish) baseArgs.push(params.commitish);
        break;
      case "remove":
        if (params.force) baseArgs.push("--force");
        if (params.worktreePath) baseArgs.push(params.worktreePath);
        break;
      case "move":
        if (params.worktreePath) baseArgs.push(params.worktreePath);
        if (params.newPath) baseArgs.push(params.newPath);
        break;
      case "prune":
        if (params.verbose) baseArgs.push("--verbose");
        if (params.dryRun) baseArgs.push("--dry-run");
        if (params.expire) baseArgs.push(`--expire=${params.expire}`);
        break;
    }
    return baseArgs;
  };

  const args = buildArgs();

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  const { stdout } = await execFileAsync("git", args);

  if (params.mode === "list" && params.verbose) {
    return {
      success: true,
      mode: params.mode,
      worktrees: parsePorcelainWorktreeList(stdout),
    };
  }

  return {
    success: true,
    mode: params.mode,
    message: stdout.trim() || `Worktree ${params.mode} operation successful.`,
  };
}
