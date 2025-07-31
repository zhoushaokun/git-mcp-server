/**
 * @fileoverview Defines the core logic, schemas, and types for the git_stash tool.
 * @module src/mcp-server/tools/gitStash/logic
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
import { getGitStatus, GitStatusOutputSchema } from "../gitStatus/logic.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitStashBaseSchema = z.object({
  path: z.string().default(".").describe("Path to the local Git repository."),
  mode: z
    .enum(["list", "apply", "pop", "drop", "save"])
    .describe("The stash operation to perform."),
  stashRef: z
    .string()
    .optional()
    .describe("Stash reference (e.g., 'stash@{1}')."),
  message: z
    .string()
    .optional()
    .describe("Optional descriptive message for 'save' mode."),
});

export const GitStashInputSchema = GitStashBaseSchema.refine(
  (data) => !(["apply", "pop", "drop"].includes(data.mode) && !data.stashRef),
  {
    message: "A 'stashRef' is required for 'apply', 'pop', and 'drop' modes.",
    path: ["stashRef"],
  },
);

// 2. DEFINE the Zod response schema.
const StashInfoSchema = z.object({
  ref: z.string(),
  branch: z.string(),
  description: z.string(),
});

export const GitStashOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  mode: z.string().describe("The mode of operation that was performed."),
  message: z.string().optional().describe("A summary message of the result."),
  stashes: z
    .array(StashInfoSchema)
    .optional()
    .describe("A list of stashes for the 'list' mode."),
  conflicts: z
    .boolean()
    .optional()
    .describe("Indicates if a merge conflict occurred."),
  stashCreated: z
    .boolean()
    .optional()
    .describe("Indicates if a stash was created."),
  status: GitStatusOutputSchema.optional().describe(
    "The status of the repository after the stash operation.",
  ),
});

// 3. INFER and export TypeScript types.
export type GitStashInput = z.infer<typeof GitStashInputSchema>;
export type GitStashOutput = z.infer<typeof GitStashOutputSchema>;
type StashInfo = z.infer<typeof StashInfoSchema>;

/**
 * Parses the raw output of `git stash list` into a structured array.
 * @private
 */
function _parseStashList(stdout: string): StashInfo[] {
  return stdout
    .trim()
    .split("\n")
    .map((line) => {
      const match = line.match(
        /^(stash@\{(\d+)\}):\s*(?:(?:WIP on|On)\s*([^:]+):\s*)?(.*)$/,
      );
      if (match) {
        const ref = match[1];
        const description = match[4] !== undefined ? match[4] : null;
        if (ref && description !== null) {
          return {
            ref,
            branch: match[3] || "unknown",
            description,
          };
        }
      }
      return null;
    })
    .filter((item): item is StashInfo => item !== null);
}

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitStashLogic(
  params: GitStashInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitStashOutput> {
  const operation = `gitStashLogic:${params.mode}`;
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
    const baseArgs = ["-C", targetPath, "stash", params.mode];
    switch (params.mode) {
      case "list":
        // No extra args needed
        break;
      case "apply":
      case "pop":
      case "drop":
        baseArgs.push(params.stashRef!);
        break;
      case "save":
        if (params.message) {
          baseArgs.push(params.message);
        }
        break;
    }
    return baseArgs;
  };

  const args = buildArgs();

  logger.debug(`Executing command: git ${args.join(" ")}`, {
    ...context,
    operation,
  });
  const { stdout, stderr } = await execFileAsync("git", args);

  const status = await getGitStatus({ path: targetPath }, context);

  if (params.mode === "list") {
    const stashes = _parseStashList(stdout);
    return { success: true, mode: params.mode, stashes, status };
  }

  const output = stdout + stderr;
  const conflicts = /conflict/i.test(output);

  if (params.mode === "save") {
    const stashCreated = !/no local changes to save/i.test(output);
    return {
      success: true,
      mode: params.mode,
      message: stashCreated ? "Changes stashed." : "No local changes to save.",
      stashCreated,
      status,
    };
  }

  return {
    success: true,
    mode: params.mode,
    message: `${params.mode} operation successful.`,
    conflicts,
    status,
  };
}
