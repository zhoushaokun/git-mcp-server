/**
 * @fileoverview Handles registration and error handling for the git_clone tool.
 * @module src/mcp-server/tools/gitClone/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ErrorHandler,
  logger,
  requestContextService,
} from "../../../utils/index.js";
import { McpError } from "../../../types-global/errors.js";
import {
  gitCloneLogic,
  GitCloneInput,
  GitCloneInputSchema,
  GitCloneOutputSchema,
} from "./logic.js";

export type GetSessionIdFn = (
  context: Record<string, unknown>,
) => string | undefined;

const TOOL_NAME = "git_clone";
const TOOL_DESCRIPTION =
  "Clones a Git repository from a given URL into a specified absolute directory path. Supports cloning specific branches and setting clone depth.";

/**
 * Registers the git_clone tool with the MCP server instance.
 * @param server The MCP server instance.
 */
export const registerGitCloneTool = async (
  server: McpServer,
): Promise<void> => {
  const operation = "registerGitCloneTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Clone",
      description: TOOL_DESCRIPTION,
      inputSchema: GitCloneInputSchema.shape,
      outputSchema: GitCloneOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Creates new files/directories
        idempotentHint: false,
        openWorldHint: true, // Interacts with remote repositories
      },
    },
    async (params: GitCloneInput, callContext: Record<string, unknown>) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        const result = await gitCloneLogic(params, handlerContext);

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
