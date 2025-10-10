/**
 * @fileoverview Git init tool - initialize a new repository
 * @module mcp-server/tools/definitions/git-init
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

const TOOL_NAME = 'git_init';
const TOOL_TITLE = 'Git Init';
const TOOL_DESCRIPTION =
  'Initialize a new Git repository at the specified path. Creates a .git directory and sets up the initial branch.';

const InputSchema = z.object({
  path: PathSchema,
  initialBranch: z
    .string()
    .optional()
    .describe('Name of the initial branch (default: main).'),
  bare: z
    .boolean()
    .default(false)
    .describe('Create a bare repository (no working directory).'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  path: z.string().describe('Path where repository was initialized.'),
  initialBranch: z.string().describe('Name of the initial branch.'),
  isBare: z.boolean().describe('Whether this is a bare repository.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitInitLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git init', { ...appContext, toolInput: input });

  // Resolve dependencies via DI
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

  // Resolve working directory (handles '.' and absolute paths)
  const targetPath = await resolveWorkingDirectory(
    input.path,
    appContext,
    storage,
  );

  // Call provider's init method
  // Build options object with only defined properties to satisfy exactOptionalPropertyTypes
  const initOptions: {
    path: string;
    initialBranch?: string;
    bare?: boolean;
  } = {
    path: targetPath,
    bare: input.bare,
  };

  if (input.initialBranch !== undefined) {
    initOptions.initialBranch = input.initialBranch;
  }

  const result = await provider.init(initOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    path: result.path,
    initialBranch: result.initialBranch,
    isBare: result.bare,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = `# Repository Initialized\n\n`;
  const details =
    `**Path:** ${result.path}\n` +
    `**Initial Branch:** ${result.initialBranch}\n` +
    `**Type:** ${result.isBare ? 'Bare repository' : 'Standard repository'}\n\n` +
    `The repository has been successfully initialized and is ready for use.`;

  return [{ type: 'text', text: `${summary}${details}` }];
}

export const gitInitTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], gitInitLogic),
  responseFormatter,
};
