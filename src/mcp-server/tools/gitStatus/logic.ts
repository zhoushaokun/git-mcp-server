/**
 * @fileoverview Defines the core logic, schemas, and types for the git_status tool.
 * @module src/mcp-server/tools/gitStatus/logic
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
export const GitStatusInputSchema = z.object({
  path: z.string().default(".").describe("Path to the Git repository."),
});

// 2. DEFINE the Zod response schema.
const ChangesSchema = z.object({
  Added: z.array(z.string()).optional(),
  Modified: z.array(z.string()).optional(),
  Deleted: z.array(z.string()).optional(),
  Renamed: z.array(z.string()).optional(),
  Copied: z.array(z.string()).optional(),
  TypeChanged: z.array(z.string()).optional(),
});

export const GitStatusOutputSchema = z.object({
  current_branch: z
    .string()
    .nullable()
    .describe("The current branch, or null for detached HEAD."),
  staged_changes: ChangesSchema.describe("Changes staged for the next commit."),
  unstaged_changes: ChangesSchema.describe("Changes not staged for commit."),
  untracked_files: z.array(z.string()).describe("Files not tracked by Git."),
  conflicted_files: z.array(z.string()).describe("Files with merge conflicts."),
  is_clean: z.boolean().describe("True if there are no pending changes."),
});

// 3. INFER and export TypeScript types.
export type GitStatusInput = z.infer<typeof GitStatusInputSchema>;
export type GitStatusOutput = z.infer<typeof GitStatusOutputSchema>;

function parseGitStatus(porcelainOutput: string): GitStatusOutput {
  const lines = porcelainOutput.trim().split("\n").filter(Boolean);
  const result: GitStatusOutput = {
    current_branch: null,
    staged_changes: {},
    unstaged_changes: {},
    untracked_files: [],
    conflicted_files: [],
    is_clean: true,
  };

  if (lines.length > 0 && lines[0]?.startsWith("## ")) {
    const branchLine = lines.shift()!;
    const branchMatch = branchLine.match(/^## (.*?)(?:\.\.\..*)?$/);
    result.current_branch = branchMatch?.[1] || "HEAD (detached)";
  }

  lines.forEach((line) => {
    result.is_clean = false;
    const xy = line.substring(0, 2);
    const file = line.substring(3);
    const staged = xy[0];
    const unstaged = xy[1];

    if (xy === "??") {
      result.untracked_files.push(file);
    } else if (
      staged === "U" ||
      unstaged === "U" ||
      (staged === "A" && unstaged === "A") ||
      (staged === "D" && unstaged === "D")
    ) {
      result.conflicted_files.push(file);
    } else {
      const mapStatus = (
        char: string,
        changeSet: z.infer<typeof ChangesSchema>,
      ) => {
        let statusKey: keyof typeof changeSet;
        switch (char) {
          case "M":
            statusKey = "Modified";
            break;
          case "A":
            statusKey = "Added";
            break;
          case "D":
            statusKey = "Deleted";
            break;
          case "R":
            statusKey = "Renamed";
            break;
          case "C":
            statusKey = "Copied";
            break;
          case "T":
            statusKey = "TypeChanged";
            break;
          default:
            return;
        }
        if (!changeSet[statusKey]) {
          changeSet[statusKey] = [];
        }
        (changeSet[statusKey] as string[]).push(file);
      };
      if (staged) {
        mapStatus(staged, result.staged_changes);
      }
      if (unstaged) {
        mapStatus(unstaged, result.unstaged_changes);
      }
    }
  });

  return result;
}

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function getGitStatus(
  params: GitStatusInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitStatusOutput> {
  const operation = "getGitStatus";
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

  const args = ["-C", targetPath, "status", "--porcelain=v1", "-b"];

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  const { stdout } = await execFileAsync("git", args);
  return parseGitStatus(stdout);
}
