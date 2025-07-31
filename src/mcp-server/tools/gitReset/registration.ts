/**
 * @fileoverview Handles registration and error handling for the git_reset tool.
 * @module src/mcp-server/tools/gitReset/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js";
import { McpError } from "../../../types-global/errors.js";
import {
  resetGitState,
  GitResetInput,
  GitResetInputSchema,
  GitResetOutputSchema,
} from "./logic.js";

export type GetWorkingDirectoryFn = (
  sessionId: string | undefined,
) => string | undefined;
export type GetSessionIdFn = (context: RequestContext) => string | undefined;

const TOOL_NAME = "git_reset";
const TOOL_DESCRIPTION =
  "Resets the current HEAD to a specified state. Supports different modes ('soft', 'mixed', 'hard', 'merge', 'keep') to control how the index and working tree are affected. Can reset to a specific commit. USE 'hard' MODE WITH EXTREME CAUTION as it discards local changes.";

/**
 * Registers the git_reset tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitResetTool = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitResetTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Reset",
      description: TOOL_DESCRIPTION,
      inputSchema: GitResetInputSchema.shape,
      outputSchema: GitResetOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Can be very destructive, especially in 'hard' mode
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params: GitResetInput, callContext: Record<string, unknown>) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        const sessionId = getSessionId(handlerContext);
        const result = await resetGitState(params, {
          ...handlerContext,
          getWorkingDirectory: () => getWorkingDirectory(sessionId),
        });

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Success: ${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        logger.error(`Error in ${TOOL_NAME} handler`, {
          error,
          ...handlerContext,
        });
        const mcpError = ErrorHandler.handleError(error, {
          operation: `tool:${TOOL_NAME}`,
          context: handlerContext,
          input: params,
        }) as McpError;

        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${mcpError.message}` }],
          structuredContent: {
            code: mcpError.code,
            message: mcpError.message,
            details: mcpError.details,
          },
        };
      }
    },
  );
  logger.info(`Tool '${TOOL_NAME}' registered successfully.`, context);
};
