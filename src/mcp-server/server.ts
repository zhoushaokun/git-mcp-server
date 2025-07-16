/**
 * Main entry point for the MCP (Model Context Protocol) server.
 * This file orchestrates the server's lifecycle:
 * 1. Initializes the core McpServer instance with its identity and capabilities.
 * 2. Registers available resources and tools, making them discoverable and usable by clients.
 * 3. Selects and starts the appropriate communication transport (stdio or Streamable HTTP)
 *    based on configuration.
 * 4. Handles top-level error management during startup.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config, environment } from "../config/index.js";
import { ErrorHandler, logger, RequestContext, requestContextService } from "../utils/index.js";

// Import registration functions for ALL Git tools (alphabetized)
import { registerGitAddTool } from "./tools/gitAdd/index.js";
import { registerGitBranchTool } from "./tools/gitBranch/index.js";
import { registerGitCheckoutTool } from "./tools/gitCheckout/index.js";
import { registerGitCherryPickTool } from "./tools/gitCherryPick/index.js";
import { registerGitCleanTool } from "./tools/gitClean/index.js";
import { registerGitClearWorkingDirTool } from "./tools/gitClearWorkingDir/index.js";
import { registerGitCloneTool } from "./tools/gitClone/index.js";
import { registerGitCommitTool } from "./tools/gitCommit/index.js";
import { registerGitDiffTool } from "./tools/gitDiff/index.js";
import { registerGitFetchTool } from "./tools/gitFetch/index.js";
import { registerGitInitTool } from "./tools/gitInit/index.js";
import { registerGitLogTool } from "./tools/gitLog/index.js";
import { registerGitMergeTool } from "./tools/gitMerge/index.js";
import { registerGitPullTool } from "./tools/gitPull/index.js";
import { registerGitPushTool } from "./tools/gitPush/index.js";
import { registerGitRebaseTool } from "./tools/gitRebase/index.js";
import { registerGitRemoteTool } from "./tools/gitRemote/index.js";
import { registerGitResetTool } from "./tools/gitReset/index.js";
import { registerGitSetWorkingDirTool } from "./tools/gitSetWorkingDir/index.js";
import { registerGitShowTool } from "./tools/gitShow/index.js";
import { registerGitStashTool } from "./tools/gitStash/index.js";
import { registerGitStatusTool } from "./tools/gitStatus/index.js";
import { registerGitTagTool } from "./tools/gitTag/index.js";
import { registerGitWorktreeTool } from "./tools/gitWorktree/index.js";
import { registerGitWrapupInstructionsTool } from "./tools/gitWrapupInstructions/index.js";

// Import transport setup functions
import { startHttpTransport } from "./transports/httpTransport.js";
import { connectStdioTransport } from "./transports/stdioTransport.js";

async function createMcpServerInstance(): Promise<McpServer> {
  const context = requestContextService.createRequestContext({
    operation: "createMcpServerInstance",
  });
  logger.info("Initializing MCP server instance", context);

  requestContextService.configure({
    appName: config.mcpServerName,
    appVersion: config.mcpServerVersion,
    environment,
  });

  const server = new McpServer(
    { name: config.mcpServerName, version: config.mcpServerVersion },
    {
      capabilities: {
        logging: {},
        resources: { listChanged: true },
        tools: { listChanged: true },
      },
    },
  );

  let sessionWorkingDirectory: string | undefined = undefined;

  const getSessionIdFromContext = (toolContext: Record<string, any>): string | undefined => {
    return (toolContext as RequestContext)?.sessionId;
  };

  const getWorkingDirectory = (sessionId: string | undefined): string | undefined => {
    return sessionWorkingDirectory;
  };

  const setWorkingDirectory = (sessionId: string | undefined, dir: string): void => {
    logger.debug("Setting session working directory", { ...context, sessionId, newDirectory: dir });
    sessionWorkingDirectory = dir;
  };
  
  const clearWorkingDirectory = (sessionId: string | undefined): void => {
    logger.debug("Clearing session working directory", { ...context, sessionId });
    sessionWorkingDirectory = undefined;
  };

  try {
    logger.debug("Registering Git tools...", context);
    await registerGitAddTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitBranchTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitCheckoutTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitCherryPickTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitCleanTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitClearWorkingDirTool(server, clearWorkingDirectory, getSessionIdFromContext);
    await registerGitCloneTool(server, getSessionIdFromContext);
    await registerGitCommitTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitDiffTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitFetchTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitInitTool(server, getSessionIdFromContext);
    await registerGitLogTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitMergeTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitPullTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitPushTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitRebaseTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitRemoteTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitResetTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitSetWorkingDirTool(server, setWorkingDirectory, getSessionIdFromContext);
    await registerGitShowTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitStashTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitStatusTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitTagTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitWorktreeTool(server, getWorkingDirectory, getSessionIdFromContext);
    await registerGitWrapupInstructionsTool(server, getWorkingDirectory, getSessionIdFromContext);
    logger.info("Git tools registered successfully", context);
  } catch (err) {
    logger.error("Failed to register resources/tools", {
      ...context,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }

  return server;
}

async function startTransport(): Promise<McpServer | void> {
  const transportType = config.mcpTransportType;
  const context = requestContextService.createRequestContext({
    operation: "startTransport",
    transport: transportType,
  });
  logger.info(`Starting transport: ${transportType}`, context);

  if (transportType === "http") {
    await startHttpTransport(createMcpServerInstance, context);
    return;
  }

  if (transportType === "stdio") {
    const server = await createMcpServerInstance();
    await connectStdioTransport(server, context);
    return server;
  }

  logger.fatal(`Unsupported transport type configured: ${transportType}`, context);
  throw new Error(`Unsupported transport type: ${transportType}. Must be 'stdio' or 'http'.`);
}

export async function initializeAndStartServer(): Promise<void | McpServer> {
  const context = requestContextService.createRequestContext({
    operation: "initializeAndStartServer",
  });
  logger.info("MCP Server initialization sequence started.", context);
  try {
    const result = await startTransport();
    logger.info("MCP Server initialization sequence completed successfully.", context);
    return result;
  } catch (err) {
    logger.fatal("Critical error during MCP server initialization.", {
      ...context,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    ErrorHandler.handleError(err, {
      ...context,
      operation: "initializeAndStartServer_Catch",
      critical: true,
    });
    logger.info("Exiting process due to critical initialization error.", context);
    process.exit(1);
  }
}
