/**
 * @fileoverview Git pull tool - fetch and integrate changes from remote
 * @module mcp-server/tools/definitions/git-pull
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  PathSchema,
  RemoteNameSchema,
  BranchNameSchema,
} from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';

const TOOL_NAME = 'git_pull';
const TOOL_TITLE = 'Git Pull';
const TOOL_DESCRIPTION =
  'Pull changes from a remote repository. Fetches and integrates changes into the current branch.';

const InputSchema = z.object({
  path: PathSchema,
  remote: RemoteNameSchema.optional().describe(
    'Remote name (default: origin).',
  ),
  branch: BranchNameSchema.optional().describe(
    'Branch name (default: current branch).',
  ),
  rebase: z
    .boolean()
    .default(false)
    .describe('Use rebase instead of merge when integrating changes.'),
  fastForwardOnly: z
    .boolean()
    .default(false)
    .describe("Fail if can't fast-forward (no merge commit)."),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  remote: z.string().describe('Remote name that was pulled from.'),
  branch: z.string().describe('Branch that was pulled.'),
  strategy: z
    .enum(['merge', 'rebase', 'fast-forward'])
    .describe('Integration strategy used.'),
  conflicts: z.boolean().describe('Whether pull had conflicts.'),
  filesChanged: z.array(z.string()).describe('Files that were changed.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitPullLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const pullOptions: {
    remote?: string;
    branch?: string;
    rebase?: boolean;
    fastForwardOnly?: boolean;
  } = {};

  if (input.remote !== undefined) {
    pullOptions.remote = input.remote;
  }
  if (input.branch !== undefined) {
    pullOptions.branch = input.branch;
  }
  if (input.rebase !== undefined) {
    pullOptions.rebase = input.rebase;
  }
  if (input.fastForwardOnly !== undefined) {
    pullOptions.fastForwardOnly = input.fastForwardOnly;
  }

  const result = await provider.pull(pullOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    remote: result.remote,
    branch: result.branch,
    strategy: result.strategy,
    conflicts: result.conflicts,
    filesChanged: result.filesChanged,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = result.conflicts
    ? `# Pull Has Conflicts ⚠️\n\n`
    : `# Pull Complete\n\n`;

  const info =
    `**Remote:** ${result.remote}\n` +
    `**Branch:** ${result.branch}\n` +
    `**Strategy:** ${result.strategy}\n\n`;

  const filesSection =
    result.filesChanged.length > 0
      ? `## Changed Files (${result.filesChanged.length})\n${result.filesChanged.map((f) => `- ${f}`).join('\n')}\n`
      : 'Already up to date.';

  const conflictWarning = result.conflicts
    ? `\n\n**⚠️ Action Required:** Resolve conflicts before continuing.`
    : '';

  return [
    {
      type: 'text',
      text: `${summary}${info}${filesSection}${conflictWarning}`.trim(),
    },
  ];
}

export const gitPullTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitPullLogic)),
  responseFormatter,
};
