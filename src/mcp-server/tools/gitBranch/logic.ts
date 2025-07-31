/**
 * @fileoverview Defines the core logic, schemas, and types for the git_branch tool.
 * @module src/mcp-server/tools/gitBranch/logic
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  logger,
  type RequestContext,
  sanitization,
} from "../../../utils/index.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitBranchBaseSchema = z.object({
  path: z
    .string()
    .default(".")
    .describe(
      "Path to the Git repository. Defaults to the directory set via `git_set_working_dir` for the session; set 'git_set_working_dir' if not set.",
    ),
  mode: z
    .enum(["list", "create", "delete", "rename", "show-current"])
    .describe("The branch operation to perform."),
  branchName: z
    .string()
    .optional()
    .describe(
      "The name of the branch for create, delete, or rename operations.",
    ),
  newBranchName: z
    .string()
    .optional()
    .describe("The new name for the branch when renaming."),
  startPoint: z
    .string()
    .optional()
    .describe("The starting point (commit, tag, or branch) for a new branch."),
  force: z
    .boolean()
    .default(false)
    .describe("Force the operation (e.g., overwrite existing branch)."),
  all: z
    .boolean()
    .default(false)
    .describe("List all branches (local and remote)."),
  remote: z
    .boolean()
    .default(false)
    .describe("Act on remote-tracking branches."),
});

export const GitBranchInputSchema = GitBranchBaseSchema.refine(
  (data) => !(data.mode === "create" && !data.branchName),
  {
    message: "A 'branchName' is required for 'create' mode.",
    path: ["branchName"],
  },
)
  .refine((data) => !(data.mode === "delete" && !data.branchName), {
    message: "A 'branchName' is required for 'delete' mode.",
    path: ["branchName"],
  })
  .refine(
    (data) =>
      !(data.mode === "rename" && (!data.branchName || !data.newBranchName)),
    {
      message:
        "Both 'branchName' and 'newBranchName' are required for 'rename' mode.",
      path: ["newBranchName"],
    },
  );

// 2. DEFINE the Zod response schema.
const BranchInfoSchema = z.object({
  name: z.string(),
  isCurrent: z.boolean(),
  isRemote: z.boolean(),
  commitHash: z.string().optional(),
  commitSubject: z.string().optional(),
});

export const GitBranchOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  mode: z.string().describe("The mode of operation that was performed."),
  message: z.string().describe("A summary message of the result."),
  branches: z
    .array(BranchInfoSchema)
    .optional()
    .describe("A list of branches for the 'list' mode."),
  currentBranch: z
    .string()
    .nullable()
    .optional()
    .describe("The current branch name."),
});

// 3. INFER and export TypeScript types.
export type GitBranchInput = z.infer<typeof GitBranchInputSchema>;
export type GitBranchOutput = z.infer<typeof GitBranchOutputSchema>;
type BranchInfo = z.infer<typeof BranchInfoSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitBranchLogic(
  params: GitBranchInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitBranchOutput> {
  const operation = `gitBranchLogic:${params.mode}`;
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

  const args = ["-C", targetPath];

  switch (params.mode) {
    case "list":
      args.push("branch", "--list", "--no-color", "--verbose");
      if (params.all) args.push("-a");
      else if (params.remote) args.push("-r");
      break;
    case "create":
      args.push("branch");
      if (params.force) args.push("-f");
      args.push(params.branchName!, params.startPoint || "");
      break;
    case "delete":
      args.push("branch", params.force ? "-D" : "-d");
      if (params.remote) args.push("-r");
      args.push(params.branchName!);
      break;
    case "rename":
      args.push(
        "branch",
        params.force ? "-M" : "-m",
        params.branchName!,
        params.newBranchName!,
      );
      break;
    case "show-current":
      args.push("branch", "--show-current");
      break;
  }

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  const { stdout, stderr } = await execFileAsync("git", args.filter(Boolean));

  if (stderr && !stderr.includes("HEAD detached")) {
    logger.warning(`Git branch command produced stderr`, {
      ...context,
      operation,
      stderr,
    });
  }

  if (params.mode === "list") {
    const branchLines = stdout.trim().split("\n");
    const branches = branchLines.reduce((acc: BranchInfo[], line) => {
      if (!line) return acc;

      const isCurrent = line.startsWith("* ");
      const trimmedLine = line.replace(/^\*?\s+/, "");
      const isRemote = trimmedLine.startsWith("remotes/");
      const parts = trimmedLine.split(/\s+/);
      const name = parts[0];

      if (name) {
        acc.push({
          name: isRemote ? name.split("/").slice(2).join("/") : name,
          isCurrent,
          isRemote,
          commitHash: parts[1],
          commitSubject: parts.slice(2).join(" "),
        });
      }
      return acc;
    }, []);

    return {
      success: true,
      mode: params.mode,
      message: `Found ${branches.length} branches.`,
      branches,
      currentBranch: branches.find((b) => b.isCurrent)?.name || null,
    };
  }

  if (params.mode === "show-current") {
    const currentBranchName = stdout.trim() || null;
    return {
      success: true,
      mode: params.mode,
      message: currentBranchName
        ? `Current branch is '${currentBranchName}'.`
        : "Currently in detached HEAD state.",
      currentBranch: currentBranchName,
    };
  }

  return {
    success: true,
    mode: params.mode,
    message: `Operation '${params.mode}' on branch '${params.branchName || params.newBranchName}' completed successfully.`,
  };
}
