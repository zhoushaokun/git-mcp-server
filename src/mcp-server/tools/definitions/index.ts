/**
 * @fileoverview Barrel file for all tool definitions.
 * This file re-exports all tool definitions for easy import and registration.
 * It also exports an array of all definitions for automated registration.
 * @module src/mcp-server/tools/definitions
 */

// Git tools
import { gitBlameTool } from './git-blame.tool.js';
import { gitCleanTool } from './git-clean.tool.js';
import { gitCloneTool } from './git-clone.tool.js';
import { gitInitTool } from './git-init.tool.js';
import { gitReflogTool } from './git-reflog.tool.js';
import { gitSetWorkingDirTool } from './git-set-working-dir.tool.js';
import { gitStatusTool } from './git-status.tool.js';

/**
 * An array containing all tool definitions for easy iteration.
 */
export const allToolDefinitions = [
  gitBlameTool,
  gitCleanTool,
  gitCloneTool,
  gitInitTool,
  gitReflogTool,
  gitSetWorkingDirTool,
  gitStatusTool,
];
