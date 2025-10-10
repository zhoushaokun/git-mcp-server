/**
 * @fileoverview Defines the core logic, schemas, and types for the git_wrapup_instructions tool.
 * @module src/mcp-server/tools/gitWrapupInstructions/logic
 */

import { readFileSync } from 'fs';
import path from 'path';
import { z } from 'zod';
import { config } from '../../../config/index.js';
import { logger, type RequestContext } from '../../../utils/index.js';
import {
  getGitStatus,
  GitStatusOutput,
  GitStatusOutputSchema,
} from '../gitStatus/logic.js';

// 1. DEFINE the Zod input schema.
export const GitWrapupInstructionsInputSchema = z.object({
  acknowledgement: z
    .enum(['Y', 'y', 'Yes', 'yes'])
    .describe('Acknowledgement to initiate the wrap-up workflow.'),
  updateAgentMetaFiles: z
    .enum(['Y', 'y', 'Yes', 'yes'])
    .optional()
    .describe('Include an instruction to update agent-specific meta files.'),
  createTag: z
    .boolean()
    .optional()
    .describe(
      'If true, instructs the agent to create a Git tag after committing all changes. Only set to true if given permission to do so.',
    ),
});

// 2. DEFINE the Zod response schema.
export const GitWrapupInstructionsOutputSchema = z.object({
  instructions: z
    .string()
    .describe('The set of instructions for the wrap-up workflow.'),
  gitStatus: GitStatusOutputSchema.optional().describe(
    'The current structured git status.',
  ),
  gitStatusError: z
    .string()
    .optional()
    .describe('Any error message if getting git status failed.'),
});

// 3. INFER and export TypeScript types.
export type GitWrapupInstructionsInput = z.infer<
  typeof GitWrapupInstructionsInputSchema
>;
export type GitWrapupInstructionsOutput = z.infer<
  typeof GitWrapupInstructionsOutputSchema
>;

const WRAPUP_INSTRUCTIONS = `
# Git Wrap-up Protocol

**Objective**: Systematically review, document, and commit all pending changes in the repository. Adherence to this protocol is mandatory.

### Phase 1: Analysis and Planning

You must begin by creating a task list that mirrors this protocol. This is your operational plan.

**Example Task List:**
\`\`\`
- [ ] Set Git working directory (if not set)
- [ ] Analyze repository changes with git_diff
- [ ] Update CHANGELOG.md with all modifications
- [ ] Review and update README.md for currency
- [ ] Commit changes in logical, atomic units
- [ ] Verify final repository status
\`\`\`

### Phase 2: Execution Workflow

Execute the following steps sequentially. Do not proceed until the prior step is confirmed complete.

1.  **Set Context**: Ensure the working directory is correctly set using **\`git_set_working_dir\`**. This is a mandatory first step.

2.  **Analyze Changes**: Execute **\`git_diff\`** with the \`includeUntracked: true\` parameter. You must thoroughly analyze the output to understand the full scope and rationale of every modification. This analysis will inform & influence your commit strategy, commit messages, and overall workflow.

3.  **Update Changelog**: Read the **\`CHANGELOG.md\`** file. Append a new version entry detailing all changes. Your entry must be concise, use the past tense, and categorize modifications (e.g., "Added," "Changed," "Fixed").

4.  **Review Documentation**: For any substantial code changes, you are required to review **\`README.md\`**. Ensure it accurately reflects the current state of the codebase. Update it as necessary.

5.  **Commit Changes**: Execute **\`git_commit\`** for each logical group of changes.
    - Commits **must be atomic** and group related changes.
    - Commit messages **must adhere** to the **Conventional Commits** standard (e.g., \`feat(auth): implement password reset\`).
    - Use the \`filesToStage\` parameter to precisely control which files are included in each commit.

**Directive**: Create your task list now. Then, execute the protocol. Do not push to the remote unless explicitly instructed.
`;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
const loadInstructions = (
  filePath: string | undefined,
  context: RequestContext,
): string => {
  if (!filePath) {
    logger.debug('No custom instructions path configured, using default.', {
      ...context,
    });
    return WRAPUP_INSTRUCTIONS;
  }
  try {
    const resolvedPath = path.resolve(filePath);
    logger.debug(
      `Attempting to load custom instructions from ${resolvedPath}`,
      {
        ...context,
      },
    );
    return readFileSync(resolvedPath, 'utf-8');
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';
    logger.warning(
      `Failed to load custom instructions from '${filePath}': ${errorMessage}. Falling back to default instructions.`,
      { ...context, error },
    );
    return WRAPUP_INSTRUCTIONS;
  }
};

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function getWrapupInstructions(
  params: GitWrapupInstructionsInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitWrapupInstructionsOutput> {
  const operation = 'getWrapupInstructions';
  logger.debug(`Executing ${operation}`, { ...context, params });

  let finalInstructions = loadInstructions(
    config.gitWrapupInstructionsPath,
    context,
  );

  if (params.updateAgentMetaFiles) {
    finalInstructions += `\nExtra request: review and update if needed the .clinerules and claude.md files if present.`;
  }

  if (params.createTag) {
    finalInstructions += `\n5. After all changes are committed and confirmed via 'git_status', use the 'git_tag' tool to create a new annotated tag. The tag name should follow semantic versioning (e.g., v1.2.3), and the annotation message should summarize the key changes in this wrap-up.`;
  }

  let statusResult: GitStatusOutput | undefined;
  let statusError: string | undefined;

  const workingDir = context.getWorkingDirectory();
  if (workingDir) {
    statusResult = await getGitStatus({ path: '.' }, context);
  } else {
    statusError = 'No working directory set for session, git status skipped.';
    logger.info(statusError, { ...context, operation });
  }

  return {
    instructions: finalInstructions,
    gitStatus: statusResult,
    gitStatusError: statusError,
  };
}
