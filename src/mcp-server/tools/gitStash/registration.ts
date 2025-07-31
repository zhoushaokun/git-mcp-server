/**
 * @fileoverview Handles registration and error handling for the git_stash tool.
 * @module src/mcp-server/tools/gitStash/registration
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
  gitStashLogic,
  GitStashInput,
  GitStashOutputSchema,
  GitStashBaseSchema,
} from "./logic.js";

export type GetWorkingDirectoryFn = (
  sessionId: string | undefined,
) => string | undefined;
export type GetSessionIdFn = (context: RequestContext) => string | undefined;

const TOOL_NAME = "git_stash";
const TOOL_DESCRIPTION =
  "Manages stashed changes in the working directory. Supports listing stashes, applying/popping specific stashes (with conflict detection), dropping stashes, and saving current changes to a new stash with an optional message. Returns results as a JSON object.";

/**
 * Registers the git_stash tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitStashTool = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitStashTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Stash",
      description: TOOL_DESCRIPTION,
      inputSchema: GitStashBaseSchema.shape,
      outputSchema: GitStashOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Can drop stashes or cause conflicts
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params: GitStashInput, callContext: Record<string, unknown>) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        const sessionId = getSessionId(handlerContext);
        const result = await gitStashLogic(params, {
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
