/**
 * @fileoverview Handles registration and error handling for the git_pull tool.
 * @module src/mcp-server/tools/gitPull/registration
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
  pullGitChanges,
  GitPullInput,
  GitPullInputSchema,
  GitPullOutputSchema,
} from "./logic.js";

export type GetWorkingDirectoryFn = (
  sessionId: string | undefined,
) => string | undefined;
export type GetSessionIdFn = (context: RequestContext) => string | undefined;

const TOOL_NAME = "git_pull";
const TOOL_DESCRIPTION =
  "Fetches from and integrates with another repository or a local branch (e.g., 'git pull origin main'). Supports rebase and fast-forward only options. Returns the pull result as a JSON object.";

/**
 * Registers the git_pull tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitPullTool = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitPullTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Pull",
      description: TOOL_DESCRIPTION,
      inputSchema: GitPullInputSchema.shape,
      outputSchema: GitPullOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Can change local files and history
        idempotentHint: false,
        openWorldHint: true, // Interacts with remote repositories
      },
    },
    async (params: GitPullInput, callContext: Record<string, unknown>) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        const sessionId = getSessionId(handlerContext);
        const result = await pullGitChanges(params, {
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
