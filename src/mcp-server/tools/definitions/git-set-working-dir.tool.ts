/**
 * @fileoverview Git set working directory tool - manage session working directory
 * @module mcp-server/tools/definitions/git-set-working-dir
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

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
  { provider, storage, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Graceful degradation for tenantId
  const tenantId = appContext.tenantId || 'default-tenant';

  // Validate git repository if requested (using provider interface instead of direct CLI import)
  if (input.validateGitRepo) {
    try {
      await provider.validateRepository(input.path, {
        workingDirectory: input.path,
        requestContext: appContext,
        tenantId,
      });
    } catch (error) {
      // If validation fails and initializeIfNotPresent is true, initialize the repo
      if (input.initializeIfNotPresent) {
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
      } else {
        // Re-throw validation error if initializeIfNotPresent is false
        throw error;
      }
    }
  }

  // Store the working directory in session storage
  const storageKey = `session:workingDir:${tenantId}`;
  await storage.set(storageKey, input.path, appContext);

  return {
    success: true,
    path: input.path,
    message: `Working directory set to: ${input.path}`,
  };
}

/**
 * Filter git_set_working_dir output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success and path only
 * - standard: Above + confirmation message (RECOMMENDED)
 * - full: Complete output (same as standard)
 */
function filterGitSetWorkingDirOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential info only
  if (level === 'minimal') {
    return {
      success: result.success,
      path: result.path,
    };
  }

  // standard & full: Complete output
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitSetWorkingDirOutput,
});

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
  logic: withToolAuth(
    ['tool:git:write'],
    createToolHandler(gitSetWorkingDirLogic, { skipPathResolution: true }),
  ),
  responseFormatter,
};
