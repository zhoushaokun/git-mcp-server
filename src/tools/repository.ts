/**
 * Repository Tools
 * ===============
 * 
 * MCP tools for Git repository operations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GitService } from '../services/git-service.js';
import { Schemas, PathValidation } from '../utils/validation.js';

/**
 * Registers repository tools with the MCP server
 * 
 * @param server - MCP server instance
 */
export function setupRepositoryTools(server: McpServer): void {
  // Initialize a new Git repository
  server.tool(
    "git_init",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to initialize the Git repository in"),
      bare: z.boolean().optional().default(false).describe("Whether to create a bare repository without a working directory")
    },
    async ({ path, bare }) => {
      try {
        const normalizedPath = PathValidation.normalizePath(path);
        const gitService = new GitService(normalizedPath);
        
        const result = await gitService.initRepo(bare);
        
        if (!result.resultSuccessful) {
          return {
            content: [{
              type: "text",
              text: `Error: ${result.resultError.errorMessage}`
            }],
            isError: true
          };
        }
        
        return {
          content: [{
            type: "text",
            text: `Successfully initialized ${bare ? 'bare ' : ''}Git repository at: ${normalizedPath}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );
  
  // Clone a Git repository
  server.tool(
    "git_clone",
    {
      url: z.string().url("Invalid repository URL").describe("URL of the Git repository to clone"),
      path: z.string().min(1, "Destination path is required").describe("Local path where the repository will be cloned"),
      branch: z.string().optional().describe("Specific branch to checkout after cloning"),
      depth: z.number().positive().optional().describe("Create a shallow clone with specified number of commits")
    },
    async ({ url, path, branch, depth }) => {
      try {
        const normalizedPath = PathValidation.normalizePath(path);
        const gitService = new GitService(normalizedPath);
        
        const options: any = {};
        if (branch) options.branch = branch;
        if (depth) options.depth = depth;
        
        const result = await gitService.cloneRepo(url, options);
        
        if (!result.resultSuccessful) {
          return {
            content: [{
              type: "text",
              text: `Error: ${result.resultError.errorMessage}`
            }],
            isError: true
          };
        }
        
        return {
          content: [{
            type: "text",
            text: `Successfully cloned repository from ${url} to ${normalizedPath}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );
  
  // Get repository status
  server.tool(
    "git_status",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository")
    },
    async ({ path }) => {
      try {
        const normalizedPath = PathValidation.normalizePath(path);
        const gitService = new GitService(normalizedPath);
        
        // Check if this is a git repository
        const isRepo = await gitService.isGitRepository();
        if (!isRepo) {
          return {
            content: [{
              type: "text",
              text: `Error: Not a Git repository: ${normalizedPath}`
            }],
            isError: true
          };
        }
        
        const result = await gitService.getStatus();
        
        if (!result.resultSuccessful) {
          return {
            content: [{
              type: "text",
              text: `Error: ${result.resultError.errorMessage}`
            }],
            isError: true
          };
        }
        
        const status = result.resultData;
        const isClean = status.isClean();
        
        let statusOutput = `Status for repository at: ${normalizedPath}\n`;
        statusOutput += `Current branch: ${status.current}\n`;
        
        if (status.tracking) {
          statusOutput += `Tracking: ${status.tracking}\n`;
        }
        
        if (isClean) {
          statusOutput += `\nWorking directory clean`;
        } else {
          // Show untracked files
          if (status.not_added && status.not_added.length > 0) {
            statusOutput += `\nUntracked files:\n  ${status.not_added.join('\n  ')}\n`;
          }
        
          if (status.created.length > 0) {
            statusOutput += `\nNew files:\n  ${status.created.join('\n  ')}\n`;
          }
          
          if (status.modified.length > 0) {
            statusOutput += `\nModified files:\n  ${status.modified.join('\n  ')}\n`;
          }
          
          if (status.deleted.length > 0) {
            statusOutput += `\nDeleted files:\n  ${status.deleted.join('\n  ')}\n`;
          }
          
          if (status.renamed.length > 0) {
            statusOutput += `\nRenamed files:\n  ${status.renamed.join('\n  ')}\n`;
          }
          
          if (status.conflicted.length > 0) {
            statusOutput += `\nConflicted files:\n  ${status.conflicted.join('\n  ')}\n`;
          }
        }
        
        return {
          content: [{
            type: "text",
            text: statusOutput
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );
}