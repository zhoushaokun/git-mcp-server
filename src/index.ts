#!/usr/bin/env node

/**
 * Git MCP Server Entry Point
 * =========================
 * 
 * This is the main entry point for the Git MCP server.
 * It creates a server instance and connects it to a stdio transport.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GitMcpServer } from './server.js';
import dotenv from 'dotenv';

// Load environment variables from .env file if it exists
dotenv.config();

/**
 * Main function to start the server
 */
async function main(): Promise<void> {
  console.error('Starting Git MCP Server...');
  
  try {
    // Create server instance
    const server = new GitMcpServer();
    
    // Use stdio transport for communication
    const transport = new StdioServerTransport();
    
    // Connect the server to the transport
    await server.connect(transport);
    
    console.error('Git MCP Server running on stdio transport');
    
    // Handle interruption signals
    process.on('SIGINT', async () => {
      console.error('Received SIGINT, shutting down Git MCP Server');
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.error('Received SIGTERM, shutting down Git MCP Server');
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start Git MCP Server:');
    console.error(error instanceof Error ? error.message : String(error));
    
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  console.error('Unhandled error in main process:');
  console.error(error instanceof Error ? error.message : String(error));
  
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  
  process.exit(1);
});