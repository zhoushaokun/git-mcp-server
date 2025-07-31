import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js";
import {
  addGitFiles,
  GitAddInput,
  GitAddInputSchema,
  GitAddOutputSchema,
} from "./logic.js";

export type GetWorkingDirectoryFn = (
  sessionId: string | undefined,
) => string | undefined;
export type GetSessionIdFn = (context: RequestContext) => string | undefined;

const TOOL_NAME = "git_add";
const TOOL_DESCRIPTION =
  "Stages changes in the Git repository for the next commit by adding file contents to the index (staging area). Can stage specific files/patterns or all changes (default: '.'). Returns the result as a JSON object.";

export const registerGitAddTool = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitAddTool";
  const context = requestContextService.createRequestContext({ operation });

  await ErrorHandler.tryCatch(
    async () => {
      server.registerTool(
        TOOL_NAME,
        {
          title: "Git Add",
          description: TOOL_DESCRIPTION,
          inputSchema: GitAddInputSchema.shape,
          outputSchema: GitAddOutputSchema.shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (validatedArgs: GitAddInput, callContext) => {
          const toolOperation = "tool:git_add";
          const requestContext = requestContextService.createRequestContext({
            operation: toolOperation,
            parentContext: callContext,
          });

          const sessionId = getSessionId(requestContext);

          const logicContext = {
            ...requestContext,
            sessionId: sessionId,
            getWorkingDirectory: () => getWorkingDirectory(sessionId),
          };

          logger.info(`Executing tool: ${TOOL_NAME}`, logicContext);

          try {
            const result = await addGitFiles(validatedArgs, logicContext);
            return {
              structuredContent: result,
              content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
              ],
            };
          } catch (error) {
            const mcpError = ErrorHandler.handleError(error, {
              operation: "gitAddToolHandler",
              context: logicContext,
              input: validatedArgs,
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

      logger.info(`Tool registered: ${TOOL_NAME}`, context);
    },
    { operation, context, critical: true },
  );
};
