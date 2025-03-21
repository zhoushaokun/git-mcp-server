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
// Get the directory path of the current module
import { fileURLToPath } from 'url';
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
   * Reads the package.json file to get metadata
   */
  private getPackageInfo() {
    // Get current file's directory and navigate to the project root
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const packagePath = path.resolve(__dirname, '../package.json');
    const packageContent = fs.readFileSync(packagePath, 'utf8');
    return JSON.parse(packageContent);
  }

  /**
   * Creates a new GitMcpServer instance
   */
  constructor() {
    // Set up git config with global user settings
    this.setupGitConfig();
    
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
   * Sets up git config by setting environment variables for consistent author identity
   * This ensures all git operations use the global git configuration
   */
  private setupGitConfig(): void {
    try {
      // Get global git config values
      const globalUserName = execSync('git config --global user.name').toString().trim();
      const globalUserEmail = execSync('git config --global user.email').toString().trim();
      
      // Set environment variables for git to use
      // These variables will override any other configuration
      process.env.GIT_AUTHOR_NAME = globalUserName;
      process.env.GIT_AUTHOR_EMAIL = globalUserEmail;
      process.env.GIT_COMMITTER_NAME = globalUserName;
      process.env.GIT_COMMITTER_EMAIL = globalUserEmail;
      
      console.error(`[Git MCP Server] Setting up git author identity: ${globalUserName} <${globalUserEmail}>`);
    } catch (error) {
      console.error('Failed to set up git config:', error);
    }
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