/**
 * @fileoverview Handles registration and error handling for the git_commit tool.
 * @module src/mcp-server/tools/gitCommit/registration
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
  commitGitChanges,
  GitCommitInput,
  GitCommitInputSchema,
  GitCommitOutputSchema,
} from "./logic.js";

export type GetWorkingDirectoryFn = (
  sessionId: string | undefined,
) => string | undefined;
export type GetSessionIdFn = (context: RequestContext) => string | undefined;

const TOOL_NAME = "git_commit";
const TOOL_DESCRIPTION = `Commits staged changes to the Git repository index with a descriptive message. Supports author override, amending, and empty commits. Returns a JSON result.

**Commit Message Guidance:**
Write clear, concise commit messages using the Conventional Commits format: \`type(scope): subject\`.
- \`type\`: feat, fix, docs, style, refactor, test, chore, etc.
- \`(scope)\`: Optional context (e.g., \`auth\`, \`ui\`, filename).
- \`subject\`: Imperative, present tense description (e.g., "add login button", not "added login button").

I want to understand what you did and why. Use the body for detailed explanations, if necessary.

**Example Commit Message:**
\`\`\`
feat(auth): implement password reset endpoint

- Adds the /api/auth/reset-password endpoint to allow users to reset their password via an email link. 
- Includes input validation and rate limiting.

Closes #123 (if applicable).
\`\`\`

**Tool Options & Behavior:**
- Commit related changes logically. Use the optional \`filesToStage\` parameter to auto-stage specific files before committing.
- The \`path\` defaults to the session's working directory unless overridden. If \`GIT_SIGN_COMMITS=true\` is set, commits are signed (\`-S\`), with an optional \`forceUnsignedOnFailure\` fallback.`;

/**
 * Registers the git_commit tool with the MCP server instance.
 * @param server The MCP server instance.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitCommitTool = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitCommitTool";
  const context = requestContextService.createRequestContext({ operation });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Git Commit",
      description: TOOL_DESCRIPTION,
      inputSchema: GitCommitInputSchema.shape,
      outputSchema: GitCommitOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false, // Committing is not idempotent
        openWorldHint: false,
      },
    },
    async (params: GitCommitInput, callContext: Record<string, unknown>) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName: TOOL_NAME,
        parentContext: callContext,
      });

      try {
        const sessionId = getSessionId(handlerContext);
        const result = await commitGitChanges(params, {
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
