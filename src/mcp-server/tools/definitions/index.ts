/**
 * @fileoverview Barrel file for all tool definitions.
 * This file re-exports all tool definitions for easy import and registration.
 * It also exports an array of all definitions for automated registration.
 * @module src/mcp-server/tools/definitions
 */

// Git tools - Core
import { gitBlameTool } from './git-blame.tool.js';
import { gitCleanTool } from './git-clean.tool.js';
import { gitCloneTool } from './git-clone.tool.js';
import { gitInitTool } from './git-init.tool.js';
import { gitReflogTool } from './git-reflog.tool.js';
import { gitSetWorkingDirTool } from './git-set-working-dir.tool.js';
import { gitStatusTool } from './git-status.tool.js';

// Git tools - Staging & Commits
import { gitAddTool } from './git-add.tool.js';
import { gitCommitTool } from './git-commit.tool.js';
import { gitDiffTool } from './git-diff.tool.js';
import { gitLogTool } from './git-log.tool.js';
import { gitShowTool } from './git-show.tool.js';

// Git tools - Branching & Merging
import { gitBranchTool } from './git-branch.tool.js';
import { gitCheckoutTool } from './git-checkout.tool.js';
import { gitMergeTool } from './git-merge.tool.js';
import { gitRebaseTool } from './git-rebase.tool.js';
import { gitCherryPickTool } from './git-cherry-pick.tool.js';

// Git tools - Remote Operations
import { gitRemoteTool } from './git-remote.tool.js';
import { gitFetchTool } from './git-fetch.tool.js';
import { gitPullTool } from './git-pull.tool.js';
import { gitPushTool } from './git-push.tool.js';

// Git tools - Advanced Workflows
import { gitTagTool } from './git-tag.tool.js';
import { gitStashTool } from './git-stash.tool.js';
import { gitResetTool } from './git-reset.tool.js';
import { gitWorktreeTool } from './git-worktree.tool.js';

/**
 * An array containing all tool definitions for easy iteration.
 */
export const allToolDefinitions = [
  // Core
  gitBlameTool,
  gitCleanTool,
  gitCloneTool,
  gitInitTool,
  gitReflogTool,
  gitSetWorkingDirTool,
  gitStatusTool,
  // Staging & Commits
  gitAddTool,
  gitCommitTool,
  gitDiffTool,
  gitLogTool,
  gitShowTool,
  // Branching & Merging
  gitBranchTool,
  gitCheckoutTool,
  gitMergeTool,
  gitRebaseTool,
  gitCherryPickTool,
  // Remote Operations
  gitRemoteTool,
  gitFetchTool,
  gitPullTool,
  gitPushTool,
  // Advanced Workflows
  gitTagTool,
  gitStashTool,
  gitResetTool,
  gitWorktreeTool,
];
