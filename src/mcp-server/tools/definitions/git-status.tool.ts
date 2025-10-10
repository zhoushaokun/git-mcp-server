/**
 * @fileoverview Git status tool - show working tree status
 * @module mcp-server/tools/definitions/git-status
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { logger, type RequestContext } from '@/utils/index.js';
import { resolveWorkingDirectory } from '../utils/git-validators.js';
import type { SdkContext, ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema } from '../schemas/common.js';
import type { StorageService } from '@/storage/core/StorageService.js';
import type { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

const TOOL_NAME = 'git_status';
const TOOL_TITLE = 'Git Status';
const TOOL_DESCRIPTION =
  'Show the working tree status including staged, unstaged, and untracked files.';

const InputSchema = z.object({
  path: PathSchema,
  includeUntracked: z
    .boolean()
    .default(true)
    .describe('Include untracked files in the output.'),
});

const OutputSchema = z.object({
  currentBranch: z.string().nullable().describe('Current branch name.'),
  isClean: z.boolean().describe('True if working directory is clean.'),
  stagedChanges: z
    .object({
      added: z
        .array(z.string())
        .optional()
        .describe('Files added to the index (staged).'),
      modified: z
        .array(z.string())
        .optional()
        .describe('Files modified and staged.'),
      deleted: z
        .array(z.string())
        .optional()
        .describe('Files deleted and staged.'),
      renamed: z
        .array(z.string())
        .optional()
        .describe('Files renamed and staged.'),
      copied: z
        .array(z.string())
        .optional()
        .describe('Files copied and staged.'),
    })
    .describe('Changes that have been staged for the next commit.'),
  unstagedChanges: z
    .object({
      added: z
        .array(z.string())
        .optional()
        .describe('Files added but not staged.'),
      modified: z
        .array(z.string())
        .optional()
        .describe('Files modified but not staged.'),
      deleted: z
        .array(z.string())
        .optional()
        .describe('Files deleted but not staged.'),
    })
    .describe('Changes in the working directory that have not been staged.'),
  untrackedFiles: z
    .array(z.string())
    .describe('Files in the working directory not tracked by git.'),
  conflictedFiles: z
    .array(z.string())
    .describe('Files with merge conflicts that need resolution.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitStatusLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git status', { ...appContext, toolInput: input });

  // Resolve working directory and get provider via DI
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

  // Call provider's status method
  const result = await provider.status(
    {
      includeUntracked: input.includeUntracked,
    },
    {
      workingDirectory: targetPath,
      requestContext: appContext,
      tenantId: appContext.tenantId || 'default-tenant',
    },
  );

  return {
    currentBranch: result.currentBranch,
    isClean: result.isClean,
    stagedChanges: result.stagedChanges,
    unstagedChanges: result.unstagedChanges,
    untrackedFiles: result.untrackedFiles,
    conflictedFiles: result.conflictedFiles,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = `# Git Status${result.currentBranch ? `: ${result.currentBranch}` : ''}\n\n`;

  // Clean status
  if (result.isClean) {
    return [
      {
        type: 'text',
        text: `${summary}Working directory is clean - no changes to commit.`,
      },
    ];
  }

  // Conflicted files
  const conflictedSection =
    result.conflictedFiles.length > 0
      ? `## ⚠️ Conflicts (${result.conflictedFiles.length})\n${result.conflictedFiles.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';

  // Staged changes
  const stagedAdded =
    result.stagedChanges.added && result.stagedChanges.added.length > 0
      ? `### Added (${result.stagedChanges.added.length})\n${result.stagedChanges.added.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';
  const stagedModified =
    result.stagedChanges.modified && result.stagedChanges.modified.length > 0
      ? `### Modified (${result.stagedChanges.modified.length})\n${result.stagedChanges.modified.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';
  const stagedDeleted =
    result.stagedChanges.deleted && result.stagedChanges.deleted.length > 0
      ? `### Deleted (${result.stagedChanges.deleted.length})\n${result.stagedChanges.deleted.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';
  const stagedRenamed =
    result.stagedChanges.renamed && result.stagedChanges.renamed.length > 0
      ? `### Renamed (${result.stagedChanges.renamed.length})\n${result.stagedChanges.renamed.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';

  const stagedSection =
    stagedAdded || stagedModified || stagedDeleted || stagedRenamed
      ? `## Staged Changes\n\n${stagedAdded}${stagedModified}${stagedDeleted}${stagedRenamed}`
      : '';

  // Unstaged changes
  const unstagedModified =
    result.unstagedChanges.modified &&
    result.unstagedChanges.modified.length > 0
      ? `### Modified (${result.unstagedChanges.modified.length})\n${result.unstagedChanges.modified.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';
  const unstagedDeleted =
    result.unstagedChanges.deleted && result.unstagedChanges.deleted.length > 0
      ? `### Deleted (${result.unstagedChanges.deleted.length})\n${result.unstagedChanges.deleted.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';

  const unstagedSection =
    unstagedModified || unstagedDeleted
      ? `## Unstaged Changes\n\n${unstagedModified}${unstagedDeleted}`
      : '';

  // Untracked files
  const untrackedSection =
    result.untrackedFiles.length > 0
      ? `## Untracked Files (${result.untrackedFiles.length})\n${result.untrackedFiles.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';

  const text = `${summary}${conflictedSection}${stagedSection}${unstagedSection}${untrackedSection}`;

  return [{ type: 'text', text: text.trim() }];
}

export const gitStatusTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], gitStatusLogic),
  responseFormatter,
};
