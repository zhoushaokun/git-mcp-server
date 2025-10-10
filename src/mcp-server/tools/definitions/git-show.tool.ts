/**
 * @fileoverview Git show tool - inspect git objects
 * @module mcp-server/tools/definitions/git-show
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

const TOOL_NAME = 'git_show';
const TOOL_TITLE = 'Git Show';
const TOOL_DESCRIPTION =
  'Show details of a git object (commit, tree, blob, or tag). Displays commit information and the diff of changes introduced.';

const InputSchema = z.object({
  path: PathSchema,
  object: CommitRefSchema.describe(
    'Git object to show (commit hash, branch, tag, tree, or blob).',
  ),
  format: z
    .enum(['raw', 'json'])
    .optional()
    .describe('Output format for the git object.'),
  stat: z
    .boolean()
    .default(false)
    .describe('Show diffstat instead of full diff.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  object: z.string().describe('Object identifier.'),
  type: z
    .enum(['commit', 'tag', 'tree', 'blob'])
    .describe('Type of git object shown.'),
  content: z.string().describe('Formatted output showing the object details.'),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe('Additional metadata about the object.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitShowLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git show', { ...appContext, toolInput: input });

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

  // Build options object with only defined properties
  const showOptions: {
    object: string;
    format?: 'raw' | 'json';
    stat?: boolean;
  } = {
    object: input.object,
  };

  if (input.format !== undefined) {
    showOptions.format = input.format;
  }
  if (input.stat !== undefined) {
    showOptions.stat = input.stat;
  }

  const result = await provider.show(showOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: true,
    object: result.object,
    type: result.type,
    content: result.content,
    metadata: result.metadata,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const header = `# Git Show: ${result.type} ${result.object}\n\n`;

  const metadataSection =
    result.metadata && Object.keys(result.metadata).length > 0
      ? `## Metadata\n` +
        Object.entries(result.metadata)
          .map(([key, value]) => `**${key}:** ${String(value)}`)
          .join('\n') +
        `\n\n`
      : '';

  const content =
    result.content.length > 0
      ? `## Content\n\n\`\`\`\n${result.content.length > 50000 ? result.content.substring(0, 50000) + '\n... (truncated, output too large)' : result.content}\n\`\`\`\n`
      : '';

  return [
    { type: 'text', text: `${header}${metadataSection}${content}`.trim() },
  ];
}

export const gitShowTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], gitShowLogic),
  responseFormatter,
};
