/**
 * Diff Resources
 * =============
 * 
 * MCP resources for exposing Git diff information.
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
 * Registers diff resources with the MCP server
 * 
 * @param server - MCP server instance
 * @param resourceDescriptors - Resource descriptors for metadata
 */
export function setupDiffResources(server: McpServer, resourceDescriptors: any): void {
  // Diff between two refs
  server.resource(
    "diff-refs",
    new ResourceTemplate("git://repo/{repoPath}/diff/{fromRef}/{toRef}?path={path}", { list: undefined }),
    {
      name: "Reference Diff",
      description: "Returns a diff between two Git references (commits, branches, tags)",
      mimeType: "application/json" // Corrected MIME type
    },
    // Returns a diff between two references (branches, tags, or commits) with optional path filter
    async (uri, variables) => {
      try {
        // Handle variables which might be arrays
        const repoPathStr = ensureString(variables.repoPath);
        const fromRefStr = ensureString(variables.fromRef);
        const toRefStr = variables.toRef ? ensureString(variables.toRef) : 'HEAD';
        const pathStr = variables.path ? ensureString(variables.path) : undefined;
        
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
                fromRef: fromRefStr,
                toRef: toRefStr,
                path: pathStr
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        // Get diff
        const diffResult = await gitService.getDiff(fromRefStr, toRefStr, pathStr);
        
        if (!diffResult.resultSuccessful) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: diffResult.resultError.errorMessage,
                repoPath: normalizedRepoPath,
                fromRef: fromRefStr,
                toRef: toRefStr,
                path: pathStr
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
              fromRef: fromRefStr,
              toRef: toRefStr,
              path: pathStr,
              diff: diffResult.resultData
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
              fromRef: ensureString(variables.fromRef),
              toRef: variables.toRef ? ensureString(variables.toRef) : 'HEAD',
              path: variables.path ? ensureString(variables.path) : undefined
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    }
  );
  
  // Diff in working directory (unstaged changes)
  server.resource(
    "diff-unstaged",
    new ResourceTemplate("git://repo/{repoPath}/diff-unstaged?path={path}", { list: undefined }),
    {
      name: "Unstaged Changes Diff",
      description: "Returns a diff of all unstaged changes in the working directory",
      mimeType: "text/plain"
    },
    // Returns a diff of all unstaged changes (between working directory and index) with optional path filter
    async (uri, variables) => {
      try {
        // Handle variables which might be arrays
        const repoPathStr = ensureString(variables.repoPath);
        const pathStr = variables.path ? ensureString(variables.path) : undefined;
        
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
                path: pathStr
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        // Get unstaged diff
        const diffResult = await gitService.getUnstagedDiff(pathStr);
        
        if (!diffResult.resultSuccessful) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: diffResult.resultError.errorMessage,
                repoPath: normalizedRepoPath,
                path: pathStr
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        return {
          contents: [{
            uri: uri.href,
            text: diffResult.resultData,
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
              path: variables.path ? ensureString(variables.path) : undefined
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    }
  );
  
  // Diff staged changes
  server.resource(
    "diff-staged",
    new ResourceTemplate("git://repo/{repoPath}/diff-staged?path={path}", { list: undefined }),
    {
      name: "Staged Changes Diff",
      description: "Returns a diff of all staged changes in the index",
      mimeType: "text/plain"
    },
    // Returns a diff of all staged changes (between index and HEAD) with optional path filter
    async (uri, variables) => {
      try {
        // Handle variables which might be arrays
        const repoPathStr = ensureString(variables.repoPath);
        const pathStr = variables.path ? ensureString(variables.path) : undefined;
        
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
                path: pathStr
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        // Get staged diff
        const diffResult = await gitService.getStagedDiff(pathStr);
        
        if (!diffResult.resultSuccessful) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: diffResult.resultError.errorMessage,
                repoPath: normalizedRepoPath,
                path: pathStr
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        return {
          contents: [{
            uri: uri.href,
            text: diffResult.resultData,
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
              path: variables.path ? ensureString(variables.path) : undefined
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    }
  );
}
