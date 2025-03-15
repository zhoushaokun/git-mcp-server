/**
 * Advanced Git Tools
 * ================
 * 
 * MCP tools for advanced Git operations like stashing, tagging, rebasing, etc.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GitService } from '../services/git-service.js';
import { Schemas, PathValidation } from '../utils/validation.js';

/**
 * Registers advanced Git tools with the MCP server
 * 
 * @param server - MCP server instance
 */
export function setupAdvancedTools(server: McpServer): void {
  // Create tag
  server.tool(
    "git_tag_create",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      name: z.string().min(1, "Tag name is required").describe("Name for the new tag"),
      message: z.string().optional().describe("Optional message for an annotated tag"),
      ref: z.string().optional().describe("Reference (commit, branch) to create the tag at")
    },
    async ({ path, name, message, ref }) => {
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
        
        const result = await gitService.createTag({
          name,
          message,
          ref
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
            text: `Successfully created ${message ? 'annotated ' : ''}tag '${name}'${ref ? ` at ref '${ref}'` : ''}`
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
  
  // List tags
  server.tool(
    "git_tag_list",
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
        
        const result = await gitService.listTags();
        
        if (!result.resultSuccessful) {
          return {
            content: [{
              type: "text",
              text: `Error: ${result.resultError.errorMessage}`
            }],
            isError: true
          };
        }
        
        if (result.resultData.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No tags found in repository at: ${normalizedPath}`
            }]
          };
        }
        
        // Format output
        let output = `Tags in repository at: ${normalizedPath}\n\n`;
        result.resultData.forEach(tag => {
          output += `${tag}\n`;
        });
        
        return {
          content: [{
            type: "text",
            text: output
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
  
  // Create stash
  server.tool(
    "git_stash_create",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      message: z.string().optional().describe("Optional description for the stash"),
      includeUntracked: z.boolean().optional().default(false).describe("Whether to include untracked files in the stash")
    },
    async ({ path, message, includeUntracked }) => {
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
        
        const result = await gitService.createStash({
          message,
          includeUntracked
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
            text: `Successfully created stash${message ? ` with message: "${message}"` : ''}${includeUntracked ? ' (including untracked files)' : ''}`
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
  
  // List stashes
  server.tool(
    "git_stash_list",
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
        
        const result = await gitService.listStashes();
        
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
              text: `No stashes found in repository at: ${normalizedPath}`
            }]
          };
        }
        
        return {
          content: [{
            type: "text",
            text: `Stashes in repository at: ${normalizedPath}\n\n${result.resultData}`
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
  
  // Apply stash
  server.tool(
    "git_stash_apply",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      stashId: z.string().optional().default("stash@{0}").describe("Stash reference to apply (defaults to most recent stash)")
    },
    async ({ path, stashId }) => {
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
        
        const result = await gitService.applyStash(stashId);
        
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
            text: `Successfully applied stash: ${stashId}`
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
  
  // Pop stash
  server.tool(
    "git_stash_pop",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      stashId: z.string().optional().default("stash@{0}").describe("Stash reference to pop (defaults to most recent stash)")
    },
    async ({ path, stashId }) => {
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
        
        const result = await gitService.popStash(stashId);
        
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
            text: `Successfully popped stash: ${stashId}`
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
  
  // Cherry-pick commits
  server.tool(
    "git_cherry_pick",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      commits: z.array(z.string()).min(1, "At least one commit hash is required").describe("Array of commit hashes to cherry-pick")
    },
    async ({ path, commits }) => {
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
        
        const result = await gitService.cherryPick(commits);
        
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
            text: `Successfully cherry-picked ${commits.length} commit${commits.length > 1 ? 's' : ''}`
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
  
  // Rebase
  server.tool(
    "git_rebase",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      branch: z.string().min(1, "Branch to rebase onto is required").describe("Branch or reference to rebase onto"),
      interactive: z.boolean().optional().default(false).describe("Whether to use interactive rebase mode")
    },
    async ({ path, branch, interactive }) => {
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
        
        const result = await gitService.rebase(branch, interactive);
        
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
            text: `Successfully rebased onto '${branch}'${interactive ? ' (interactive)' : ''}`
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
  
  // Log commits
  server.tool(
    "git_log",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      maxCount: z.number().positive().optional().default(50).describe("Maximum number of commits to display"),
      file: z.string().optional().describe("Optional file path to show history for a specific file")
    },
    async ({ path, maxCount, file }) => {
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
        
        const result = await gitService.getLog({
          maxCount,
          file
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
        
        if (result.resultData.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No commits found${file ? ` for file '${file}'` : ''}`
            }]
          };
        }
        
        // Format output
        let output = `Commit history${file ? ` for file '${file}'` : ''} (showing up to ${maxCount} commits)\n\n`;
        
        result.resultData.forEach(commit => {
          output += `Commit: ${commit.hash}\n`;
          output += `Author: ${commit.author} <${commit.authorEmail}>\n`;
          output += `Date: ${commit.date.toISOString()}\n\n`;
          output += `    ${commit.message}\n\n`;
        });
        
        return {
          content: [{
            type: "text",
            text: output
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
  
  // Show commit details
  server.tool(
    "git_show",
    {
      path: z.string().min(1, "Repository path is required").describe("Path to the Git repository"),
      commitHash: z.string().min(1, "Commit hash is required").describe("Hash or reference of the commit to display")
    },
    async ({ path, commitHash }) => {
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
        
        const result = await gitService.showCommit(commitHash);
        
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
}