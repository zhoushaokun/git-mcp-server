/**
 * @fileoverview Git commit tool - create a new commit
 * @module mcp-server/tools/definitions/git-commit
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { logger, type RequestContext } from '@/utils/index.js';
import { resolveWorkingDirectory } from '../utils/git-validators.js';
import type { SdkContext, ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  PathSchema,
  CommitMessageSchema,
  SignSchema,
  NoVerifySchema,
} from '../schemas/common.js';
import type { StorageService } from '@/storage/core/StorageService.js';
import type { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

const TOOL_NAME = 'git_commit';
const TOOL_TITLE = 'Git Commit';
const TOOL_DESCRIPTION =
  'Create a new commit with staged changes in the repository. Records a snapshot of the staging area with a commit message.';

const InputSchema = z.object({
  path: PathSchema,
  message: CommitMessageSchema,
  author: z
    .object({
      name: z.string().min(1).describe("Author's name"),
      email: z.string().email().describe("Author's email address"),
    })
    .optional()
    .describe('Override commit author (defaults to git config).'),
  amend: z
    .boolean()
    .default(false)
    .describe(
      'Amend the previous commit instead of creating a new one. Use with caution.',
    ),
  allowEmpty: z
    .boolean()
    .default(false)
    .describe('Allow creating a commit with no changes.'),
  sign: SignSchema,
  noVerify: NoVerifySchema,
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  commitHash: z.string().describe('SHA-1 hash of the created commit.'),
  message: z.string().describe('The commit message.'),
  author: z.string().describe('Author of the commit.'),
  timestamp: z
    .number()
    .int()
    .describe('Unix timestamp when the commit was created.'),
  filesChanged: z
    .number()
    .int()
    .optional()
    .describe('Number of files changed in this commit.'),
  insertions: z
    .number()
    .int()
    .optional()
    .describe('Number of line insertions.'),
  deletions: z.number().int().optional().describe('Number of line deletions.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitCommitLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git commit', { ...appContext, toolInput: input });

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
  const commitOptions: {
    message: string;
    author?: { name: string; email: string };
    amend?: boolean;
    allowEmpty?: boolean;
    sign?: boolean;
    noVerify?: boolean;
  } = {
    message: input.message,
  };

  if (input.author !== undefined) {
    commitOptions.author = input.author;
  }
  if (input.amend !== undefined) {
    commitOptions.amend = input.amend;
  }
  if (input.allowEmpty !== undefined) {
    commitOptions.allowEmpty = input.allowEmpty;
  }
  if (input.sign !== undefined) {
    commitOptions.sign = input.sign;
  }
  if (input.noVerify !== undefined) {
    commitOptions.noVerify = input.noVerify;
  }

  const result = await provider.commit(commitOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    commitHash: result.commitHash,
    message: result.message,
    author: result.author,
    timestamp: result.timestamp,
    filesChanged: result.filesChanged.length,
    insertions: undefined,
    deletions: undefined,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = `# Commit Created Successfully\n\n`;
  const commitInfo =
    `**Commit Hash:** ${result.commitHash}\n` +
    `**Author:** ${result.author}\n` +
    `**Date:** ${new Date(result.timestamp * 1000).toISOString()}\n` +
    `**Message:** ${result.message}\n\n`;

  const stats =
    result.filesChanged !== undefined
      ? `## Changes\n` +
        `- **Files Changed:** ${result.filesChanged}\n` +
        (result.insertions !== undefined
          ? `- **Insertions:** +${result.insertions}\n`
          : '') +
        (result.deletions !== undefined
          ? `- **Deletions:** -${result.deletions}\n`
          : '') +
        `\n`
      : '';

  return [{ type: 'text', text: `${summary}${commitInfo}${stats}`.trim() }];
}

export const gitCommitTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], gitCommitLogic),
  responseFormatter,
};
