/**
 * @fileoverview Handles registration and error handling for the git_cherry-pick tool.
 * @module src/mcp-server/tools/gitCherryPick/registration
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
  gitCherryPickLogic,
  GitCherryPickInput,
  GitCherryPickInputSchema,
  GitCherryPickOutputSchema,
} from "./logic.js";

export type GetWorkingDirectoryFn = (
  sessionId: string | undefined,
) => string | undefined;
export type GetSessionIdFn = (context: RequestContext) => string | undefined;

const TOOL_NAME = "git_cherry_pick";
const TOOL_DESCRIPTION =
  "Applies the changes introduced by existing commits. Supports picking single commits or ranges, handling merge commits, and options like --no-commit and --signoff. Returns results as a JSON object, indicating success, failure, or conflicts.";

/**
 * Registers the git_cherry_pick tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitCherryPickTool = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitCherryPickTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Cherry-Pick",
      description: TOOL_DESCRIPTION,
      inputSchema: GitCherryPickInputSchema.shape,
      outputSchema: GitCherryPickOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // Not typically destructive, but can cause conflicts
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (
      params: GitCherryPickInput,
      callContext: Record<string, unknown>,
    ) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        const sessionId = getSessionId(handlerContext);
        const result = await gitCherryPickLogic(params, {
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
