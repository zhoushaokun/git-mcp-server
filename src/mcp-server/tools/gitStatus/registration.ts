import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../../utils/logger.js';
import { ErrorHandler } from '../../../utils/errorHandler.js';
import { requestContextService } from '../../../utils/requestContext.js';
// Import the result type along with the function and input schema
import { getGitStatus, GitStatusInputSchema, GitStatusInput, GitStatusResult } from './logic.js';
import { McpError, BaseErrorCode } from '../../../types-global/errors.js'; // Import BaseErrorCode

// --- State Accessors ---
/** Type definition for the function that gets the working directory for a session */
export type GetWorkingDirectoryFn = (sessionId: string | undefined) => string | undefined;
/** Type definition for the function that gets the session ID from the context */
export type GetSessionIdFn = (context: Record<string, any>) => string | undefined; // Re-using from other tools

let _getWorkingDirectory: GetWorkingDirectoryFn | undefined;
let _getSessionId: GetSessionIdFn | undefined;

/**
 * Initializes the state accessors needed by the tool registration.
 * This should be called once during server setup.
 * @param getWdFn - Function to get the working directory for a session.
 * @param getSidFn - Function to get the session ID from context.
 */
export function initializeGitStatusStateAccessors(getWdFn: GetWorkingDirectoryFn, getSidFn: GetSessionIdFn): void {
  _getWorkingDirectory = getWdFn;
  _getSessionId = getSidFn;
  logger.info('State accessors initialized for git_status tool registration.');
}


const TOOL_NAME = 'git_status';
const TOOL_DESCRIPTION = 'Retrieves the status of a Git repository. Shows the working tree status including tracked/untracked files, modifications, staged changes, and current branch information. Returns the status as a JSON object.';

/**
 * Registers the git_status tool with the MCP server.
 * Uses the high-level server.tool() method for registration, schema validation, and routing.
 *
 * @param {McpServer} server - The McpServer instance to register the tool with.
 * @returns {Promise<void>}
 * @throws {Error} If registration fails or state accessors are not initialized.
 */
export const registerGitStatusTool = async (server: McpServer): Promise<void> => {
  if (!_getWorkingDirectory || !_getSessionId) {
    throw new Error('State accessors for git_status must be initialized before registration.');
  }

  const operation = 'registerGitStatusTool';
  const context = requestContextService.createRequestContext({ operation });

  await ErrorHandler.tryCatch(async () => {
    server.tool<typeof GitStatusInputSchema.shape>(
      TOOL_NAME,
      TOOL_DESCRIPTION,
      GitStatusInputSchema.shape, // Provide the Zod schema shape
      async (validatedArgs, callContext): Promise<CallToolResult> => {
        const toolOperation = 'tool:git_status';
        // Create context, potentially inheriting from callContext
        const requestContext = requestContextService.createRequestContext({ operation: toolOperation, parentContext: callContext });

        // Get session ID
        const sessionId = _getSessionId!(requestContext);

        // Define the session-specific getter function
        const getWorkingDirectoryForSession = () => {
          return _getWorkingDirectory!(sessionId);
        };

        // Enhance context for the logic function
        const logicContext = {
          ...requestContext,
          sessionId: sessionId,
          getWorkingDirectory: getWorkingDirectoryForSession,
        };

        logger.info(`Executing tool: ${TOOL_NAME}`, logicContext);

        // Use ErrorHandler.tryCatch to wrap the logic execution
        return await ErrorHandler.tryCatch<CallToolResult>(
          async () => {
            // Call the core logic function with validated args and enhanced context
            const statusResult: GitStatusResult = await getGitStatus(validatedArgs as GitStatusInput, logicContext);

            // Format the successful result as a JSON string within TextContent
            const resultContent: TextContent = {
              type: 'text',
              // Stringify the JSON object for the response content
              text: JSON.stringify(statusResult, null, 2), // Pretty-print JSON
              contentType: 'application/json', // Specify content type
            };

            logger.info(`Tool ${TOOL_NAME} executed successfully, returning JSON`, logicContext);
            return { content: [resultContent] }; // isError defaults to false
          },
          {
            operation: toolOperation,
            context: logicContext,
            input: validatedArgs, // Log sanitized input
            errorCode: BaseErrorCode.INTERNAL_ERROR, // Default error code if logic fails unexpectedly
          }
        );
      }
    );

    logger.info(`Tool registered: ${TOOL_NAME}`, context);
  }, { operation, context, critical: true }); // Treat registration failure as critical
};
