/**
 * @fileoverview Git fetch tool - download objects and refs from remote
 * @module mcp-server/tools/definitions/git-fetch
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
  PruneSchema,
  DepthSchema,
} from '../schemas/common.js';
import type { StorageService } from '@/storage/core/StorageService.js';
import type { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

const TOOL_NAME = 'git_fetch';
const TOOL_TITLE = 'Git Fetch';
const TOOL_DESCRIPTION =
  'Fetch updates from a remote repository. Downloads objects and refs without merging them.';

const InputSchema = z.object({
  path: PathSchema,
  remote: RemoteNameSchema.optional().describe(
    'Remote name (default: origin).',
  ),
  prune: PruneSchema,
  tags: z.boolean().default(false).describe('Fetch all tags from the remote.'),
  depth: DepthSchema,
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  remote: z.string().describe('Remote name that was fetched from.'),
  fetchedRefs: z
    .array(z.string())
    .describe('References that were fetched from the remote.'),
  prunedRefs: z
    .array(z.string())
    .describe('References that were pruned (deleted locally).'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitFetchLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git fetch', { ...appContext, toolInput: input });

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

  const fetchOptions: {
    remote?: string;
    prune?: boolean;
    tags?: boolean;
    depth?: number;
  } = {};

  if (input.remote !== undefined) {
    fetchOptions.remote = input.remote;
  }
  if (input.prune !== undefined) {
    fetchOptions.prune = input.prune;
  }
  if (input.tags !== undefined) {
    fetchOptions.tags = input.tags;
  }
  if (input.depth !== undefined) {
    fetchOptions.depth = input.depth;
  }

  const result = await provider.fetch(fetchOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    remote: result.remote,
    fetchedRefs: result.fetchedRefs,
    prunedRefs: result.prunedRefs,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = `# Fetch Complete from '${result.remote}'\n\n`;

  const fetchedSection =
    result.fetchedRefs.length > 0
      ? `## Fetched References (${result.fetchedRefs.length})\n${result.fetchedRefs.map((ref) => `- ${ref}`).join('\n')}\n\n`
      : '';

  const prunedSection =
    result.prunedRefs.length > 0
      ? `## Pruned References (${result.prunedRefs.length})\n${result.prunedRefs.map((ref) => `- ${ref}`).join('\n')}\n`
      : '';

  const message =
    result.fetchedRefs.length === 0 && result.prunedRefs.length === 0
      ? 'Already up to date.'
      : '';

  return [
    {
      type: 'text',
      text: `${summary}${fetchedSection}${prunedSection}${message}`.trim(),
    },
  ];
}

export const gitFetchTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], gitFetchLogic),
  responseFormatter,
};
