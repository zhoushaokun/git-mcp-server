/**
 * @fileoverview Git reset tool - reset current HEAD to specified state
 * @module mcp-server/tools/definitions/git-reset
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

const TOOL_NAME = 'git_reset';
const TOOL_TITLE = 'Git Reset';
const TOOL_DESCRIPTION =
  'Reset current HEAD to specified state. Can be used to unstage files (soft), discard commits (mixed), or discard all changes (hard).';

const InputSchema = z.object({
  path: PathSchema,
  mode: z
    .enum(['soft', 'mixed', 'hard', 'merge', 'keep'])
    .default('mixed')
    .describe(
      'Reset mode: soft (keep changes staged), mixed (unstage changes), hard (discard all changes), merge (reset and merge), keep (reset but keep local changes).',
    ),
  target: CommitRefSchema.optional().describe(
    'Target commit to reset to (default: HEAD).',
  ),
  paths: z
    .array(z.string())
    .optional()
    .describe('Specific file paths to reset (leaves HEAD unchanged).'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  mode: z.string().describe('Reset mode that was used.'),
  target: z.string().describe('Target commit that was reset to.'),
  filesReset: z
    .array(z.string())
    .describe('Files that were affected by the reset.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitResetLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git reset', { ...appContext, toolInput: input });

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

  const resetOptions: {
    mode: 'soft' | 'mixed' | 'hard' | 'merge' | 'keep';
    commit?: string;
    paths?: string[];
  } = {
    mode: input.mode,
  };

  if (input.target !== undefined) {
    resetOptions.commit = input.target;
  }
  if (input.paths !== undefined) {
    resetOptions.paths = input.paths;
  }

  const result = await provider.reset(resetOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    mode: result.mode,
    target: result.commit,
    filesReset: result.filesReset,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = `# Git Reset (${result.mode})\n\n`;
  const targetInfo = `**Reset to:** ${result.target}\n`;
  const modeDesc =
    result.mode === 'soft'
      ? '**Effect:** Commits discarded, changes kept staged\n'
      : result.mode === 'mixed'
        ? '**Effect:** Commits discarded, changes kept unstaged\n'
        : '**Effect:** ⚠️ All changes discarded permanently\n';

  const filesSection =
    result.filesReset.length > 0
      ? `\n**Files Affected (${result.filesReset.length}):**\n${result.filesReset.map((f) => `- ${f}`).join('\n')}\n`
      : '';

  return [
    {
      type: 'text',
      text: `${summary}${targetInfo}${modeDesc}${filesSection}`.trim(),
    },
  ];
}

export const gitResetTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], gitResetLogic),
  responseFormatter,
};
