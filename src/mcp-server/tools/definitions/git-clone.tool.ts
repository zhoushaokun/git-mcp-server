/**
 * @fileoverview Git clone tool - clone a repository from a remote URL
 * @module mcp-server/tools/definitions/git-clone
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { logger, type RequestContext } from '@/utils/index.js';
import type { SdkContext, ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { DepthSchema } from '../schemas/common.js';
import type { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

const TOOL_NAME = 'git_clone';
const TOOL_TITLE = 'Git Clone';
const TOOL_DESCRIPTION =
  'Clone a repository from a remote URL to a local path. Supports HTTP/HTTPS and SSH URLs, with optional shallow cloning.';

const InputSchema = z.object({
  url: z.string().url().describe('Remote repository URL to clone from.'),
  localPath: z
    .string()
    .min(1)
    .describe('Local path where the repository should be cloned.'),
  branch: z
    .string()
    .optional()
    .describe('Specific branch to clone (defaults to remote HEAD).'),
  depth: DepthSchema,
  bare: z
    .boolean()
    .default(false)
    .describe('Create a bare repository (no working directory).'),
  mirror: z
    .boolean()
    .default(false)
    .describe('Create a mirror clone (implies bare).'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  remoteUrl: z.string().describe('The remote URL that was cloned.'),
  localPath: z.string().describe('Local path where repository was cloned.'),
  branch: z.string().describe('The branch that was checked out.'),
  commitHash: z.string().optional().describe('Current HEAD commit hash.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitCloneLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git clone', { ...appContext, toolInput: input });

  // Resolve dependencies via DI
  const { container } = await import('tsyringe');
  const { GitProviderFactory: GitProviderFactoryToken } = await import(
    '@/container/tokens.js'
  );

  const factory = container.resolve<GitProviderFactory>(
    GitProviderFactoryToken,
  );
  const provider = await factory.getProvider();

  // Call provider's clone method
  // Build options object with only defined properties to satisfy exactOptionalPropertyTypes
  const cloneOptions: {
    remoteUrl: string;
    localPath: string;
    branch?: string;
    depth?: number;
    bare?: boolean;
    mirror?: boolean;
    recurseSubmodules?: boolean;
  } = {
    remoteUrl: input.url,
    localPath: input.localPath,
    bare: input.bare,
    mirror: input.mirror,
  };

  if (input.branch !== undefined) {
    cloneOptions.branch = input.branch;
  }
  if (input.depth !== undefined) {
    cloneOptions.depth = input.depth;
  }

  const result = await provider.clone(cloneOptions, {
    workingDirectory: input.localPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    remoteUrl: result.remoteUrl,
    localPath: result.localPath,
    branch: result.branch,
    commitHash: undefined,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = `# Repository Cloned Successfully\n\n`;
  const details =
    `**Remote URL:** ${result.remoteUrl}\n` +
    `**Local Path:** ${result.localPath}\n` +
    `**Branch:** ${result.branch}\n` +
    (result.commitHash ? `**Current Commit:** ${result.commitHash}\n` : '') +
    `\nThe repository has been successfully cloned and is ready for use.`;

  return [{ type: 'text', text: `${summary}${details}` }];
}

export const gitCloneTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], gitCloneLogic),
  responseFormatter,
};
