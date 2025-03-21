/**
 * Git Service
 * ===========
 * 
 * An abstraction layer for Git operations using simple-git.
 * Provides a clean interface for the MCP server to interact with Git repositories.
 */

import { simpleGit } from 'simple-git';
type SimpleGit = any;
type SimpleGitOptions = any;
import fs from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';
import { 
  GitRepositoryOptions, 
  GitCommitOptions, 
  GitBranchOptions,
  GitMergeOptions,
  GitRemoteOptions,
  GitPullOptions,
  GitPushOptions,
  GitTagOptions,
  GitStashOptions,
  GitRepositoryStatus,
  GitLogEntry,
  GitDiffEntry,
  GitError
} from '../types/git.js';
import {
  createGitError,
  createSuccessResult,
  createFailureResult,
  OperationResult,
  StandardizedApplicationErrorObject,
  wrapExceptionAsStandardizedError
} from './error-service.js';

export class GitService {
  private git: SimpleGit;
  private repoPath: string;

  /**
   * Creates a new GitService instance for a specific repository path
   * 
   * @param repoPath - Path to the git repository
   * @param options - Additional simple-git options
   */
  constructor(repoPath: string, options: SimpleGitOptions = {}) {
    this.repoPath = repoPath;

    try {
      // Try to get the global git user configuration
      const globalUserName = execSync('git config --global user.name').toString().trim();
      const globalUserEmail = execSync('git config --global user.email').toString().trim();

      // Initialize git with this configuration to ensure it uses the global values
      this.git = simpleGit(this.repoPath, {
        ...options,
        config: [
          `user.name=${globalUserName}`,
          `user.email=${globalUserEmail}`
        ]
      });
    } catch (error) {
      // If we can't get the global config, fall back to standard initialization
      console.error('Failed to get global git config, using default initialization', error);
      this.git = simpleGit(this.repoPath, {
        ...options,
        baseDir: this.repoPath
      });
    }
  }

  /**
   * Handles Git errors in a standardized way
   * 
   * @param error - The error to handle
   * @param defaultMessage - Default message if error is not a Git error
   * @returns Standardized error object
   */
  private handleGitError(error: unknown, defaultMessage: string): StandardizedApplicationErrorObject {
    if ((error as GitError).code) {
      const gitError = error as GitError;
      return createGitError(
        gitError.message || defaultMessage,
        gitError.code || 'GIT_ERROR',
        {
          command: gitError.command,
          args: gitError.args,
          stderr: gitError.stderr
        }
      );
    }
    
    return wrapExceptionAsStandardizedError(error, defaultMessage);
  }

  /**
   * Ensures the repository directory exists
   * 
   * @returns Promise resolving when directory exists or is created
   */
  private async ensureRepoPathExists(): Promise<void> {
    try {
      await fs.access(this.repoPath);
    } catch (error) {
      // Create directory if it doesn't exist
      await fs.mkdir(this.repoPath, { recursive: true });
    }
  }

  /**
   * Checks if a path is a Git repository
   * 
   * @param dirPath - Path to check
   * @returns Promise resolving to true if path is a Git repository
   */
  async isGitRepository(dirPath: string = this.repoPath): Promise<boolean> {
    try {
      const gitDir = path.join(dirPath, '.git');
      await fs.access(gitDir);
      return true;
    } catch (error) {
      try {
        // Check if it's a bare repository by looking for common Git files
        const gitFiles = ['HEAD', 'config', 'objects', 'refs'];
        for (const file of gitFiles) {
          await fs.access(path.join(dirPath, file));
        }
        return true;
      } catch {
        return false;
      }
    }
  }

  // ==========================================
  // Repository Operations
  // ==========================================

  /**
   * Initializes a new Git repository
   * 
   * @param bare - Whether to create a bare repository
   * @param initialBranch - Initial branch name (default: main)
   * @returns Promise resolving to operation result
   */
  async initRepo(bare = false, initialBranch = 'main'): Promise<OperationResult<string>> {
    try {
      await this.ensureRepoPathExists();
      // Use init with options to set the initial branch name
      const initOptions = {
        '--initial-branch': initialBranch,
        '--bare': bare ? true : undefined,
      };
      const result = await this.git.init(initOptions);
      
      // If we're not in a bare repository, make an initial commit to establish the branch
      if (!bare) {
        try {
          // Create a README.md file as first commit to establish the branch
          const readmePath = path.join(this.repoPath, 'README.md');
          await fs.writeFile(readmePath, `# Git Repository\n\nInitialized with branch '${initialBranch}'.`);
          await this.git.add('README.md');
          await this.git.commit(`Initial commit`, { '--allow-empty': null });
        } catch (commitError) {
          // If initial commit fails, it's not critical - the repo is still initialized
          console.error('Failed to create initial commit:', commitError);
        }
      }
      
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to initialize repository')
      );
    }
  }

  /**
   * Clones a Git repository
   * 
   * @param url - URL of the repository to clone
   * @param options - Clone options
   * @returns Promise resolving to operation result
   */
  async cloneRepo(url: string, options: GitRepositoryOptions = {}): Promise<OperationResult<string>> {
    try {
      await this.ensureRepoPathExists();
      const result = await this.git.clone(url, this.repoPath, options);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to clone repository from ${url}`)
      );
    }
  }

  /**
   * Gets the status of the repository
   * 
   * @returns Promise resolving to repository status
   */
  async getStatus(): Promise<OperationResult<GitRepositoryStatus>> {
    try {
      const status = await this.git.status();
      return createSuccessResult(status);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to get repository status')
      );
    }
  }

  // ==========================================
  // Commit Operations
  // ==========================================

  /**
   * Stages files for commit
   * 
   * @param files - Array of file paths to stage, or '.' for all
   * @returns Promise resolving to operation result
   */
  async stageFiles(files: string[] | string = '.'): Promise<OperationResult<string>> {
    try {
      if (Array.isArray(files) && files.length === 0) {
        return createSuccessResult('No files to stage');
      }
      
      const result = await this.git.add(files);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to stage files')
      );
    }
  }

  /**
   * Unstages files
   * 
   * @param files - Array of file paths to unstage, or '.' for all
   * @returns Promise resolving to operation result
   */
  async unstageFiles(files: string[] | string = '.'): Promise<OperationResult<string>> {
    try {
      if (Array.isArray(files) && files.length === 0) {
        return createSuccessResult('No files to unstage');
      }
      
      // Use reset to unstage files
      const result = await this.git.reset(['--', ...(Array.isArray(files) ? files : [files])]);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to unstage files')
      );
    }
  }

  /**
   * Creates a commit
   * 
   * @param options - Commit options
   * @returns Promise resolving to commit hash
   */
  async commit(options: GitCommitOptions): Promise<OperationResult<string>> {
    try {
      // Simple-git uses the underlying git config for author information
      // when these specific options aren't provided, so we'll only set
      // them when explicitly specified
      const commitOptions: any = {
        '--allow-empty': options.allowEmpty ? null : undefined,
        '--amend': options.amend ? null : undefined
      };

      if (options.author && options.author.name) {
        commitOptions['--author'] = `${options.author.name} <${options.author.email || ''}>`;
      }
      const result = await this.git.commit(options.message, commitOptions);
      return createSuccessResult(result.commit || '');
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to create commit')
      );
    }
  }

  // ==========================================
  // Branch Operations
  // ==========================================

  /**
   * Creates a new branch
   * 
   * @param options - Branch options
   * @returns Promise resolving to operation result
   */
  async createBranch(options: GitBranchOptions): Promise<OperationResult<string>> {
    try {
      const branchParams = [options.name];
      if (options.startPoint) branchParams.push(options.startPoint);
      
      await this.git.branch(branchParams);
      
      if (options.checkout) {
        await this.git.checkout(options.name);
      }
      
      return createSuccessResult(`Branch '${options.name}' created successfully`);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to create branch '${options.name}'`)
      );
    }
  }

  /**
   * Lists all branches
   * 
   * @param all - Whether to include remote branches
   * @returns Promise resolving to list of branches
   */
  async listBranches(all = false): Promise<OperationResult<string[]>> {
    try {
      const branchSummary = await this.git.branch(all ? ['-a'] : []);
      return createSuccessResult(Object.keys(branchSummary.branches));
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to list branches')
      );
    }
  }

  /**
   * Checkout a branch or commit
   * 
   * @param target - Branch name, commit hash, or reference to checkout
   * @param createBranch - Whether to create the branch if it doesn't exist
   * @returns Promise resolving to operation result
   */
  async checkout(target: string, createBranch = false): Promise<OperationResult<string>> {
    try {
      const options = createBranch ? ['-b'] : [];
      const result = await this.git.checkout([...options, target]);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to checkout '${target}'`)
      );
    }
  }

  /**
   * Delete a branch
   * 
   * @param branchName - Name of the branch to delete
   * @param force - Whether to force delete
   * @returns Promise resolving to operation result
   */
  async deleteBranch(branchName: string, force = false): Promise<OperationResult<string>> {
    try {
      const options = force ? ['-D'] : ['-d'];
      const result = await this.git.branch([...options, branchName]);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to delete branch '${branchName}'`)
      );
    }
  }

  /**
   * Merge a branch into the current branch
   * 
   * @param options - Merge options
   * @returns Promise resolving to merge result
   */
  async merge(options: GitMergeOptions): Promise<OperationResult<string>> {
    try {
      const mergeParams = [options.branch];
      
      if (options.fastForwardOnly) mergeParams.unshift('--ff-only');
      if (options.noFastForward) mergeParams.unshift('--no-ff');
      if (options.message) {
        mergeParams.unshift('-m', options.message);
      }
      
      const result = await this.git.merge(mergeParams);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to merge branch '${options.branch}'`)
      );
    }
  }

  // ==========================================
  // Remote Operations
  // ==========================================

  /**
   * Add a remote
   * 
   * @param options - Remote options
   * @returns Promise resolving to operation result
   */
  async addRemote(options: GitRemoteOptions): Promise<OperationResult<string>> {
    try {
      const result = await this.git.addRemote(options.name, options.url);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to add remote '${options.name}'`)
      );
    }
  }

  /**
   * List remotes
   * 
   * @returns Promise resolving to list of remotes
   */
  async listRemotes(): Promise<OperationResult<Array<{name: string, refs: {fetch: string, push: string}}>>> {
    try {
      const remotes = await this.git.getRemotes(true);
      return createSuccessResult(remotes);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to list remotes')
      );
    }
  }

  /**
   * Fetch from a remote
   * 
   * @param remote - Remote to fetch from (default: origin)
   * @param branch - Branch to fetch (default: all branches)
   * @returns Promise resolving to fetch result
   */
  async fetch(remote = 'origin', branch?: string): Promise<OperationResult<string>> {
    try {
      const options = branch ? [remote, branch] : [remote];
      const result = await this.git.fetch(options);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to fetch from remote '${remote}'`)
      );
    }
  }

  /**
   * Pull from a remote
   * 
   * @param options - Pull options
   * @returns Promise resolving to pull result
   */
  async pull(options: GitPullOptions = {}): Promise<OperationResult<string>> {
    try {
      const pullOptions: Record<string, any> = {};
      
      if (options.remote) pullOptions.remote = options.remote;
      if (options.branch) pullOptions.branch = options.branch;
      if (options.rebase) pullOptions['--rebase'] = null;
      
      const result = await this.git.pull(pullOptions);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to pull changes')
      );
    }
  }

  /**
   * Push to a remote
   * 
   * @param options - Push options
   * @returns Promise resolving to push result
   */
  async push(options: GitPushOptions = {}): Promise<OperationResult<string>> {
    try {
      const pushOptions: string[] = [];
      
      if (options.force) pushOptions.push('--force');
      if (options.setUpstream) pushOptions.push('--set-upstream');
      
      const remote = options.remote || 'origin';
      const branch = options.branch || 'HEAD';
      
      const result = await this.git.push(remote, branch, pushOptions);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to push changes')
      );
    }
  }

  // ==========================================
  // History Operations
  // ==========================================

  /**
   * Get commit history
   * 
   * @param options - Options for git log
   * @returns Promise resolving to commit history
   */
  async getLog(options: {maxCount?: number, file?: string} = {}): Promise<OperationResult<GitLogEntry[]>> {
    try {
      // Build options object for simple-git in the format it expects
      const logOptions: any = {
        maxCount: options.maxCount || 50,
        format: {
          hash: '%H',
          abbrevHash: '%h',
          author_name: '%an',
          author_email: '%ae',
          date: '%ai',
          message: '%s'
        }
      };
      
      if (options.file) {
        logOptions.file = options.file;
      }
      
      const result = await this.git.log(logOptions);
      
      // Parse the log output into structured data
      const entries: GitLogEntry[] = result.all.map((entry: any) => ({
        hash: entry.hash,
        abbrevHash: entry.hash.substring(0, 7),
        author: entry.author_name,
        authorEmail: entry.author_email,
        date: new Date(entry.date),
        message: entry.message,
        refs: entry.refs
      }));
      
      return createSuccessResult(entries);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to get commit history')
      );
    }
  }

  /**
   * Get file blame information
   * 
   * @param filePath - Path to the file
   * @returns Promise resolving to blame information
   */
  async getBlame(filePath: string): Promise<OperationResult<string>> {
    try {
      const result = await this.git.raw(['blame', filePath]);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to get blame for file '${filePath}'`)
      );
    }
  }

  /**
   * Get the diff between commits
   * 
   * @param fromRef - Starting reference (commit, branch, etc.)
   * @param toRef - Ending reference (default: current working tree)
   * @param path - Optional path to restrict the diff to
   * @returns Promise resolving to diff information
   */
  async getDiff(fromRef: string, toRef = 'HEAD', path?: string): Promise<OperationResult<GitDiffEntry[]>> {
    try {
      const args = ['diff', '--name-status', fromRef];
      
      if (toRef !== 'HEAD') {
        args.push(toRef);
      }
      
      if (path) {
        args.push('--', path);
      }
      
      const result = await this.git.raw(args);
      const entries: GitDiffEntry[] = [];
      
      // Parse the diff output into structured data
      const lines = result.split('\n').filter((line: string) => line.trim() !== '');
      
      for (const line of lines) {
        const [status, ...pathParts] = line.split('\t');
        const filePath = pathParts.join('\t');
        
        entries.push({
          path: filePath,
          // Mapping status letters to more descriptive terms
          status: status === 'A' ? 'added' :
                  status === 'M' ? 'modified' :
                  status === 'D' ? 'deleted' :
                  status === 'R' ? 'renamed' :
                  status === 'C' ? 'copied' : status
        });
      }
      
      return createSuccessResult(entries);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to get diff')
      );
    }
  }

  /**
   * Get the content of a file at a specific reference
   * 
   * @param filePath - Path to the file
   * @param ref - Git reference (commit, branch, etc.)
   * @returns Promise resolving to file content
   */
  async getFileAtRef(filePath: string, ref = 'HEAD'): Promise<OperationResult<string>> {
    try {
      const result = await this.git.show([`${ref}:${filePath}`]);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to get file '${filePath}' at ref '${ref}'`)
      );
    }
  }

  /**
   * Get unstaged diff (changes in working directory)
   * 
   * @param path - Optional path to restrict the diff to
   * @param showUntracked - Whether to include information about untracked files
   * @returns Promise resolving to diff content
   */
  async getUnstagedDiff(path?: string, showUntracked = true): Promise<OperationResult<string>> {
    try {
      const args = ['diff'];
      
      if (path) {
        args.push('--', path);
      }
      
      let diffResult = await this.git.raw(args);
      
      // If requested, also include information about untracked files
      if (showUntracked) {
        try {
          // Get status to find untracked files
          const statusResult = await this.getStatus();
          
          if (statusResult.resultSuccessful && statusResult.resultData.not_added.length > 0) {
            // Filter untracked files by path if specified
            const untrackedFiles = path 
              ? statusResult.resultData.not_added.filter(file => file === path || file.startsWith(path + '/'))
              : statusResult.resultData.not_added;
            
            if (untrackedFiles.length > 0) {
              // Add header for untracked files if we have a diff and untracked files
              if (diffResult.trim() !== '') {
                diffResult += '\n\n';
              }
              
              diffResult += '# Untracked files:\n';
              for (const file of untrackedFiles) {
                diffResult += `# - ${file}\n`;
              }
            }
          }
        } catch (error) {
          // Silently ignore errors with listing untracked files
          console.error('Error listing untracked files:', error);
        }
      }
      
      return createSuccessResult(diffResult);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to get unstaged diff')
      );
    }
  }

  /**
   * Get staged diff (changes in index)
   * 
   * @param path - Optional path to restrict the diff to
   * @returns Promise resolving to diff content
   */
  async getStagedDiff(path?: string): Promise<OperationResult<string>> {
    try {
      const args = ['diff', '--cached'];
      
      if (path) {
        args.push('--', path);
      }
      
      const result = await this.git.raw(args);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to get staged diff')
      );
    }
  }

  /**
   * List files in a directory at a specific reference
   * 
   * @param dirPath - Path to the directory (relative to the repo root)
   * @param ref - Git reference (commit, branch, etc.)
   * @returns Promise resolving to list of files
   */
  async listFilesAtRef(dirPath: string = '.', ref = 'HEAD'): Promise<OperationResult<string[]>> {
    try {
      const result = await this.git.raw(['ls-tree', '-r', '--name-only', ref, dirPath]);
      
      // Parse the output
      const files = result.split('\n')
        .filter((line: string) => line.trim() !== '')
        .filter((file: string) => {
          // If dirPath is empty or root, include all files
          if (!dirPath || dirPath === '.') {
            return true;
          }
          
          // Otherwise, only include files that are within the directory
          return file.startsWith(dirPath + '/');
        });
      
      return createSuccessResult(files);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to list files in directory '${dirPath}' at ref '${ref}'`)
      );
    }
  }

  // ==========================================
  // Advanced Operations
  // ==========================================

  /**
   * Create a tag
   * 
   * @param options - Tag options
   * @returns Promise resolving to operation result
   */
  async createTag(options: GitTagOptions): Promise<OperationResult<string>> {
    try {
      const tagArgs = [options.name];
      
      if (options.ref) {
        tagArgs.push(options.ref);
      }
      
      if (options.message) {
        tagArgs.unshift('-m', options.message);
        // -a creates an annotated tag
        tagArgs.unshift('-a');
      }
      
      const result = await this.git.tag(tagArgs);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to create tag '${options.name}'`)
      );
    }
  }

  /**
   * List tags
   * 
   * @returns Promise resolving to list of tags
   */
  async listTags(): Promise<OperationResult<string[]>> {
    try {
      const tags = await this.git.tags();
      return createSuccessResult(tags.all);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to list tags')
      );
    }
  }

  /**
   * Create a stash
   * 
   * @param options - Stash options
   * @returns Promise resolving to operation result
   */
  async createStash(options: GitStashOptions = {}): Promise<OperationResult<string>> {
    try {
      const stashArgs: string[] = [];
      
      if (options.message) {
        stashArgs.push('save', options.message);
      }
      
      if (options.includeUntracked) {
        stashArgs.push('--include-untracked');
      }
      
      const result = await this.git.stash(stashArgs);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to create stash')
      );
    }
  }

  /**
   * List stashes
   * 
   * @returns Promise resolving to list of stashes
   */
  async listStashes(): Promise<OperationResult<string>> {
    try {
      const result = await this.git.stash(['list']);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to list stashes')
      );
    }
  }

  /**
   * Show a commit's details
   * 
   * @param commitHash - Hash of the commit to show
   * @returns Promise resolving to commit details
   */
  async showCommit(commitHash: string): Promise<OperationResult<string>> {
    try {
      const result = await this.git.raw(['show', commitHash]);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to show commit '${commitHash}'`)
      );
    }
  }

  /**
   * Apply a stash
   * 
   * @param stashId - Stash identifier (default: most recent stash)
   * @returns Promise resolving to operation result
   */
  async applyStash(stashId = 'stash@{0}'): Promise<OperationResult<string>> {
    try {
      const result = await this.git.stash(['apply', stashId]);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to apply stash '${stashId}'`)
      );
    }
  }

  /**
   * Pop a stash
   * 
   * @param stashId - Stash identifier (default: most recent stash)
   * @returns Promise resolving to operation result
   */
  async popStash(stashId = 'stash@{0}'): Promise<OperationResult<string>> {
    try {
      const result = await this.git.stash(['pop', stashId]);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to pop stash '${stashId}'`)
      );
    }
  }

  /**
   * Cherry-pick commits
   * 
   * @param commits - Array of commit hashes to cherry-pick
   * @returns Promise resolving to operation result
   */
  async cherryPick(commits: string[]): Promise<OperationResult<string>> {
    try {
      if (commits.length === 0) {
        return createSuccessResult('No commits specified for cherry-pick');
      }
      
      const result = await this.git.raw(['cherry-pick', ...commits]);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to cherry-pick commits')
      );
    }
  }

  /**
   * Rebase the current branch
   * 
   * @param branch - Branch to rebase onto
   * @param interactive - Whether to use interactive rebase
   * @returns Promise resolving to operation result
   */
  async rebase(branch: string, interactive = false): Promise<OperationResult<string>> {
    try {
      const args = interactive ? ['-i', branch] : [branch];
      const result = await this.git.rebase(args);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to rebase onto '${branch}'`)
      );
    }
  }

  /**
   * Reset the repository to a specific commit
   * 
   * @param ref - Reference to reset to
   * @param mode - Reset mode (hard, soft, mixed)
   * @returns Promise resolving to operation result
   */
  async reset(ref = 'HEAD', mode: 'hard' | 'soft' | 'mixed' = 'mixed'): Promise<OperationResult<string>> {
    try {
      const args = [`--${mode}`, ref];
      const result = await this.git.reset(args);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, `Failed to reset to '${ref}'`)
      );
    }
  }

  /**
   * Clean the working directory
   * 
   * @param directories - Whether to remove directories too
   * @param force - Whether to force clean
   * @returns Promise resolving to operation result
   */
  async clean(directories = false, force = false): Promise<OperationResult<string>> {
    try {
      const args = ['-f'];
      if (directories) args.push('-d');
      if (force) args.push('-x');
      
      const result = await this.git.clean(args);
      return createSuccessResult(result);
    } catch (error) {
      return createFailureResult(
        this.handleGitError(error, 'Failed to clean working directory')
      );
    }
  }
}