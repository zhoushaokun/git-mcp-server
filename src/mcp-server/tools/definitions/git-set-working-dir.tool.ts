/**
 * @fileoverview Git set working directory tool - manage session working directory
 * @module mcp-server/tools/definitions/git-set-working-dir
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { logger, type RequestContext } from '@/utils/index.js';
import type { SdkContext, ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import type { StorageService } from '@/storage/core/StorageService.js';
import type { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';
import { validateGitRepository } from '@/services/git/providers/cli/utils/git-validators.js';

const TOOL_NAME = 'git_set_working_dir';
const TOOL_TITLE = 'Git Set Working Directory';
const TOOL_DESCRIPTION =
  'Set the session working directory for all git operations. This allows subsequent git commands to omit the path parameter and use this directory as the default.';

const InputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'Absolute path to the git repository to use as the working directory.',
    ),
  validateGitRepo: z
    .boolean()
    .default(true)
    .describe('Validate that the path is a Git repository.'),
  initializeIfNotPresent: z
    .boolean()
    .default(false)
    .describe("If not a Git repository, initialize it with 'git init'."),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  path: z.string().describe('The working directory that was set.'),
  message: z.string().describe('Confirmation message.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitSetWorkingDirLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git set working directory', {
    ...appContext,
    toolInput: input,
  });

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

  // Graceful degradation for tenantId
  const tenantId = appContext.tenantId || 'default-tenant';

  // Validate git repository if requested
  if (input.validateGitRepo) {
    try {
      await validateGitRepository(input.path, appContext);
      logger.debug('Git repository validation passed', {
        ...appContext,
        path: input.path,
      });
    } catch (error) {
      // If validation fails and initializeIfNotPresent is true, initialize the repo
      if (input.initializeIfNotPresent) {
        logger.info('Initializing git repository', {
          ...appContext,
          path: input.path,
        });

        await provider.init(
          {
            path: input.path,
            initialBranch: 'main',
            bare: false,
          },
          {
            workingDirectory: input.path,
            requestContext: appContext,
            tenantId,
          },
        );

        logger.info('Git repository initialized', {
          ...appContext,
          path: input.path,
        });
      } else {
        // Re-throw validation error if initializeIfNotPresent is false
        throw error;
      }
    }
  }

  // Store the working directory in session storage
  const storageKey = `session:workingDir:${tenantId}`;
  await storage.set(storageKey, input.path, appContext);

  logger.info('Session working directory set', {
    ...appContext,
    path: input.path,
    tenantId,
  });

  return {
    success: true,
    path: input.path,
    message: `Working directory set to: ${input.path}`,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const text =
    `# Working Directory Set\n\n` +
    `**Path:** ${result.path}\n\n` +
    `All subsequent git operations will use this directory by default. ` +
    `You can override this on a per-operation basis by providing an explicit path parameter.`;

  return [{ type: 'text', text }];
}

export const gitSetWorkingDirTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], gitSetWorkingDirLogic),
  responseFormatter,
};
