/**
 * @fileoverview Handles registration and error handling for the git_fetch tool.
 * @module src/mcp-server/tools/gitFetch/registration
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
  fetchGitRemote,
  GitFetchInput,
  GitFetchInputSchema,
  GitFetchOutputSchema,
} from "./logic.js";

export type GetWorkingDirectoryFn = (
  sessionId: string | undefined,
) => string | undefined;
export type GetSessionIdFn = (context: RequestContext) => string | undefined;

const TOOL_NAME = "git_fetch";
const TOOL_DESCRIPTION =
  "Downloads objects and refs from one or more repositories. Can fetch specific remotes or all, prune stale branches, and fetch tags.";

/**
 * Registers the git_fetch tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitFetchTool = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitFetchTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Fetch",
      description: TOOL_DESCRIPTION,
      inputSchema: GitFetchInputSchema.shape,
      outputSchema: GitFetchOutputSchema.shape,
      annotations: {
        readOnlyHint: false, // Modifies local refs
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true, // Interacts with remote repositories
      },
    },
    async (params: GitFetchInput, callContext: Record<string, unknown>) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        const sessionId = getSessionId(handlerContext);
        const result = await fetchGitRemote(params, {
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
