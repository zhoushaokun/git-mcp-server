/**
 * Git MCP Server
 * =============
 * 
 * Main implementation of the Git MCP server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllResources } from './resources/index.js';
import { registerAllTools } from './tools/index.js';
import { resourceDescriptors } from './resources/descriptors.js';

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
   * Creates a new GitMcpServer instance
   */
  constructor() {
    // Initialize MCP server
    this.server = new McpServer({
      name: 'git-mcp-server',
      version: '1.0.0',
      description: 'Git operations exposed through the Model Context Protocol'
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
    
    // Register resource descriptions
    this.registerResourceDescriptions();
  }

  /**
   * Registers resource descriptions for better client displays
   */
  private registerResourceDescriptions(): void {
    // This is a placeholder for resource descriptions
    // In MCP SDK, descriptions need to be specified at resource registration time
    // The actual descriptions are now defined in descriptors.ts and can be used
    // by the individual resource registration methods
    console.error('Resource descriptions are provided during resource registration');
  }

  /**
   * Sets up global error handling for the server
   */
  private setupErrorHandling(): void {
    // Error handling will be done with try-catch in methods that can fail
    process.on('uncaughtException', (error: Error) => {
      console.error(`[Git MCP Server Uncaught Exception] ${error.message}`);
      console.error(error.stack);
    });

    process.on('unhandledRejection', (reason: any) => {
      console.error(`[Git MCP Server Unhandled Rejection] ${reason instanceof Error ? reason.message : String(reason)}`);
      if (reason instanceof Error && reason.stack) {
        console.error(reason.stack);
      }
    });
  }

  /**
   * Connects the server to a transport
   * 
   * @param transport - MCP transport to connect to
   * @returns Promise that resolves when connected
   */
  async connect(transport: any): Promise<void> {
    await this.server.connect(transport);
  }
}