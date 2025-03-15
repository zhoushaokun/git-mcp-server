/**
 * Git-Related Type Definitions
 * ============================
 * 
 * Type definitions for Git operations and entities used throughout the server.
 */

/**
 * Options for repository operations
 */
export interface GitRepositoryOptions {
  /** Git directory path (default: .git) */
  gitdir?: string;
  /** Bare repository flag */
  bare?: boolean;
  /** Optional depth for shallow clones */
  depth?: number;
  /** Optional branch name to checkout */
  branch?: string;
  /** Optional remote name */
  remote?: string;
}

/**
 * Options for commit operations
 */
export interface GitCommitOptions {
  /** Commit message */
  message: string;
  /** Optional author name */
  author?: {
    name?: string;
    email?: string;
  };
  /** Optional commit date */
  date?: Date;
  /** Whether to allow empty commits */
  allowEmpty?: boolean;
  /** Whether to amend the previous commit */
  amend?: boolean;
}

/**
 * Options for branch operations
 */
export interface GitBranchOptions {
  /** Branch name */
  name: string;
  /** Whether to checkout the branch after creation */
  checkout?: boolean;
  /** Reference to create branch from */
  startPoint?: string;
}

/**
 * Options for merge operations
 */
export interface GitMergeOptions {
  /** Branch to merge */
  branch: string;
  /** Whether to fast-forward if possible */
  fastForwardOnly?: boolean;
  /** Whether to create a merge commit (no fast-forward) */
  noFastForward?: boolean;
  /** Commit message for merge */
  message?: string;
}

/**
 * Options for remote operations
 */
export interface GitRemoteOptions {
  /** Remote name */
  name: string;
  /** Remote URL */
  url: string;
}

/**
 * Options for pull operations
 */
export interface GitPullOptions {
  /** Remote name */
  remote?: string;
  /** Branch name */
  branch?: string;
  /** Whether to rebase instead of merge */
  rebase?: boolean;
}

/**
 * Options for push operations
 */
export interface GitPushOptions {
  /** Remote name */
  remote?: string;
  /** Branch name */
  branch?: string;
  /** Whether to force push */
  force?: boolean;
  /** Whether to set upstream */
  setUpstream?: boolean;
}

/**
 * Options for tag operations
 */
export interface GitTagOptions {
  /** Tag name */
  name: string;
  /** Optional tag message (creates annotated tag) */
  message?: string;
  /** Reference to create tag from */
  ref?: string;
}

/**
 * Options for stash operations
 */
export interface GitStashOptions {
  /** Optional stash message */
  message?: string;
  /** Whether to include untracked files */
  includeUntracked?: boolean;
}

/**
 * Git log entry
 */
export interface GitLogEntry {
  /** Commit hash */
  hash: string;
  /** Abbreviated commit hash */
  abbrevHash: string;
  /** Author name */
  author: string;
  /** Author email */
  authorEmail: string;
  /** Author date */
  date: Date;
  /** Commit message */
  message: string;
  /** Reference names (branches, tags) */
  refs?: string;
}

/**
 * Git file status
 */
export interface GitFileStatus {
  /** File path */
  path: string;
  /** File status (added, modified, deleted, etc.) */
  status: string;
  /** Index status */
  index?: string;
  /** Working directory status */
  working_dir?: string;
}

/**
 * Git repository status
 */
export interface GitRepositoryStatus {
  /** Current branch */
  current: string;
  /** Tracking branch */
  tracking?: string;
  /** Whether the repository is detached HEAD */
  detached: boolean;
  /** List of files with status */
  files: GitFileStatus[];
  /** Whether the repository has conflicts */
  conflicted: string[];
  /** Modified files */
  modified: string[];
  /** Deleted files */
  deleted: string[];
  /** Created files */
  created: string[];
  /** Renamed files */
  renamed: string[];
  /** Untracked files */
  not_added: string[];
  /** Whether the repository is clean */
  isClean(): boolean;
}

/**
 * Git diff entry
 */
export interface GitDiffEntry {
  /** File path */
  path: string;
  /** Status of the file (added, modified, deleted, etc.) */
  status?: string;
  /** Old file path (for renames) */
  oldPath?: string;
  /** Whether the file is binary */
  binary?: boolean;
  /** Diff content */
  content?: string;
  /** Added lines count */
  added?: number;
  /** Deleted lines count */
  deleted?: number;
}

/**
 * Git error type
 */
export interface GitError extends Error {
  /** Git error code */
  code?: string;
  /** Command that caused the error */
  command?: string;
  /** Command arguments */
  args?: string[];
  /** Git stderr output */
  stderr?: string;
}