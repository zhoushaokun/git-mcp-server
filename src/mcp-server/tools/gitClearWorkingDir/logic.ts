/**
 * @fileoverview Defines the core logic, schemas, and types for the git_clear_working_dir tool.
 * @module src/mcp-server/tools/gitClearWorkingDir/logic
 */

import { z } from "zod";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { logger, type RequestContext } from "../../../utils/index.js";

// 1. DEFINE the Zod input schema.
export const GitClearWorkingDirInputSchema = z
  .object({
    confirm: z
      .enum(["Y", "y", "Yes", "yes"])
      .optional()
      .describe(
        "Optional confirmation flag. The tool runs without it, but it can be provided for clarity.",
      ),
  })
  .strict();

// 2. DEFINE the Zod response schema.
export const GitClearWorkingDirOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
});

// 3. INFER and export TypeScript types.
export type GitClearWorkingDirInput = z.infer<
  typeof GitClearWorkingDirInputSchema
>;
export type GitClearWorkingDirOutput = z.infer<
  typeof GitClearWorkingDirOutputSchema
>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitClearWorkingDirLogic(
  params: GitClearWorkingDirInput,
  context: RequestContext & { clearWorkingDirectory: () => void },
): Promise<GitClearWorkingDirOutput> {
  const operation = "gitClearWorkingDirLogic";
  logger.debug(`Executing ${operation}`, { ...context, params });

  try {
    context.clearWorkingDirectory();
    const message = "Session working directory cleared successfully.";
    logger.info(message, { ...context, operation });
    return { success: true, message };
  } catch (error) {
    // This is unlikely to be hit unless the clearWorkingDirectory function is changed
    // to throw, but it makes the pattern consistent with other logic files.
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      "An unexpected error occurred while clearing the working directory.",
      { originalError: error instanceof Error ? error.message : String(error) },
    );
  }
}
