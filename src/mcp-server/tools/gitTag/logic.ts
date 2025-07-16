/**
 * @fileoverview Defines the core logic, schemas, and types for the git_tag tool.
 * @module src/mcp-server/tools/gitTag/logic
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { logger, type RequestContext, sanitization } from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitTagBaseSchema = z.object({
  path: z.string().default(".").describe("Path to the local Git repository."),
  mode: z.enum(["list", "create", "delete"]).describe("The tag operation to perform."),
  tagName: z.string().min(1).optional().describe("The name for the tag."),
  message: z.string().optional().describe("The annotation message for the tag."),
  commitRef: z.string().optional().describe("The commit hash, branch, or other reference to tag."),
  annotate: z.boolean().default(false).describe("Create an annotated tag."),
});

export const GitTagInputSchema = GitTagBaseSchema.refine(
  (data) => !(data.mode === "create" && data.annotate && !data.message),
  {
    message: "An annotation 'message' is required when creating an annotated tag.",
    path: ["message"],
  }
).refine((data) => !(data.mode === "create" && !data.tagName), {
    message: "A 'tagName' is required for 'create' mode.",
    path: ["tagName"],
}).refine((data) => !(data.mode === "delete" && !data.tagName), {
    message: "A 'tagName' is required for 'delete' mode.",
    path: ["tagName"],
});

// 2. DEFINE the Zod response schema.
export const GitTagOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  mode: z.string().describe("The mode of operation that was performed."),
  message: z.string().optional().describe("A summary message of the result."),
  tags: z.array(z.string()).optional().describe("A list of tags for the 'list' mode."),
  tagName: z.string().optional().describe("The name of the tag that was created or deleted."),
});

// 3. INFER and export TypeScript types.
export type GitTagInput = z.infer<typeof GitTagInputSchema>;
export type GitTagOutput = z.infer<typeof GitTagOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitTagLogic(
  params: GitTagInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined }
): Promise<GitTagOutput> {
  const operation = `gitTagLogic:${params.mode}`;
  logger.debug(`Executing ${operation}`, { ...context, params });

  const workingDir = context.getWorkingDirectory();
  const targetPath = sanitization.sanitizePath(params.path === "." ? (workingDir || process.cwd()) : params.path, { allowAbsolute: true }).sanitizedPath;

  const args = ["-C", targetPath, "tag"];
  
  switch (params.mode) {
      case "list":
          args.push("--list");
          break;
      case "create":
          if (params.annotate) args.push("-a", "-m", params.message!);
          args.push(params.tagName!);
          if (params.commitRef) args.push(params.commitRef);
          break;
      case "delete":
          args.push("-d", params.tagName!);
          break;
  }

  try {
    logger.debug(`Executing command: git ${args.join(" ")}`, { ...context, operation });
    const { stdout } = await execFileAsync("git", args);

    if (params.mode === 'list') {
        const tags = stdout.trim().split("\n").filter(Boolean);
        return { success: true, mode: params.mode, tags };
    }

    return { success: true, mode: params.mode, message: `Tag '${params.tagName}' ${params.mode}d successfully.`, tagName: params.tagName };

  } catch (error: any) {
    const errorMessage = error.stderr || error.message || "";
    logger.error(`Failed to execute git tag command`, { ...context, operation, errorMessage });

    if (errorMessage.toLowerCase().includes("not a git repository")) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`);
    }
    if (params.mode === "create" && errorMessage.toLowerCase().includes("already exists")) {
      throw new McpError(BaseErrorCode.CONFLICT, `Tag '${params.tagName}' already exists.`);
    }
    if (params.mode === "delete" && errorMessage.toLowerCase().includes("not found")) {
        throw new McpError(BaseErrorCode.NOT_FOUND, `Tag '${params.tagName}' not found.`);
    }
    if (params.mode === "create" && params.commitRef && /unknown revision or path not in the working tree/i.test(errorMessage)) {
        throw new McpError(BaseErrorCode.NOT_FOUND, `Commit reference '${params.commitRef}' not found.`);
    }

    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Git tag ${params.mode} failed: ${errorMessage}`);
  }
}
