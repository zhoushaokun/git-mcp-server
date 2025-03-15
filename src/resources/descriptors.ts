/**
 * Resource Descriptors
 * ===================
 * 
 * This module defines descriptors for Git MCP resources.
 * These descriptions help both users and LLMs understand
 * what each resource does and what data it returns.
 */

/**
 * Descriptor object for each resource
 */
export type ResourceDescriptor = {
  name: string;
  description: string;
  mimeType: string;
};

/**
 * Map of resource descriptors keyed by resource ID
 */
export const resourceDescriptors: Record<string, ResourceDescriptor> = {
  // Repository resources
  "repository-info": {
    name: "Repository Information",
    description: "Basic Git repository information including current branch, status, and reference details",
    mimeType: "application/json"
  },
  "repository-branches": {
    name: "Repository Branches",
    description: "List of all branches in the repository with current branch indicator",
    mimeType: "application/json"
  },
  "repository-remotes": {
    name: "Repository Remotes",
    description: "List of all configured remote repositories with their URLs",
    mimeType: "application/json"
  },
  "repository-tags": {
    name: "Repository Tags",
    description: "List of all tags in the repository with their references",
    mimeType: "application/json"
  },

  // File resources
  "file-at-ref": {
    name: "File Content",
    description: "The content of a specific file at a given Git reference",
    mimeType: "text/plain"
  },
  "directory-listing": {
    name: "Directory Listing",
    description: "List of files and directories at a specific path and reference",
    mimeType: "application/json"
  },

  // Diff resources
  "diff-refs": {
    name: "Reference Diff",
    description: "Diff between two Git references (commits, branches, tags)",
    mimeType: "text/plain"
  },
  "diff-unstaged": {
    name: "Unstaged Changes Diff",
    description: "Diff of all unstaged changes in the working directory",
    mimeType: "text/plain"
  },
  "diff-staged": {
    name: "Staged Changes Diff",
    description: "Diff of all staged changes in the index",
    mimeType: "text/plain"
  },

  // History resources
  "commit-log": {
    name: "Commit History",
    description: "Commit history log with author, date, and message details",
    mimeType: "application/json"
  },
  "file-blame": {
    name: "File Blame",
    description: "Line-by-line attribution showing which commit last modified each line",
    mimeType: "text/plain"
  },
  "commit-show": {
    name: "Commit Details",
    description: "Detailed information about a specific commit including diff changes",
    mimeType: "text/plain"
  }
};