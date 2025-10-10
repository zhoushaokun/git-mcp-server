/**
 * @fileoverview Git clean tool - remove untracked files
 * @module mcp-server/tools/definitions/git-clean
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema, ForceSchema, DryRunSchema } from '../schemas/common.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';

const TOOL_NAME = 'git_clean';
const TOOL_TITLE = 'Git Clean';
const TOOL_DESCRIPTION =
  'Remove untracked files from the working directory. Requires force flag for safety. Use dry-run to preview files that would be removed.';

const InputSchema = z.object({
  path: PathSchema,
  force: ForceSchema.refine((val) => val === true, {
    message: 'force flag must be set to true to clean untracked files',
  }),
  dryRun: DryRunSchema,
  directories: z
    .boolean()
    .default(false)
    .describe('Remove untracked directories in addition to files.'),
  ignored: z.boolean().default(false).describe('Remove ignored files as well.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  filesRemoved: z
    .array(z.string())
    .describe('List of files that were removed.'),
  directoriesRemoved: z
    .array(z.string())
    .describe('List of directories that were removed.'),
  dryRun: z.boolean().describe('Whether this was a dry-run (preview only).'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitCleanLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Build options object using modern spread syntax
  const { path: _path, ...rest } = input;
  const cleanOptions = {
    ...rest,
  };

  const result = await provider.clean(cleanOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    filesRemoved: result.filesRemoved,
    directoriesRemoved: result.directoriesRemoved,
    dryRun: result.dryRun,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = result.dryRun
    ? '# Git Clean - Preview (Dry Run)\n\n'
    : '# Git Clean - Files Removed\n\n';

  const totalFiles = result.filesRemoved.length;
  const totalDirs = result.directoriesRemoved.length;

  if (totalFiles === 0 && totalDirs === 0) {
    return [
      {
        type: 'text',
        text: `${summary}No untracked files or directories to remove.`,
      },
    ];
  }

  const stats =
    `**Files:** ${totalFiles}\n` +
    `**Directories:** ${totalDirs}\n` +
    `**Total Items:** ${totalFiles + totalDirs}\n\n`;

  const filesSection =
    result.filesRemoved.length > 0
      ? `## Files${result.dryRun ? ' (would be removed)' : ''}\n${result.filesRemoved.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';

  const dirsSection =
    result.directoriesRemoved.length > 0
      ? `## Directories${result.dryRun ? ' (would be removed)' : ''}\n${result.directoriesRemoved.map((d) => `- ${d}`).join('\n')}\n\n`
      : '';

  const warning = result.dryRun
    ? '**Note:** This was a dry-run. No files were actually removed. Run again with dry-run=false to perform the cleanup.'
    : '**Warning:** These files have been permanently removed and cannot be recovered.';

  return [
    {
      type: 'text',
      text: `${summary}${stats}${filesSection}${dirsSection}${warning}`,
    },
  ];
}

export const gitCleanTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitCleanLogic)),
  responseFormatter,
};
