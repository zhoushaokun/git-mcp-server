/**
 * @fileoverview Defines the core logic for the git working directory resource.
 * @module src/mcp-server/resources/gitWorkingDir/logic
 */

import { logger, type RequestContext } from "../../../utils/index.js";

export type GetWorkingDirectoryFn = (
  sessionId: string | undefined,
) => string | undefined;

/**
 * Retrieves the current working directory for the session.
 * @param context The request context for logging and tracing.
 * @param getWorkingDirectory Function to get the session's working directory.
 * @param sessionId The ID of the current session.
 * @returns The current working directory path or 'NOT_SET'.
 */
export function getGitWorkingDirLogic(
  context: RequestContext,
  getWorkingDirectory: GetWorkingDirectoryFn,
  sessionId: string | undefined,
): string {
  logger.debug("Executing getGitWorkingDirLogic...", { ...context, sessionId });

  const workingDir = getWorkingDirectory(sessionId);
  return workingDir ?? "NOT_SET";
}
