/**
 * @fileoverview Handles registration and error handling for the git_worktree tool.
 * @module src/mcp-server/tools/gitWorktree/registration
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
  gitWorktreeLogic,
  GitWorktreeInput,
  GitWorktreeInputSchema,
  GitWorktreeOutputSchema,
  GitWorktreeBaseSchema,
} from "./logic.js";

export type GetWorkingDirectoryFn = (
  sessionId: string | undefined,
) => string | undefined;
export type GetSessionIdFn = (context: RequestContext) => string | undefined;

const TOOL_NAME = "git_worktree";
const TOOL_DESCRIPTION =
  "Manages Git worktrees. Supports listing, adding, removing, moving, and pruning worktrees. Returns results as a JSON object.";

/**
 * Registers the git_worktree tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitWorktreeTool = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitWorktreeTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Worktree",
      description: TOOL_DESCRIPTION,
      inputSchema: GitWorktreeBaseSchema.shape,
      outputSchema: GitWorktreeOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Can add/remove/move worktrees
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params: GitWorktreeInput, callContext: Record<string, unknown>) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        // Explicitly parse with the refined schema to enforce validation rules
        const validatedParams = GitWorktreeInputSchema.parse(params);
        const sessionId = getSessionId(handlerContext);
        const result = await gitWorktreeLogic(validatedParams, {
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
