/**
 * MCP Tool Handlers
 * ================
 * 
 * Entry point for all MCP tool implementations.
 * This module registers all tool handlers with the MCP server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { setupRepositoryTools } from './repository.js';
import { setupBranchTools } from './branch.js';
import { setupWorkdirTools } from './workdir.js';
import { setupRemoteTools } from './remote.js';
import { setupAdvancedTools } from './advanced.js';

/**
 * Registers all Git MCP tools with the server
 * 
 * @param server - MCP server instance
 */
export function registerAllTools(server: McpServer): void {
  // Repository operations (init, clone, status)
  setupRepositoryTools(server);
  
  // Branch operations (create, checkout, merge, etc.)
  setupBranchTools(server);
  
  // Working directory operations (stage, unstage, commit, etc.)
  setupWorkdirTools(server);
  
  // Remote operations (add, fetch, pull, push, etc.)
  setupRemoteTools(server);
  
  // Advanced operations (stash, cherry-pick, rebase, etc.)
  setupAdvancedTools(server);
}