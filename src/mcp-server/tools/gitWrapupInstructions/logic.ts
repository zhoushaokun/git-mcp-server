/**
 * @fileoverview Defines the core logic, schemas, and types for the git_wrapup_instructions tool.
 * @module src/mcp-server/tools/gitWrapupInstructions/logic
 */

import { z } from "zod";
import { logger, type RequestContext } from "../../../utils/index.js";
import {
  getGitStatus,
  GitStatusOutput,
  GitStatusOutputSchema,
} from "../gitStatus/logic.js";

// 1. DEFINE the Zod input schema.
export const GitWrapupInstructionsInputSchema = z.object({
  acknowledgement: z
    .enum(["Y", "y", "Yes", "yes"])
    .describe("Acknowledgement to initiate the wrap-up workflow."),
  updateAgentMetaFiles: z
    .enum(["Y", "y", "Yes", "yes"])
    .optional()
    .describe("Include an instruction to update agent-specific meta files."),
  createTag: z
    .boolean()
    .optional()
    .describe(
      "If true, instructs the agent to create a Git tag after committing all changes. Only set to true if given permission to do so.",
    ),
});

// 2. DEFINE the Zod response schema.
export const GitWrapupInstructionsOutputSchema = z.object({
  instructions: z
    .string()
    .describe("The set of instructions for the wrap-up workflow."),
  gitStatus: GitStatusOutputSchema.optional().describe(
    "The current structured git status.",
  ),
  gitStatusError: z
    .string()
    .optional()
    .describe("Any error message if getting git status failed."),
});

// 3. INFER and export TypeScript types.
export type GitWrapupInstructionsInput = z.infer<
  typeof GitWrapupInstructionsInputSchema
>;
export type GitWrapupInstructionsOutput = z.infer<
  typeof GitWrapupInstructionsOutputSchema
>;

const WRAPUP_INSTRUCTIONS = `
Perform all actions for our git wrapup workflow:
1. Use the git_diff tool to understand the precise nature and rationale behind each change (what changed and why did it change?) within the code base. Use the 'includeUntracked' parameter to view all changes, including untracked files. This will help you understand the context and purpose of the modifications made.
2. For substantial code updates, review and update the README to ensure it is up to date with our current codebase (make a note to the user of any discrepancies you noticed, gathered from everything you've seen of our codebase so far).
3. Update the CHANGELOG with concise, descriptive entries detailing all modifications, clearly indicating their purpose (e.g., bug fix, feature implementation, refactoring). Include specific metrics or identifiers where applicable, such as issue numbers or pull request links, to provide context and traceability for each change. This will help maintain a clear history of changes and their impacts on the project.
4. Proceed to commit all changes; based on your review of the git_diff and readme, group these changes into logical, atomic commits, each accompanied by a clear and descriptive message adhering to Conventional Commits standards (e.g. "docs(readme): updated readme to include xyz."). Note the 'git_commit' tool allows you to also stage the files while commiting. Ensure commit messages accurately convey the scope and impact of the changes, incorporating specific metrics or identifiers where applicable.
Note: Be sure to set 'git_set_working_dir' if not already set.

Instructions: Now write a concise list of what you must do to complete the git wrapup workflow, then perform all actions. Do not push unless requested.
`;

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function getWrapupInstructions(
  params: GitWrapupInstructionsInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined },
): Promise<GitWrapupInstructionsOutput> {
  const operation = "getWrapupInstructions";
  logger.debug(`Executing ${operation}`, { ...context, params });

  let finalInstructions = WRAPUP_INSTRUCTIONS;
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
    statusResult = await getGitStatus({ path: "." }, context);
  } else {
    statusError = "No working directory set for session, git status skipped.";
    logger.info(statusError, { ...context, operation });
  }

  return {
    instructions: finalInstructions,
    gitStatus: statusResult,
    gitStatusError: statusError,
  };
}
