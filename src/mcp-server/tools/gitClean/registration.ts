/**
 * @fileoverview Handles registration and error handling for the git_clean tool.
 * @module src/mcp-server/tools/gitClean/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";
import {
  gitCleanLogic,
  GitCleanInput,
  GitCleanInputSchema,
  GitCleanOutputSchema,
} from "./logic.js";

export type GetWorkingDirectoryFn = (sessionId: string | undefined) => string | undefined;
export type GetSessionIdFn = (context: Record<string, any>) => string | undefined;

const TOOL_NAME = "git_clean";
const TOOL_DESCRIPTION =
  "Removes untracked files from the working directory. Supports dry runs, removing directories, and removing ignored files. CRITICAL: Requires explicit `force: true` parameter for safety as this is a destructive operation. Returns results as a JSON object.";

/**
 * Registers the git_clean tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitCleanTool = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitCleanTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Clean",
      description: TOOL_DESCRIPTION,
      inputSchema: GitCleanInputSchema.shape,
      outputSchema: GitCleanOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true, // Running clean again does nothing if already clean
        openWorldHint: false,
      },
    },
    async (params: GitCleanInput, callContext: Record<string, any>) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        const sessionId = getSessionId(handlerContext);
        const result = await gitCleanLogic(params, {
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
