import { z } from 'zod';
import { RequestContext } from '../../../utils/internal/requestContext.js'; // For consistency, though not strictly used by logic

// Define the input schema
export const GitWrapupInstructionsInputSchema = z.object({
  acknowledgement: z.enum(['Y', 'y', 'Yes', 'yes'], {
    required_error: 'Acknowledgement is required.',
    description: 'Acknowledgement that you have permission (implicit allowed, explicit preferred) from the user to initiate this tool. Must be "Y" or "Yes" (case-insensitive).',
  }),
  updateAgentMetaFiles: z.enum(['Y', 'y', 'Yes', 'yes']).optional().describe("If set to 'Y' or 'Yes', include an extra instruction to review and update agent-specific meta files like .clinerules or claude.md if present. Only use this if the user explicitly requested it."),
});

// Infer the TypeScript type for the input.
export type GitWrapupInstructionsInput = z.infer<typeof GitWrapupInstructionsInputSchema>;

// Define the structure of the result object that the logic function will return.
export interface GitWrapupInstructionsResult {
  instructions: string;
}

// The predefined instructions string.
const WRAPUP_INSTRUCTIONS = `Initiate our standard git wrapup workflow. (1) First, review all changes to our repo using the git_diff tool to understand the precise nature and rationale behind each change (what changed and why did it change?). (2) For substantial code updates, review and update the README to ensure it is up to date with our current codebase (make a note to the user of any discrepancies you noticed, gathered from everything you've seen of our codebase). (3) Then, update the CHANGELOG with concise, descriptive entries detailing all modifications, clearly indicating their purpose (e.g., bug fix, feature implementation, refactoring). (4) Finally, proceed to commit all changes; group these changes into logical, atomic commits, each accompanied by a clear and descriptive message adhering to Conventional Commits standards (e.g. "docs(readme): updated readme to include xyz."). Note the 'git_commit' tool allows you to also stage the files while commiting. Ensure commit messages accurately convey the scope and impact of the changes, incorporating specific metrics or identifiers where applicable. Be sure to set 'git_set_working_dir' if not already set.`;

/**
 * Core logic for the git_wrapup_instructions tool.
 * This tool simply returns a predefined set of instructions, potentially augmented.
 *
 * @param {GitWrapupInstructionsInput} input - The validated input, may contain 'updateAgentMetaFiles'.
 * @param {RequestContext} _context - The request context (included for consistency, not used in this simple logic).
 * @returns {Promise<GitWrapupInstructionsResult>} A promise that resolves with the wrap-up instructions.
 */
export async function getWrapupInstructions(
  input: GitWrapupInstructionsInput,
  _context: RequestContext // Included for structural consistency, not used by this simple tool
): Promise<GitWrapupInstructionsResult> {
  let finalInstructions = WRAPUP_INSTRUCTIONS;
  if (input.updateAgentMetaFiles && ['Y', 'y', 'Yes', 'yes'].includes(input.updateAgentMetaFiles)) {
    finalInstructions += ` Extra request: review and update if needed the .clinerules and claude.md files if present.`;
  }
  return {
    instructions: finalInstructions,
  };
}
