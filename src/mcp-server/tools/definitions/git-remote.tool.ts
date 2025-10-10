/**
 * @fileoverview Git remote tool - manage remote repositories
 * @module mcp-server/tools/definitions/git-remote
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { logger, type RequestContext } from '@/utils/index.js';
import { resolveWorkingDirectory } from '../utils/git-validators.js';
import type { SdkContext, ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema, RemoteNameSchema } from '../schemas/common.js';
import type { StorageService } from '@/storage/core/StorageService.js';
import type { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

const TOOL_NAME = 'git_remote';
const TOOL_TITLE = 'Git Remote';
const TOOL_DESCRIPTION =
  'Manage remote repositories: list remotes, add new remotes, remove remotes, rename remotes, or get/set remote URLs.';

const InputSchema = z.object({
  path: PathSchema,
  mode: z
    .enum(['list', 'add', 'remove', 'rename', 'get-url', 'set-url'])
    .default('list')
    .describe('The remote operation to perform.'),
  name: RemoteNameSchema.optional().describe(
    'Remote name for add/remove/rename/get-url/set-url operations.',
  ),
  url: z
    .string()
    .url()
    .optional()
    .describe('Remote URL for add/set-url operations.'),
  newName: RemoteNameSchema.optional().describe(
    'New remote name for rename operation.',
  ),
  push: z
    .boolean()
    .default(false)
    .describe('Set push URL separately (for set-url operation).'),
});

const RemoteInfoSchema = z.object({
  name: z.string().describe('Remote name.'),
  fetchUrl: z.string().describe('Fetch URL.'),
  pushUrl: z.string().describe('Push URL (may differ from fetch URL).'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  mode: z.string().describe('Operation mode that was performed.'),
  remotes: z
    .array(RemoteInfoSchema)
    .optional()
    .describe('List of remotes (for list mode).'),
  added: z
    .object({
      name: z.string(),
      url: z.string(),
    })
    .optional()
    .describe('Added remote (for add mode).'),
  removed: z
    .string()
    .optional()
    .describe('Removed remote name (for remove mode).'),
  renamed: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .optional()
    .describe('Rename information (for rename mode).'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitRemoteLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git remote', { ...appContext, toolInput: input });

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

  const remoteOptions: {
    mode: 'list' | 'add' | 'remove' | 'rename' | 'get-url' | 'set-url';
    name?: string;
    url?: string;
    newName?: string;
    push?: boolean;
  } = {
    mode: input.mode,
  };

  if (input.name !== undefined) {
    remoteOptions.name = input.name;
  }
  if (input.url !== undefined) {
    remoteOptions.url = input.url;
  }
  if (input.newName !== undefined) {
    remoteOptions.newName = input.newName;
  }
  if (input.push !== undefined) {
    remoteOptions.push = input.push;
  }

  const result = await provider.remote(remoteOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: true,
    mode: result.mode,
    remotes: result.remotes,
    added: result.added,
    removed: result.removed,
    renamed: result.renamed,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const header = `# Git Remote - ${result.mode.charAt(0).toUpperCase() + result.mode.slice(1)}\n\n`;

  if (result.mode === 'list' && result.remotes) {
    const remoteList = result.remotes
      .map(
        (remote) =>
          `**${remote.name}**\n  Fetch: ${remote.fetchUrl}\n  Push:  ${remote.pushUrl}`,
      )
      .join('\n\n');
    return [{ type: 'text', text: `${header}${remoteList}` }];
  }

  if (result.added) {
    return [
      {
        type: 'text',
        text: `${header}Remote '${result.added.name}' added with URL: ${result.added.url}`,
      },
    ];
  }

  if (result.removed) {
    return [
      { type: 'text', text: `${header}Remote '${result.removed}' removed.` },
    ];
  }

  if (result.renamed) {
    return [
      {
        type: 'text',
        text: `${header}Remote '${result.renamed.from}' renamed to '${result.renamed.to}'.`,
      },
    ];
  }

  return [{ type: 'text', text: `${header}Operation completed successfully.` }];
}

export const gitRemoteTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], gitRemoteLogic),
  responseFormatter,
};
