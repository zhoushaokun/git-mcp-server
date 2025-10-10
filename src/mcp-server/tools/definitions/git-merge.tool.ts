/**
 * @fileoverview Git merge tool - merge branches
 * @module mcp-server/tools/definitions/git-merge
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
  MergeStrategySchema,
  CommitMessageSchema,
} from '../schemas/common.js';
import type { StorageService } from '@/storage/core/StorageService.js';
import type { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

const TOOL_NAME = 'git_merge';
const TOOL_TITLE = 'Git Merge';
const TOOL_DESCRIPTION =
  'Merge branches together. Integrates changes from another branch into the current branch with optional merge strategies.';

const InputSchema = z.object({
  path: PathSchema,
  branch: BranchNameSchema.describe('Branch to merge into current branch.'),
  strategy: MergeStrategySchema,
  noFastForward: z
    .boolean()
    .default(false)
    .describe('Prevent fast-forward merge (create merge commit).'),
  squash: z
    .boolean()
    .default(false)
    .describe('Squash all commits from the branch into a single commit.'),
  message: CommitMessageSchema.optional().describe(
    'Custom merge commit message.',
  ),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  strategy: z.string().describe('Merge strategy used.'),
  fastForward: z.boolean().describe('Whether merge was fast-forward.'),
  conflicts: z.boolean().describe('Whether merge had conflicts.'),
  conflictedFiles: z
    .array(z.string())
    .describe('Files with conflicts that need resolution.'),
  mergedFiles: z.array(z.string()).describe('Files that were merged.'),
  message: z.string().describe('Merge commit message.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitMergeLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git merge', { ...appContext, toolInput: input });

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

  const mergeOptions: {
    branch: string;
    strategy?: 'ort' | 'recursive' | 'octopus' | 'ours' | 'subtree';
    noFastForward?: boolean;
    squash?: boolean;
    message?: string;
  } = {
    branch: input.branch,
  };

  if (input.strategy !== undefined) {
    mergeOptions.strategy = input.strategy;
  }
  if (input.noFastForward !== undefined) {
    mergeOptions.noFastForward = input.noFastForward;
  }
  if (input.squash !== undefined) {
    mergeOptions.squash = input.squash;
  }
  if (input.message !== undefined) {
    mergeOptions.message = input.message;
  }

  const result = await provider.merge(mergeOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    strategy: result.strategy,
    fastForward: result.fastForward,
    conflicts: result.conflicts,
    conflictedFiles: result.conflictedFiles,
    mergedFiles: result.mergedFiles,
    message: result.message,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = result.conflicts
    ? `# Merge Has Conflicts ⚠️\n\n`
    : result.fastForward
      ? `# Fast-Forward Merge Complete\n\n`
      : `# Merge Complete\n\n`;

  const info =
    `**Strategy:** ${result.strategy}\n` +
    `**Fast-Forward:** ${result.fastForward ? 'Yes' : 'No'}\n` +
    `**Message:** ${result.message}\n\n`;

  const conflictsSection = result.conflicts
    ? `## ⚠️ Conflicts (${result.conflictedFiles.length})\n` +
      `${result.conflictedFiles.map((f) => `- ${f}`).join('\n')}\n\n` +
      `**Action Required:** Resolve conflicts and commit the merge.\n\n`
    : '';

  const mergedSection =
    result.mergedFiles.length > 0
      ? `## Merged Files (${result.mergedFiles.length})\n${result.mergedFiles.map((f) => `- ${f}`).join('\n')}\n`
      : '';

  return [
    {
      type: 'text',
      text: `${summary}${info}${conflictsSection}${mergedSection}`.trim(),
    },
  ];
}

export const gitMergeTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], gitMergeLogic),
  responseFormatter,
};
