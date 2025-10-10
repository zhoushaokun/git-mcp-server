/**
 * @fileoverview Git rebase tool - rebase commits onto another branch
 * @module mcp-server/tools/definitions/git-rebase
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { logger, type RequestContext } from '@/utils/index.js';
import { resolveWorkingDirectory } from '../utils/git-validators.js';
import type { SdkContext, ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema, CommitRefSchema } from '../schemas/common.js';
import type { StorageService } from '@/storage/core/StorageService.js';
import type { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

const TOOL_NAME = 'git_rebase';
const TOOL_TITLE = 'Git Rebase';
const TOOL_DESCRIPTION =
  'Rebase commits onto another branch. Reapplies commits on top of another base tip for a cleaner history.';

const InputSchema = z.object({
  path: PathSchema,
  upstream: CommitRefSchema.describe('Upstream branch to rebase onto.'),
  branch: CommitRefSchema.optional().describe(
    'Branch to rebase (default: current branch).',
  ),
  interactive: z
    .boolean()
    .default(false)
    .describe('Interactive rebase (not supported in all providers).'),
  onto: CommitRefSchema.optional().describe(
    'Rebase onto different commit than upstream.',
  ),
  preserve: z
    .boolean()
    .default(false)
    .describe('Preserve merge commits during rebase.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  conflicts: z.boolean().describe('Whether rebase had conflicts.'),
  conflictedFiles: z
    .array(z.string())
    .describe('Files with conflicts that need resolution.'),
  rebasedCommits: z
    .number()
    .int()
    .describe('Number of commits that were rebased.'),
  currentCommit: z
    .string()
    .optional()
    .describe('Current commit hash if rebase stopped due to conflict.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitRebaseLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git rebase', { ...appContext, toolInput: input });

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

  const rebaseOptions: {
    upstream: string;
    branch?: string;
    interactive?: boolean;
    onto?: string;
    preserve?: boolean;
  } = {
    upstream: input.upstream,
  };

  if (input.branch !== undefined) {
    rebaseOptions.branch = input.branch;
  }
  if (input.interactive !== undefined) {
    rebaseOptions.interactive = input.interactive;
  }
  if (input.onto !== undefined) {
    rebaseOptions.onto = input.onto;
  }
  if (input.preserve !== undefined) {
    rebaseOptions.preserve = input.preserve;
  }

  const result = await provider.rebase(rebaseOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    conflicts: result.conflicts,
    conflictedFiles: result.conflictedFiles,
    rebasedCommits: result.rebasedCommits,
    currentCommit: result.currentCommit,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = result.conflicts
    ? `# Rebase Has Conflicts ⚠️\n\n`
    : `# Rebase Complete\n\n`;

  const stats = `**Commits Rebased:** ${result.rebasedCommits}\n`;
  const currentInfo = result.currentCommit
    ? `**Stopped At:** ${result.currentCommit.substring(0, 7)}\n`
    : '';

  const conflictsSection = result.conflicts
    ? `\n## ⚠️ Conflicts (${result.conflictedFiles.length})\n` +
      `${result.conflictedFiles.map((f) => `- ${f}`).join('\n')}\n\n` +
      `**Action Required:** Resolve conflicts, then continue or abort rebase.\n`
    : '';

  return [
    {
      type: 'text',
      text: `${summary}${stats}${currentInfo}${conflictsSection}`.trim(),
    },
  ];
}

export const gitRebaseTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], gitRebaseLogic),
  responseFormatter,
};
