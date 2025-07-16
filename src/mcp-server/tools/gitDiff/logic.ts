/**
 * @fileoverview Defines the core logic, schemas, and types for the git_diff tool.
 * @module src/mcp-server/tools/gitDiff/logic
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { logger, type RequestContext, sanitization } from "../../../utils/index.js";
import { McpError, BaseErrorCode } from "../../../types-global/errors.js";

const execFileAsync = promisify(execFile);

// 1. DEFINE the Zod input schema.
export const GitDiffBaseSchema = z.object({
  path: z.string().default(".").describe("Path to the Git repository."),
  commit1: z.string().optional().describe("First commit, branch, or ref for comparison."),
  commit2: z.string().optional().describe("Second commit, branch, or ref for comparison."),
  staged: z.boolean().default(false).describe("Show diff of changes staged for the next commit."),
  file: z.string().optional().describe("Limit the diff output to a specific file path."),
  includeUntracked: z.boolean().default(false).describe("Include untracked files in the diff output."),
});

export const GitDiffInputSchema = GitDiffBaseSchema.refine(data => !(data.staged && (data.commit1 || data.commit2)), {
  message: "Cannot use 'staged' option with specific commit references.",
  path: ["staged"],
});

// 2. DEFINE the Zod response schema.
export const GitDiffOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the command was successful."),
  diff: z.string().describe("The diff output. Will be 'No changes found.' if there are no differences."),
  message: z.string().describe("A summary message of the result."),
});

// 3. INFER and export TypeScript types.
export type GitDiffInput = z.infer<typeof GitDiffInputSchema>;
export type GitDiffOutput = z.infer<typeof GitDiffOutputSchema>;

async function getUntrackedFilesDiff(targetPath: string, context: RequestContext): Promise<string> {
    const { stdout } = await execFileAsync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: targetPath, shell: true });
    const untrackedFiles = stdout.trim().split("\n").filter(Boolean);
    if (untrackedFiles.length === 0) return "";

    let diffs = "";
    for (const file of untrackedFiles) {
        try {
            const { stdout: diffOut } = await execFileAsync("git", ["diff", "--no-index", "/dev/null", file], { cwd: targetPath, shell: true });
            diffs += diffOut;
        } catch (error: any) {
            if (error.stdout) diffs += error.stdout;
            else logger.warning(`Failed to diff untracked file: ${file}`, { ...context, error: error.message });
        }
    }
    return diffs;
}

/**
 * 4. IMPLEMENT the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function diffGitChanges(
  params: GitDiffInput,
  context: RequestContext & { getWorkingDirectory: () => string | undefined }
): Promise<GitDiffOutput> {
  const operation = "diffGitChanges";
  logger.debug(`Executing ${operation}`, { ...context, params });

  const workingDir = context.getWorkingDirectory();
  const targetPath = sanitization.sanitizePath(params.path === "." ? (workingDir || process.cwd()) : params.path, { allowAbsolute: true }).sanitizedPath;

  const args = ["diff"];
  if (params.staged) {
    args.push("--staged");
  } else {
    if (params.commit1) args.push(params.commit1);
    if (params.commit2) args.push(params.commit2);
  }
  if (params.file) args.push("--", params.file);

  try {
    logger.debug(`Executing command: git ${args.join(" ")} in ${targetPath}`, { ...context, operation });
    const { stdout } = await execFileAsync("git", args, { cwd: targetPath, maxBuffer: 1024 * 1024 * 20, shell: true });
    let combinedDiff = stdout;

    if (params.includeUntracked) {
        const untrackedDiff = await getUntrackedFilesDiff(targetPath, context);
        if (untrackedDiff) {
            combinedDiff += (combinedDiff ? "\n" : "") + untrackedDiff;
        }
    }

    const noChanges = combinedDiff.trim() === "";
    const message = noChanges ? "No changes found." : `Diff generated successfully.${params.includeUntracked ? " Untracked files included." : ""}`;
    
    return {
      success: true,
      diff: noChanges ? "No changes found." : combinedDiff,
      message,
    };

  } catch (error: any) {
    const errorMessage = error.stderr || error.message || "";
    logger.error(`Failed to execute git diff command`, { ...context, operation, errorMessage });

    if (errorMessage.toLowerCase().includes("not a git repository")) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Path is not a Git repository: ${targetPath}`);
    }
    if (errorMessage.includes("bad object") || errorMessage.includes("unknown revision")) {
      throw new McpError(BaseErrorCode.NOT_FOUND, `Invalid commit reference or file path specified.`);
    }
    
    throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Git diff failed: ${errorMessage}`);
  }
}
