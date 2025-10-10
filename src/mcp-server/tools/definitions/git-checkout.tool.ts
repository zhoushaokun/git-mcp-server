/**
 * @fileoverview Git checkout tool - switch branches or restore files
 * @module mcp-server/tools/definitions/git-checkout
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  PathSchema,
  BranchNameSchema,
  CommitRefSchema,
  ForceSchema,
} from '../schemas/common.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';

const TOOL_NAME = 'git_checkout';
const TOOL_TITLE = 'Git Checkout';
const TOOL_DESCRIPTION =
  'Switch branches or restore working tree files. Can checkout an existing branch, create a new branch, or restore specific files.';

const InputSchema = z.object({
  path: PathSchema,
  target: z
    .union([BranchNameSchema, CommitRefSchema])
    .describe('Branch name, commit hash, or tag to checkout.'),
  createBranch: z
    .boolean()
    .default(false)
    .describe('Create a new branch with the specified name.'),
  force: ForceSchema,
  paths: z
    .array(z.string())
    .optional()
    .describe(
      'Specific file paths to checkout/restore (relative to repository root).',
    ),
  track: z
    .boolean()
    .optional()
    .describe(
      'Set up tracking relationship with remote branch when creating new branch.',
    ),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  target: z.string().describe('Checked out branch or commit.'),
  branchCreated: z.boolean().describe('True if a new branch was created.'),
  filesModified: z
    .array(z.string())
    .describe('Files that were modified during checkout.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitCheckoutLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Build options object with only defined properties
  const checkoutOptions: {
    target: string;
    createBranch?: boolean;
    force?: boolean;
    paths?: string[];
    track?: boolean;
  } = {
    target: input.target,
    createBranch: input.createBranch,
    force: input.force,
  };

  if (input.paths !== undefined) {
    checkoutOptions.paths = input.paths;
  }
  if (input.track !== undefined) {
    checkoutOptions.track = input.track;
  }

  const result = await provider.checkout(checkoutOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    target: result.target,
    branchCreated: result.branchCreated,
    filesModified: result.filesModified,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = result.branchCreated
    ? `# Branch Created and Checked Out\n\n`
    : result.filesModified.length > 0
      ? `# Files Modified During Checkout\n\n`
      : `# Checked Out Successfully\n\n`;

  const targetInfo = `**Target:** ${result.target}\n`;
  const createdInfo = result.branchCreated
    ? `**New Branch Created:** Yes\n`
    : '';

  const filesInfo =
    result.filesModified.length > 0
      ? `\n**Files Modified (${result.filesModified.length}):**\n${result.filesModified.map((f) => `- ${f}`).join('\n')}\n`
      : '';

  return [
    {
      type: 'text',
      text: `${summary}${targetInfo}${createdInfo}${filesInfo}`.trim(),
    },
  ];
}

export const gitCheckoutTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitCheckoutLogic)),
  responseFormatter,
};
