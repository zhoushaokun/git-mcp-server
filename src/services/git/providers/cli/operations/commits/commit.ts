/**
 * @fileoverview CLI provider git commit operation
 * @module services/git/providers/cli/operations/commits/commit
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitCommitOptions,
  GitCommitResult,
  GitOperationContext,
} from '../../../../types.js';
import {
  buildGitCommand,
  GIT_FIELD_DELIMITER,
  GIT_RECORD_DELIMITER,
  mapGitError,
} from '../../utils/index.js';

/**
 * Execute git commit to create a new commit.
 */
export async function executeCommit(
  options: GitCommitOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitCommitResult> {
  try {
    const args: string[] = ['-m', options.message];

    if (options.amend) {
      args.push('--amend');
    }

    if (options.allowEmpty) {
      args.push('--allow-empty');
    }

    if (options.noVerify) {
      args.push('--no-verify');
    }

    if (options.sign) {
      args.push('--gpg-sign');
    }

    if (options.author) {
      const authorStr = `${options.author.name} <${options.author.email}>`;
      args.push(`--author=${authorStr}`);
    }

    const cmd = buildGitCommand({ command: 'commit', args });
    await execGit(cmd, context.workingDirectory, context.requestContext);

    // Get commit hash reliably
    const hashCmd = buildGitCommand({
      command: 'rev-parse',
      args: ['HEAD'],
    });
    const hashResult = await execGit(
      hashCmd,
      context.workingDirectory,
      context.requestContext,
    );
    const commitHash = hashResult.stdout.trim();

    // Get commit details using the reliable hash
    const showCmd = buildGitCommand({
      command: 'show',
      args: [
        `--format=%an${GIT_FIELD_DELIMITER}%at${GIT_RECORD_DELIMITER}`,
        '--name-only',
        commitHash,
      ],
    });
    const showResult = await execGit(
      showCmd,
      context.workingDirectory,
      context.requestContext,
    );

    const parts = showResult.stdout.split(GIT_RECORD_DELIMITER);
    const metaParts = parts[0]?.split(GIT_FIELD_DELIMITER) || [];
    const authorName = metaParts[0] || '';
    const timestamp = parseInt(metaParts[1] || '0', 10);

    // Parse changed files
    const filesChanged =
      parts[1]
        ?.split('\n')
        .filter((f) => f.trim())
        .slice(0, -1) || [];

    const result = {
      success: true,
      commitHash,
      message: options.message,
      author: authorName,
      timestamp,
      filesChanged,
    };

    return result;
  } catch (error) {
    throw mapGitError(error, 'commit');
  }
}
