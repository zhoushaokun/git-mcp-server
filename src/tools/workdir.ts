/**
 * Working Directory Tools
 * =====================
 * 
 * MCP tools for Git working directory operations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GitService } from '../services/git-service.js';
import { Schemas, PathValidation } from '../utils/validation.js';

/**
 * Registers working directory tools with the MCP server
 * 
 * @param server - MCP server instance
 */
export function setupWorkdirTools(server: McpServer): void {
  // Stage files
  server.tool(
    "git_add",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      files: z.union([
        z.string().min(1, "File path is required").describe("Path to a file to stage"), 
        z.array(z.string().min(1, "File path is required")).describe("Array of file paths to stage")
      ]).optional().default('.').describe("Files to stage for commit, defaults to all changes")
    },
    async ({ path, files }) => {
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
        
        const result = await gitService.stageFiles(files);
        
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
            text: `Successfully staged ${typeof files === 'string' && files === '.' ? 'all files' : 
              (Array.isArray(files) ? `${files.length} files` : `'${files}'`)}`
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
  
  // Unstage files
  server.tool(
    "git_reset",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      files: z.union([
        z.string().min(1, "File path is required").describe("Path to a file to unstage"), 
        z.array(z.string().min(1, "File path is required")).describe("Array of file paths to unstage")
      ]).optional().default('.').describe("Files to unstage, defaults to all staged changes")
    },
    async ({ path, files }) => {
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
        
        const result = await gitService.unstageFiles(files);
        
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
            text: `Successfully unstaged ${typeof files === 'string' && files === '.' ? 'all files' : 
              (Array.isArray(files) ? `${files.length} files` : `'${files}'`)}`
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
  
  // Commit changes
  server.tool(
    "git_commit",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      message: z.string().min(1, "Commit message is required").describe("Message for the commit"),
      author: z.object({
        name: z.string().optional().describe("Author name for the commit"),
        email: z.string().email("Invalid email").optional().describe("Author email for the commit")
      }).optional().describe("Author information for the commit"),
      allowEmpty: z.boolean().optional().default(false).describe("Allow creating empty commits"),
      amend: z.boolean().optional().default(false).describe("Amend the previous commit instead of creating a new one")
    },
    async ({ path, message, author, allowEmpty, amend }) => {
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
        
        const result = await gitService.commit({
          message,
          author,
          allowEmpty,
          amend
        });
        
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
            text: `Successfully committed changes${amend ? ' (amended)' : ''} with message: "${message}"\nCommit hash: ${result.resultData}`
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
  
  // View working directory diff
  server.tool(
    "git_diff_unstaged",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      file: z.string().optional().describe("Specific file to get diff for, or all files if omitted"),
      showUntracked: z.boolean().optional().default(true).describe("Whether to include information about untracked files")
    },
    async ({ path, file, showUntracked }) => {
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
        
        const result = await gitService.getUnstagedDiff(file, showUntracked);
        
        if (!result.resultSuccessful) {
          return {
            content: [{
              type: "text",
              text: `Error: ${result.resultError.errorMessage}`
            }],
            isError: true
          };
        }
        
        if (result.resultData.trim() === '') {
          return {
            content: [{
              type: "text",
              text: `No unstaged changes or untracked files${file ? ` in '${file}'` : ''}`
            }]
          };
        }
        
        return {
          content: [{
            type: "text",
            text: result.resultData
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
  
  // View staged diff
  server.tool(
    "git_diff_staged",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      file: z.string().optional().describe("Specific file to get diff for, or all files if omitted")
    },
    async ({ path, file }) => {
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
        
        const result = await gitService.getStagedDiff(file);
        
        if (!result.resultSuccessful) {
          return {
            content: [{
              type: "text",
              text: `Error: ${result.resultError.errorMessage}`
            }],
            isError: true
          };
        }
        
        if (result.resultData.trim() === '') {
          return {
            content: [{
              type: "text",
              text: `No staged changes${file ? ` in '${file}'` : ''}`
            }]
          };
        }
        
        return {
          content: [{
            type: "text",
            text: result.resultData
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
  
  // Reset to a specific commit
  server.tool(
    "git_reset_commit",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      ref: z.string().default("HEAD").describe("Reference to reset to, defaults to HEAD"),
      mode: z.enum(["hard", "soft", "mixed"]).default("mixed").describe("Reset mode: hard (discard changes), soft (keep staged), or mixed (unstage but keep changes)")
    },
    async ({ path, ref, mode }) => {
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
        
        const result = await gitService.reset(ref, mode);
        
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
            text: `Successfully reset to ${ref} using mode: ${mode}`
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
  
  // Clean working directory
  server.tool(
    "git_clean",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      directories: z.boolean().optional().default(false).describe("Whether to remove untracked directories in addition to files"),
      force: z.boolean().optional().default(false).describe("Force cleaning of files, including ignored files")
    },
    async ({ path, directories, force }) => {
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
        
        const result = await gitService.clean(directories, force);
        
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
            text: `Successfully cleaned working directory${directories ? ' (including directories)' : ''}`
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