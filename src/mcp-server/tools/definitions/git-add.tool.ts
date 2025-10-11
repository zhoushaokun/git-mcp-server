/**
 * @fileoverview Git add tool - stage files for commit
 * @module mcp-server/tools/definitions/git-add
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema, AllSchema } from '../schemas/common.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import { markdown } from '../utils/markdown-builder.js';

const TOOL_NAME = 'git_add';
const TOOL_TITLE = 'Git Add';
const TOOL_DESCRIPTION =
  'Stage files for commit. Add file contents to the staging area (index) to prepare for the next commit.';

const InputSchema = z.object({
  path: PathSchema,
  files: z
    .array(z.string())
    .min(1)
    .describe(
      'Array of file paths to stage (relative to repository root). Use ["."] to stage all changes.',
    ),
  update: z
    .boolean()
    .default(false)
    .describe('Stage only modified and deleted files (skip untracked files).'),
  all: AllSchema,
  force: z
    .boolean()
    .default(false)
    .describe('Allow adding otherwise ignored files.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  stagedFiles: z
    .array(z.string())
    .describe('Files that were successfully staged.'),
  totalFiles: z.number().int().describe('Total number of files staged.'),
  status: z
    .object({
      current_branch: z
        .string()
        .nullable()
        .describe('Current branch name after staging.'),
      staged_changes: z
        .record(z.any())
        .describe('All staged changes after this operation.'),
      unstaged_changes: z
        .record(z.any())
        .describe('Remaining unstaged changes.'),
      untracked_files: z
        .array(z.string())
        .describe('Remaining untracked files.'),
      conflicted_files: z.array(z.string()).describe('Files with conflicts.'),
      is_clean: z
        .boolean()
        .describe('Whether working directory is clean (ready to commit).'),
    })
    .describe('Repository status after staging files.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitAddLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Build options object using modern spread syntax
  const { path: _path, files, ...rest } = input;
  const addOptions = {
    paths: files,
    ...rest,
  };

  const result = await provider.add(addOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  // Get repository status after staging
  const statusResult = await provider.status(
    { includeUntracked: true },
    {
      workingDirectory: targetPath,
      requestContext: appContext,
      tenantId: appContext.tenantId || 'default-tenant',
    },
  );

  // Helper to convert staged/unstaged changes to flat arrays
  const flattenChanges = (changes: {
    added?: string[];
    modified?: string[];
    deleted?: string[];
    renamed?: string[];
    copied?: string[];
  }): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    if (changes.added && changes.added.length > 0) result.added = changes.added;
    if (changes.modified && changes.modified.length > 0)
      result.modified = changes.modified;
    if (changes.deleted && changes.deleted.length > 0)
      result.deleted = changes.deleted;
    if (changes.renamed && changes.renamed.length > 0)
      result.renamed = changes.renamed;
    if (changes.copied && changes.copied.length > 0)
      result.copied = changes.copied;
    return result;
  };

  return {
    success: result.success,
    stagedFiles: result.stagedFiles,
    totalFiles: result.stagedFiles.length,
    status: {
      current_branch: statusResult.currentBranch,
      staged_changes: flattenChanges(statusResult.stagedChanges),
      unstaged_changes: flattenChanges(statusResult.unstagedChanges),
      untracked_files: statusResult.untrackedFiles,
      conflicted_files: statusResult.conflictedFiles,
      is_clean: statusResult.isClean,
    },
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const md = markdown();

  // Main heading
  md.h1('Files Staged Successfully', '✅');

  // Summary stats
  md.keyValue('Total Files Staged', result.totalFiles).blankLine();

  // List of staged files
  md.when(result.stagedFiles.length > 0, () => {
    md.section('Staged Files', 2, () => {
      md.list(result.stagedFiles);
    });
  });

  // Repository status after staging
  md.section('Repository Status After Staging', 2, () => {
    md.keyValue(
      'Branch',
      result.status.current_branch || 'detached HEAD',
    ).keyValue(
      'Ready to Commit',
      Object.keys(result.status.staged_changes).length > 0 ? 'Yes' : 'No',
    );

    // Show all staged changes (including those from this operation)
    const allStaged = Object.keys(result.status.staged_changes);
    md.when(allStaged.length > 0, () => {
      md.blankLine();
      md.h3('All Staged Changes');
      allStaged.forEach((type) => {
        const files = (
          result.status.staged_changes as Record<string, string[]>
        )[type];
        if (files && files.length > 0) {
          md.keyValue(type, `${files.length} file(s)`);
        }
      });
    });

    // Show remaining unstaged changes
    const unstaged = Object.keys(result.status.unstaged_changes);
    md.when(unstaged.length > 0, () => {
      md.blankLine();
      md.h3('Remaining Unstaged Changes');
      unstaged.forEach((type) => {
        const files = (
          result.status.unstaged_changes as Record<string, string[]>
        )[type];
        if (files && files.length > 0) {
          md.keyValue(type, `${files.length} file(s)`);
        }
      });
    });

    // Show untracked files
    md.when(result.status.untracked_files.length > 0, () => {
      md.blankLine();
      md.h3('Untracked Files');
      md.keyValue('Count', result.status.untracked_files.length);
    });
  });

  return [
    {
      type: 'text',
      text: md.build(),
    },
  ];
}

export const gitAddTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitAddLogic)),
  responseFormatter,
};
