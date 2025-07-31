/**
 * @fileoverview Handles registration and error handling for the git_init tool.
 * @module src/mcp-server/tools/gitInit/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ErrorHandler,
  logger,
  requestContextService,
} from "../../../utils/index.js";
import { McpError } from "../../../types-global/errors.js";
import {
  gitInitLogic,
  GitInitInput,
  GitInitInputSchema,
  GitInitOutputSchema,
} from "./logic.js";

export type GetSessionIdFn = (
  context: Record<string, unknown>,
) => string | undefined;

const TOOL_NAME = "git_init";
const TOOL_DESCRIPTION =
  "Initializes a new Git repository at the specified path. If path is relative or omitted, it resolves against the session working directory (if you have set the git_working_dir). Can optionally set the initial branch name and create a bare repository.";

/**
 * Registers the git_init tool with the MCP server instance.
 * @param server The MCP server instance.
 */
export const registerGitInitTool = async (server: McpServer): Promise<void> => {
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
    async (params: GitInitInput, callContext: Record<string, unknown>) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        // The logic function now handles path resolution.
        const result = await gitInitLogic(params, handlerContext);

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
