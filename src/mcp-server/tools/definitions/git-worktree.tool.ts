/**
 * @fileoverview Git worktree tool - manage multiple working trees
 * @module mcp-server/tools/definitions/git-worktree
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { logger, type RequestContext } from '@/utils/index.js';
import { resolveWorkingDirectory } from '../utils/git-validators.js';
import type { SdkContext, ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  PathSchema,
  BranchNameSchema,
  CommitRefSchema,
} from '../schemas/common.js';
import type { StorageService } from '@/storage/core/StorageService.js';
import type { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

const TOOL_NAME = 'git_worktree';
const TOOL_TITLE = 'Git Worktree';
const TOOL_DESCRIPTION =
  'Manage multiple working trees: list worktrees, add new worktrees for parallel work, remove worktrees, or move worktrees to new locations.';

const InputSchema = z.object({
  path: PathSchema,
  mode: z
    .enum(['list', 'add', 'remove', 'move', 'prune'])
    .default('list')
    .describe('The worktree operation to perform.'),
  worktreePath: z
    .string()
    .optional()
    .describe('Path for the new worktree (for add/move operations).'),
  branch: BranchNameSchema.optional().describe(
    'Branch to checkout in the new worktree (for add operation).',
  ),
  commitish: CommitRefSchema.optional().describe(
    'Commit/branch to base the worktree on (for add operation).',
  ),
  force: z
    .boolean()
    .default(false)
    .describe(
      'Force operation (for remove operation with uncommitted changes).',
    ),
  newPath: z
    .string()
    .optional()
    .describe('New path for the worktree (for move operation).'),
});

const WorktreeInfoSchema = z.object({
  path: z.string().describe('Absolute path to the worktree.'),
  head: z.string().describe('HEAD commit hash in this worktree.'),
  branch: z
    .string()
    .optional()
    .describe('Branch checked out (if not detached).'),
  bare: z.boolean().describe('Whether worktree is bare.'),
  detached: z.boolean().describe('Whether HEAD is detached.'),
  locked: z.boolean().describe('Whether the worktree is locked.'),
  prunable: z.boolean().describe('Whether the worktree can be pruned.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  mode: z.string().describe('Operation mode that was performed.'),
  worktrees: z
    .array(WorktreeInfoSchema)
    .optional()
    .describe('List of worktrees (for list mode).'),
  added: z.string().optional().describe('Added worktree path (for add mode).'),
  removed: z
    .string()
    .optional()
    .describe('Removed worktree path (for remove mode).'),
  moved: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .optional()
    .describe('Move operation info (for move mode).'),
  pruned: z
    .array(z.string())
    .optional()
    .describe('Pruned worktree paths (for prune mode).'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitWorktreeLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git worktree', { ...appContext, toolInput: input });

  const { container } = await import('tsyringe');
  const {
    StorageService: StorageServiceToken,
    GitProviderFactory: GitProviderFactoryToken,
  } = await import('@/container/tokens.js');

  const storage = container.resolve<StorageService>(StorageServiceToken);
  const factory = container.resolve<GitProviderFactory>(
    GitProviderFactoryToken,
  );
  const provider = await factory.getProvider();

  const targetPath = await resolveWorkingDirectory(
    input.path,
    appContext,
    storage,
  );

  const worktreeOptions: {
    mode: 'list' | 'add' | 'remove' | 'move' | 'prune';
    path?: string;
    branch?: string;
    commitish?: string;
    force?: boolean;
    newPath?: string;
  } = {
    mode: input.mode,
  };

  if (input.worktreePath !== undefined) {
    worktreeOptions.path = input.worktreePath;
  }
  if (input.branch !== undefined) {
    worktreeOptions.branch = input.branch;
  }
  if (input.commitish !== undefined) {
    worktreeOptions.commitish = input.commitish;
  }
  if (input.force !== undefined) {
    worktreeOptions.force = input.force;
  }
  if (input.newPath !== undefined) {
    worktreeOptions.newPath = input.newPath;
  }

  const result = await provider.worktree(worktreeOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: true,
    mode: result.mode,
    worktrees: result.worktrees,
    added: result.added,
    removed: result.removed,
    moved: result.moved,
    pruned: result.pruned,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const header = `# Git Worktree - ${result.mode.charAt(0).toUpperCase() + result.mode.slice(1)}\n\n`;

  if (result.mode === 'list' && result.worktrees) {
    if (result.worktrees.length === 0) {
      return [{ type: 'text', text: `${header}No worktrees found.` }];
    }

    const worktreeList = result.worktrees
      .map(
        (wt) =>
          `**${wt.path}**\n` +
          `  ${wt.detached ? 'Detached HEAD' : wt.branch ? `Branch: ${wt.branch}` : 'No branch'}\n` +
          `  HEAD: ${wt.head.substring(0, 7)}\n` +
          (wt.bare ? `  Type: Bare\n` : '') +
          (wt.locked ? `  Status: 🔒 Locked\n` : '') +
          (wt.prunable ? `  Status: ⚠️ Prunable\n` : ''),
      )
      .join('\n');

    return [{ type: 'text', text: `${header}${worktreeList}` }];
  }

  if (result.added) {
    return [
      {
        type: 'text',
        text: `${header}Worktree added at: ${result.added}`,
      },
    ];
  }

  if (result.removed) {
    return [
      { type: 'text', text: `${header}Worktree removed: ${result.removed}` },
    ];
  }

  if (result.moved) {
    return [
      {
        type: 'text',
        text: `${header}Worktree moved:\n**From:** ${result.moved.from}\n**To:** ${result.moved.to}`,
      },
    ];
  }

  if (result.pruned && result.pruned.length > 0) {
    return [
      {
        type: 'text',
        text: `${header}Pruned ${result.pruned.length} worktree(s):\n${result.pruned.map((p) => `- ${p}`).join('\n')}`,
      },
    ];
  }

  return [{ type: 'text', text: `${header}Operation completed.` }];
}

export const gitWorktreeTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], gitWorktreeLogic),
  responseFormatter,
};
