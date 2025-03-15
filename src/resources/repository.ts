/**
 * Repository Resources
 * ===================
 * 
 * MCP resources for exposing Git repository information.
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GitService } from '../services/git-service.js';
import { Schemas, PathValidation } from '../utils/validation.js';

/**
 * Helper function to ensure a variable is treated as a string
 * 
 * @param value - The value to convert to string
 * @returns A string representation of the value
 */
function ensureString(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Registers repository resources with the MCP server
 * 
 * @param server - MCP server instance
 * @param resourceDescriptors - Resource descriptors for metadata
 */
export function setupRepositoryResources(server: McpServer, resourceDescriptors: any): void {
  // Repository information resource
  // Repository information resource
  server.resource(
    "repository-info",
    new ResourceTemplate("git://repo/{repoPath}/info", { list: undefined }),
    {
      name: "Repository Information",
      description: "Basic Git repository information including current branch, status, and reference details", 
      mimeType: "application/json"
    },
    async (uri, variables) => {
      try {
        // Handle repoPath which might be an array
        const repoPathStr = ensureString(variables.repoPath);
        const normalizedPath = PathValidation.normalizePath(decodeURIComponent(repoPathStr));
        const gitService = new GitService(normalizedPath);
        
        // Check if the path is a Git repository
        const isRepo = await gitService.isGitRepository();
        
        if (!isRepo) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: "Not a Git repository",
                path: normalizedPath,
                isGitRepository: false
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        // Get repository status
        const statusResult = await gitService.getStatus();
        
        if (!statusResult.resultSuccessful) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: statusResult.resultError.errorMessage,
                path: normalizedPath,
                isGitRepository: true
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              path: normalizedPath,
              isGitRepository: true,
              status: statusResult.resultData
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              path: ensureString(variables.repoPath),
              isGitRepository: false
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    }
  );
  
  // Repository branches resource
  // Branches resource
  server.resource(
    "repository-branches",
    new ResourceTemplate("git://repo/{repoPath}/branches", { list: undefined }),
    {
      name: "Repository Branches",
      description: "List of all branches in the repository with current branch indicator",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      try {
        // Handle repoPath which might be an array
        const repoPathStr = ensureString(variables.repoPath);
        const normalizedPath = PathValidation.normalizePath(decodeURIComponent(repoPathStr));
        const gitService = new GitService(normalizedPath);
        
        // Check if the path is a Git repository
        const isRepo = await gitService.isGitRepository();
        
        if (!isRepo) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: "Not a Git repository",
                path: normalizedPath
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        // Get branches
        const branchesResult = await gitService.listBranches(true);
        
        if (!branchesResult.resultSuccessful) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: branchesResult.resultError.errorMessage,
                path: normalizedPath
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              path: normalizedPath,
              branches: branchesResult.resultData
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              path: ensureString(variables.repoPath)
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    }
  );
  
  // Repository remotes resource
  // Remotes resource
  server.resource(
    "repository-remotes",
    new ResourceTemplate("git://repo/{repoPath}/remotes", { list: undefined }),
    {
      name: "Repository Remotes",
      description: "List of all configured remote repositories with their URLs",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      try {
        // Handle repoPath which might be an array
        const repoPathStr = ensureString(variables.repoPath);
        const normalizedPath = PathValidation.normalizePath(decodeURIComponent(repoPathStr));
        const gitService = new GitService(normalizedPath);
        
        // Check if the path is a Git repository
        const isRepo = await gitService.isGitRepository();
        
        if (!isRepo) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: "Not a Git repository",
                path: normalizedPath
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        // Get remotes
        const remotesResult = await gitService.listRemotes();
        
        if (!remotesResult.resultSuccessful) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: remotesResult.resultError.errorMessage,
                path: normalizedPath
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              path: normalizedPath,
              remotes: remotesResult.resultData
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              path: ensureString(variables.repoPath)
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    }
  );
  
  // Repository tags resource
  // Tags resource
  server.resource(
    "repository-tags",
    new ResourceTemplate("git://repo/{repoPath}/tags", { list: undefined }),
    {
      name: "Repository Tags",
      description: "List of all tags in the repository with their references",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      try {
        // Handle repoPath which might be an array
        const repoPathStr = ensureString(variables.repoPath);
        const normalizedPath = PathValidation.normalizePath(decodeURIComponent(repoPathStr));
        const gitService = new GitService(normalizedPath);
        
        // Check if the path is a Git repository
        const isRepo = await gitService.isGitRepository();
        
        if (!isRepo) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: "Not a Git repository",
                path: normalizedPath
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        // Get tags
        const tagsResult = await gitService.listTags();
        
        if (!tagsResult.resultSuccessful) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: tagsResult.resultError.errorMessage,
                path: normalizedPath
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              path: normalizedPath,
              tags: tagsResult.resultData
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              path: ensureString(variables.repoPath)
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    }
  );
}