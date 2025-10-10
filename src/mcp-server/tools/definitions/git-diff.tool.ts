/**
 * @fileoverview Git diff tool - view differences between commits/files
 * @module mcp-server/tools/definitions/git-diff
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

const TOOL_NAME = 'git_diff';
const TOOL_TITLE = 'Git Diff';
const TOOL_DESCRIPTION =
  'View differences between commits, branches, or working tree. Shows changes in unified diff format.';

const InputSchema = z.object({
  path: PathSchema,
  target: CommitRefSchema.optional().describe(
    'Target commit/branch to compare against. If not specified, shows unstaged changes in working tree.',
  ),
  source: CommitRefSchema.optional().describe(
    'Source commit/branch to compare from. If target is specified but not source, compares target against working tree.',
  ),
  paths: z
    .array(z.string())
    .optional()
    .describe(
      'Limit diff to specific file paths (relative to repository root).',
    ),
  staged: z
    .boolean()
    .default(false)
    .describe('Show diff of staged changes instead of unstaged.'),
  includeUntracked: z
    .boolean()
    .default(false)
    .describe(
      'Include untracked files in the diff. Useful for reviewing all upcoming changes.',
    ),
  nameOnly: z
    .boolean()
    .default(false)
    .describe('Show only names of changed files, not the diff content.'),
  stat: z
    .boolean()
    .default(false)
    .describe(
      'Show diffstat (summary of changes) instead of full diff content.',
    ),
  contextLines: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(3)
    .describe('Number of context lines to show around changes.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  diff: z.string().describe('The diff output in unified diff format.'),
  filesChanged: z.number().int().describe('Number of files with differences.'),
  insertions: z
    .number()
    .int()
    .optional()
    .describe('Total number of line insertions.'),
  deletions: z
    .number()
    .int()
    .optional()
    .describe('Total number of line deletions.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitDiffLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git diff', { ...appContext, toolInput: input });

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
  const diffOptions: {
    target?: string;
    source?: string;
    paths?: string[];
    staged?: boolean;
    includeUntracked?: boolean;
    nameOnly?: boolean;
    stat?: boolean;
    contextLines?: number;
  } = {};

  if (input.target !== undefined) {
    diffOptions.target = input.target;
  }
  if (input.source !== undefined) {
    diffOptions.source = input.source;
  }
  if (input.paths !== undefined) {
    diffOptions.paths = input.paths;
  }
  if (input.staged !== undefined) {
    diffOptions.staged = input.staged;
  }
  if (input.includeUntracked !== undefined) {
    diffOptions.includeUntracked = input.includeUntracked;
  }
  if (input.nameOnly !== undefined) {
    diffOptions.nameOnly = input.nameOnly;
  }
  if (input.stat !== undefined) {
    diffOptions.stat = input.stat;
  }
  if (input.contextLines !== undefined) {
    diffOptions.contextLines = input.contextLines;
  }

  const result = await provider.diff(diffOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: true,
    diff: result.diff,
    filesChanged: result.filesChanged || 0,
    insertions: result.insertions,
    deletions: result.deletions,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = `# Git Diff\n\n`;

  const stats =
    `**Files Changed:** ${result.filesChanged}\n` +
    (result.insertions !== undefined
      ? `**Insertions:** +${result.insertions}\n`
      : '') +
    (result.deletions !== undefined
      ? `**Deletions:** -${result.deletions}\n`
      : '') +
    `\n`;

  const diffContent =
    result.diff.length > 0
      ? `## Diff Output\n\n\`\`\`diff\n${result.diff.length > 50000 ? result.diff.substring(0, 50000) + '\n... (truncated, diff too large)' : result.diff}\n\`\`\`\n`
      : `No differences found.\n`;

  return [{ type: 'text', text: `${summary}${stats}${diffContent}`.trim() }];
}

export const gitDiffTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], gitDiffLogic),
  responseFormatter,
};
