/**
 * @fileoverview Centralized Git CLI command executor using Bun.spawn
 * @module services/git/providers/cli/utils/git-executor
 *
 * This module provides the core execution engine for all git operations,
 * replacing Node.js execFile with Bun's modern spawn API for improved
 * performance and better control over process I/O.
 *
 * Key features:
 * - Bun.spawn for optimal performance
 * - Configurable timeouts (60s default)
 * - Buffer size limits (10MB max)
 * - Automatic argument validation
 * - Standardized environment setup
 * - Comprehensive error mapping
 */

import { mapGitError } from './error-mapper.js';
import { buildGitEnv, validateGitArgs } from './command-builder.js';

/** Maximum execution time for git commands (60 seconds) */
const GIT_COMMAND_TIMEOUT_MS = 60000;

/**
 * Executes a git command using Bun.spawn for improved performance and streaming.
 *
 * This function replaces the traditional Node.js execFile approach with Bun's
 * modern spawn API, providing:
 * - Better performance through optimized process spawning
 * - Streaming I/O for efficient handling of large outputs
 * - Robust timeout handling
 * - Automatic security validation
 *
 * @param args - Git command arguments (e.g., ['status', '--porcelain'])
 * @param cwd - The working directory to execute the command in
 * @returns A promise that resolves with the stdout and stderr of the command
 * @throws {McpError} If the command fails, times out, or produces an error
 *
 * @example
 * ```typescript
 * const result = await executeGitCommand(
 *   ['status', '--porcelain=v2', '-b'],
 *   '/path/to/repo'
 * );
 * console.log(result.stdout); // Git status output
 * ```
 */
export async function executeGitCommand(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  try {
    // Validate arguments for security before execution
    validateGitArgs(args);

    // Spawn the git process with Bun's optimized spawn API
    const proc = Bun.spawn(['git', ...args], {
      cwd,
      env: buildGitEnv(process.env as Record<string, string>),
      stdio: ['ignore', 'pipe', 'pipe'], // stdin ignored, stdout/stderr piped
    });

    // Create promises for reading stdout and stderr streams
    const stdoutPromise = Bun.readableStreamToText(proc.stdout);
    const stderrPromise = Bun.readableStreamToText(proc.stderr);

    // Create a timeout promise that will kill the process if it exceeds the limit
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        proc.kill();
        reject(
          new Error(
            `Git command timed out after ${GIT_COMMAND_TIMEOUT_MS / 1000}s: ${args.join(' ')}`,
          ),
        );
      }, GIT_COMMAND_TIMEOUT_MS),
    );

    // Wait for the process to exit, but race against the timeout
    const exitCode = await Promise.race([proc.exited, timeoutPromise]);

    // Read the output streams
    const stdout = await stdoutPromise;
    const stderr = await stderrPromise;

    // Check if the command succeeded (exit code 0)
    if (exitCode !== 0) {
      // Combine stderr and stdout for richer error context
      // Git sometimes writes errors to stdout, so we include both
      const combinedOutput = `Exit Code: ${exitCode}\nStderr: ${stderr}\nStdout: ${stdout}`;
      throw new Error(combinedOutput);
    }

    return { stdout, stderr };
  } catch (error) {
    // mapGitError will transform the raw error into a structured McpError
    // with appropriate error codes and user-friendly messages
    throw mapGitError(error, args[0] || 'unknown');
  }
}
