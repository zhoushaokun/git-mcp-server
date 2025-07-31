/**
 * @fileoverview Defines the core logic, schemas, and types for the git_tag tool.
 * @module src/mcp-server/tools/gitTag/logic
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
import { config } from "../../../config/index.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitTagBaseSchema = z.object({
  path: z.string().default(".").describe("Path to the local Git repository."),
  mode: z
    .enum(["list", "create", "delete"])
    .describe("The tag operation to perform."),
  tagName: z.string().min(1).optional().describe("The name for the tag."),
  message: z
    .string()
    .optional()
    .describe("The annotation message for the tag."),
  commitRef: z
    .string()
    .optional()
    .describe("The commit hash, branch, or other reference to tag."),
  annotate: z.boolean().default(false).describe("Create an annotated tag."),
});

export const GitTagInputSchema = GitTagBaseSchema.refine(
  (data) => !(data.mode === "create" && data.annotate && !data.message),
  {
    message:
      "An annotation 'message' is required when creating an annotated tag.",
    path: ["message"],
  },
)
  .refine((data) => !(data.mode === "create" && !data.tagName), {
    message: "A 'tagName' is required for 'create' mode.",
    path: ["tagName"],
  })
  .refine((data) => !(data.mode === "delete" && !data.tagName), {
    message: "A 'tagName' is required for 'delete' mode.",
    path: ["tagName"],
  });

// 2. DEFINE the Zod response schema.
export const GitTagOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  mode: z.string().describe("The mode of operation that was performed."),
  message: z.string().optional().describe("A summary message of the result."),
  tags: z
    .array(z.string())
    .optional()
    .describe("A list of tags for the 'list' mode."),
  tagName: z
    .string()
    .optional()
    .describe("The name of the tag that was created or deleted."),
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
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitTagOutput> {
  const operation = `gitTagLogic:${params.mode}`;
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

  if (params.mode === "list") {
    const { stdout } = await execFileAsync("git", [
      "-C",
      targetPath,
      "tag",
      "--list",
    ]);
    const tags = stdout.trim().split("\n").filter(Boolean);
    return { success: true, mode: params.mode, tags };
  }

  if (params.mode === "delete") {
    await execFileAsync("git", [
      "-C",
      targetPath,
      "tag",
      "-d",
      params.tagName!,
    ]);
    return {
      success: true,
      mode: params.mode,
      message: `Tag '${params.tagName}' deleted successfully.`,
      tagName: params.tagName,
    };
  }

  // Handle create mode with signing logic
  if (params.mode === "create") {
    const attemptTag = async (withSigning: boolean) => {
      const args = ["-C", targetPath, "tag"];
      if (params.annotate) {
        // Use -s for signed annotated tag, -a for unsigned
        args.push(withSigning ? "-s" : "-a");
        args.push("-m", params.message!);
      }
      args.push(params.tagName!);
      if (params.commitRef) {
        args.push(params.commitRef);
      }
      logger.debug(`Executing command: git ${args.join(" ")}`, {
        ...context,
        operation,
      });
      return await execFileAsync("git", args);
    };

    const shouldSign = !!config.gitSignCommits && params.annotate;
    try {
      await attemptTag(shouldSign);
    } catch (error: unknown) {
      const err = error as { stderr?: string }; // Cast to a type that might have stderr
      const isSigningError = (err.stderr || "").includes("gpg failed to sign");
      if (shouldSign && isSigningError) {
        logger.warning(
          "Tag with signing failed. Retrying automatically without signature.",
          { ...context, operation },
        );
        await attemptTag(false); // Fallback to unsigned annotated tag
      } else {
        throw error;
      }
    }
  }

  return {
    success: true,
    mode: params.mode,
    message: `Tag '${params.tagName}' ${params.mode}d successfully.`,
    tagName: params.tagName,
  };
}
