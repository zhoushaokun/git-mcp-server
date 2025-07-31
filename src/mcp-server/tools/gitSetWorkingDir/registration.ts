/**
 * @fileoverview Handles registration and error handling for the git_set_working_dir tool.
 * @module src/mcp-server/tools/gitSetWorkingDir/registration
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
  gitSetWorkingDirLogic,
  GitSetWorkingDirInput,
  GitSetWorkingDirInputSchema,
  GitSetWorkingDirOutputSchema,
} from "./logic.js";

export type SetWorkingDirectoryFn = (
  sessionId: string | undefined,
  path: string,
) => void;
export type GetSessionIdFn = (context: RequestContext) => string | undefined;

const TOOL_NAME = "git_set_working_dir";
const TOOL_DESCRIPTION =
  "Sets the default working directory for the current session. Subsequent Git tool calls within this session can use '.' for the `path` parameter, which will resolve to this directory. Optionally validates if the path is a Git repository (`validateGitRepo: true`). Can optionally initialize a Git repository with 'git init' if it's not already one and `initializeIfNotPresent: true` is set. Returns the result as a JSON object. IMPORTANT: The provided path must be absolute.";

/**
 * Registers the git_set_working_dir tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param setWorkingDirectory Function to set the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitSetWorkingDirTool = async (
  server: McpServer,
  setWorkingDirectory: SetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitSetWorkingDirTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Set Working Directory",
      description: TOOL_DESCRIPTION,
      inputSchema: GitSetWorkingDirInputSchema.shape,
      outputSchema: GitSetWorkingDirOutputSchema.shape,
      annotations: {
        readOnlyHint: true, // Modifies session state, but not external files
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (
      params: GitSetWorkingDirInput,
      callContext: Record<string, unknown>,
    ) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        const sessionId = getSessionId(handlerContext);
        const result = await gitSetWorkingDirLogic(params, {
          ...handlerContext,
          setWorkingDirectory: (path: string) =>
            setWorkingDirectory(sessionId, path),
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
