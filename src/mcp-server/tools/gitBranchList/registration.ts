import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../../utils/logger.js';
import { ErrorHandler } from '../../../utils/errorHandler.js';
import { requestContextService } from '../../../utils/requestContext.js';
// Import the result type along with the function and input schema
import { getGitBranchList, GitBranchListInputSchema, GitBranchListInput, GitBranchListResult } from './logic.js';
import { McpError, BaseErrorCode } from '../../../types-global/errors.js'; // Import BaseErrorCode

// --- State Accessors ---
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
export function initializeGitBranchListStateAccessors(getWdFn: GetWorkingDirectoryFn, getSidFn: GetSessionIdFn): void {
  _getWorkingDirectory = getWdFn;
  _getSessionId = getSidFn;
  logger.info('State accessors initialized for git_branch_list tool registration.');
}


const TOOL_NAME = 'git_branch_list';
const TOOL_DESCRIPTION = 'Lists branches in a Git repository. Displays local branches by default, and optionally remote branches (`all: true`). Marks the current branch and returns the list as a JSON object.';

/**
 * Registers the git_branch_list tool with the MCP server.
 * Uses the high-level server.tool() method for registration, schema validation, and routing.
 *
 * @param {McpServer} server - The McpServer instance to register the tool with.
 * @returns {Promise<void>}
 * @throws {Error} If registration fails or state accessors are not initialized.
 */
export const registerGitBranchListTool = async (server: McpServer): Promise<void> => {
  if (!_getWorkingDirectory || !_getSessionId) {
    throw new Error('State accessors for git_branch_list must be initialized before registration.');
  }

  const operation = 'registerGitBranchListTool';
  const context = requestContextService.createRequestContext({ operation });

  await ErrorHandler.tryCatch(async () => {
    server.tool<typeof GitBranchListInputSchema.shape>(
      TOOL_NAME,
      TOOL_DESCRIPTION,
      GitBranchListInputSchema.shape, // Provide the Zod schema shape
      async (validatedArgs, callContext): Promise<CallToolResult> => {
        const toolOperation = 'tool:git_branch_list';
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
            // Call the core logic function which now returns a GitBranchListResult object
            const branchListResult: GitBranchListResult = await getGitBranchList(validatedArgs as GitBranchListInput, logicContext);

            // Format the successful result as a JSON string within TextContent
            const resultContent: TextContent = {
              type: 'text',
              // Stringify the JSON object for the response content
              text: JSON.stringify(branchListResult, null, 2), // Pretty-print JSON
              contentType: 'application/json',
            };

            logger.info(`Tool ${TOOL_NAME} executed successfully, returning JSON`, logicContext);
            return { content: [resultContent] };
          },
          {
            operation: toolOperation,
            context: logicContext,
            input: validatedArgs,
            errorCode: BaseErrorCode.INTERNAL_ERROR,
          }
        );
      }
    );

    logger.info(`Tool registered: ${TOOL_NAME}`, context);
  }, { operation, context, critical: true });
};
