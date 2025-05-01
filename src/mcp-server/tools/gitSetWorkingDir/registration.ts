import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { BaseErrorCode } from '../../../types-global/errors.js'; // Direct import for types-global
import { ErrorHandler, logger, requestContextService } from '../../../utils/index.js'; // ErrorHandler (./utils/internal/errorHandler.js), logger (./utils/internal/logger.js), requestContextService & RequestContext (./utils/internal/requestContext.js)
import { GitSetWorkingDirInput, GitSetWorkingDirInputSchema, gitSetWorkingDirLogic } from './logic.js';

// --- State Accessors ---
// These functions need to be provided by the server setup layer (server.ts)
// to allow the tool registration to interact with the session-specific state.

/** Type definition for the function that sets the working directory for a session */
export type SetWorkingDirectoryFn = (sessionId: string | undefined, path: string) => void;
/** Type definition for the function that gets the session ID from the context */
export type GetSessionIdFn = (context: Record<string, any>) => string | undefined;

let _setWorkingDirectory: SetWorkingDirectoryFn | undefined;
let _getSessionId: GetSessionIdFn | undefined;

/**
 * Initializes the state accessors needed by the tool registration.
 * This should be called once during server setup.
 * @param setFn - Function to set the working directory for a session.
 * @param getFn - Function to get the session ID from context.
 */
export function initializeGitSetWorkingDirStateAccessors(setFn: SetWorkingDirectoryFn, getFn: GetSessionIdFn): void {
  _setWorkingDirectory = setFn;
  _getSessionId = getFn;
  logger.info('State accessors initialized for git_set_working_dir tool registration.');
}


const TOOL_NAME = 'git_set_working_dir';
const TOOL_DESCRIPTION = "Sets the default working directory for the current session. Subsequent Git tool calls within this session can use '.' for the `path` parameter, which will resolve to this directory. Optionally validates if the path is a Git repository (`validateGitRepo: true`). Returns the result as a JSON object. IMPORTANT: The provided path must be absolute.";

/**
 * Registers the git_set_working_dir tool with the MCP server.
 *
 * @param {McpServer} server - The MCP server instance.
 * @throws {Error} If state accessors are not initialized.
 */
export async function registerGitSetWorkingDirTool(server: McpServer): Promise<void> {
  if (!_setWorkingDirectory || !_getSessionId) {
    throw new Error('State accessors for git_set_working_dir must be initialized before registration.');
  }

  try {
    server.tool<typeof GitSetWorkingDirInputSchema.shape>(
      TOOL_NAME,
      TOOL_DESCRIPTION,
      GitSetWorkingDirInputSchema.shape, // Pass the shape for SDK validation
      async (validatedArgs, callContext) => { // Use callContext provided by SDK
        const operation = 'tool:git_set_working_dir';
        // Create a request context, potentially inheriting from callContext if it provides relevant info
        const requestContext = requestContextService.createRequestContext({ operation, parentContext: callContext });

        // Get session ID using the accessor function
        const sessionId = _getSessionId!(requestContext); // Non-null assertion as we checked initialization

        // Define the session-specific setter function
        const setWorkingDirectoryForSession = (path: string) => {
          _setWorkingDirectory!(sessionId, path); // Non-null assertion
        };

        // Enhance context with session ID and the setter function
        const logicContext = {
          ...requestContext,
          sessionId: sessionId,
          setWorkingDirectory: setWorkingDirectoryForSession,
        };

        return await ErrorHandler.tryCatch<CallToolResult>(
          async () => {
            // Call the core logic function with validated args and enhanced context
            const result = await gitSetWorkingDirLogic(validatedArgs as GitSetWorkingDirInput, logicContext);

            // Format the successful result for the MCP client
            const responseContent: TextContent = {
              type: 'text',
              text: JSON.stringify(result, null, 2), // Pretty-print JSON result
              contentType: 'application/json',
            };
            logger.info(`Tool ${TOOL_NAME} executed successfully`, { ...logicContext, result });
            return { content: [responseContent] };
          },
          {
            operation,
            context: logicContext,
            input: validatedArgs, // Log sanitized input
            errorCode: BaseErrorCode.INTERNAL_ERROR, // Default error code if logic fails unexpectedly
            // toolName: TOOL_NAME, // Removed as it's not part of ErrorHandlerOptions
          }
        );
      }
    );
    logger.info(`Tool registered: ${TOOL_NAME}`);
  } catch (error) {
    logger.error(`Failed to register tool: ${TOOL_NAME}`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Propagate the error to prevent server startup if registration fails
    throw error;
  }
}
