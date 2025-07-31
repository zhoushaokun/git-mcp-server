/**
 * @fileoverview Handles registration for the git working directory resource.
 * @module src/mcp-server/resources/gitWorkingDir/registration
 */

import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  requestContextService,
} from "../../../utils/index.js";
import { GetSessionIdFn } from "../../tools/gitAdd/registration.js";
import { getGitWorkingDirLogic, GetWorkingDirectoryFn } from "./logic.js";

const RESOURCE_URI = "git://working-directory";
const RESOURCE_NAME = "git_working_directory";
const RESOURCE_DESCRIPTION =
  "A resource that returns the currently configured working directory for the Git session as a JSON object. Returns 'NOT_SET' if no directory is configured.";

/**
 * Registers the Git Working Directory resource with the MCP server instance.
 * @param server The MCP server instance.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param getSessionId Function to get the session ID from context.
 */
export const registerGitWorkingDirResource = async (
  server: McpServer,
  getWorkingDirectory: GetWorkingDirectoryFn,
  getSessionId: GetSessionIdFn,
): Promise<void> => {
  const operation = "registerGitWorkingDirResource";
  const context = requestContextService.createRequestContext({ operation });

  await ErrorHandler.tryCatch(
    async () => {
      const template = new ResourceTemplate(RESOURCE_URI, {
        list: async () => ({ resources: [] }),
      });

      server.resource(
        RESOURCE_NAME,
        template,
        {
          name: "Current Git Working Directory",
          description: RESOURCE_DESCRIPTION,
          mimeType: "application/json",
        },
        async (uri: URL, params: Record<string, unknown>) => {
          const handlerContext = requestContextService.createRequestContext({
            parentRequestId: context.requestId,
            operation: "HandleResourceRead",
            resourceUri: uri.href,
            inputParams: params,
          });

          try {
            const sessionId = getSessionId(handlerContext);
            const workingDir = getGitWorkingDirLogic(
              handlerContext,
              getWorkingDirectory,
              sessionId,
            );
            const responseData = { workingDirectory: workingDir };

            return {
              contents: [
                {
                  uri: uri.href,
                  text: JSON.stringify(responseData),
                  mimeType: "application/json",
                },
              ],
            };
          } catch (error) {
            throw ErrorHandler.handleError(error, {
              operation: "gitWorkingDirReadHandler",
              context: handlerContext,
              input: { uri: uri.href, params },
            });
          }
        },
      );

      logger.info(
        `Resource '${RESOURCE_NAME}' registered successfully.`,
        context,
      );
    },
    {
      operation: `RegisteringResource_${RESOURCE_NAME}`,
      context: context,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      critical: true,
    },
  );
};
