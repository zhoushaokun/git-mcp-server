/**
 * History Resources
 * ================
 * 
 * MCP resources for exposing Git commit history and related information.
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
 * Registers history resources with the MCP server
 * 
 * @param server - MCP server instance
 * @param resourceDescriptors - Resource descriptors for metadata
 */
export function setupHistoryResources(server: McpServer, resourceDescriptors: any): void {
  // Commit log resource
  server.resource(
    "commit-log",
    new ResourceTemplate("git://repo/{repoPath}/log?maxCount={maxCount}&file={file}", { list: undefined }),
    {
      name: "Commit History",
      description: "Returns the commit history log with author, date, and message details",
      mimeType: "application/json"
    },
    // Returns the commit history for a repository with optional file path filter and commit count limit
    async (uri, variables) => {
      try {
        // Handle variables which might be arrays
        const repoPathStr = ensureString(variables.repoPath);
        const maxCountStr = variables.maxCount ? ensureString(variables.maxCount) : '50';
        const fileStr = variables.file ? ensureString(variables.file) : undefined;
        
        // Normalize paths
        const normalizedRepoPath = PathValidation.normalizePath(decodeURIComponent(repoPathStr));
        
        // Parse max count
        const maxCount = parseInt(maxCountStr, 10);
        
        const gitService = new GitService(normalizedRepoPath);
        
        // Check if the path is a Git repository
        const isRepo = await gitService.isGitRepository();
        
        if (!isRepo) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: "Not a Git repository",
                repoPath: normalizedRepoPath,
                maxCount: isNaN(maxCount) ? undefined : maxCount,
                file: fileStr
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        // Get commit log
        const logResult = await gitService.getLog({
          maxCount: isNaN(maxCount) ? 50 : maxCount,
          file: fileStr
        });
        
        if (!logResult.resultSuccessful) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: logResult.resultError.errorMessage,
                repoPath: normalizedRepoPath,
                maxCount: isNaN(maxCount) ? undefined : maxCount,
                file: fileStr
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              repoPath: normalizedRepoPath,
              maxCount: isNaN(maxCount) ? 50 : maxCount,
              file: fileStr,
              commits: logResult.resultData
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
              repoPath: ensureString(variables.repoPath),
              maxCount: variables.maxCount ? parseInt(ensureString(variables.maxCount), 10) : 50,
              file: variables.file ? ensureString(variables.file) : undefined
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    }
  );
  
  // File blame resource
  server.resource(
    "file-blame",
    new ResourceTemplate("git://repo/{repoPath}/blame/{filePath}", { list: undefined }),
    {
      name: "File Blame",
      description: "Returns line-by-line attribution showing which commit last modified each line",
      mimeType: "text/plain"
    },
    // Returns the blame information showing which commit last modified each line of a file
    async (uri, variables) => {
      try {
        // Handle variables which might be arrays
        const repoPathStr = ensureString(variables.repoPath);
        const filePathStr = ensureString(variables.filePath);
        
        // Normalize paths
        const normalizedRepoPath = PathValidation.normalizePath(decodeURIComponent(repoPathStr));
        const normalizedFilePath = PathValidation.normalizePath(decodeURIComponent(filePathStr));
        
        const gitService = new GitService(normalizedRepoPath);
        
        // Check if the path is a Git repository
        const isRepo = await gitService.isGitRepository();
        
        if (!isRepo) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: "Not a Git repository",
                repoPath: normalizedRepoPath,
                filePath: normalizedFilePath
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        // Get blame information
        const blameResult = await gitService.getBlame(normalizedFilePath);
        
        if (!blameResult.resultSuccessful) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: blameResult.resultError.errorMessage,
                repoPath: normalizedRepoPath,
                filePath: normalizedFilePath
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        return {
          contents: [{
            uri: uri.href,
            text: blameResult.resultData,
            mimeType: "text/plain"
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              repoPath: ensureString(variables.repoPath),
              filePath: ensureString(variables.filePath)
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    }
  );
  
  // Show commit details
  server.resource(
    "commit-show",
    new ResourceTemplate("git://repo/{repoPath}/commit/{commitHash}", { list: undefined }),
    {
      name: "Commit Details",
      description: "Returns detailed information about a specific commit including diff changes",
      mimeType: "text/plain"
    },
    // Returns the detailed information for a specific commit including diff and metadata
    async (uri, variables) => {
      try {
        // Handle variables which might be arrays
        const repoPathStr = ensureString(variables.repoPath);
        const commitHashStr = ensureString(variables.commitHash);
        
        // Normalize paths
        const normalizedRepoPath = PathValidation.normalizePath(decodeURIComponent(repoPathStr));
        
        const gitService = new GitService(normalizedRepoPath);
        
        // Check if the path is a Git repository
        const isRepo = await gitService.isGitRepository();
        
        if (!isRepo) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: "Not a Git repository",
                repoPath: normalizedRepoPath,
                commitHash: commitHashStr
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        // Get commit details
        const commitResult = await gitService.showCommit(commitHashStr);
        
        if (!commitResult.resultSuccessful) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: commitResult.resultError.errorMessage,
                repoPath: normalizedRepoPath,
                commitHash: commitHashStr
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        return {
          contents: [{
            uri: uri.href,
            text: commitResult.resultData,
            mimeType: "text/plain"
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              repoPath: ensureString(variables.repoPath),
              commitHash: ensureString(variables.commitHash)
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    }
  );
}