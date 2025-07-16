/**
 * @fileoverview Handles registration and error handling for the git_remote tool.
 * @module src/mcp-server/tools/gitRemote/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";
import {
  gitRemoteLogic,
  GitRemoteInput,
  GitRemoteInputSchema,
  GitRemoteOutputSchema,
  GitRemoteBaseSchema,
} from "./logic.js";

export type GetWorkingDirectoryFn = (sessionId: string | undefined) => string | undefined;
export type GetSessionIdFn = (context: Record<string, any>) => string | undefined;

const TOOL_NAME = "git_remote";
const TOOL_DESCRIPTION = "Manages remote repositories (list, add, remove, show).";

/**
 * Registers the git_remote tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitRemoteTool = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitRemoteTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Remote",
      description: TOOL_DESCRIPTION,
      inputSchema: GitRemoteBaseSchema.shape,
      outputSchema: GitRemoteOutputSchema.shape,
      annotations: {
        readOnlyHint: false, // Can add/remove remotes
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params: GitRemoteInput, callContext: Record<string, any>) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        const sessionId = getSessionId(handlerContext);
        const result = await gitRemoteLogic(params, {
            ...handlerContext,
            getWorkingDirectory: () => getWorkingDirectory(sessionId),
        });

        return {
          structuredContent: result,
          content: [{ type: "text", text: `Success: ${JSON.stringify(result, null, 2)}` }],
        };
      } catch (error) {
        logger.error(`Error in ${TOOL_NAME} handler`, { error, ...handlerContext });
        const handledError = ErrorHandler.handleError(error, {
            operation: `tool:${TOOL_NAME}`,
            context: handlerContext,
            input: params,
        });

        const mcpError = handledError instanceof McpError
            ? handledError
            : new McpError(BaseErrorCode.INTERNAL_ERROR, "An unexpected error occurred.", { originalError: handledError });

        return {
          isError: true,
          content: [{ type: "text", text: mcpError.message }],
          structuredContent: mcpError.details,
        };
      }
    }
  );
  logger.info(`Tool '${TOOL_NAME}' registered successfully.`, context);
};
