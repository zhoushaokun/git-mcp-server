/**
 * @fileoverview Git tag tool - manage release tags
 * @module mcp-server/tools/definitions/git-tag
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import {
  PathSchema,
  TagNameSchema,
  CommitRefSchema,
  ForceSchema,
} from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';

const TOOL_NAME = 'git_tag';
const TOOL_TITLE = 'Git Tag';
const TOOL_DESCRIPTION =
  'Manage tags: list all tags, create a new tag, or delete a tag. Tags are used to mark specific points in history (releases, milestones).';

const InputSchema = z.object({
  path: PathSchema,
  mode: z
    .enum(['list', 'create', 'delete'])
    .default('list')
    .describe('The tag operation to perform.'),
  tagName: TagNameSchema.optional().describe(
    'Tag name for create/delete operations.',
  ),
  commit: CommitRefSchema.optional().describe(
    'Commit to tag (default: HEAD for create operation).',
  ),
  message: z
    .string()
    .optional()
    .describe('Tag message (creates annotated tag).'),
  annotated: z
    .boolean()
    .default(false)
    .describe('Create annotated tag with message.'),
  force: ForceSchema.describe(
    'Force tag creation/deletion (overwrite existing).',
  ),
});

const TagInfoSchema = z.object({
  name: z.string().describe('Tag name.'),
  commit: z.string().describe('Commit hash the tag points to.'),
  message: z.string().optional().describe('Tag message (for annotated tags).'),
  tagger: z.string().optional().describe('Tagger name and email.'),
  timestamp: z.number().int().optional().describe('Tag creation timestamp.'),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  mode: z.string().describe('Operation mode that was performed.'),
  tags: z
    .array(TagInfoSchema)
    .optional()
    .describe('List of tags (for list mode).'),
  created: z
    .string()
    .optional()
    .describe('Created tag name (for create mode).'),
  deleted: z
    .string()
    .optional()
    .describe('Deleted tag name (for delete mode).'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitTagLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const tagOptions: {
    mode: 'list' | 'create' | 'delete';
    tagName?: string;
    commit?: string;
    message?: string;
    annotated?: boolean;
    force?: boolean;
  } = {
    mode: input.mode,
  };

  if (input.tagName !== undefined) {
    tagOptions.tagName = input.tagName;
  }
  if (input.commit !== undefined) {
    tagOptions.commit = input.commit;
  }
  if (input.message !== undefined) {
    tagOptions.message = input.message;
  }
  if (input.annotated !== undefined) {
    tagOptions.annotated = input.annotated;
  }
  if (input.force !== undefined) {
    tagOptions.force = input.force;
  }

  const result = await provider.tag(tagOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: true,
    mode: result.mode,
    tags: result.tags,
    created: result.created,
    deleted: result.deleted,
  };
}

function responseFormatter(result: ToolOutput): ContentBlock[] {
  const header = `# Git Tag - ${result.mode.charAt(0).toUpperCase() + result.mode.slice(1)}\n\n`;

  if (result.mode === 'list' && result.tags) {
    if (result.tags.length === 0) {
      return [{ type: 'text', text: `${header}No tags found.` }];
    }

    const tagList = result.tags
      .map((tag) => {
        const base = `**${tag.name}** → ${tag.commit.substring(0, 7)}`;
        const msg = tag.message ? `\n  ${tag.message}` : '';
        const tagger =
          tag.tagger && tag.timestamp
            ? `\n  By: ${tag.tagger} on ${new Date(tag.timestamp * 1000).toISOString().split('T')[0]}`
            : '';
        return base + msg + tagger;
      })
      .join('\n\n');

    return [{ type: 'text', text: `${header}${tagList}` }];
  }

  if (result.created) {
    return [
      {
        type: 'text',
        text: `${header}Tag '${result.created}' created successfully.`,
      },
    ];
  }

  if (result.deleted) {
    return [
      {
        type: 'text',
        text: `${header}Tag '${result.deleted}' deleted successfully.`,
      },
    ];
  }

  return [{ type: 'text', text: `${header}Operation completed.` }];
}

export const gitTagTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: false },
  logic: withToolAuth(['tool:git:write'], createToolHandler(gitTagLogic)),
  responseFormatter,
};
