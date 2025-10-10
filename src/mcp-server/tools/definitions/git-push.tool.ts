/**
 * @fileoverview Git push tool - upload changes to remote repository
 * @module mcp-server/tools/definitions/git-push
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { logger, type RequestContext } from '@/utils/index.js';
import { resolveWorkingDirectory } from '../utils/git-validators.js';
import type { SdkContext, ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  PathSchema,
  RemoteNameSchema,
  BranchNameSchema,
  ForceSchema,
  DryRunSchema,
} from '../schemas/common.js';
import type { StorageService } from '@/storage/core/StorageService.js';
import type { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

const TOOL_NAME = 'git_push';
const TOOL_TITLE = 'Git Push';
const TOOL_DESCRIPTION =
  'Push changes to a remote repository. Uploads local commits to the remote branch.';

const InputSchema = z.object({
  path: PathSchema,
  remote: RemoteNameSchema.optional().describe(
    'Remote name (default: origin).',
  ),
  branch: BranchNameSchema.optional().describe(
    'Branch name (default: current branch).',
  ),
  force: ForceSchema.describe(
    'Force push (DANGEROUS - can overwrite remote history).',
  ),
  forceWithLease: z
    .boolean()
    .default(false)
    .describe(
      'Safer force push - only succeeds if remote branch is at expected state.',
    ),
  setUpstream: z
    .boolean()
    .default(false)
    .describe('Set upstream tracking relationship for the branch.'),
  tags: z.boolean().default(false).describe('Push all tags to the remote.'),
  dryRun: DryRunSchema,
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  remote: z.string().describe('Remote name that was pushed to.'),
  branch: z.string().describe('Branch that was pushed.'),
  upstreamSet: z
    .boolean()
    .describe('Whether upstream tracking was set for the branch.'),
  pushedRefs: z
    .array(z.string())
    .describe('References that were successfully pushed.'),
  rejectedRefs: z
    .array(z.string())
    .describe('References that were rejected by the remote.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitPushLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git push', { ...appContext, toolInput: input });

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

  const pushOptions: {
    remote?: string;
    branch?: string;
    force?: boolean;
    forceWithLease?: boolean;
    setUpstream?: boolean;
    tags?: boolean;
    dryRun?: boolean;
  } = {};

  if (input.remote !== undefined) {
    pushOptions.remote = input.remote;
  }
  if (input.branch !== undefined) {
    pushOptions.branch = input.branch;
  }
  if (input.force !== undefined) {
    pushOptions.force = input.force;
  }
  if (input.forceWithLease !== undefined) {
    pushOptions.forceWithLease = input.forceWithLease;
  }
  if (input.setUpstream !== undefined) {
    pushOptions.setUpstream = input.setUpstream;
  }
  if (input.tags !== undefined) {
    pushOptions.tags = input.tags;
  }
  if (input.dryRun !== undefined) {
    pushOptions.dryRun = input.dryRun;
  }

  const result = await provider.push(pushOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    remote: result.remote,
    branch: result.branch,
    upstreamSet: result.upstreamSet,
    pushedRefs: result.pushedRefs,
    rejectedRefs: result.rejectedRefs,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary =
    result.rejectedRefs.length > 0
      ? `# Push Failed (Some Refs Rejected) ⚠️\n\n`
      : `# Push Complete\n\n`;

  const info =
    `**Remote:** ${result.remote}\n` +
    `**Branch:** ${result.branch}\n` +
    (result.upstreamSet ? `**Upstream Set:** Yes\n` : '') +
    `\n`;

  const pushedSection =
    result.pushedRefs.length > 0
      ? `## Pushed References (${result.pushedRefs.length})\n${result.pushedRefs.map((ref) => `- ${ref}`).join('\n')}\n\n`
      : '';

  const rejectedSection =
    result.rejectedRefs.length > 0
      ? `## ⚠️ Rejected References (${result.rejectedRefs.length})\n${result.rejectedRefs.map((ref) => `- ${ref}`).join('\n')}\n\n` +
        `**Hint:** Pull the latest changes or use force-with-lease if you're sure.\n`
      : '';

  return [
    {
      type: 'text',
      text: `${summary}${info}${pushedSection}${rejectedSection}`.trim(),
    },
  ];
}

export const gitPushTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], gitPushLogic),
  responseFormatter,
};
