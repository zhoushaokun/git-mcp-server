/**
 * @fileoverview Git stash tool - temporarily save changes
 * @module mcp-server/tools/definitions/git-stash
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema } from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';

const TOOL_NAME = 'git_stash';
const TOOL_TITLE = 'Git Stash';
const TOOL_DESCRIPTION =
  'Manage stashes: list stashes, save current changes (push), restore changes (pop/apply), or remove stashes (drop/clear).';

const InputSchema = z.object({
  path: PathSchema,
  mode: z
    .enum(['list', 'push', 'pop', 'apply', 'drop', 'clear'])
    .default('list')
    .describe('The stash operation to perform.'),
  message: z
    .string()
    .optional()
    .describe('Stash message description (for push operation).'),
  stashRef: z
    .string()
    .optional()
    .describe(
      'Stash reference like stash@{0} (for pop/apply/drop operations).',
    ),
  includeUntracked: z
    .boolean()
    .default(false)
    .describe('Include untracked files in the stash (for push operation).'),
  keepIndex: z
    .boolean()
    .default(false)
    .describe("Don't revert staged changes (for push operation)."),
});

const StashInfoSchema = z.object({
  ref: z.string().describe('Stash reference (e.g., stash@{0}).'),
  index: z.number().int().describe('Stash index number.'),
  branch: z.string().describe('Branch name when stashed.'),
  description: z.string().describe('Stash description.'),
  timestamp: z.number().int().describe('Unix timestamp when stashed.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  mode: z.string().describe('Operation mode that was performed.'),
  stashes: z
    .array(StashInfoSchema)
    .optional()
    .describe('List of stashes (for list mode).'),
  created: z
    .string()
    .optional()
    .describe('Created stash reference (for push mode).'),
  applied: z
    .string()
    .optional()
    .describe('Applied stash reference (for pop/apply mode).'),
  dropped: z
    .string()
    .optional()
    .describe('Dropped stash reference (for drop mode).'),
  conflicts: z
    .boolean()
    .optional()
    .describe('Whether operation had conflicts.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitStashLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const stashOptions: {
    mode: 'list' | 'push' | 'pop' | 'apply' | 'drop' | 'clear';
    message?: string;
    stashRef?: string;
    includeUntracked?: boolean;
    keepIndex?: boolean;
  } = {
    mode: input.mode,
  };

  if (input.message !== undefined) {
    stashOptions.message = input.message;
  }
  if (input.stashRef !== undefined) {
    stashOptions.stashRef = input.stashRef;
  }
  if (input.includeUntracked !== undefined) {
    stashOptions.includeUntracked = input.includeUntracked;
  }
  if (input.keepIndex !== undefined) {
    stashOptions.keepIndex = input.keepIndex;
  }

  const result = await provider.stash(stashOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: true,
    mode: result.mode,
    stashes: result.stashes,
    created: result.created,
    applied: result.applied,
    dropped: result.dropped,
    conflicts: result.conflicts,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const header = `# Git Stash - ${result.mode.charAt(0).toUpperCase() + result.mode.slice(1)}\n\n`;

  if (result.mode === 'list' && result.stashes) {
    if (result.stashes.length === 0) {
      return [{ type: 'text', text: `${header}No stashes found.` }];
    }

    const stashList = result.stashes
      .map(
        (stash) =>
          `**${stash.ref}** (${stash.branch})\n` +
          `  ${stash.description}\n` +
          `  ${new Date(stash.timestamp * 1000).toISOString()}`,
      )
      .join('\n\n');

    return [{ type: 'text', text: `${header}${stashList}` }];
  }

  const stashRef = result.created || result.applied || result.dropped;
  const message = stashRef
    ? `Operation completed for ${stashRef}.`
    : 'Operation completed successfully.';
  const conflictWarning = result.conflicts
    ? '\n\n**⚠️ Conflicts detected** - resolve before continuing.'
    : '';

  return [{ type: 'text', text: `${header}${message}${conflictWarning}` }];
}

export const gitStashTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitStashLogic)),
  responseFormatter,
};
