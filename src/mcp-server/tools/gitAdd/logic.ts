import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { logger, RequestContext, sanitization } from "../../../utils/index.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";

const execFileAsync = promisify(execFile);

export const GitAddInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .optional()
    .default(".")
    .describe(
      "Path to the Git repository. Defaults to the directory set via `git_set_working_dir` for the session; set 'git_set_working_dir' if not set.",
    ),
  files: z
    .union([z.string().min(1), z.array(z.string().min(1))])
    .default(".")
    .describe("Files or patterns to stage, defaults to all changes ('.')"),
});

export type GitAddInput = z.infer<typeof GitAddInputSchema>;

export const GitAddOutputSchema = z.object({
  success: z.boolean().describe("Indicates whether the operation was successful."),
  statusMessage: z.string().describe("A message describing the result of the operation."),
  filesStaged: z.union([z.string(), z.array(z.string())]).describe("The files or patterns that were staged."),
});

export type GitAddOutput = z.infer<typeof GitAddOutputSchema>;

export async function addGitFiles(
  input: GitAddInput,
  context: RequestContext & {
    sessionId?: string;
    getWorkingDirectory: () => string | undefined;
  },
): Promise<GitAddOutput> {
  const operation = "addGitFiles";
  logger.debug(`Executing ${operation}`, { ...context, input });

  let targetPath: string;
  try {
    if (input.path && input.path !== ".") {
      targetPath = input.path;
      logger.debug(`Using provided path: ${targetPath}`, {
        ...context,
        operation,
      });
    } else {
      const workingDir = context.getWorkingDirectory();
      if (!workingDir) {
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          "No path provided and no working directory set for the session.",
          { context, operation },
        );
      }
      targetPath = workingDir;
      logger.debug(`Using session working directory: ${targetPath}`, {
        ...context,
        operation,
        sessionId: context.sessionId,
      });
    }

    const sanitizedPathInfo = sanitization.sanitizePath(targetPath, {
      allowAbsolute: true,
    });
    logger.debug("Sanitized repository path", {
      ...context,
      operation,
      sanitizedPathInfo,
    });
    targetPath = sanitizedPathInfo.sanitizedPath;
  } catch (error) {
    logger.error("Path resolution or sanitization failed", {
      ...context,
      operation,
      error,
    });
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Invalid path: ${error instanceof Error ? error.message : String(error)}`,
      { context, operation, originalError: error },
    );
  }

  const filesToStage = Array.isArray(input.files) ? input.files : [input.files];
  if (filesToStage.length === 0) {
    filesToStage.push(".");
  }

  try {
    const args = ["-C", targetPath, "add", "--", ...filesToStage.map(file => file.startsWith("-") ? `./${file}` : file)];

    logger.debug(`Executing command: git ${args.join(" ")}`, {
      ...context,
      operation,
    });

    const { stderr } = await execFileAsync("git", args);

    if (stderr) {
      logger.warning(`Git add command produced stderr`, {
        ...context,
        operation,
        stderr,
      });
    }

    const filesAddedDesc = Array.isArray(filesToStage)
      ? filesToStage.join(", ")
      : filesToStage;
    const successMessage = `Successfully staged: ${filesAddedDesc}`;
    logger.info(successMessage, {
      ...context,
      operation,
      path: targetPath,
      files: filesToStage,
    });
    const reminder =
      "Remember to write clear, concise commit messages using the Conventional Commits format (e.g., 'feat(scope): subject').";
    return {
      success: true,
      statusMessage: `${successMessage}. ${reminder}`,
      filesStaged: filesToStage,
    };
  } catch (error: any) {
    logger.error(`Failed to execute git add command`, {
      ...context,
      operation,
      path: targetPath,
      error: error.message,
      stderr: error.stderr,
    });

    const errorMessage = error.stderr || error.message || "";
    if (errorMessage.toLowerCase().includes("not a git repository")) {
      throw new McpError(
        BaseErrorCode.NOT_FOUND,
        `Path is not a Git repository: ${targetPath}`,
        { context, operation, originalError: error },
      );
    }
    if (errorMessage.toLowerCase().includes("did not match any files")) {
      throw new McpError(
        BaseErrorCode.NOT_FOUND,
        `Specified files/patterns did not match any files in ${targetPath}: ${filesToStage.join(", ")}`,
        { context, operation, originalError: error, filesStaged: filesToStage },
      );
    }

    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Failed to stage files for path: ${targetPath}. Error: ${errorMessage}`,
      { context, operation, originalError: error, filesStaged: filesToStage },
    );
  }
}
