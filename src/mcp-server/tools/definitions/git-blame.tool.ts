/**
 * @fileoverview Git blame tool - show line-by-line authorship
 * @module mcp-server/tools/definitions/git-blame
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

const TOOL_NAME = 'git_blame';
const TOOL_TITLE = 'Git Blame';
const TOOL_DESCRIPTION =
  'Show line-by-line authorship information for a file, displaying who last modified each line and when.';

const InputSchema = z.object({
  path: PathSchema,
  file: z
    .string()
    .min(1)
    .describe('Path to the file to blame (relative to repository root).'),
  startLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Start line number (1-indexed).'),
  endLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('End line number (1-indexed).'),
  ignoreWhitespace: z
    .boolean()
    .default(false)
    .describe('Ignore whitespace changes.'),
});

const BlameLineSchema = z.object({
  lineNumber: z
    .number()
    .int()
    .positive()
    .describe('Line number in the file (1-indexed).'),
  commitHash: z
    .string()
    .describe('Full commit hash of the last change to this line.'),
  author: z.string().describe('Author who last modified this line.'),
  timestamp: z
    .number()
    .int()
    .describe('Unix timestamp of the commit that last modified this line.'),
  content: z.string().describe('The actual content/text of this line.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  file: z.string().describe('The file that was blamed.'),
  lines: z
    .array(BlameLineSchema)
    .describe('Array of blame information for each line.'),
  totalLines: z.number().int().describe('Total number of lines in the output.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitBlameLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git blame', { ...appContext, toolInput: input });

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

  // Call provider's blame method - it handles sanitization and execution
  // Build options object with only defined properties
  const blameOptions: {
    file: string;
    startLine?: number;
    endLine?: number;
    ignoreWhitespace?: boolean;
  } = {
    file: input.file,
  };

  if (input.startLine !== undefined) {
    blameOptions.startLine = input.startLine;
  }
  if (input.endLine !== undefined) {
    blameOptions.endLine = input.endLine;
  }
  if (input.ignoreWhitespace !== undefined) {
    blameOptions.ignoreWhitespace = input.ignoreWhitespace;
  }

  const result = await provider.blame(blameOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    file: result.file,
    lines: result.lines,
    totalLines: result.totalLines,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const { file, lines, totalLines } = result;

  const header = `# Git Blame: ${file}\n\n`;
  const stats = `**Total Lines:** ${totalLines}\n\n`;

  const formattedLines = lines
    .map((line) => {
      const shortHash = line.commitHash.substring(0, 7);
      const date = new Date(line.timestamp * 1000).toISOString().split('T')[0];
      const authorShort =
        line.author.length > 20
          ? line.author.substring(0, 17) + '...'
          : line.author.padEnd(20);

      return `${String(line.lineNumber).padStart(4)} | ${shortHash} | ${date} | ${authorShort} | ${line.content}`;
    })
    .join('\n');

  const legend = '\n\n**Format:** Line | Commit | Date | Author | Content';

  return [
    {
      type: 'text',
      text: `${header}${stats}\`\`\`\n${formattedLines}\n\`\`\`${legend}`,
    },
  ];
}

export const gitBlameTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], gitBlameLogic),
  responseFormatter,
};
