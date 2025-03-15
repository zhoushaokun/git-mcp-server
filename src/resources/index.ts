/**
 * Resource Handlers
 * ===============
 * 
 * Entry point for all MCP resource implementations.
 * This module registers all resource handlers with the MCP server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { setupRepositoryResources } from './repository.js';
import { setupFileResources } from './file.js';
import { setupDiffResources } from './diff.js';
import { setupHistoryResources } from './history.js';
import { resourceDescriptors } from './descriptors.js';

/**
 * Metadata for resource descriptions
 */
export const resourceMetadata = {
  // Repository resources
  "repository-info": {
    name: "Repository Information",
    description: "Returns basic Git repository information including current branch, status, and reference details",
    mimeType: "application/json"
  },
  "repository-branches": {
    name: "Repository Branches",
    description: "Returns a list of all branches in the repository with current branch indicator",
    mimeType: "application/json"
  },
  "repository-remotes": {
    name: "Repository Remotes",
    description: "Returns a list of all configured remote repositories with their URLs",
    mimeType: "application/json"
  },
  "repository-tags": {
    name: "Repository Tags",
    description: "Returns a list of all tags in the repository with their references",
    mimeType: "application/json"
  },

  // File resources
  "file-at-ref": {
    name: "File Content",
    description: "Returns the content of a specific file at a given Git reference",
    mimeType: "text/plain"
  },
  "directory-listing": {
    name: "Directory Listing",
    description: "Returns a list of files and directories at a specific path and reference",
    mimeType: "application/json"
  },

  // Diff resources
  "diff-refs": {
    name: "Reference Diff",
    description: "Returns a diff between two Git references (commits, branches, tags)",
    mimeType: "text/plain"
  },
  "diff-unstaged": {
    name: "Unstaged Changes Diff",
    description: "Returns a diff of all unstaged changes in the working directory",
    mimeType: "text/plain"
  },
  "diff-staged": {
    name: "Staged Changes Diff",
    description: "Returns a diff of all staged changes in the index",
    mimeType: "text/plain"
  },

  // History resources
  "commit-log": {
    name: "Commit History",
    description: "Returns the commit history log with author, date, and message details",
    mimeType: "application/json"
  },
  "file-blame": {
    name: "File Blame",
    description: "Returns line-by-line attribution showing which commit last modified each line",
    mimeType: "text/plain"
  },
  "commit-show": {
    name: "Commit Details",
    description: "Returns detailed information about a specific commit including diff changes",
    mimeType: "text/plain"
  }
};

/**
 * Registers all Git MCP resources with the server
 * 
 * @param server - MCP server instance
 */
export function registerAllResources(server: McpServer): void {
  // Repository info resources (status, branches, remotes, etc.)
  setupRepositoryResources(server, resourceDescriptors);
  
  // File resources (file content, directory listings)
  setupFileResources(server, resourceDescriptors);
  
  // Diff resources (changes between refs, unstaged, staged)
  setupDiffResources(server, resourceDescriptors);
  
  // History resources (log, blame, show commit)
  setupHistoryResources(server, resourceDescriptors);

  // Note: Metadata for resources is defined in the resourceMetadata object,
  // which can be used when registering resources in their respective handlers.
  // The MCP protocol exposes this metadata through the registered resources.
}