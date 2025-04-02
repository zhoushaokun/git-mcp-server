/**
 * File Resources
 * =============
 * 
 * MCP resources for exposing Git file contents at specific references.
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GitService } from '../services/git-service.js';
import { Schemas, PathValidation } from '../utils/validation.js';
import path from 'path';

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
 * Registers file resources with the MCP server
 * 
 * @param server - MCP server instance
 * @param resourceDescriptors - Resource descriptors for metadata
 */
export function setupFileResources(server: McpServer, resourceDescriptors: any): void {
  // File contents at a specific reference
  server.resource(
    "file-at-ref",
    new ResourceTemplate("git://repo/{repoPath}/file/{filePath}?ref={ref}", { list: undefined }),
    {
      name: "File Content",
      description: "Returns the content of a specific file at a given Git reference",
      mimeType: "text/plain"
    },
    // Returns the content of a specific file at a given reference (branch, tag, or commit)
    async (uri, variables) => {
      try {
        // Handle variables which might be arrays
        const repoPathStr = ensureString(variables.repoPath);
        const filePathStr = ensureString(variables.filePath);
        const refStr = variables.ref ? ensureString(variables.ref) : 'HEAD';
        
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
                filePath: normalizedFilePath,
                ref: refStr
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        // Get file content at reference
        const fileResult = await gitService.getFileAtRef(normalizedFilePath, refStr);
        
        if (!fileResult.resultSuccessful) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: fileResult.resultError.errorMessage,
                repoPath: normalizedRepoPath,
                filePath: normalizedFilePath,
                ref: refStr
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        // Detect MIME type based on file extension
        const fileExtension = path.extname(normalizedFilePath).toLowerCase();
        let mimeType = "text/plain";
        
        // Simple MIME type detection
        if (['.js', '.ts', '.jsx', '.tsx'].includes(fileExtension)) {
          mimeType = "application/javascript";
        } else if (['.html', '.htm'].includes(fileExtension)) {
          mimeType = "text/html";
        } else if (fileExtension === '.css') {
          mimeType = "text/css";
        } else if (fileExtension === '.json') {
          mimeType = "application/json";
        } else if (['.md', '.markdown'].includes(fileExtension)) {
          mimeType = "text/markdown";
        } else if (['.xml', '.svg'].includes(fileExtension)) {
          mimeType = "application/xml";
        } else if (['.yml', '.yaml'].includes(fileExtension)) {
          mimeType = "text/yaml";
        }
        
        // Return the file content directly
        return {
          contents: [{
            uri: uri.href,
            text: fileResult.resultData,
            mimeType
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              repoPath: ensureString(variables.repoPath),
              filePath: ensureString(variables.filePath),
              ref: variables.ref ? ensureString(variables.ref) : 'HEAD'
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    }
  );
  
  // List files in a directory at a specific reference
  server.resource(
    "directory-listing",
    new ResourceTemplate("git://repo/{repoPath}/ls/{dirPath}?ref={ref}", { list: undefined }),
    {
      name: "Directory Listing",
      description: "Returns a list of files and directories at a specific path and reference",
      mimeType: "application/json"
    },
    // Returns a list of files and directories within a specific directory at a given reference
    async (uri, variables) => {
      try {
        // Handle variables which might be arrays
        const repoPathStr = ensureString(variables.repoPath);
        const dirPathStr = ensureString(variables.dirPath || '');
        const refStr = variables.ref ? ensureString(variables.ref) : 'HEAD';
        
        // Normalize paths
        const normalizedRepoPath = PathValidation.normalizePath(decodeURIComponent(repoPathStr));
        const normalizedDirPath = PathValidation.normalizePath(decodeURIComponent(dirPathStr));
        
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
                dirPath: normalizedDirPath,
                ref: refStr
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
        
        // Use Git command to get directory listing
        try {
          // Use the listFilesAtRef method from GitService
          const filesResult = await gitService.listFilesAtRef(normalizedDirPath, refStr);
          
          if (!filesResult.resultSuccessful) {
            return {
              contents: [{
                uri: uri.href,
                text: JSON.stringify({
                  error: filesResult.resultError.errorMessage,
                  repoPath: normalizedRepoPath,
                  dirPath: normalizedDirPath,
                  ref: refStr
                }, null, 2),
                mimeType: "application/json"
              }]
            };
            }
            
            // The listFilesAtRef method now returns only immediate children,
            // so no need to strip prefixes here.
            const files = filesResult.resultData;
            
            return {
              contents: [{
              uri: uri.href,
              text: JSON.stringify({
                repoPath: normalizedRepoPath,
                dirPath: normalizedDirPath,
                ref: refStr,
                files
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        } catch (gitError) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                error: gitError instanceof Error ? gitError.message : String(gitError),
                repoPath: normalizedRepoPath,
                dirPath: normalizedDirPath,
                ref: refStr
              }, null, 2),
              mimeType: "application/json"
            }]
          };
        }
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              repoPath: ensureString(variables.repoPath),
              dirPath: variables.dirPath ? ensureString(variables.dirPath) : '',
              ref: variables.ref ? ensureString(variables.ref) : 'HEAD'
            }, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    }
  );
}
