/**
 * Git MCP Server
 * =============
 * 
 * Main implementation of the Git MCP server.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'; 
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'; // Import specific transport
// Get the directory path of the current module
import { fileURLToPath } from 'url';
import { registerAllResources } from './resources/index.js';
import { registerAllTools } from './tools/index.js';
// resourceDescriptors import is no longer needed as descriptions are handled inline

/**
 * Git MCP Server class
 * 
 * This class creates and manages an MCP server that exposes Git functionality
 * through the Model Context Protocol, making it accessible to AI assistants
 * and other MCP clients.
 */
export class GitMcpServer {
  private server: McpServer;

  /**
   * Reads the package.json file to get metadata
   * @throws Error if package.json cannot be read or parsed
   */
  private getPackageInfo(): { name: string; version: string; description: string } {
    try {
      // Get current file's directory and navigate to the project root
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const packagePath = path.resolve(__dirname, '../package.json');
      const packageContent = fs.readFileSync(packagePath, 'utf8');
      const parsedContent = JSON.parse(packageContent);

      // Basic validation
      if (
        !parsedContent ||
        typeof parsedContent.name !== 'string' ||
        typeof parsedContent.version !== 'string' ||
        typeof parsedContent.description !== 'string'
      ) {
        throw new Error('Invalid package.json content');
      }
      return parsedContent;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Git MCP Server] Error reading or parsing package.json: ${message}`);
      // Re-throw to prevent server from starting in an invalid state
      throw new Error(`Failed to load package information: ${message}`);
    }
  }

  /**
   * Creates a new GitMcpServer instance
   */
  constructor() {
    // NOTE: Git author identity (GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL, etc.) 
    // should be set in the environment launching this server process.
    // This server no longer attempts to read global git config.
    
    // Get package info
    const pkg = this.getPackageInfo();
    
    // Initialize MCP server
    this.server = new McpServer({
      name: pkg.name,
      version: pkg.version,
      description: pkg.description
    });  

    // Register all resources and tools
    this.registerHandlers();
    
    // Set up error handling
    this.setupErrorHandling();
  }

  /**
   * Registers all resource and tool handlers with the server
   */
  private registerHandlers(): void {
    // Register all resources (for providing Git data)
    registerAllResources(this.server);
    
    // Register all tools (for executing Git commands)
    registerAllTools(this.server);
  }

  /**
   * Sets up global error handling for the server
   */
  private setupErrorHandling(): void {
    // Error handling will be done with try-catch in methods that can fail
    process.on('uncaughtException', (error: Error) => {
      console.error(`[Git MCP Server Uncaught Exception] ${error.message}`);
      console.error(error.stack);
      // Exit process on uncaught exceptions to avoid undefined state
      process.exit(1); 
    });

    process.on('unhandledRejection', (reason: any) => {
      console.error(`[Git MCP Server Unhandled Rejection] ${reason instanceof Error ? reason.message : String(reason)}`);
      if (reason instanceof Error && reason.stack) {
        console.error(reason.stack);
      }
      // Exit process on unhandled rejections
      process.exit(1); 
    });
  }

  /**
   * Connects the server to a transport
   * 
   * @param transport - MCP transport to connect to
   * @returns Promise that resolves when connected
   */
  async connect(transport: StdioServerTransport): Promise<void> { // Use StdioServerTransport here
    await this.server.connect(transport);
  }

  /**
   * Gracefully shuts down the server
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    console.error('[Git MCP Server] Shutting down...');
    // Add any specific cleanup logic here if needed
    await this.server.close();
    console.error('[Git MCP Server] Shutdown complete.');
  }
}
