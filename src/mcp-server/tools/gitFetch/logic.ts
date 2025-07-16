/**
 * @fileoverview Defines the core logic, schemas, and types for the git_fetch tool.
 * @module src/mcp-server/tools/gitFetch/logic
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { logger, type RequestContext, sanitization } from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitFetchInputSchema = z.object({
  path: z.string().default(".").describe("Path to the Git repository. Defaults to the directory set via `git_set_working_dir` for the session; set 'git_set_working_dir' if not set."),
  remote: z.string().optional().describe("The remote repository to fetch from (e.g., 'origin')."),
  prune: z.boolean().default(false).describe("Remove remote-tracking references that no longer exist on the remote."),
  tags: z.boolean().default(false).describe("Fetch all tags from the remote."),
  all: z.boolean().default(false).describe("Fetch all remotes."),
});

// 2. DEFINE the Zod response schema.
export const GitFetchOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
});

// 3. INFER and export TypeScript types.
export type GitFetchInput = z.infer<typeof GitFetchInputSchema>;
export type GitFetchOutput = z.infer<typeof GitFetchOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function fetchGitRemote(
  params: GitFetchInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined }
): Promise<GitFetchOutput> {
  const operation = "fetchGitRemote";
  logger.debug(`Executing ${operation}`, { ...context, params });

  const workingDir = context.getWorkingDirectory();
  const targetPath = sanitization.sanitizePath(params.path === "." ? (workingDir || process.cwd()) : params.path, { allowAbsolute: true }).sanitizedPath;

  const args = ["-C", targetPath, "fetch"];
  if (params.prune) args.push("--prune");
  if (params.tags) args.push("--tags");
  if (params.all) {
    args.push("--all");
  } else if (params.remote) {
    args.push(params.remote);
  }

  try {
    logger.debug(`Executing command: git ${args.join(" ")}`, { ...context, operation });
    const { stderr } = await execFileAsync("git", args);

    const message = stderr.trim() || "Fetch successful.";
    
    return { success: true, message };

  } catch (error: any) {
    const errorMessage = error.stderr || error.message || "";
    logger.error(`Failed to execute git fetch command`, { ...context, operation, errorMessage });

    if (errorMessage.toLowerCase().includes("not a git repository")) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`);
    }
    if (errorMessage.includes("Could not read from remote repository")) {
      throw new McpError(BaseErrorCode.SERVICE_UNAVAILABLE, `Failed to connect to remote repository '${params.remote || "default"}'.`);
    }
    if (errorMessage.includes("Authentication failed")) {
      throw new McpError(BaseErrorCode.UNAUTHORIZED, `Authentication failed for remote repository '${params.remote || "default"}'.`);
    }

    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Git fetch failed: ${errorMessage}`);
  }
}
