/**
 * @fileoverview Handles registration and error handling for the git_wrapup_instructions tool.
 * @module src/mcp-server/tools/gitWrapupInstructions/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js";
import {
  getWrapupInstructions,
  GitWrapupInstructionsInput,
  GitWrapupInstructionsInputSchema,
  GitWrapupInstructionsOutputSchema,
} from "./logic.js";

export type GetWorkingDirectoryFn = (
  sessionId: string | undefined,
) => string | undefined;
export type GetSessionIdFn = (context: RequestContext) => string | undefined;

const TOOL_NAME = "git_wrapup_instructions";
const TOOL_DESCRIPTION =
  "Provides a standard Git wrap-up workflow. This involves reviewing changes with `git_diff`, updating documentation (README, CHANGELOG), and making logical, descriptive commits using the `git_commit` tool. Can optionally include instructions to create a Git tag after committing. The tool's response also includes the current `git status` output. You should set the working directory using `git_set_working_dir` before running this tool.";

/**
 * Registers the git_wrapup_instructions tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitWrapupInstructionsTool = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitWrapupInstructionsTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Wrap-up Instructions",
      description: TOOL_DESCRIPTION,
      inputSchema: GitWrapupInstructionsInputSchema.shape,
      outputSchema: GitWrapupInstructionsOutputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (
      params: GitWrapupInstructionsInput,
      callContext: Record<string, unknown>,
    ) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        const sessionId = getSessionId(handlerContext);
        const result = await getWrapupInstructions(params, {
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
