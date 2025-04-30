import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ErrorHandler } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { requestContextService, RequestContext } from '../../../utils/requestContext.js';
// Import the shape and the final schema/types
import { GitDiffInputShape, GitDiffInputSchema, diffGitChanges, GitDiffInput, GitDiffResult } from './logic.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';

// --- State Accessors ---
// These functions need to be provided by the server setup layer (server.ts)

/** Type definition for the function that gets the working directory for a session */
export type GetWorkingDirectoryFn = (sessionId: string | undefined) => string | undefined;
/** Type definition for the function that gets the session ID from the context */
export type GetSessionIdFn = (context: Record<string, any>) => string | undefined;

let _getWorkingDirectory: GetWorkingDirectoryFn | undefined;
let _getSessionId: GetSessionIdFn | undefined;

/**
 * Initializes the state accessors needed by the tool registration.
 * This should be called once during server setup.
 * @param getWdFn - Function to get the working directory for a session.
 * @param getSidFn - Function to get the session ID from context.
 */
export function initializeGitDiffStateAccessors(getWdFn: GetWorkingDirectoryFn, getSidFn: GetSessionIdFn): void {
  _getWorkingDirectory = getWdFn;
  _getSessionId = getSidFn;
  logger.info('State accessors initialized for git_diff tool registration.');
}


const TOOL_NAME = 'git_diff';
const TOOL_DESCRIPTION = "Shows changes between commits, commit and working tree, etc. Can show staged changes or diff specific files. Returns the diff output as plain text.";

/**
 * Registers the git_diff tool with the MCP server.
 *
 * @param {McpServer} server - The MCP server instance.
 * @throws {Error} If state accessors are not initialized.
 */
export async function registerGitDiffTool(server: McpServer): Promise<void> {
  if (!_getWorkingDirectory || !_getSessionId) {
    throw new Error('State accessors for git_diff must be initialized before registration.');
  }

  const operation = 'registerGitDiffTool';
  const context = requestContextService.createRequestContext({ operation });

  await ErrorHandler.tryCatch(async () => {
    // Use the exported shape for registration
    server.tool<typeof GitDiffInputShape>(
      TOOL_NAME,
      TOOL_DESCRIPTION,
      GitDiffInputShape, // Provide the Zod base schema shape
      async (validatedArgs, callContext): Promise<CallToolResult> => {
        const toolOperation = 'tool:git_diff';
        const requestContext = requestContextService.createRequestContext({ operation: toolOperation, parentContext: callContext });

        const sessionId = _getSessionId!(requestContext);

        const getWorkingDirectoryForSession = () => {
          return _getWorkingDirectory!(sessionId);
        };

        const logicContext = {
          ...requestContext,
          sessionId: sessionId,
          getWorkingDirectory: getWorkingDirectoryForSession,
        };

        logger.info(`Executing tool: ${TOOL_NAME}`, logicContext);

        return await ErrorHandler.tryCatch<CallToolResult>(
          async () => {
            // Call the core logic function
            const diffResult: GitDiffResult = await diffGitChanges(validatedArgs as GitDiffInput, logicContext);

            // Format the result (the diff string) as plain text within TextContent
            const resultContent: TextContent = {
              type: 'text',
              // Return the raw diff output directly
              text: diffResult.diff,
              // Indicate the content type is plain text diff
              contentType: 'text/plain; charset=utf-8', // Or 'text/x-diff'
            };

            logger.info(`Tool ${TOOL_NAME} executed successfully: ${diffResult.message}`, logicContext);
            // Success is determined by the logic function
            return { content: [resultContent] };
          },
          {
            operation: toolOperation,
            context: logicContext,
            input: validatedArgs,
            errorCode: BaseErrorCode.INTERNAL_ERROR, // Default if unexpected error in logic
          }
        );
      }
    );

    logger.info(`Tool registered: ${TOOL_NAME}`, context);
  }, { operation, context, critical: true });
};
