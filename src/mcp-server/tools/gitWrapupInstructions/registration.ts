import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { BaseErrorCode } from '../../../types-global/errors.js';
import { ErrorHandler, logger, requestContextService } from '../../../utils/index.js';
import {
  getWrapupInstructions,
  GitWrapupInstructionsInput,
  GitWrapupInstructionsInputSchema,
  GitWrapupInstructionsResult,
} from './logic.js';

const TOOL_NAME = 'git_wrapup_instructions';
const TOOL_DESCRIPTION = 'Provides a standard Git wrap-up workflow. This involves reviewing changes with `git_diff`, updating documentation (README, CHANGELOG), and making logical, descriptive commits using the `git_commit` tool.';

/**
 * Registers the git_wrapup_instructions tool with the MCP server.
 *
 * @param {McpServer} server - The McpServer instance to register the tool with.
 * @returns {Promise<void>}
 * @throws {Error} If registration fails.
 */
export const registerGitWrapupInstructionsTool = async (server: McpServer): Promise<void> => {
  const operation = 'registerGitWrapupInstructionsTool';
  const context = requestContextService.createRequestContext({ operation });

  await ErrorHandler.tryCatch(async () => {
    server.tool<typeof GitWrapupInstructionsInputSchema.shape>(
      TOOL_NAME,
      TOOL_DESCRIPTION,
      GitWrapupInstructionsInputSchema.shape, // Empty schema shape
      async (validatedArgs, callContext): Promise<CallToolResult> => {
        const toolOperation = 'tool:git_wrapup_instructions';
        // Pass callContext as parentContext for consistent context chaining
        const requestContext = requestContextService.createRequestContext({ operation: toolOperation, parentContext: callContext });

        logger.info(`Executing tool: ${TOOL_NAME}`, requestContext);

        return await ErrorHandler.tryCatch<CallToolResult>(
          async () => {
            const result: GitWrapupInstructionsResult = await getWrapupInstructions(
              validatedArgs as GitWrapupInstructionsInput,
              requestContext // Pass the created requestContext
            );

            const resultContent: TextContent = {
              type: 'text',
              text: JSON.stringify(result, null, 2),
              contentType: 'application/json',
            };

            logger.info(`Tool ${TOOL_NAME} executed successfully, returning JSON`, requestContext);
            return { content: [resultContent] };
          },
          {
            operation: toolOperation,
            context: requestContext,
            input: validatedArgs,
            errorCode: BaseErrorCode.INTERNAL_ERROR,
          }
        );
      }
    );
    logger.info(`Tool registered: ${TOOL_NAME}`, context);
  }, { operation, context, critical: true });
};
