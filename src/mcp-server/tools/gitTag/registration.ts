/**
 * @fileoverview Handles registration and error handling for the git_tag tool.
 * @module src/mcp-server/tools/gitTag/registration
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
  gitTagLogic,
  GitTagInput,
  GitTagInputSchema,
  GitTagOutputSchema,
  GitTagBaseSchema,
} from "./logic.js";

export type GetWorkingDirectoryFn = (
  sessionId: string | undefined,
) => string | undefined;
export type GetSessionIdFn = (context: RequestContext) => string | undefined;

const TOOL_NAME = "git_tag";
const TOOL_DESCRIPTION =
  "Manages Git tags. Supports listing existing tags, creating new lightweight or annotated tags against specific commits, and deleting local tags. Returns results as a JSON object.";

/**
 * Registers the git_tag tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitTagTool = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitTagTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Tag",
      description: TOOL_DESCRIPTION,
      inputSchema: GitTagBaseSchema.shape,
      outputSchema: GitTagOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Can create/delete tags
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params: GitTagInput, callContext: Record<string, unknown>) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        // Explicitly parse with the refined schema to enforce validation rules
        const validatedParams = GitTagInputSchema.parse(params);
        const sessionId = getSessionId(handlerContext);
        const result = await gitTagLogic(validatedParams, {
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
