/**
 * @fileoverview Defines the core logic, schemas, and types for the git_stash tool.
 * @module src/mcp-server/tools/gitStash/logic
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { logger, type RequestContext, sanitization } from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitStashBaseSchema = z.object({
  path: z.string().default(".").describe("Path to the local Git repository."),
  mode: z.enum(["list", "apply", "pop", "drop", "save"]).describe("The stash operation to perform."),
  stashRef: z.string().optional().describe("Stash reference (e.g., 'stash@{1}')."),
  message: z.string().optional().describe("Optional descriptive message for 'save' mode."),
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
  stashes: z.array(StashInfoSchema).optional().describe("A list of stashes for the 'list' mode."),
  conflicts: z.boolean().optional().describe("Indicates if a merge conflict occurred."),
  stashCreated: z.boolean().optional().describe("Indicates if a stash was created."),
});

// 3. INFER and export TypeScript types.
export type GitStashInput = z.infer<typeof GitStashInputSchema>;
export type GitStashOutput = z.infer<typeof GitStashOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitStashLogic(
  params: GitStashInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined }
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
  const targetPath = sanitization.sanitizePath(params.path === "." ? workingDir! : params.path, { allowAbsolute: true }).sanitizedPath;

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

  try {
    logger.debug(`Executing command: git ${args.join(" ")}`, { ...context, operation });
    const { stdout, stderr } = await execFileAsync("git", args);

    if (params.mode === 'list') {
        const stashes = stdout.trim().split("\n").filter(Boolean).map(line => {
            const match = line.match(/^(stash@\{(\d+)\}):\s*(?:(?:WIP on|On)\s*([^:]+):\s*)?(.*)$/);
            return match ? { ref: match[1], branch: match[3] || "unknown", description: match[4] } : { ref: "unknown", branch: "unknown", description: line };
        });
        return { success: true, mode: params.mode, stashes };
    }

    const output = stdout + stderr;
    const conflicts = /conflict/i.test(output);
    
    if (params.mode === 'save') {
        const stashCreated = !/no local changes to save/i.test(output);
        return { success: true, mode: params.mode, message: stashCreated ? "Changes stashed." : "No local changes to save.", stashCreated };
    }

    return { success: true, mode: params.mode, message: `${params.mode} operation successful.`, conflicts };

  } catch (error: any) {
    const errorMessage = error.stderr || error.message || "";
    logger.error(`Failed to execute git stash command`, { ...context, operation, errorMessage });

    if (errorMessage.toLowerCase().includes("not a git repository")) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`);
    }
    if (/no such stash/i.test(errorMessage)) {
        throw new McpError(BaseErrorCode.NOT_FOUND, `Stash '${params.stashRef}' not found.`);
    }
    if (/conflict/i.test(errorMessage)) {
        throw new McpError(BaseErrorCode.CONFLICT, `Stash ${params.mode} failed due to conflicts.`);
    }

    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Git stash ${params.mode} failed: ${errorMessage}`);
  }
}
