/**
 * @fileoverview Handles registration and error handling for the git_clear_working_dir tool.
 * @module src/mcp-server/tools/gitClearWorkingDir/registration
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
  gitClearWorkingDirLogic,
  GitClearWorkingDirInput,
  GitClearWorkingDirInputSchema,
  GitClearWorkingDirOutputSchema,
} from "./logic.js";

export type ClearWorkingDirectoryFn = (sessionId: string | undefined) => void;
export type GetSessionIdFn = (context: RequestContext) => string | undefined;

const TOOL_NAME = "git_clear_working_dir";
const TOOL_DESCRIPTION =
  "Clears the session-specific working directory previously set by `git_set_working_dir`. Subsequent Git tool calls in this session will require an explicit `path` parameter or will default to the server's current working directory. Returns the result as a JSON object.";

/**
 * Registers the git_clear_working_dir tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param clearWorkingDirectory Function to clear the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitClearWorkingDirTool = async (
  server: McpServer,
  clearWorkingDirectory: ClearWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitClearWorkingDirTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Clear Working Directory",
      description: TOOL_DESCRIPTION,
      inputSchema: GitClearWorkingDirInputSchema.shape,
      outputSchema: GitClearWorkingDirOutputSchema.shape,
      annotations: {
        readOnlyHint: true, // Modifies session state, but not external files
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (
      params: GitClearWorkingDirInput,
      callContext: Record<string, unknown>,
    ) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        const sessionId = getSessionId(handlerContext);
        const result = await gitClearWorkingDirLogic(params, {
          ...handlerContext,
          clearWorkingDirectory: () => clearWorkingDirectory(sessionId),
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
