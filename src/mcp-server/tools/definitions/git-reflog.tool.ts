/**
 * @fileoverview Git reflog tool - view reference logs
 * @module mcp-server/tools/definitions/git-reflog
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { logger, type RequestContext } from '@/utils/index.js';

import { resolveWorkingDirectory } from '../utils/git-validators.js';
import type { SdkContext, ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema, LimitSchema } from '../schemas/common.js';
import type { StorageService } from '@/storage/core/StorageService.js';
import type { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

const TOOL_NAME = 'git_reflog';
const TOOL_TITLE = 'Git Reflog';
const TOOL_DESCRIPTION =
  'View the reference logs (reflog) to track when branch tips and other references were updated. Useful for recovering lost commits.';

const InputSchema = z.object({
  path: PathSchema,
  ref: z
    .string()
    .optional()
    .describe('Show reflog for specific reference (default: HEAD).'),
  maxCount: LimitSchema.describe('Limit number of reflog entries.'),
});

const ReflogEntrySchema = z.object({
  hash: z.string().describe('Commit hash for this reflog entry.'),
  refName: z.string().describe('Reference name (e.g., HEAD@{0}, main@{1}).'),
  action: z
    .string()
    .describe('Action that caused this reflog entry (commit, checkout, etc.).'),
  message: z.string().describe('Detailed message describing the action.'),
  timestamp: z
    .number()
    .int()
    .describe('Unix timestamp when this action occurred.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  ref: z.string().describe('The reference that was queried.'),
  entries: z
    .array(ReflogEntrySchema)
    .describe('Array of reflog entries in reverse chronological order.'),
  totalEntries: z.number().int().describe('Total number of reflog entries.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitReflogLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git reflog', { ...appContext, toolInput: input });

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

  // Call provider's reflog method - it handles execution and parsing
  // Build options object with only defined properties
  const reflogOptions: {
    ref?: string;
    maxCount?: number;
  } = {};

  if (input.ref !== undefined) {
    reflogOptions.ref = input.ref;
  }
  if (input.maxCount !== undefined) {
    reflogOptions.maxCount = input.maxCount;
  }

  const result = await provider.reflog(reflogOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    ref: result.ref,
    entries: result.entries,
    totalEntries: result.totalEntries,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const { ref, entries, totalEntries } = result;

  const header = `# Git Reflog: ${ref}\n\n`;
  const stats = `**Total Entries:** ${totalEntries}\n\n`;

  const formattedEntries = entries
    .map((entry) => {
      const shortHash = entry.hash.substring(0, 7);
      const date = new Date(entry.timestamp * 1000).toISOString();

      return [
        `## ${entry.refName}`,
        `**Commit:** ${shortHash}`,
        `**Date:** ${date}`,
        `**Action:** ${entry.message}`,
        '',
      ].join('\n');
    })
    .join('\n');

  return [
    {
      type: 'text',
      text: `${header}${stats}${formattedEntries}`,
    },
  ];
}

export const gitReflogTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], gitReflogLogic),
  responseFormatter,
};
