/**
 * @fileoverview Handles registration and error handling for the git_init tool.
 * @module src/mcp-server/tools/gitInit/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";
import {
  gitInitLogic,
  GitInitInput,
  GitInitInputSchema,
  GitInitOutputSchema,
} from "./logic.js";

export type GetSessionIdFn = (context: Record<string, any>) => string | undefined;

const TOOL_NAME = "git_init";
const TOOL_DESCRIPTION =
  "Initializes a new Git repository at the specified path. If path is relative or omitted, it resolves against the session working directory (if you have set the git_working_dir). Can optionally set the initial branch name and create a bare repository.";

/**
 * Registers the git_init tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitInitTool = async (
  server: McpServer,
  getSessionId: GetSessionIdFn, // Added for consistency
): Promise<void> => {
  const operation = "registerGitInitTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Initialize",
      description: TOOL_DESCRIPTION,
      inputSchema: GitInitInputSchema.shape,
      outputSchema: GitInitOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Creates a .git directory
        idempotentHint: true, // Re-initializing is idempotent
        openWorldHint: false,
      },
    },
    async (params: GitInitInput, callContext: Record<string, any>) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        // The logic function now handles path resolution.
        const result = await gitInitLogic(params, handlerContext);

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
