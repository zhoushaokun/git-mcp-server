# Migration Guide: Git MCP Server v2.4 → v2.5 Provider Pattern Architecture

**Version:** 2.5.0
**Last Updated:** 2025-10-09
**Status:** Active Development
**Migration Timeline:** 6-8 weeks

---

## Table of Contents

1. [Overview](#overview)
2. [Migration Philosophy](#migration-philosophy)
3. [Phase 0: Pre-Migration Enhancements](#phase-0-pre-migration-enhancements)
4. [Phase 1: Git Service Foundation](#phase-1-git-service-foundation)
5. [Phase 2: Provider Implementation](#phase-2-provider-implementation)
6. [Phase 3: Tool Migration](#phase-3-tool-migration)
7. [Phase 4: Post-Migration Enhancements](#phase-4-post-migration-enhancements)
8. [Phase 5: Testing & Quality Assurance](#phase-5-testing--quality-assurance)
9. [Response Formatter Best Practices](#response-formatter-best-practices)
10. [Tool Migration Matrix](#tool-migration-matrix)
11. [Rollback & Risk Mitigation](#rollback--risk-mitigation)
12. [Deployment Guide](#deployment-guide)
13. [Appendix](#appendix)

---

## Overview

### What We're Building

This migration transforms git-mcp-server from a **CLI-only architecture** to a **dual-provider system** that runs seamlessly in both local and serverless environments.

**Current State (v2.4):**
```
Tool → Direct CLI Execution → Local Git Binary
        ❌ Serverless incompatible
        ❌ Direct filesystem coupling
        ✅ Full git feature set
```

**Target State (v2.5):**
```
Tool → Git Service → Provider Factory → {
  ✅ CLI Provider (Local: Full features)
  ✅ Isomorphic Provider (Edge: Core features)
  ✅ Future: GitHub API Provider
}
```

### Migration Goals

- ✅ **Dual Environment Support**: Run on localhost OR Cloudflare Workers
- ✅ **Better Architecture**: Clean separation of concerns via provider pattern
- ✅ **Enhanced UX**: Improved response formatting for LLM consumption
- ✅ **Safety First**: Better validations and error handling
- ✅ **Future-Proof**: Easy to add new providers (GitHub API, GitLab API, etc.)
- ✅ **Zero Downtime**: Incremental migration with backwards compatibility

### Migration Scope

**Total Effort:** ~3,500 lines of logic code + infrastructure
- **25 Git Tools** → New provider-based architecture
- **1 Resource** → Session working directory management
- **New Additions**: 5-7 new tools, git helper utilities, enhanced formatters
- **Infrastructure**: Provider factory, DI integration, comprehensive tests

---

## Migration Philosophy

### Core Principles

1. **Incremental, Not Big Bang**
   - Migrate tools one category at a time
   - Maintain backwards compatibility during transition
   - Test continuously, not just at the end

2. **Preparation Over Speed**
   - Phase 0 enhancements make migration smoother
   - Git helper utilities reduce duplication
   - Standardized schemas prevent rework

3. **Quality Gates**
   - Each phase has specific completion criteria
   - Must pass all tests before proceeding
   - Code review checkpoints at phase boundaries

4. **Rollback Safety**
   - Keep old_tools directory until migration complete
   - Feature flags for new vs old implementations
   - Database/storage migrations are reversible

---

## Phase 0: Pre-Migration Enhancements
**Duration:** 1-2 weeks
**Status:** Preparation & Quick Wins

### Objectives

Improve the existing codebase to make the migration smoother and deliver immediate value to users.

### 0.1 Response Formatter Improvements

**Priority:** CRITICAL
**Impact:** Dramatically improves LLM's ability to present git information

#### Current Problem

Many tools return raw JSON, which LLMs struggle to parse and present clearly:

```typescript
// ❌ Current git_log output (hard for LLMs to parse)
{
  "success": true,
  "commits": [
    {"hash": "a1b2c3d", "author": "Casey", "message": "feat: add feature"},
    {"hash": "e4f5g6h", "author": "Sam", "message": "fix: resolve bug"}
  ]
}
```

#### Target Solution

Provide markdown-formatted, hierarchical output:

```typescript
// ✅ New git_log output (LLM-friendly)
# Git Log (2 commits)

## a1b2c3d - feat: add feature
**Author:** Casey Smith <casey@example.com>
**Date:** 2025-10-09 14:23:15
**Message:** feat: add feature

Added new provider pattern for git operations...

---

## e4f5g6h - fix: resolve bug
**Author:** Sam Jones <sam@example.com>
**Date:** 2025-10-08 09:15:42
**Message:** fix: resolve bug

Resolved null pointer exception in status parser
```

#### Tools to Enhance

| Tool | Priority | Effort | Current Issue | Target Improvement |
|------|----------|--------|---------------|-------------------|
| `git_log` | HIGH | 2hrs | Raw JSON array | Formatted commit history |
| `git_status` | HIGH | 1hr | Flat structure | Sectioned view (staged/unstaged/conflicts) |
| `git_diff` | HIGH | 2hrs | Plain text dump | File headers + stats + formatted hunks |
| `git_branch` | MEDIUM | 1hr | Simple list | Current branch indicator + tracking status |
| `git_stash` | MEDIUM | 1hr | JSON array | Formatted stash list with metadata |
| `git_worktree` | LOW | 1hr | JSON array | Table format with status indicators |

#### Implementation Example: git_log

**Before:**
```typescript
export const gitLogTool: ToolDefinition = {
  name: 'git_log',
  outputSchema: GitLogOutputSchema,
  logic: logGitHistory,
  // ❌ No formatter - defaults to JSON.stringify()
};
```

**After:**
```typescript
function gitLogResponseFormatter(result: GitLogOutput): ContentBlock[] {
  const { commits } = result;

  const header = `# Git Log (${commits.length} commits)\n\n`;

  const formattedCommits = commits.map(commit => {
    const shortHash = commit.hash.substring(0, 7);
    const date = new Date(commit.timestamp * 1000).toISOString();

    return [
      `## ${shortHash} - ${commit.subject}`,
      `**Author:** ${commit.authorName} <${commit.authorEmail}>`,
      `**Date:** ${date}`,
      `**Message:** ${commit.subject}`,
      commit.body ? `\n${commit.body}` : '',
      '\n---\n'
    ].join('\n');
  }).join('\n');

  return [{
    type: 'text',
    text: `${header}${formattedCommits}`
  }];
}

export const gitLogTool: ToolDefinition = {
  name: 'git_log',
  outputSchema: GitLogOutputSchema,
  logic: logGitHistory,
  responseFormatter: gitLogResponseFormatter, // ✅ Added
};
```

See [Response Formatter Best Practices](#response-formatter-best-practices) for detailed guidelines.

### 0.2 Git CLI Abstraction Layer

**Priority:** CRITICAL (Migration Prep)
**Impact:** Reduces code duplication by 60%, simplifies provider implementation

#### Current Problem

Git CLI execution is duplicated across 25 tools:

```typescript
// ❌ Repeated in every tool
const execFileAsync = promisify(execFile);
const { stdout } = await execFileAsync('git', ['-C', path, 'status', '--porcelain']);
// Manual error handling, no standardization
```

#### Target Solution

Centralized, type-safe git command execution:

```typescript
// ✅ New git-helpers.ts utility
import { execGitCommand, type GitCommandResult } from '@/utils/git-helpers.js';

const result = await execGitCommand('status', ['--porcelain'], {
  cwd: workingDir,
  context: appContext,
  maxBuffer: 1024 * 1024 * 10,
});
```

#### Implementation

**File:** `src/utils/git-helpers.ts`

```typescript
/**
 * @fileoverview Git CLI execution helpers and utilities
 * @module utils/git-helpers
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger, type RequestContext } from './index.js';
import { McpError, BaseErrorCode } from '@/types-global/errors.js';

const execFileAsync = promisify(execFile);

/**
 * Result of a git command execution
 */
export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Options for git command execution
 */
export interface GitCommandOptions {
  /** Working directory for command execution */
  cwd: string;
  /** Request context for logging/tracing */
  context: RequestContext;
  /** Maximum stdout/stderr buffer size in bytes */
  maxBuffer?: number;
  /** Environment variables to pass to git process */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Execute a git command with standardized error handling and logging.
 *
 * @param command - Git subcommand (e.g., 'status', 'commit', 'push')
 * @param args - Arguments to pass to the git command
 * @param options - Execution options
 * @returns Promise resolving to command result
 * @throws {McpError} If command fails or validation errors occur
 *
 * @example
 * ```typescript
 * const result = await execGitCommand('status', ['--porcelain', '-b'], {
 *   cwd: '/path/to/repo',
 *   context: appContext,
 * });
 * ```
 */
export async function execGitCommand(
  command: string,
  args: string[],
  options: GitCommandOptions,
): Promise<GitCommandResult> {
  const { cwd, context, maxBuffer = 1024 * 1024 * 10, env, timeout = 30000 } = options;

  const fullArgs = ['-C', cwd, command, ...args];
  const cmdString = `git ${fullArgs.join(' ')}`;

  logger.debug(`Executing git command: ${cmdString}`, {
    ...context,
    operation: `git_${command}`,
  });

  try {
    const { stdout, stderr } = await execFileAsync('git', fullArgs, {
      maxBuffer,
      env: { ...process.env, ...env },
      timeout,
    });

    logger.debug(`Git command succeeded: ${cmdString}`, {
      ...context,
      operation: `git_${command}`,
      stdoutLength: stdout.length,
      stderrLength: stderr.length,
    });

    return {
      stdout,
      stderr,
      exitCode: 0,
    };
  } catch (error: unknown) {
    const stderr = error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr)
      : '';
    const stdout = error && typeof error === 'object' && 'stdout' in error
      ? String(error.stdout)
      : '';
    const exitCode = error && typeof error === 'object' && 'code' in error
      ? Number(error.code)
      : 1;

    logger.error(`Git command failed: ${cmdString}`, {
      ...context,
      operation: `git_${command}`,
      exitCode,
      stderr,
      stdout,
    });

    // Check for common error patterns
    if (stderr.includes('not a git repository')) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Not a git repository: ${cwd}`,
        { command: cmdString, stderr },
      );
    }

    if (stderr.includes('permission denied')) {
      throw new McpError(
        BaseErrorCode.PERMISSION_DENIED,
        `Permission denied for git operation: ${command}`,
        { command: cmdString, stderr },
      );
    }

    // Generic error
    throw new McpError(
      BaseErrorCode.TOOL_EXECUTION_ERROR,
      `Git command failed: ${stderr || 'Unknown error'}`,
      { command: cmdString, stderr, stdout, exitCode },
    );
  }
}

/**
 * Validate that a directory is a git repository.
 *
 * @param path - Path to check
 * @param context - Request context
 * @returns Promise resolving to true if valid git repo
 * @throws {McpError} If not a git repository
 */
export async function validateGitRepository(
  path: string,
  context: RequestContext,
): Promise<boolean> {
  const result = await execGitCommand('rev-parse', ['--is-inside-work-tree'], {
    cwd: path,
    context,
  });

  if (result.stdout.trim() !== 'true') {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Not a git repository: ${path}`,
    );
  }

  return true;
}

/**
 * Get the root directory of a git repository.
 *
 * @param path - Path within the repository
 * @param context - Request context
 * @returns Promise resolving to absolute path of repo root
 */
export async function getGitRoot(
  path: string,
  context: RequestContext,
): Promise<string> {
  const result = await execGitCommand('rev-parse', ['--show-toplevel'], {
    cwd: path,
    context,
  });

  return result.stdout.trim();
}

/**
 * Get current branch name.
 *
 * @param path - Repository path
 * @param context - Request context
 * @returns Promise resolving to branch name or null if detached HEAD
 */
export async function getCurrentBranch(
  path: string,
  context: RequestContext,
): Promise<string | null> {
  const result = await execGitCommand('symbolic-ref', ['--short', 'HEAD'], {
    cwd: path,
    context,
  });

  const branch = result.stdout.trim();
  return branch || null;
}

/**
 * Check if repository has uncommitted changes.
 *
 * @param path - Repository path
 * @param context - Request context
 * @returns Promise resolving to true if working directory is clean
 */
export async function isWorkingDirectoryClean(
  path: string,
  context: RequestContext,
): Promise<boolean> {
  const result = await execGitCommand('status', ['--porcelain'], {
    cwd: path,
    context,
  });

  return result.stdout.trim() === '';
}

/**
 * Validate branch name format.
 *
 * @param branchName - Branch name to validate
 * @throws {McpError} If branch name is invalid
 */
export function validateBranchName(branchName: string): void {
  // Git branch naming rules
  const invalidPatterns = [
    /^\./,                    // Cannot start with .
    /\.\./, /                   // Cannot contain ..
    /\/\//,                   // Cannot contain consecutive slashes
    /@\{/,                    // Cannot contain @{
    /[\x00-\x1F\x7F]/,       // No control characters
    /[~^:?*\[\\]/,           // No special characters
    /\.lock$/,                // Cannot end with .lock
    /\/$/,                    // Cannot end with /
  ];

  if (branchName.length === 0) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      'Branch name cannot be empty',
    );
  }

  for (const pattern of invalidPatterns) {
    if (pattern.test(branchName)) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Invalid branch name: ${branchName}`,
        { pattern: pattern.source },
      );
    }
  }
}

/**
 * Validate commit reference (hash, branch, tag).
 *
 * @param ref - Reference to validate
 * @param path - Repository path
 * @param context - Request context
 * @returns Promise resolving to true if valid
 * @throws {McpError} If reference is invalid
 */
export async function validateCommitRef(
  ref: string,
  path: string,
  context: RequestContext,
): Promise<boolean> {
  const result = await execGitCommand('rev-parse', ['--verify', ref], {
    cwd: path,
    context,
  });

  return result.stdout.trim().length > 0;
}
```

**Benefits:**
- ✅ Centralized error handling
- ✅ Consistent logging and tracing
- ✅ Type-safe command results
- ✅ Reusable validation utilities
- ✅ Easier testing (mock single module)
- ✅ Foundation for provider pattern

### 0.3 New Essential Tools

Add commonly requested git operations before migration.

#### 0.3.1 git_blame Tool

**Use Case:** Identify who last modified each line of a file

**File:** `src/mcp-server/tools/definitions/git-blame.tool.ts`

```typescript
/**
 * @fileoverview Git blame tool - show line-by-line authorship
 * @module
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { SdkContext, ToolDefinition } from '@/mcp-server/tools/utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { execGitCommand } from '@/utils/git-helpers.js';
import { sanitization, logger, type RequestContext } from '@/utils/index.js';
import { McpError, BaseErrorCode } from '@/types-global/errors.js';

const TOOL_NAME = 'git_blame';
const TOOL_TITLE = 'Git Blame';
const TOOL_DESCRIPTION =
  'Show line-by-line authorship information for a file, displaying who last modified each line and when.';

const InputSchema = z.object({
  path: z.string().default('.').describe('Path to the Git repository.'),
  file: z.string().min(1).describe('Path to the file to blame (relative to repository root).'),
  startLine: z.number().int().positive().optional().describe('Start line number (1-indexed).'),
  endLine: z.number().int().positive().optional().describe('End line number (1-indexed).'),
  ignoreWhitespace: z.boolean().default(false).describe('Ignore whitespace changes.'),
});

const BlameLineSchema = z.object({
  lineNumber: z.number().int().positive(),
  commitHash: z.string(),
  author: z.string(),
  timestamp: z.number().int(),
  content: z.string(),
});

const OutputSchema = z.object({
  success: z.boolean(),
  file: z.string(),
  lines: z.array(BlameLineSchema),
  totalLines: z.number().int(),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;
type BlameLine = z.infer<typeof BlameLineSchema>;

async function gitBlameLogic(
  input: ToolInput,
  appContext: RequestContext & { getWorkingDirectory: () => string | undefined },
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git blame', { ...appContext, toolInput: input });

  const workingDir = appContext.getWorkingDirectory();
  if (input.path === '.' && !workingDir) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      "No session working directory set. Please specify a 'path' or use 'git_set_working_dir' first.",
    );
  }

  const targetPath = sanitization.sanitizePath(
    input.path === '.' ? workingDir! : input.path,
    { allowAbsolute: true },
  ).sanitizedPath;

  // Sanitize file path to prevent directory traversal
  const filePath = sanitization.sanitizePath(input.file, {
    rootDir: targetPath,
  }).sanitizedPath;

  const args = ['--porcelain'];

  if (input.ignoreWhitespace) {
    args.push('-w');
  }

  if (input.startLine && input.endLine) {
    args.push(`-L${input.startLine},${input.endLine}`);
  }

  args.push('--', filePath);

  const result = await execGitCommand('blame', args, {
    cwd: targetPath,
    context: appContext,
  });

  // Parse porcelain format
  const lines: BlameLine[] = [];
  const rawLines = result.stdout.split('\n');
  let currentCommit: Partial<BlameLine> = {};
  let lineNumber = input.startLine || 1;

  for (const line of rawLines) {
    if (!line) continue;

    // Commit hash line
    if (line.match(/^[0-9a-f]{40}/)) {
      const parts = line.split(' ');
      currentCommit = {
        commitHash: parts[0],
        lineNumber,
      };
    }
    // Author line
    else if (line.startsWith('author ')) {
      currentCommit.author = line.substring(7);
    }
    // Timestamp line
    else if (line.startsWith('author-time ')) {
      currentCommit.timestamp = parseInt(line.substring(12), 10);
    }
    // Content line (starts with tab)
    else if (line.startsWith('\t')) {
      currentCommit.content = line.substring(1);

      if (currentCommit.commitHash && currentCommit.author && currentCommit.timestamp !== undefined) {
        lines.push(currentCommit as BlameLine);
        lineNumber++;
        currentCommit = {};
      }
    }
  }

  return {
    success: true,
    file: filePath,
    lines,
    totalLines: lines.length,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const { file, lines, totalLines } = result;

  const header = `# Git Blame: ${file}\n\n`;
  const stats = `**Total Lines:** ${totalLines}\n\n`;

  const formattedLines = lines.map(line => {
    const shortHash = line.commitHash.substring(0, 7);
    const date = new Date(line.timestamp * 1000).toISOString().split('T')[0];
    const authorShort = line.author.length > 20
      ? line.author.substring(0, 17) + '...'
      : line.author.padEnd(20);

    return `${String(line.lineNumber).padStart(4)} | ${shortHash} | ${date} | ${authorShort} | ${line.content}`;
  }).join('\n');

  const legend = '\n\n**Format:** Line | Commit | Date | Author | Content';

  return [{
    type: 'text',
    text: `${header}${stats}\`\`\`\n${formattedLines}\n\`\`\`${legend}`,
  }];
}

export const gitBlameTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], gitBlameLogic),
  responseFormatter,
};
```

#### 0.3.2 git_reflog Tool

**Use Case:** View reference logs to recover lost commits

**File:** `src/mcp-server/tools/definitions/git-reflog.tool.ts`

```typescript
/**
 * @fileoverview Git reflog tool - view reference logs
 * @module
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { SdkContext, ToolDefinition } from '@/mcp-server/tools/utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { execGitCommand } from '@/utils/git-helpers.js';
import { sanitization, logger, type RequestContext } from '@/utils/index.js';
import { McpError, BaseErrorCode } from '@/types-global/errors.js';

const TOOL_NAME = 'git_reflog';
const TOOL_TITLE = 'Git Reflog';
const TOOL_DESCRIPTION =
  'View the reference logs (reflog) to track when branch tips and other references were updated. Useful for recovering lost commits.';

const InputSchema = z.object({
  path: z.string().default('.').describe('Path to the Git repository.'),
  ref: z.string().optional().describe('Show reflog for specific reference (default: HEAD).'),
  maxCount: z.number().int().positive().optional().describe('Limit number of entries.'),
});

const ReflogEntrySchema = z.object({
  hash: z.string(),
  refName: z.string(),
  action: z.string(),
  message: z.string(),
  timestamp: z.number().int(),
});

const OutputSchema = z.object({
  success: z.boolean(),
  ref: z.string(),
  entries: z.array(ReflogEntrySchema),
  totalEntries: z.number().int(),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;
type ReflogEntry = z.infer<typeof ReflogEntrySchema>;

async function gitReflogLogic(
  input: ToolInput,
  appContext: RequestContext & { getWorkingDirectory: () => string | undefined },
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git reflog', { ...appContext, toolInput: input });

  const workingDir = appContext.getWorkingDirectory();
  if (input.path === '.' && !workingDir) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      "No session working directory set. Please specify a 'path' or use 'git_set_working_dir' first.",
    );
  }

  const targetPath = sanitization.sanitizePath(
    input.path === '.' ? workingDir! : input.path,
    { allowAbsolute: true },
  ).sanitizedPath;

  const ref = input.ref || 'HEAD';
  const args = ['--format=%H%x1F%gd%x1F%gs%x1F%ct%x1E'];

  if (input.maxCount) {
    args.push(`-n${input.maxCount}`);
  }

  args.push(ref);

  const result = await execGitCommand('reflog', args, {
    cwd: targetPath,
    context: appContext,
  });

  // Parse reflog output
  const entries: ReflogEntry[] = [];
  const records = result.stdout.split('\x1E').filter(r => r.trim());

  for (const record of records) {
    const fields = record.trim().split('\x1F');
    if (fields.length >= 4) {
      const [hash, refName, message, timestampStr] = fields;

      // Parse action from refName (e.g., "HEAD@{0}")
      const actionMatch = refName.match(/\{([^}]+)\}/);
      const action = actionMatch ? actionMatch[1] : 'unknown';

      entries.push({
        hash,
        refName,
        action,
        message,
        timestamp: parseInt(timestampStr, 10),
      });
    }
  }

  return {
    success: true,
    ref,
    entries,
    totalEntries: entries.length,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const { ref, entries, totalEntries } = result;

  const header = `# Git Reflog: ${ref}\n\n`;
  const stats = `**Total Entries:** ${totalEntries}\n\n`;

  const formattedEntries = entries.map((entry, index) => {
    const shortHash = entry.hash.substring(0, 7);
    const date = new Date(entry.timestamp * 1000).toISOString();

    return [
      `## ${entry.refName}`,
      `**Commit:** ${shortHash}`,
      `**Date:** ${date}`,
      `**Action:** ${entry.message}`,
      '',
    ].join('\n');
  }).join('\n');

  return [{
    type: 'text',
    text: `${header}${stats}${formattedEntries}`,
  }];
}

export const gitReflogTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], gitReflogLogic),
  responseFormatter,
};
```

### 0.4 Enhanced Safety Validations

Add pre-flight checks for destructive operations.

#### 0.4.1 Branch Protection Validator

**File:** `src/utils/git-validators.ts`

```typescript
/**
 * @fileoverview Git safety validators and pre-flight checks
 * @module utils/git-validators
 */

import { McpError, BaseErrorCode } from '@/types-global/errors.js';
import { execGitCommand, getCurrentBranch } from './git-helpers.js';
import { logger, type RequestContext } from './index.js';

/**
 * Protected branch configuration
 */
export interface BranchProtectionConfig {
  /** Branches that require confirmation for destructive operations */
  protectedBranches: string[];
  /** Whether to enforce protection (default: true) */
  enforce: boolean;
}

/**
 * Default branch protection configuration
 */
const DEFAULT_PROTECTION: BranchProtectionConfig = {
  protectedBranches: ['main', 'master', 'production', 'prod', 'develop', 'dev'],
  enforce: true,
};

/**
 * Check if a branch is protected and requires special handling.
 *
 * @param branchName - Branch name to check
 * @param config - Protection configuration
 * @returns True if branch is protected
 */
export function isProtectedBranch(
  branchName: string,
  config: BranchProtectionConfig = DEFAULT_PROTECTION,
): boolean {
  return config.protectedBranches.includes(branchName.toLowerCase());
}

/**
 * Validate that a destructive operation on a protected branch has explicit confirmation.
 *
 * @param branchName - Branch name
 * @param operation - Operation being performed (e.g., 'force push', 'reset --hard')
 * @param confirmed - Whether user explicitly confirmed
 * @param config - Protection configuration
 * @throws {McpError} If operation on protected branch is not confirmed
 */
export function validateProtectedBranchOperation(
  branchName: string,
  operation: string,
  confirmed: boolean,
  config: BranchProtectionConfig = DEFAULT_PROTECTION,
): void {
  if (!config.enforce) {
    return;
  }

  if (isProtectedBranch(branchName, config) && !confirmed) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Cannot perform '${operation}' on protected branch '${branchName}' without explicit confirmation.`,
      {
        branch: branchName,
        operation,
        hint: 'Set the confirmation parameter to true to proceed.',
      },
    );
  }
}

/**
 * Check if repository has uncommitted changes and warn if proceeding with destructive operation.
 *
 * @param path - Repository path
 * @param context - Request context
 * @param operation - Operation being performed
 * @param force - Whether operation is forced
 * @throws {McpError} If uncommitted changes exist and operation is not forced
 */
export async function validateCleanWorkingDirectory(
  path: string,
  context: RequestContext,
  operation: string,
  force: boolean = false,
): Promise<void> {
  const result = await execGitCommand('status', ['--porcelain'], {
    cwd: path,
    context,
  });

  const hasChanges = result.stdout.trim().length > 0;

  if (hasChanges && !force) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Cannot perform '${operation}' with uncommitted changes. Commit or stash changes first, or use force=true.`,
      {
        operation,
        hint: 'Use git_status to see uncommitted changes, or set force=true to proceed anyway.',
      },
    );
  }

  if (hasChanges && force) {
    logger.warning(`Proceeding with '${operation}' despite uncommitted changes`, {
      ...context,
      operation,
    });
  }
}

/**
 * Validate that target branch exists before attempting merge/rebase.
 *
 * @param branchName - Branch name to validate
 * @param path - Repository path
 * @param context - Request context
 * @throws {McpError} If branch does not exist
 */
export async function validateBranchExists(
  branchName: string,
  path: string,
  context: RequestContext,
): Promise<void> {
  const result = await execGitCommand('rev-parse', ['--verify', `refs/heads/${branchName}`], {
    cwd: path,
    context,
  });

  if (!result.stdout.trim()) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Branch '${branchName}' does not exist.`,
      {
        branch: branchName,
        hint: 'Use git_branch with mode=list to see available branches.',
      },
    );
  }
}

/**
 * Pre-flight check for git push operations.
 *
 * @param path - Repository path
 * @param branch - Branch to push
 * @param force - Whether using force push
 * @param context - Request context
 * @throws {McpError} If pre-flight checks fail
 */
export async function validatePushOperation(
  path: string,
  branch: string | null,
  force: boolean,
  context: RequestContext,
): Promise<void> {
  // Get current branch if not specified
  const targetBranch = branch || await getCurrentBranch(path, context);

  if (!targetBranch) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      'Cannot push from detached HEAD state. Specify a branch explicitly.',
    );
  }

  // Check if force pushing to protected branch
  if (force && isProtectedBranch(targetBranch)) {
    logger.error(`Attempted force push to protected branch: ${targetBranch}`, {
      ...context,
      branch: targetBranch,
    });

    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Force push to protected branch '${targetBranch}' is not allowed.`,
      {
        branch: targetBranch,
        hint: 'Use --force-with-lease instead of --force, or remove branch from protection list.',
      },
    );
  }
}
```

### 0.5 Schema Standardization

Create consistent schema patterns for all tools.

#### Common Schema Patterns

**File:** `src/mcp-server/tools/schemas/common.ts`

```typescript
/**
 * @fileoverview Common schema patterns for git tools
 * @module mcp-server/tools/schemas/common
 */

import { z } from 'zod';

/**
 * Standard path parameter (defaults to session working directory)
 */
export const PathSchema = z.string()
  .default('.')
  .describe('Path to the Git repository. Defaults to session working directory set via git_set_working_dir.');

/**
 * Force flag for destructive operations
 */
export const ForceSchema = z.boolean()
  .default(false)
  .describe('Force the operation, bypassing safety checks. Use with caution.');

/**
 * Dry-run flag for preview mode
 */
export const DryRunSchema = z.boolean()
  .default(false)
  .describe('Preview the operation without executing it.');

/**
 * Confirmation flag for protected operations
 */
export const ConfirmSchema = z.enum(['Y', 'y', 'Yes', 'yes'])
  .describe('Explicit confirmation required for this operation.');

/**
 * Branch name with validation
 */
export const BranchNameSchema = z.string()
  .min(1)
  .max(255)
  .regex(/^[^~^:?*\[\\]+$/, 'Invalid branch name format')
  .describe('Branch name (must follow git naming conventions).');

/**
 * Commit reference (hash, branch, or tag)
 */
export const CommitRefSchema = z.string()
  .min(1)
  .describe('Commit reference: full/short hash, branch name, or tag name.');

/**
 * Author information
 */
export const AuthorSchema = z.object({
  name: z.string().min(1).describe("Author's name"),
  email: z.string().email().describe("Author's email address"),
});

/**
 * Remote name
 */
export const RemoteNameSchema = z.string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid remote name format')
  .describe('Remote name (alphanumeric, dots, dashes, underscores only).');

/**
 * Standard success response
 */
export const SuccessResponseSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  message: z.string().describe('Human-readable summary of the result.'),
});
```

### Phase 0 Completion Criteria

✅ **Before proceeding to Phase 1:**
1. All 6 priority response formatters implemented and tested
2. Git helpers module complete with 100% test coverage
3. git_blame and git_reflog tools functional
4. Branch protection validators in place
5. Common schemas documented and used in at least 3 tools
6. All existing tests still pass
7. Code review approved

---

## Phase 1: Git Service Foundation
**Duration:** 1 week
**Status:** Architecture Setup

### Objectives

Create the provider pattern infrastructure and type system.

### 1.1 Directory Structure

Create the new service architecture:

```
src/
├── services/
│   └── git/
│       ├── core/
│       │   ├── IGitProvider.ts              # Provider interface contract
│       │   └── gitProviderFactory.ts        # Provider selection logic
│       ├── providers/
│       │   ├── cli.provider.ts              # Native git CLI (local/Node.js)
│       │   └── isomorphic.provider.ts       # isomorphic-git (serverless)
│       ├── types.ts                         # Shared Git operation types
│       └── index.ts                         # Barrel exports
```

### 1.2 Git Operation Types

**File:** `src/services/git/types.ts`

```typescript
/**
 * @fileoverview Type definitions for Git service operations
 * @module services/git/types
 */

import { z } from 'zod';
import type { RequestContext } from '@/utils/index.js';

/**
 * Base context for all git operations
 */
export interface GitOperationContext {
  /** Request context for logging and tracing */
  requestContext: RequestContext;
  /** Working directory (repository path) */
  workingDirectory: string;
  /** Optional tenant ID for multi-tenancy */
  tenantId?: string;
}

// ============================================================================
// Repository Operations
// ============================================================================

export interface GitInitOptions {
  path: string;
  initialBranch?: string;
  bare?: boolean;
}

export interface GitInitResult {
  success: boolean;
  path: string;
  initialBranch: string;
  bare: boolean;
}

export interface GitCloneOptions {
  remoteUrl: string;
  localPath: string;
  branch?: string;
  depth?: number;
  bare?: boolean;
}

export interface GitCloneResult {
  success: boolean;
  localPath: string;
  remoteUrl: string;
  branch: string;
}

// ============================================================================
// Status & Information
// ============================================================================

export interface GitStatusOptions {
  includeUntracked?: boolean;
  ignoreSubmodules?: boolean;
}

export interface GitFileStatus {
  path: string;
  indexStatus: string;    // e.g., 'M', 'A', 'D', 'R', 'C'
  workingTreeStatus: string;
}

export interface GitStatusResult {
  currentBranch: string | null;
  stagedChanges: {
    added?: string[];
    modified?: string[];
    deleted?: string[];
    renamed?: string[];
    copied?: string[];
  };
  unstagedChanges: {
    added?: string[];
    modified?: string[];
    deleted?: string[];
  };
  untrackedFiles: string[];
  conflictedFiles: string[];
  isClean: boolean;
}

// ============================================================================
// Commit Operations
// ============================================================================

export interface GitCommitOptions {
  message: string;
  author?: {
    name: string;
    email: string;
  };
  amend?: boolean;
  allowEmpty?: boolean;
  sign?: boolean;
  noVerify?: boolean;
}

export interface GitCommitResult {
  success: boolean;
  commitHash: string;
  message: string;
  author: string;
  timestamp: number;
  filesChanged: string[];
}

export interface GitLogOptions {
  maxCount?: number;
  since?: string;
  until?: string;
  author?: string;
  path?: string;
  grep?: string;
  showSignature?: boolean;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  timestamp: number;
  subject: string;
  body?: string;
  parents: string[];
  refs?: string[];
}

export interface GitLogResult {
  commits: GitCommitInfo[];
  totalCount: number;
}

// ============================================================================
// Branch Operations
// ============================================================================

export interface GitBranchOptions {
  mode: 'list' | 'create' | 'delete' | 'rename';
  branchName?: string;
  newBranchName?: string;
  startPoint?: string;
  force?: boolean;
  remote?: boolean;
}

export interface GitBranchInfo {
  name: string;
  current: boolean;
  commitHash: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
}

export interface GitBranchResult {
  mode: string;
  branches?: GitBranchInfo[];
  created?: string;
  deleted?: string;
  renamed?: { from: string; to: string };
}

// ============================================================================
// Merge & Rebase Operations
// ============================================================================

export interface GitMergeOptions {
  branch: string;
  strategy?: 'ort' | 'recursive' | 'octopus' | 'ours' | 'subtree';
  noFastForward?: boolean;
  squash?: boolean;
  message?: string;
}

export interface GitMergeResult {
  success: boolean;
  strategy: string;
  fastForward: boolean;
  conflicts: boolean;
  conflictedFiles: string[];
  mergedFiles: string[];
  message: string;
}

export interface GitRebaseOptions {
  upstream: string;
  branch?: string;
  interactive?: boolean;
  onto?: string;
  preserve?: boolean;
}

export interface GitRebaseResult {
  success: boolean;
  conflicts: boolean;
  conflictedFiles: string[];
  rebasedCommits: number;
  currentCommit?: string;
}

// ============================================================================
// Remote Operations
// ============================================================================

export interface GitRemoteOptions {
  mode: 'list' | 'add' | 'remove' | 'rename' | 'get-url' | 'set-url';
  name?: string;
  url?: string;
  newName?: string;
  push?: boolean;
}

export interface GitRemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface GitRemoteResult {
  mode: string;
  remotes?: GitRemoteInfo[];
  added?: { name: string; url: string };
  removed?: string;
  renamed?: { from: string; to: string };
}

export interface GitFetchOptions {
  remote?: string;
  prune?: boolean;
  tags?: boolean;
  depth?: number;
}

export interface GitFetchResult {
  success: boolean;
  remote: string;
  fetchedRefs: string[];
  prunedRefs: string[];
}

export interface GitPushOptions {
  remote?: string;
  branch?: string;
  force?: boolean;
  forceWithLease?: boolean;
  setUpstream?: boolean;
  tags?: boolean;
  dryRun?: boolean;
}

export interface GitPushResult {
  success: boolean;
  remote: string;
  branch: string;
  upstreamSet: boolean;
  pushedRefs: string[];
  rejectedRefs: string[];
}

export interface GitPullOptions {
  remote?: string;
  branch?: string;
  rebase?: boolean;
  fastForwardOnly?: boolean;
}

export interface GitPullResult {
  success: boolean;
  remote: string;
  branch: string;
  strategy: 'merge' | 'rebase' | 'fast-forward';
  conflicts: boolean;
  filesChanged: string[];
}

// ============================================================================
// Diff Operations
// ============================================================================

export interface GitDiffOptions {
  commit1?: string;
  commit2?: string;
  staged?: boolean;
  path?: string;
  unified?: number;
  includeUntracked?: boolean;
  stat?: boolean;
}

export interface GitDiffResult {
  diff: string;
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
  binary?: boolean;
}

// ============================================================================
// Tag Operations
// ============================================================================

export interface GitTagOptions {
  mode: 'list' | 'create' | 'delete';
  tagName?: string;
  commit?: string;
  message?: string;
  annotated?: boolean;
  force?: boolean;
}

export interface GitTagInfo {
  name: string;
  commit: string;
  message?: string;
  tagger?: string;
  timestamp?: number;
}

export interface GitTagResult {
  mode: string;
  tags?: GitTagInfo[];
  created?: string;
  deleted?: string;
}

// ============================================================================
// Stash Operations
// ============================================================================

export interface GitStashOptions {
  mode: 'list' | 'push' | 'pop' | 'apply' | 'drop' | 'clear';
  message?: string;
  stashRef?: string;
  includeUntracked?: boolean;
  keepIndex?: boolean;
}

export interface GitStashInfo {
  ref: string;
  index: number;
  branch: string;
  description: string;
  timestamp: number;
}

export interface GitStashResult {
  mode: string;
  stashes?: GitStashInfo[];
  created?: string;
  applied?: string;
  dropped?: string;
  conflicts?: boolean;
}

// ============================================================================
// Worktree Operations
// ============================================================================

export interface GitWorktreeOptions {
  mode: 'list' | 'add' | 'remove' | 'move' | 'prune';
  path?: string;
  newPath?: string;
  commitish?: string;
  branch?: string;
  force?: boolean;
  detach?: boolean;
}

export interface GitWorktreeInfo {
  path: string;
  head: string;
  branch?: string;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
}

export interface GitWorktreeResult {
  mode: string;
  worktrees?: GitWorktreeInfo[];
  added?: string;
  removed?: string;
  moved?: { from: string; to: string };
  pruned?: string[];
}

// ============================================================================
// Additional Operations
// ============================================================================

export interface GitShowOptions {
  object: string;
  format?: 'raw' | 'json';
  stat?: boolean;
}

export interface GitShowResult {
  object: string;
  type: 'commit' | 'tree' | 'blob' | 'tag';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface GitResetOptions {
  mode: 'soft' | 'mixed' | 'hard';
  commit?: string;
  paths?: string[];
}

export interface GitResetResult {
  success: boolean;
  mode: string;
  commit: string;
  filesReset: string[];
}

export interface GitCherryPickOptions {
  commits: string[];
  noCommit?: boolean;
  continueOperation?: boolean;
  abort?: boolean;
}

export interface GitCherryPickResult {
  success: boolean;
  pickedCommits: string[];
  conflicts: boolean;
  conflictedFiles: string[];
}

export interface GitCleanOptions {
  force: boolean;
  dryRun?: boolean;
  directories?: boolean;
  ignored?: boolean;
  interactive?: boolean;
}

export interface GitCleanResult {
  success: boolean;
  filesRemoved: string[];
  directoriesRemoved: string[];
  dryRun: boolean;
}

export interface GitAddOptions {
  paths: string[];
  all?: boolean;
  update?: boolean;
  force?: boolean;
  patch?: boolean;
}

export interface GitAddResult {
  success: boolean;
  stagedFiles: string[];
}

export interface GitCheckoutOptions {
  target: string;
  createBranch?: boolean;
  force?: boolean;
  detach?: boolean;
  paths?: string[];
}

export interface GitCheckoutResult {
  success: boolean;
  target: string;
  previousHead: string;
  branchCreated?: string;
  filesRestored?: string[];
}
```

### 1.3 Provider Interface

**File:** `src/services/git/core/IGitProvider.ts`

```typescript
/**
 * @fileoverview Git provider interface - contract for all git implementations
 * @module services/git/core/IGitProvider
 */

import type {
  GitOperationContext,
  GitInitOptions,
  GitInitResult,
  GitCloneOptions,
  GitCloneResult,
  GitStatusOptions,
  GitStatusResult,
  GitCommitOptions,
  GitCommitResult,
  GitLogOptions,
  GitLogResult,
  GitBranchOptions,
  GitBranchResult,
  GitMergeOptions,
  GitMergeResult,
  GitRebaseOptions,
  GitRebaseResult,
  GitRemoteOptions,
  GitRemoteResult,
  GitFetchOptions,
  GitFetchResult,
  GitPushOptions,
  GitPushResult,
  GitPullOptions,
  GitPullResult,
  GitDiffOptions,
  GitDiffResult,
  GitTagOptions,
  GitTagResult,
  GitStashOptions,
  GitStashResult,
  GitWorktreeOptions,
  GitWorktreeResult,
  GitShowOptions,
  GitShowResult,
  GitResetOptions,
  GitResetResult,
  GitCherryPickOptions,
  GitCherryPickResult,
  GitCleanOptions,
  GitCleanResult,
  GitAddOptions,
  GitAddResult,
  GitCheckoutOptions,
  GitCheckoutResult,
} from '../types.js';

/**
 * Provider interface for git operations.
 *
 * All methods are async and throw McpError on failure.
 * Implementations should handle their own error transformation.
 */
export interface IGitProvider {
  /**
   * Provider name for logging and diagnostics
   */
  readonly name: string;

  /**
   * Provider version
   */
  readonly version: string;

  /**
   * Capabilities supported by this provider
   */
  readonly capabilities: GitProviderCapabilities;

  /**
   * Check if provider is available and functional in current environment
   */
  healthCheck(context: GitOperationContext): Promise<boolean>;

  // ========================================================================
  // Repository Operations
  // ========================================================================

  /**
   * Initialize a new git repository
   */
  init(options: GitInitOptions, context: GitOperationContext): Promise<GitInitResult>;

  /**
   * Clone a repository from a remote URL
   */
  clone(options: GitCloneOptions, context: GitOperationContext): Promise<GitCloneResult>;

  /**
   * Get repository status
   */
  status(options: GitStatusOptions, context: GitOperationContext): Promise<GitStatusResult>;

  // ========================================================================
  // Commit Operations
  // ========================================================================

  /**
   * Create a new commit
   */
  commit(options: GitCommitOptions, context: GitOperationContext): Promise<GitCommitResult>;

  /**
   * View commit history
   */
  log(options: GitLogOptions, context: GitOperationContext): Promise<GitLogResult>;

  /**
   * Show details of a git object
   */
  show(options: GitShowOptions, context: GitOperationContext): Promise<GitShowResult>;

  /**
   * View differences between commits/files
   */
  diff(options: GitDiffOptions, context: GitOperationContext): Promise<GitDiffResult>;

  /**
   * Stage files for commit
   */
  add(options: GitAddOptions, context: GitOperationContext): Promise<GitAddResult>;

  // ========================================================================
  // Branch Operations
  // ========================================================================

  /**
   * Manage branches (list/create/delete/rename)
   */
  branch(options: GitBranchOptions, context: GitOperationContext): Promise<GitBranchResult>;

  /**
   * Switch branches or restore files
   */
  checkout(options: GitCheckoutOptions, context: GitOperationContext): Promise<GitCheckoutResult>;

  /**
   * Merge branches
   */
  merge(options: GitMergeOptions, context: GitOperationContext): Promise<GitMergeResult>;

  /**
   * Rebase commits
   */
  rebase(options: GitRebaseOptions, context: GitOperationContext): Promise<GitRebaseResult>;

  /**
   * Apply specific commits to current branch
   */
  cherryPick(options: GitCherryPickOptions, context: GitOperationContext): Promise<GitCherryPickResult>;

  // ========================================================================
  // Remote Operations
  // ========================================================================

  /**
   * Manage remote repositories
   */
  remote(options: GitRemoteOptions, context: GitOperationContext): Promise<GitRemoteResult>;

  /**
   * Fetch from remote repository
   */
  fetch(options: GitFetchOptions, context: GitOperationContext): Promise<GitFetchResult>;

  /**
   * Push to remote repository
   */
  push(options: GitPushOptions, context: GitOperationContext): Promise<GitPushResult>;

  /**
   * Pull from remote repository
   */
  pull(options: GitPullOptions, context: GitOperationContext): Promise<GitPullResult>;

  // ========================================================================
  // Tag Operations
  // ========================================================================

  /**
   * Manage tags
   */
  tag(options: GitTagOptions, context: GitOperationContext): Promise<GitTagResult>;

  // ========================================================================
  // Stash Operations
  // ========================================================================

  /**
   * Manage stashed changes
   */
  stash(options: GitStashOptions, context: GitOperationContext): Promise<GitStashResult>;

  // ========================================================================
  // Worktree Operations (optional - not all providers support)
  // ========================================================================

  /**
   * Manage worktrees (optional - may throw "not supported")
   */
  worktree(options: GitWorktreeOptions, context: GitOperationContext): Promise<GitWorktreeResult>;

  // ========================================================================
  // Advanced Operations
  // ========================================================================

  /**
   * Reset repository state
   */
  reset(options: GitResetOptions, context: GitOperationContext): Promise<GitResetResult>;

  /**
   * Clean untracked files
   */
  clean(options: GitCleanOptions, context: GitOperationContext): Promise<GitCleanResult>;
}

/**
 * Capabilities that a provider may support
 */
export interface GitProviderCapabilities {
  /** Can perform git init */
  init: boolean;
  /** Can perform git clone */
  clone: boolean;
  /** Can create commits */
  commit: boolean;
  /** Can manage branches */
  branch: boolean;
  /** Can merge branches */
  merge: boolean;
  /** Can rebase commits */
  rebase: boolean;
  /** Can manage remotes */
  remote: boolean;
  /** Can fetch from remotes */
  fetch: boolean;
  /** Can push to remotes */
  push: boolean;
  /** Can pull from remotes */
  pull: boolean;
  /** Can create tags */
  tag: boolean;
  /** Can stash changes */
  stash: boolean;
  /** Can manage worktrees */
  worktree: boolean;
  /** Can sign commits (GPG/SSH) */
  signCommits: boolean;
  /** Supports SSH authentication */
  sshAuth: boolean;
  /** Supports HTTP/HTTPS authentication */
  httpAuth: boolean;
  /** Maximum recommended repository size in MB */
  maxRepoSizeMB: number;
}
```

### Phase 1 Completion Criteria

✅ **Before proceeding to Phase 2:**
1. All type definitions complete and documented
2. IGitProvider interface finalized
3. Provider capabilities system designed
4. Types exported from barrel (src/services/git/index.ts)
5. Type definitions tested with sample implementations
6. Architecture review approved

---

## Phase 2: Provider Implementation
**Duration:** 2 weeks
**Status:** Core Development

### 2.1 CLI Provider (Local/Node.js)

**File:** `src/services/git/providers/cli.provider.ts`

This will be the primary provider, wrapping the git CLI commands we've already abstracted in git-helpers.ts.

```typescript
/**
 * @fileoverview CLI-based git provider for local/Node.js environments
 * @module services/git/providers/cli
 */

import { injectable } from 'tsyringe';
import type { IGitProvider, GitProviderCapabilities } from '../core/IGitProvider.js';
import { execGitCommand, validateGitRepository } from '@/utils/git-helpers.js';
import { logger } from '@/utils/index.js';
import { config } from '@/config/index.js';
import type {
  GitOperationContext,
  GitInitOptions,
  GitInitResult,
  GitStatusOptions,
  GitStatusResult,
  GitCommitOptions,
  GitCommitResult,
  // ... import all other types
} from '../types.js';

@injectable()
export class CliGitProvider implements IGitProvider {
  readonly name = 'cli';
  readonly version = '1.0.0';
  readonly capabilities: GitProviderCapabilities = {
    init: true,
    clone: true,
    commit: true,
    branch: true,
    merge: true,
    rebase: true,
    remote: true,
    fetch: true,
    push: true,
    pull: true,
    tag: true,
    stash: true,
    worktree: true,
    signCommits: true,
    sshAuth: true,
    httpAuth: true,
    maxRepoSizeMB: Infinity, // No size limit for CLI
  };

  async healthCheck(context: GitOperationContext): Promise<boolean> {
    try {
      const result = await execGitCommand('--version', [], {
        cwd: process.cwd(),
        context: context.requestContext,
      });

      const versionMatch = result.stdout.match(/git version (\d+\.\d+\.\d+)/);
      if (versionMatch) {
        logger.info(`Git CLI provider available: ${versionMatch[1]}`, {
          ...context.requestContext,
          provider: this.name,
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.warning('Git CLI not available', {
        ...context.requestContext,
        provider: this.name,
        error,
      });
      return false;
    }
  }

  async init(options: GitInitOptions, context: GitOperationContext): Promise<GitInitResult> {
    const { path, initialBranch = 'main', bare = false } = options;

    const args: string[] = [];
    if (initialBranch) {
      args.push('--initial-branch', initialBranch);
    }
    if (bare) {
      args.push('--bare');
    }

    await execGitCommand('init', args, {
      cwd: path,
      context: context.requestContext,
    });

    logger.info('Repository initialized', {
      ...context.requestContext,
      provider: this.name,
      path,
      initialBranch,
      bare,
    });

    return {
      success: true,
      path,
      initialBranch,
      bare,
    };
  }

  async status(options: GitStatusOptions, context: GitOperationContext): Promise<GitStatusResult> {
    const args = ['--porcelain=v1', '-b'];

    if (options.includeUntracked !== false) {
      args.push('--untracked-files=all');
    }

    if (options.ignoreSubmodules) {
      args.push('--ignore-submodules');
    }

    const result = await execGitCommand('status', args, {
      cwd: context.workingDirectory,
      context: context.requestContext,
    });

    // Parse porcelain output
    const lines = result.stdout.split('\n').filter(Boolean);
    const statusResult: GitStatusResult = {
      currentBranch: null,
      stagedChanges: {},
      unstagedChanges: {},
      untrackedFiles: [],
      conflictedFiles: [],
      isClean: true,
    };

    // First line is branch info
    if (lines.length > 0 && lines[0].startsWith('## ')) {
      const branchLine = lines.shift()!;
      const branchMatch = branchLine.match(/^## (.*?)(?:\.\.\..*)?$/);
      statusResult.currentBranch = branchMatch?.[1] || null;
    }

    // Parse file statuses
    for (const line of lines) {
      statusResult.isClean = false;

      const xy = line.substring(0, 2);
      const filePath = line.substring(3);
      const staged = xy[0];
      const unstaged = xy[1];

      // Untracked files
      if (xy === '??') {
        statusResult.untrackedFiles.push(filePath);
        continue;
      }

      // Conflicted files
      if (
        staged === 'U' ||
        unstaged === 'U' ||
        (staged === 'A' && unstaged === 'A') ||
        (staged === 'D' && unstaged === 'D')
      ) {
        statusResult.conflictedFiles.push(filePath);
        continue;
      }

      // Staged changes
      if (staged && staged !== ' ') {
        const category = this.mapStatusChar(staged);
        if (!statusResult.stagedChanges[category]) {
          statusResult.stagedChanges[category] = [];
        }
        statusResult.stagedChanges[category].push(filePath);
      }

      // Unstaged changes
      if (unstaged && unstaged !== ' ') {
        const category = this.mapStatusChar(unstaged);
        if (!statusResult.unstagedChanges[category]) {
          statusResult.unstagedChanges[category] = [];
        }
        statusResult.unstagedChanges[category].push(filePath);
      }
    }

    return statusResult;
  }

  async commit(options: GitCommitOptions, context: GitOperationContext): Promise<GitCommitResult> {
    const args: string[] = [];

    // Author override
    if (options.author) {
      args.push('-c', `user.name=${options.author.name}`);
      args.push('-c', `user.email=${options.author.email}`);
    }

    args.push('commit', '-m', options.message);

    if (options.amend) {
      args.push('--amend');
    }

    if (options.allowEmpty) {
      args.push('--allow-empty');
    }

    if (options.sign || config.gitSignCommits) {
      args.push('-S');
    }

    if (options.noVerify) {
      args.push('--no-verify');
    }

    const result = await execGitCommand('commit', args, {
      cwd: context.workingDirectory,
      context: context.requestContext,
    });

    // Extract commit hash from output
    const hashMatch = result.stdout.match(/([a-f0-9]{7,40})/);
    const commitHash = hashMatch ? hashMatch[1] : 'unknown';

    // Get commit details
    const showResult = await execGitCommand('show', [
      '--format=%an%n%ct',
      '--name-only',
      '--no-patch',
      commitHash,
    ], {
      cwd: context.workingDirectory,
      context: context.requestContext,
    });

    const [author, timestampStr, ...files] = showResult.stdout.split('\n').filter(Boolean);
    const timestamp = parseInt(timestampStr, 10);

    return {
      success: true,
      commitHash,
      message: options.message,
      author,
      timestamp,
      filesChanged: files,
    };
  }

  // Implement all other operations following the same pattern...
  // (Full implementation would be ~1500-2000 lines)

  private mapStatusChar(char: string): 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' {
    switch (char) {
      case 'A': return 'added';
      case 'M': return 'modified';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      case 'C': return 'copied';
      default: return 'modified';
    }
  }
}
```

### 2.2 Isomorphic Provider (Serverless/Edge)

**File:** `src/services/git/providers/isomorphic.provider.ts`

```typescript
/**
 * @fileoverview Isomorphic-git provider for serverless/edge environments
 * @module services/git/providers/isomorphic
 */

import { injectable } from 'tsyringe';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import type { IGitProvider, GitProviderCapabilities } from '../core/IGitProvider.js';
import { logger } from '@/utils/index.js';
import { McpError, BaseErrorCode } from '@/types-global/errors.js';
import type {
  GitOperationContext,
  GitInitOptions,
  GitInitResult,
  GitStatusOptions,
  GitStatusResult,
  GitCommitOptions,
  GitCommitResult,
  // ... import all other types
} from '../types.js';

@injectable()
export class IsomorphicGitProvider implements IGitProvider {
  readonly name = 'isomorphic';
  readonly version = '1.0.0';
  readonly capabilities: GitProviderCapabilities = {
    init: true,
    clone: true,
    commit: true,
    branch: true,
    merge: true,
    rebase: false,       // Limited support
    remote: true,
    fetch: true,
    push: true,
    pull: true,
    tag: true,
    stash: false,        // Not supported
    worktree: false,     // Not supported
    signCommits: false,  // Not supported
    sshAuth: false,      // HTTP/HTTPS only
    httpAuth: true,
    maxRepoSizeMB: 100,  // Recommended limit
  };

  async healthCheck(context: GitOperationContext): Promise<boolean> {
    try {
      const version = git.version();
      logger.info(`Isomorphic-git provider available: ${version}`, {
        ...context.requestContext,
        provider: this.name,
      });
      return true;
    } catch (error) {
      logger.warning('Isomorphic-git not available', {
        ...context.requestContext,
        provider: this.name,
        error,
      });
      return false;
    }
  }

  async init(options: GitInitOptions, context: GitOperationContext): Promise<GitInitResult> {
    const { path, initialBranch = 'main', bare = false } = options;

    if (bare) {
      logger.warning('Bare repositories not fully supported in isomorphic-git', {
        ...context.requestContext,
        provider: this.name,
      });
    }

    await git.init({
      fs: this.getFileSystem(context),
      dir: path,
      defaultBranch: initialBranch,
    });

    logger.info('Repository initialized (isomorphic-git)', {
      ...context.requestContext,
      provider: this.name,
      path,
      initialBranch,
    });

    return {
      success: true,
      path,
      initialBranch,
      bare: false, // isomorphic-git doesn't support bare repos
    };
  }

  async status(options: GitStatusOptions, context: GitOperationContext): Promise<GitStatusResult> {
    const fs = this.getFileSystem(context);
    const dir = context.workingDirectory;

    // Get current branch
    let currentBranch: string | null = null;
    try {
      currentBranch = await git.currentBranch({ fs, dir });
    } catch {
      // Detached HEAD or no commits
      currentBranch = null;
    }

    // Get status matrix
    const statusMatrix = await git.statusMatrix({ fs, dir });

    const result: GitStatusResult = {
      currentBranch,
      stagedChanges: {},
      unstagedChanges: {},
      untrackedFiles: [],
      conflictedFiles: [],
      isClean: true,
    };

    for (const [filepath, headStatus, workdirStatus, stageStatus] of statusMatrix) {
      // Unmodified
      if (headStatus === 1 && workdirStatus === 1 && stageStatus === 1) {
        continue;
      }

      result.isClean = false;

      // Untracked
      if (headStatus === 0 && workdirStatus === 2 && stageStatus === 0) {
        if (options.includeUntracked !== false) {
          result.untrackedFiles.push(filepath);
        }
        continue;
      }

      // Deleted from working dir
      if (headStatus === 1 && workdirStatus === 0) {
        if (!result.unstagedChanges.deleted) {
          result.unstagedChanges.deleted = [];
        }
        result.unstagedChanges.deleted.push(filepath);
      }

      // Modified in working dir
      if (headStatus === 1 && workdirStatus === 2 && stageStatus === 1) {
        if (!result.unstagedChanges.modified) {
          result.unstagedChanges.modified = [];
        }
        result.unstagedChanges.modified.push(filepath);
      }

      // Staged changes
      if (stageStatus === 2 || stageStatus === 3) {
        if (headStatus === 0) {
          // New file staged
          if (!result.stagedChanges.added) {
            result.stagedChanges.added = [];
          }
          result.stagedChanges.added.push(filepath);
        } else if (workdirStatus === 0) {
          // File deleted and staged
          if (!result.stagedChanges.deleted) {
            result.stagedChanges.deleted = [];
          }
          result.stagedChanges.deleted.push(filepath);
        } else {
          // File modified and staged
          if (!result.stagedChanges.modified) {
            result.stagedChanges.modified = [];
          }
          result.stagedChanges.modified.push(filepath);
        }
      }
    }

    return result;
  }

  async commit(options: GitCommitOptions, context: GitOperationContext): Promise<GitCommitResult> {
    const fs = this.getFileSystem(context);
    const dir = context.workingDirectory;

    if (options.sign) {
      throw new McpError(
        BaseErrorCode.NOT_SUPPORTED,
        'Commit signing is not supported in isomorphic-git provider',
      );
    }

    const author = options.author
      ? {
          name: options.author.name,
          email: options.author.email,
        }
      : undefined;

    const commitHash = await git.commit({
      fs,
      dir,
      message: options.message,
      author,
      committer: author,
    });

    // Get commit details
    const commitObj = await git.readCommit({ fs, dir, oid: commitHash });

    return {
      success: true,
      commitHash,
      message: options.message,
      author: `${commitObj.commit.author.name} <${commitObj.commit.author.email}>`,
      timestamp: commitObj.commit.author.timestamp,
      filesChanged: [], // Would need additional logic to determine
    };
  }

  // Implement all other operations...
  // (Full implementation would be ~1500-2000 lines)

  private getFileSystem(context: GitOperationContext): any {
    // In Cloudflare Workers, this would use LightningFS or Durable Objects
    // For now, use Node.js fs as fallback
    if (typeof window === 'undefined') {
      return require('fs');
    }

    throw new McpError(
      BaseErrorCode.NOT_SUPPORTED,
      'File system not available in this environment',
    );
  }
}
```

### 2.3 Provider Factory

**File:** `src/services/git/core/gitProviderFactory.ts`

```typescript
/**
 * @fileoverview Factory for selecting and creating git providers
 * @module services/git/core/gitProviderFactory
 */

import { injectable, inject } from 'tsyringe';
import type { IGitProvider } from './IGitProvider.js';
import { CliGitProvider } from '../providers/cli.provider.js';
import { IsomorphicGitProvider } from '../providers/isomorphic.provider.js';
import { logger } from '@/utils/index.js';
import { config } from '@/config/index.js';
import { McpError, BaseErrorCode } from '@/types-global/errors.js';

/**
 * Provider type selection
 */
export type GitProviderType = 'cli' | 'isomorphic' | 'auto';

/**
 * Factory for creating git provider instances
 */
@injectable()
export class GitProviderFactory {
  private cachedProvider: IGitProvider | null = null;

  constructor(
    @inject('CliGitProvider') private cliProvider: CliGitProvider,
    @inject('IsomorphicGitProvider') private isomorphicProvider: IsomorphicGitProvider,
  ) {}

  /**
   * Get the appropriate git provider for the current environment.
   *
   * Selection logic:
   * 1. If GIT_PROVIDER env var is set, use that
   * 2. If running in Cloudflare Workers, use isomorphic
   * 3. If git CLI is available, use CLI provider
   * 4. Fall back to isomorphic provider
   *
   * @returns Promise resolving to git provider instance
   */
  async getProvider(): Promise<IGitProvider> {
    // Return cached provider if available
    if (this.cachedProvider) {
      return this.cachedProvider;
    }

    const providerType = this.determineProviderType();

    logger.info('Selecting git provider', {
      providerType,
      environment: this.detectEnvironment(),
    });

    let provider: IGitProvider;

    switch (providerType) {
      case 'cli':
        provider = this.cliProvider;
        break;
      case 'isomorphic':
        provider = this.isomorphicProvider;
        break;
      case 'auto':
        provider = await this.autoSelectProvider();
        break;
      default:
        throw new McpError(
          BaseErrorCode.CONFIGURATION_ERROR,
          `Invalid git provider type: ${providerType}`,
        );
    }

    // Validate provider is functional
    const mockContext = {
      requestContext: {
        requestId: 'health-check',
        timestamp: Date.now(),
        operation: 'provider-selection',
        correlationId: 'startup',
      },
      workingDirectory: process.cwd(),
    };

    const healthy = await provider.healthCheck(mockContext);
    if (!healthy) {
      logger.warning(`Selected provider '${provider.name}' failed health check`, {
        provider: provider.name,
      });
    }

    this.cachedProvider = provider;
    return provider;
  }

  /**
   * Auto-select provider based on environment capabilities
   */
  private async autoSelectProvider(): Promise<IGitProvider> {
    const env = this.detectEnvironment();

    // In serverless environments, use isomorphic-git
    if (env === 'cloudflare-worker' || env === 'browser') {
      logger.info('Auto-selected isomorphic-git provider for serverless environment');
      return this.isomorphicProvider;
    }

    // In local environments, prefer CLI if available
    const mockContext = {
      requestContext: {
        requestId: 'auto-select',
        timestamp: Date.now(),
        operation: 'provider-selection',
        correlationId: 'startup',
      },
      workingDirectory: process.cwd(),
    };

    const cliAvailable = await this.cliProvider.healthCheck(mockContext);
    if (cliAvailable) {
      logger.info('Auto-selected CLI provider (git binary available)');
      return this.cliProvider;
    }

    logger.info('Auto-selected isomorphic-git provider (git binary not available)');
    return this.isomorphicProvider;
  }

  /**
   * Determine provider type from configuration
   */
  private determineProviderType(): GitProviderType {
    const envProvider = process.env.GIT_PROVIDER as GitProviderType | undefined;

    if (envProvider && ['cli', 'isomorphic', 'auto'].includes(envProvider)) {
      return envProvider;
    }

    // Default to auto-selection
    return 'auto';
  }

  /**
   * Detect current execution environment
   */
  private detectEnvironment(): 'node' | 'bun' | 'cloudflare-worker' | 'browser' | 'unknown' {
    // Cloudflare Workers
    if (typeof globalThis.caches !== 'undefined' && typeof globalThis.WebSocketPair !== 'undefined') {
      return 'cloudflare-worker';
    }

    // Browser
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      return 'browser';
    }

    // Bun
    if (typeof Bun !== 'undefined') {
      return 'bun';
    }

    // Node.js
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      return 'node';
    }

    return 'unknown';
  }

  /**
   * Clear cached provider (useful for testing)
   */
  clearCache(): void {
    this.cachedProvider = null;
  }
}
```

### 2.4 DI Container Registration

**File:** `src/container/index.ts` (additions)

```typescript
// Add to existing container registration
import { GitProviderFactory } from '@/services/git/core/gitProviderFactory.js';
import { CliGitProvider } from '@/services/git/providers/cli.provider.js';
import { IsomorphicGitProvider } from '@/services/git/providers/isomorphic.provider.js';

// Register git providers
container.register('CliGitProvider', { useClass: CliGitProvider });
container.register('IsomorphicGitProvider', { useClass: IsomorphicGitProvider });
container.registerSingleton('GitProviderFactory', GitProviderFactory);

// Export token
export const GitProviderFactoryToken = 'GitProviderFactory';
```

### Phase 2 Completion Criteria

✅ **Before proceeding to Phase 3:**
1. CLI provider implements all 25 operations
2. Isomorphic provider implements core operations (init, commit, status, fetch, push, pull)
3. Provider factory auto-selection works correctly
4. Health checks pass for both providers
5. Unit tests for both providers (80%+ coverage)
6. Integration tests with real git operations
7. Documentation for provider capabilities
8. Performance benchmarks completed

---

## Phase 3: Tool Migration
**Duration:** 2 weeks
**Status:** Tool Transformation

### Objectives

Migrate all 25 tools from direct CLI execution to provider-based architecture.

### 3.1 Migration Strategy

**Incremental Approach:**
1. Migrate tools by category (repository → commit → branch → remote → advanced)
2. Keep old implementations until new ones are tested
3. Use feature flags to switch between implementations
4. Validate each migrated tool before proceeding

### 3.2 Migration Example: git_status

**Before (old_tools/tools/gitStatus/logic.ts):**
```typescript
export async function getGitStatus(
  params: GitStatusInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitStatusOutput> {
  // Direct CLI execution
  const { stdout } = await execFileAsync('git', ['-C', targetPath, 'status', '--porcelain']);
  return parseGitStatus(stdout);
}
```

**After (src/mcp-server/tools/definitions/git-status.tool.ts):**
```typescript
/**
 * @fileoverview Git status tool - provider-based implementation
 * @module
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { container } from 'tsyringe';
import { z } from 'zod';

import { GitProviderFactoryToken } from '@/container/tokens.js';
import type { GitProviderFactory } from '@/services/git/core/gitProviderFactory.js';
import type { SdkContext, ToolDefinition } from '@/mcp-server/tools/utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema } from '@/mcp-server/tools/schemas/common.js';
import { sanitization, logger, type RequestContext } from '@/utils/index.js';
import { McpError, BaseErrorCode } from '@/types-global/errors.js';

const TOOL_NAME = 'git_status';
const TOOL_TITLE = 'Git Status';
const TOOL_DESCRIPTION =
  'Show the working tree status including staged, unstaged, and untracked files.';

const InputSchema = z.object({
  path: PathSchema,
  includeUntracked: z.boolean().default(true).describe('Include untracked files in the output.'),
});

const ChangesSchema = z.object({
  added: z.array(z.string()).optional(),
  modified: z.array(z.string()).optional(),
  deleted: z.array(z.string()).optional(),
  renamed: z.array(z.string()).optional(),
  copied: z.array(z.string()).optional(),
});

const OutputSchema = z.object({
  currentBranch: z.string().nullable(),
  stagedChanges: ChangesSchema,
  unstagedChanges: ChangesSchema,
  untrackedFiles: z.array(z.string()),
  conflictedFiles: z.array(z.string()),
  isClean: z.boolean(),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitStatusLogic(
  input: ToolInput,
  appContext: RequestContext & { getWorkingDirectory: () => string | undefined },
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git status (provider-based)', {
    ...appContext,
    toolInput: input,
  });

  // Get working directory
  const workingDir = input.path === '.'
    ? appContext.getWorkingDirectory()
    : input.path;

  if (!workingDir) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      "No session working directory set. Please specify a 'path' or use 'git_set_working_dir' first.",
    );
  }

  const targetPath = sanitization.sanitizePath(workingDir, {
    allowAbsolute: true,
  }).sanitizedPath;

  // Get provider from factory
  const providerFactory = container.resolve<GitProviderFactory>(GitProviderFactoryToken);
  const provider = await providerFactory.getProvider();

  // Execute via provider
  const result = await provider.status(
    {
      includeUntracked: input.includeUntracked,
      ignoreSubmodules: false,
    },
    {
      requestContext: appContext,
      workingDirectory: targetPath,
      tenantId: appContext.tenantId,
    },
  );

  return result;
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const { currentBranch, stagedChanges, unstagedChanges, untrackedFiles, conflictedFiles, isClean } = result;

  if (isClean) {
    return [{
      type: 'text',
      text: `# Git Status: ${currentBranch || 'HEAD'}\n\nWorking directory is clean.`,
    }];
  }

  let output = `# Git Status: ${currentBranch || 'HEAD (detached)'}\n\n`;

  // Staged changes
  const stagedCount = Object.values(stagedChanges).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  if (stagedCount > 0) {
    output += `## Staged Changes (${stagedCount})\n\n`;
    if (stagedChanges.added?.length) {
      output += `**Added:**\n${stagedChanges.added.map(f => `  - ${f}`).join('\n')}\n\n`;
    }
    if (stagedChanges.modified?.length) {
      output += `**Modified:**\n${stagedChanges.modified.map(f => `  - ${f}`).join('\n')}\n\n`;
    }
    if (stagedChanges.deleted?.length) {
      output += `**Deleted:**\n${stagedChanges.deleted.map(f => `  - ${f}`).join('\n')}\n\n`;
    }
    if (stagedChanges.renamed?.length) {
      output += `**Renamed:**\n${stagedChanges.renamed.map(f => `  - ${f}`).join('\n')}\n\n`;
    }
  }

  // Unstaged changes
  const unstagedCount = Object.values(unstagedChanges).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  if (unstagedCount > 0) {
    output += `## Unstaged Changes (${unstagedCount})\n\n`;
    if (unstagedChanges.added?.length) {
      output += `**Added:**\n${unstagedChanges.added.map(f => `  - ${f}`).join('\n')}\n\n`;
    }
    if (unstagedChanges.modified?.length) {
      output += `**Modified:**\n${unstagedChanges.modified.map(f => `  - ${f}`).join('\n')}\n\n`;
    }
    if (unstagedChanges.deleted?.length) {
      output += `**Deleted:**\n${unstagedChanges.deleted.map(f => `  - ${f}`).join('\n')}\n\n`;
    }
  }

  // Untracked files
  if (untrackedFiles.length > 0) {
    output += `## Untracked Files (${untrackedFiles.length})\n\n`;
    output += untrackedFiles.map(f => `  - ${f}`).join('\n') + '\n\n';
  }

  // Conflicted files
  if (conflictedFiles.length > 0) {
    output += `## ⚠️ Conflicts (${conflictedFiles.length})\n\n`;
    output += conflictedFiles.map(f => `  - ${f}`).join('\n') + '\n\n';
    output += '**Note:** Resolve conflicts before committing.\n';
  }

  return [{ type: 'text', text: output }];
}

export const gitStatusTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], gitStatusLogic),
  responseFormatter,
};
```

### 3.3 Tool Migration Checklist Template

For each tool during migration:

```markdown
## Tool: git_[operation]

- [ ] Provider method implemented in CliGitProvider
- [ ] Provider method implemented in IsomorphicGitProvider (or marked as not supported)
- [ ] Tool definition created in src/mcp-server/tools/definitions/
- [ ] Input schema uses common schemas where applicable
- [ ] Output schema matches provider result type
- [ ] Response formatter implemented with LLM-friendly markdown
- [ ] Authorization wrapper applied (withToolAuth)
- [ ] Path sanitization applied
- [ ] Working directory resolution logic
- [ ] Error handling validates McpError usage
- [ ] Unit tests cover happy path
- [ ] Unit tests cover error cases
- [ ] Integration test with real git repo
- [ ] Integration test with provider fallback
- [ ] Documentation updated in README.md
- [ ] Old tool moved to old_tools (not deleted yet)
- [ ] Tool registered in barrel export (src/mcp-server/tools/definitions/index.ts)
```

### 3.4 Migration Order

**Week 1: Repository & Commit Operations**
1. ✅ git_init
2. ✅ git_clone
3. ✅ git_status
4. ✅ git_add
5. ✅ git_commit
6. ✅ git_log
7. ✅ git_show
8. ✅ git_diff

**Week 2: Branch, Remote & Advanced Operations**
9. ✅ git_branch
10. ✅ git_checkout
11. ✅ git_merge
12. ✅ git_rebase
13. ✅ git_cherry_pick
14. ✅ git_remote
15. ✅ git_fetch
16. ✅ git_pull
17. ✅ git_push
18. ✅ git_tag
19. ✅ git_stash
20. ✅ git_reset
21. ✅ git_clean
22. ✅ git_worktree
23. ✅ git_set_working_dir (update to use provider)
24. ✅ git_clear_working_dir
25. ✅ git_wrapup_instructions

### Phase 3 Completion Criteria

✅ **Before proceeding to Phase 4:**
1. All 25 tools migrated to provider pattern
2. All tools registered in barrel export
3. All tools have response formatters
4. All tools have unit tests (80%+ coverage)
5. Integration tests pass with both providers
6. No regressions in existing functionality
7. Performance is acceptable (no more than 20% slower than old implementation)
8. Documentation complete

---

## Phase 4: Post-Migration Enhancements
**Duration:** 1 week
**Status:** Feature Addition

### Objectives

Add new features enabled by the provider architecture.

### 4.1 Additional Git Tools

#### 4.1.1 git_submodule

**File:** `src/mcp-server/tools/definitions/git-submodule.tool.ts`

Manage git submodules (add, update, init, sync, status).

#### 4.1.2 git_bisect

**File:** `src/mcp-server/tools/definitions/git-bisect.tool.ts`

Binary search for bug-introducing commits.

#### 4.1.3 git_apply

**File:** `src/mcp-server/tools/definitions/git-apply.tool.ts`

Apply patches from files or diffs.

#### 4.1.4 git_config

**File:** `src/mcp-server/tools/definitions/git-config.tool.ts`

Read and write git configuration values (with safety limits).

#### 4.1.5 git_contributors

**File:** `src/mcp-server/tools/definitions/git-contributors.tool.ts`

List contributors with commit statistics.

### 4.2 Advanced Features

#### 4.2.1 Provider Fallback Chain

Enhance provider factory to support automatic fallback:

```typescript
// If CLI provider fails, fall back to isomorphic
const primaryProvider = await factory.getProvider('cli');
try {
  await primaryProvider.commit(options, context);
} catch (error) {
  logger.warning('Primary provider failed, falling back to isomorphic', {
    error,
    operation: 'commit',
  });
  const fallbackProvider = await factory.getProvider('isomorphic');
  await fallbackProvider.commit(options, context);
}
```

#### 4.2.2 Operation Caching

Add optional caching for read-only operations:

```typescript
// Cache git status for 5 seconds to reduce CLI calls
const cacheKey = `status:${workingDir}:${tenantId}`;
const cached = await cache.get(cacheKey);
if (cached) {
  return JSON.parse(cached);
}

const result = await provider.status(options, context);
await cache.set(cacheKey, JSON.stringify(result), { ttl: 5000 });
return result;
```

#### 4.2.3 Batch Operations

Support batch operations for efficiency:

```typescript
// Batch multiple file adds into single operation
await provider.addBatch({
  files: ['file1.ts', 'file2.ts', 'file3.ts'],
}, context);
```

### Phase 4 Completion Criteria

✅ **Before proceeding to Phase 5:**
1. At least 3 new tools implemented
2. Provider fallback chain tested
3. Optional features (caching, batching) implemented and configurable
4. Performance improvements documented
5. All new features have tests
6. Documentation updated

---

## Phase 5: Testing & Quality Assurance
**Duration:** 1 week
**Status:** Validation & Polish

### Objectives

Comprehensive testing and quality validation.

### 5.1 Test Coverage Goals

- **Unit Tests:** 85%+ coverage
- **Integration Tests:** All 25+ tools
- **Provider Tests:** Both CLI and isomorphic
- **Edge Case Tests:** Error handling, edge environments
- **Performance Tests:** Benchmarks for common operations

### 5.2 Test Structure

```
tests/
├── unit/
│   ├── services/
│   │   └── git/
│   │       ├── providers/
│   │       │   ├── cli.provider.test.ts
│   │       │   └── isomorphic.provider.test.ts
│   │       └── core/
│   │           └── gitProviderFactory.test.ts
│   └── mcp-server/
│       └── tools/
│           └── definitions/
│               ├── git-status.tool.test.ts
│               ├── git-commit.tool.test.ts
│               └── ... (all tools)
├── integration/
│   ├── git-operations.test.ts
│   ├── provider-fallback.test.ts
│   └── e2e-workflow.test.ts
└── performance/
    └── git-benchmarks.test.ts
```

### 5.3 Integration Test Example

```typescript
/**
 * @fileoverview Integration tests for git operations
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { container } from 'tsyringe';
import { GitProviderFactory } from '@/services/git/core/gitProviderFactory.js';

describe('Git Operations Integration', () => {
  let testDir: string;
  let provider: IGitProvider;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'git-test-'));
    const factory = container.resolve<GitProviderFactory>(GitProviderFactoryToken);
    provider = await factory.getProvider();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should complete full git workflow', async () => {
    const context = {
      requestContext: {
        requestId: 'test-1',
        timestamp: Date.now(),
        operation: 'integration-test',
        correlationId: 'test',
      },
      workingDirectory: testDir,
    };

    // Init
    const initResult = await provider.init(
      { path: testDir, initialBranch: 'main' },
      context,
    );
    expect(initResult.success).toBe(true);

    // Add file (would need file system operations)
    // ...

    // Commit
    const commitResult = await provider.commit(
      { message: 'Initial commit', allowEmpty: true },
      context,
    );
    expect(commitResult.success).toBe(true);
    expect(commitResult.commitHash).toBeTruthy();

    // Status
    const statusResult = await provider.status({}, context);
    expect(statusResult.isClean).toBe(true);
    expect(statusResult.currentBranch).toBe('main');
  });

  it('should handle provider fallback', async () => {
    // Test that if CLI provider fails, isomorphic takes over
    // (Implementation depends on fallback mechanism)
  });
});
```

### 5.4 Performance Benchmarks

Create benchmarks to ensure migration doesn't degrade performance:

```typescript
/**
 * @fileoverview Performance benchmarks for git operations
 */
import { describe, it, bench } from 'vitest';

describe('Git Performance Benchmarks', () => {
  bench('git_status (CLI provider)', async () => {
    await provider.status({}, context);
  });

  bench('git_log with 100 commits (CLI provider)', async () => {
    await provider.log({ maxCount: 100 }, context);
  });

  bench('git_diff (large file)', async () => {
    await provider.diff({ path: 'large-file.ts' }, context);
  });
});
```

### 5.5 Quality Checklist

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Code coverage ≥ 85%
- [ ] No ESLint errors or warnings
- [ ] All files formatted with Prettier
- [ ] TypeScript strict mode enabled, no errors
- [ ] Security audit passes (bun audit)
- [ ] Performance benchmarks show acceptable results
- [ ] Documentation complete and accurate
- [ ] CHANGELOG updated with all changes
- [ ] README updated with new features
- [ ] Migration guide finalized

### Phase 5 Completion Criteria

✅ **Before release:**
1. All quality checks pass
2. Documentation review complete
3. Performance validated
4. Security audit clean
5. Stakeholder sign-off

---

## Response Formatter Best Practices

### Philosophy

The response formatter is the **only output the LLM sees**. It must contain:
1. **Complete data** - Everything needed to answer follow-up questions
2. **Human-readable structure** - Clear hierarchy and formatting
3. **Balanced detail** - Summaries + full details, not one or the other

### Formatting Patterns

#### Pattern 1: Summary + Structured Details

**Use for:** Status, commits, branches, logs

```typescript
function responseFormatter(result: ToolOutput): ContentBlock[] {
  const header = `# ${operation} Summary\n\n`;
  const overview = `**Status:** ${result.status}\n**Items:** ${result.count}\n\n`;

  const details = result.items.map(item => {
    return `## ${item.name}\n${formatDetails(item)}\n`;
  }).join('\n');

  return [{ type: 'text', text: `${header}${overview}${details}` }];
}
```

#### Pattern 2: Pure JSON for Maximum Flexibility

**Use for:** Simple confirmations, init operations

```typescript
function responseFormatter(result: ToolOutput): ContentBlock[] {
  return [{
    type: 'text',
    text: JSON.stringify(result, null, 2),
  }];
}
```

#### Pattern 3: Hybrid (Summary + JSON)

**Use for:** Complex operations with many fields

```typescript
function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = `# Operation Complete\n\n${result.message}\n\n`;
  const json = `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;

  return [{
    type: 'text',
    text: `${summary}${json}`,
  }];
}
```

### Markdown Guidelines

✅ **DO:**
- Use headings (`#`, `##`) for hierarchy
- Use bold (`**text**`) for labels
- Use code blocks (` ``` `) for diffs, logs
- Use lists for file names, changes
- Include separators (`---`) between sections
- Truncate very long content (e.g., 1000+ line diffs)

❌ **DON'T:**
- Return only summaries without data
- Omit critical information
- Use inconsistent formatting
- Include raw JSON without structure
- Assume LLM can access the raw result object

---

## Tool Migration Matrix

Track progress during migration:

| Tool | Provider Impl | Tool Definition | Tests | Formatter | Status |
|------|--------------|----------------|-------|-----------|--------|
| git_init | ✅ / ✅ | ✅ | ✅ | ✅ | Done |
| git_clone | ✅ / ✅ | ✅ | ✅ | ✅ | Done |
| git_status | ✅ / ✅ | ✅ | ✅ | ✅ | Done |
| git_add | ✅ / ✅ | ⏳ | ⏳ | ⏳ | In Progress |
| git_commit | ✅ / ⚠️ | ⏳ | ⏳ | ⏳ | Blocked (signing) |
| ... | ... | ... | ... | ... | ... |

**Legend:**
- ✅ Complete
- ⏳ In Progress
- ⚠️ Partial (limitations documented)
- ❌ Not Started
- 🚫 Not Supported

---

## Rollback & Risk Mitigation

### Rollback Plan

If migration encounters critical issues:

1. **Immediate Rollback:**
   ```bash
   git checkout main
   git revert <migration-commit-range>
   bun rebuild
   bun test
   ```

2. **Feature Flag Rollback:**
   ```typescript
   // Keep old implementations behind flag
   const USE_PROVIDER_PATTERN = process.env.USE_PROVIDER_PATTERN === 'true';

   if (USE_PROVIDER_PATTERN) {
     return newProviderBasedImplementation();
   } else {
     return legacyCliImplementation();
   }
   ```

3. **Partial Rollback:**
   - Disable specific tools via configuration
   - Fall back to old implementation for critical tools
   - Keep provider pattern for non-critical tools

### Risk Matrix

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Performance degradation | HIGH | MEDIUM | Benchmark early, optimize hot paths |
| Isomorphic provider limitations | MEDIUM | HIGH | Document limitations, CLI fallback |
| Breaking changes in tools | HIGH | LOW | Comprehensive testing, gradual rollout |
| Storage provider incompatibility | MEDIUM | LOW | Test with all storage types |
| Edge deployment issues | MEDIUM | MEDIUM | Thorough testing in Cloudflare Workers |
| Security vulnerabilities | HIGH | LOW | Security audit, path sanitization review |

---

## Deployment Guide

### Local Development Deployment

1. **Prepare Environment:**
   ```bash
   # Ensure git is installed and accessible
   which git
   git --version

   # Set environment variables
   export GIT_PROVIDER=auto  # or 'cli' or 'isomorphic'
   export MCP_TRANSPORT_TYPE=stdio
   export STORAGE_PROVIDER_TYPE=in-memory
   ```

2. **Build and Run:**
   ```bash
   bun rebuild
   bun run devcheck
   bun test
   bun start:stdio
   ```

3. **Validate:**
   - Test git_status in a git repository
   - Test git_commit with staged changes
   - Verify provider selection in logs

### Cloudflare Workers Deployment

1. **Build Worker Bundle:**
   ```bash
   bun run build:worker
   ```

2. **Configure wrangler.toml:**
   ```toml
   name = "git-mcp-server"
   main = "dist/worker.js"
   compatibility_date = "2025-09-01"

   [vars]
   GIT_PROVIDER = "isomorphic"
   STORAGE_PROVIDER_TYPE = "cloudflare-kv"

   [[kv_namespaces]]
   binding = "GIT_SESSION_KV"
   id = "your-kv-namespace-id"
   ```

3. **Deploy:**
   ```bash
   bun deploy:prod
   ```

4. **Validate:**
   - Test health endpoint: `GET /healthz`
   - Test git_init via HTTP transport
   - Verify provider is isomorphic-git
   - Check storage in KV namespace

### Production Deployment Checklist

- [ ] All tests passing
- [ ] Security audit clean
- [ ] Environment variables configured
- [ ] Provider selection tested
- [ ] Storage backend configured
- [ ] Authentication configured (if using HTTP)
- [ ] Rate limiting configured
- [ ] Logging configured (level, destination)
- [ ] Telemetry configured (OTEL)
- [ ] Backup/restore procedures documented
- [ ] Monitoring and alerting set up
- [ ] Rollback plan tested
- [ ] Documentation updated
- [ ] Team trained on new architecture

---

## Appendix

### A. Configuration Reference

Complete list of environment variables:

```bash
# Git Provider Selection
GIT_PROVIDER=auto                    # 'auto', 'cli', or 'isomorphic'

# Git Configuration
GIT_SIGN_COMMITS=false               # Enable commit signing
GIT_WRAPUP_INSTRUCTIONS_PATH=        # Path to custom wrapup instructions

# MCP Server Configuration
MCP_TRANSPORT_TYPE=stdio             # 'stdio' or 'http'
MCP_HTTP_PORT=3015
MCP_HTTP_HOST=127.0.0.1
MCP_HTTP_ENDPOINT_PATH=/mcp

# Authentication
MCP_AUTH_MODE=none                   # 'none', 'jwt', or 'oauth'
MCP_AUTH_SECRET_KEY=                 # JWT secret (32+ chars)
OAUTH_ISSUER_URL=                    # OAuth issuer
OAUTH_AUDIENCE=                      # OAuth audience

# Storage
STORAGE_PROVIDER_TYPE=in-memory      # 'in-memory', 'filesystem', 'supabase', etc.
STORAGE_FILESYSTEM_PATH=./data       # For filesystem provider

# Observability
MCP_LOG_LEVEL=info                   # 'debug', 'info', 'warn', 'error'
OTEL_ENABLED=false                   # Enable OpenTelemetry
OTEL_SERVICE_NAME=git-mcp-server
OTEL_EXPORTER_OTLP_ENDPOINT=
```

### B. Provider Capabilities Comparison

| Feature | CLI Provider | Isomorphic Provider | Notes |
|---------|-------------|---------------------|-------|
| **Initialization** |
| git init | ✅ Full | ✅ Full | - |
| git clone | ✅ Full | ✅ HTTP/HTTPS only | No SSH support in isomorphic |
| **Commits** |
| git commit | ✅ Full | ✅ Basic | No signing in isomorphic |
| git log | ✅ Full | ✅ Full | - |
| git show | ✅ Full | ✅ Full | - |
| git diff | ✅ Full | ✅ Basic | Limited formatting in isomorphic |
| **Branches** |
| git branch | ✅ Full | ✅ Full | - |
| git checkout | ✅ Full | ✅ Full | - |
| git merge | ✅ Full | ✅ Basic | Limited strategies in isomorphic |
| git rebase | ✅ Full | ❌ Not supported | Too complex for isomorphic |
| **Remotes** |
| git fetch | ✅ Full | ✅ HTTP/HTTPS only | - |
| git pull | ✅ Full | ✅ HTTP/HTTPS only | - |
| git push | ✅ Full | ✅ HTTP/HTTPS only | - |
| **Advanced** |
| git stash | ✅ Full | ❌ Not supported | - |
| git worktree | ✅ Full | ❌ Not supported | - |
| git tag | ✅ Full | ✅ Full | - |
| git cherry-pick | ✅ Full | ⚠️ Limited | Basic support only |
| **Other** |
| Commit signing | ✅ GPG/SSH | ❌ Not supported | - |
| Large repos (>100MB) | ✅ No limit | ⚠️ Not recommended | Performance issues |
| Offline operations | ✅ Full | ✅ Full | - |

### C. Glossary

**Terms:**

- **Provider:** An implementation of IGitProvider that executes git operations
- **CLI Provider:** Provider that uses native git command-line tool
- **Isomorphic Provider:** Provider that uses isomorphic-git JavaScript library
- **Provider Factory:** Service that selects and instantiates the appropriate provider
- **Tool Definition:** Declarative configuration for an MCP tool
- **Response Formatter:** Function that transforms tool output for LLM consumption
- **GitOperationContext:** Context object passed to all provider methods
- **Barrel Export:** index.ts file that re-exports items from a directory

### D. Common Issues & Solutions

**Issue:** Provider selection keeps using isomorphic even though git CLI is available

**Solution:** Check `GIT_PROVIDER` env var, clear provider cache, verify git is in PATH

---

**Issue:** Isomorphic provider fails with "file system not available"

**Solution:** Ensure proper file system adapter is configured for your environment

---

**Issue:** Tool response formatter returns undefined

**Solution:** Ensure formatter returns `ContentBlock[]`, not plain text

---

**Issue:** Tests fail with "container not configured"

**Solution:** Mock DI container in test setup or use test-specific container

---

## Summary

This migration transforms git-mcp-server into a flexible, multi-environment platform:

- **Phase 0** (1-2 weeks): Quick wins - better formatters, git helpers, new tools
- **Phase 1** (1 week): Architecture - types, interfaces, provider contract
- **Phase 2** (2 weeks): Implementation - CLI and isomorphic providers
- **Phase 3** (2 weeks): Migration - transform all 25 tools
- **Phase 4** (1 week): Enhancements - new features and optimizations
- **Phase 5** (1 week): Testing - comprehensive validation

**Total Timeline:** 6-8 weeks

**Expected Outcomes:**
- ✅ Dual environment support (local + edge)
- ✅ Better code organization and maintainability
- ✅ Enhanced user experience (improved formatters)
- ✅ Foundation for future providers (GitHub API, etc.)
- ✅ Comprehensive test coverage
- ✅ Production-ready quality

Ready to begin! 🚀
