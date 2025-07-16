/**
 * @fileoverview Defines the core logic, schemas, and types for the git_remote tool.
 * @module src/mcp-server/tools/gitRemote/logic
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { logger, type RequestContext, sanitization } from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitRemoteBaseSchema = z.object({
  path: z.string().default(".").describe("Path to the Git repository."),
  mode: z.enum(["list", "add", "remove", "show"]).describe("Operation mode."),
  name: z.string().optional().describe("Remote name (required for 'add', 'remove', 'show')."),
  url: z.string().optional().describe("Remote URL (required for 'add')."),
});

export const GitRemoteInputSchema = GitRemoteBaseSchema.refine(data => !(data.mode === 'add' && (!data.name || !data.url)), {
    message: "Remote 'name' and 'url' are required for 'add' mode.",
    path: ["name", "url"],
}).refine(data => !((data.mode === 'remove' || data.mode === 'show') && !data.name), {
    message: "Remote 'name' is required for 'remove' or 'show' mode.",
    path: ["name"],
});

// 2. DEFINE the Zod response schema.
const RemoteInfoSchema = z.object({
    name: z.string(),
    fetchUrl: z.string(),
    pushUrl: z.string(),
});

export const GitRemoteOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  mode: z.string().describe("The mode of operation that was performed."),
  message: z.string().optional().describe("A summary message of the result."),
  remotes: z.array(RemoteInfoSchema).optional().describe("A list of remotes for the 'list' mode."),
  details: z.string().optional().describe("Details for the 'show' mode."),
});

// 3. INFER and export TypeScript types.
export type GitRemoteInput = z.infer<typeof GitRemoteInputSchema>;
export type GitRemoteOutput = z.infer<typeof GitRemoteOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitRemoteLogic(
  params: GitRemoteInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined }
): Promise<GitRemoteOutput> {
  const operation = `gitRemoteLogic:${params.mode}`;
  logger.debug(`Executing ${operation}`, { ...context, params });

  const workingDir = context.getWorkingDirectory();
  const targetPath = sanitization.sanitizePath(params.path === "." ? (workingDir || process.cwd()) : params.path, { allowAbsolute: true }).sanitizedPath;

  const args = ["-C", targetPath, "remote"];
  
  switch (params.mode) {
      case "list":
          args.push("-v");
          break;
      case "add":
          args.push("add", params.name!, params.url!);
          break;
      case "remove":
          args.push("remove", params.name!);
          break;
      case "show":
          args.push("show", params.name!);
          break;
  }

  try {
    logger.debug(`Executing command: git ${args.join(" ")}`, { ...context, operation });
    const { stdout } = await execFileAsync("git", args);

    if (params.mode === 'list') {
        const remoteMap = new Map<string, { fetchUrl?: string; pushUrl?: string }>();
        stdout.trim().split("\n").forEach(line => {
            const parts = line.split(/\s+/);
            if (parts.length < 3) return;
            const [name, url, type] = parts;
            const cleanType = type.replace(/[()]/g, "");
            if (!remoteMap.has(name)) remoteMap.set(name, {});
            if (cleanType === 'fetch') remoteMap.get(name)!.fetchUrl = url;
            if (cleanType === 'push') remoteMap.get(name)!.pushUrl = url;
        });
        const remotes = Array.from(remoteMap.entries()).map(([name, urls]) => ({ name, fetchUrl: urls.fetchUrl || 'N/A', pushUrl: urls.pushUrl || urls.fetchUrl || 'N/A' }));
        return { success: true, mode: params.mode, remotes };
    }

    if (params.mode === 'show') {
        return { success: true, mode: params.mode, details: stdout.trim() };
    }

    return { success: true, mode: params.mode, message: `Remote '${params.name}' ${params.mode === 'add' ? 'added' : 'removed'} successfully.` };

  } catch (error: any) {
    const errorMessage = error.stderr || error.message || "";
    logger.error(`Failed to execute git remote command`, { ...context, operation, errorMessage });

    if (errorMessage.toLowerCase().includes("not a git repository")) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`);
    }
    if (params.mode === "add" && errorMessage.toLowerCase().includes("already exists")) {
      throw new McpError(BaseErrorCode.CONFLICT, `Remote '${params.name}' already exists.`);
    }
    if ((params.mode === "remove" || params.mode === "show") && errorMessage.toLowerCase().includes("no such remote")) {
        throw new McpError(BaseErrorCode.NOT_FOUND, `Remote '${params.name}' does not exist.`);
    }

    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Git remote ${params.mode} failed: ${errorMessage}`);
  }
}
