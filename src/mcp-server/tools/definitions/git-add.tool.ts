/**
 * @fileoverview Git add tool - stage files for commit
 * @module mcp-server/tools/definitions/git-add
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { logger, type RequestContext } from '@/utils/index.js';
import { resolveWorkingDirectory } from '../utils/git-validators.js';
import type { SdkContext, ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema, AllSchema } from '../schemas/common.js';
import type { StorageService } from '@/storage/core/StorageService.js';
import type { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

const TOOL_NAME = 'git_add';
const TOOL_TITLE = 'Git Add';
const TOOL_DESCRIPTION =
  'Stage files for commit. Add file contents to the staging area (index) to prepare for the next commit.';

const InputSchema = z.object({
  path: PathSchema,
  files: z
    .array(z.string())
    .min(1)
    .describe(
      'Array of file paths to stage (relative to repository root). Use ["."] to stage all changes.',
    ),
  update: z
    .boolean()
    .default(false)
    .describe('Stage only modified and deleted files (skip untracked files).'),
  all: AllSchema,
  force: z
    .boolean()
    .default(false)
    .describe('Allow adding otherwise ignored files.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  stagedFiles: z
    .array(z.string())
    .describe('Files that were successfully staged.'),
  totalFiles: z.number().int().describe('Total number of files staged.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitAddLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git add', { ...appContext, toolInput: input });

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
  const addOptions: {
    paths: string[];
    update?: boolean;
    all?: boolean;
    force?: boolean;
  } = {
    paths: input.files,
  };

  if (input.update !== undefined) {
    addOptions.update = input.update;
  }
  if (input.all !== undefined) {
    addOptions.all = input.all;
  }
  if (input.force !== undefined) {
    addOptions.force = input.force;
  }

  const result = await provider.add(addOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    stagedFiles: result.stagedFiles,
    totalFiles: result.stagedFiles.length,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = `# Files Staged Successfully\n\n`;
  const stats = `**Total Files Staged:** ${result.totalFiles}\n\n`;

  const fileList =
    result.stagedFiles.length > 0
      ? `## Staged Files\n${result.stagedFiles.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';

  const message = `${summary}${stats}${fileList}These files are now in the staging area and ready to be committed.`;

  return [{ type: 'text', text: message.trim() }];
}

export const gitAddTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], gitAddLogic),
  responseFormatter,
};
