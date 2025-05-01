import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
// Import utils from barrel (ErrorHandler from ../utils/internal/errorHandler.js)
import { ErrorHandler } from '../../../utils/index.js';
// Import utils from barrel (logger from ../utils/internal/logger.js)
import { logger } from '../../../utils/index.js';
// Import utils from barrel (requestContextService from ../utils/internal/requestContext.js)
import { BaseErrorCode } from '../../../types-global/errors.js'; // Keep direct import for types-global
import { requestContextService } from '../../../utils/index.js';
import { GitInitInput, GitInitInputSchema, gitInitLogic, GitInitResult } from './logic.js';

const TOOL_NAME = 'git_init';
const TOOL_DESCRIPTION = 'Initializes a new Git repository at the specified absolute path. Can optionally set the initial branch name and create a bare repository.';

/**
 * Registers the git_init tool with the MCP server.
 *
 * @param {McpServer} server - The McpServer instance to register the tool with.
 * @returns {Promise<void>}
 * @throws {Error} If registration fails.
 */
export const registerGitInitTool = async (server: McpServer): Promise<void> => {
  const operation = 'registerGitInitTool';
  const context = requestContextService.createRequestContext({ operation });

  await ErrorHandler.tryCatch(async () => {
    server.tool<typeof GitInitInputSchema.shape>(
      TOOL_NAME,
      TOOL_DESCRIPTION,
      GitInitInputSchema.shape, // Provide the Zod schema shape
      async (validatedArgs, callContext): Promise<CallToolResult> => {
        const toolOperation = 'tool:git_init';
        const requestContext = requestContextService.createRequestContext({ operation: toolOperation, parentContext: callContext });

        logger.info(`Executing tool: ${TOOL_NAME}`, requestContext);

        return await ErrorHandler.tryCatch<CallToolResult>(
          async () => {
            // Call the core logic function
            const initResult: GitInitResult = await gitInitLogic(validatedArgs as GitInitInput, requestContext);

            // Format the result as a JSON string within TextContent
            const resultContent: TextContent = {
              type: 'text',
              text: JSON.stringify(initResult, null, 2), // Pretty-print JSON
              contentType: 'application/json',
            };

            logger.info(`Tool ${TOOL_NAME} executed successfully, returning JSON`, requestContext);
            return { content: [resultContent] };
          },
          {
            operation: toolOperation,
            context: requestContext,
            input: validatedArgs,
            errorCode: BaseErrorCode.INTERNAL_ERROR, // Default if unexpected error occurs
          }
        );
      }
    );

    logger.info(`Tool registered: ${TOOL_NAME}`, context);
  }, { operation, context, critical: true }); // Mark registration as critical
};
