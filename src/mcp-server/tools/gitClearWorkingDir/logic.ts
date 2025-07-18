/**
 * @fileoverview Defines the core logic, schemas, and types for the git_clear_working_dir tool.
 * @module src/mcp-server/tools/gitClearWorkingDir/logic
 */

import { z } from "zod";
import { logger, type RequestContext } from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";

// 1. DEFINE the Zod input schema.
export const GitClearWorkingDirInputSchema = z.object({});

// 2. DEFINE the Zod response schema.
export const GitClearWorkingDirOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  message: z.string().describe("A summary message of the result."),
});

// 3. INFER and export TypeScript types.
export type GitClearWorkingDirInput = z.infer<typeof GitClearWorkingDirInputSchema>;
export type GitClearWorkingDirOutput = z.infer<typeof GitClearWorkingDirOutputSchema>;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function gitClearWorkingDirLogic(
  params: GitClearWorkingDirInput,
  context: RequestContext & { clearWorkingDirectory: () => void }
): Promise<GitClearWorkingDirOutput> {
  const operation = "gitClearWorkingDirLogic";
  logger.debug(`Executing ${operation}`, { ...context, params });

  context.clearWorkingDirectory();
  const message = "Session working directory cleared successfully.";
  logger.info(message, { ...context, operation });
  return { success: true, message };
}
