/**
 * @fileoverview Handles registration and error handling for the git_merge tool.
 * @module src/mcp-server/tools/gitMerge/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";
import {
  gitMergeLogic,
  GitMergeInput,
  GitMergeInputSchema,
  GitMergeOutputSchema,
} from "./logic.js";

export type GetWorkingDirectoryFn = (sessionId: string | undefined) => string | undefined;
export type GetSessionIdFn = (context: Record<string, any>) => string | undefined;

const TOOL_NAME = "git_merge";
const TOOL_DESCRIPTION =
  "Merges the specified branch into the current branch. Supports options like --no-ff, --squash, and --abort. Returns the merge result as a JSON object.";

/**
 * Registers the git_merge tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitMergeTool = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitMergeTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Merge",
      description: TOOL_DESCRIPTION,
      inputSchema: GitMergeInputSchema.shape,
      outputSchema: GitMergeOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Can create merge commits and change history
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params: GitMergeInput, callContext: Record<string, any>) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        const sessionId = getSessionId(handlerContext);
        const result = await gitMergeLogic(params, {
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
