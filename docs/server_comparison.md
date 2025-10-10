# Git MCP Server Comparison: Production vs. Development

This document outlines the differences between the `git-mcp-server` (production) and `git-mcp-server-development` (development) instances connected to this environment.

## Summary of Differences

| Category                  | `git-mcp-server` (Production)                                  | `git-mcp-server-development` (Development)                                 |
| ------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Total Tools**           | 25                                                             | 25                                                                         |
| **Unique Tools**          | `git_clear_working_dir`, `git_wrapup_instructions`             | `git_blame`, `git_reflog`                                                  |
| **Common Tools**          | 23                                                             | 23                                                                         |
| **Naming Convention**     | Generally uses terms like `mode`, `branchName`.                | Generally uses more verbose terms like `operation`, `name`.                |
| **Parameter Granularity** | Tends to have fewer, sometimes overloaded parameters.          | Tends to have more specific, granular boolean parameters for options.      |
| **Resources**             | Provides `git://working-directory` for managing session state. | Provides `echo://` resources primarily for testing purposes.               |

---

## I. Unique Tools

### Tools Only in `git-mcp-server` (Production)

-   `git_clear_working_dir`: Clears the session-specific working directory set by `git_set_working_dir`.
-   `git_wrapup_instructions`: Provides a standard "wrap-up" workflow guide, including instructions for `git_diff` and `git_commit`.

### Tools Only in `git-mcp-server-development` (Development)

-   `git_blame`: Shows line-by-line authorship information for a file.
-   `git_reflog`: Lets you view reference logs to track when branch tips and other references were updated.

---

## II. Common Tool Parameter Comparison

This section details the differences in parameters for tools that exist on both servers. The `development` server generally features schemas with more granular options and different naming conventions.

### `git_add`

| `git-mcp-server` (Prod) | `git-mcp-server-development` (Dev) | Notes                                                 |
| :---------------------- | :--------------------------------- | :---------------------------------------------------- |
| `files` (string/array)  | `files` (array)                    | `dev` is stricter, requiring an array for the `files` parameter. |
| -                       | `update` (boolean)                 | `dev` adds a flag to only stage modified/deleted files. |
| -                       | `all` (boolean)                    | `dev` adds functionality equivalent to the `--all` flag. |
| -                       | `force` (boolean)                  | `dev` adds a flag to allow adding otherwise ignored files. |

### `git_branch`

| `git-mcp-server` (Prod) | `git-m-server-development` (Dev) | Notes                                                           |
| :---------------------- | :------------------------------- | :-------------------------------------------------------------- |
| `mode`                  | `operation`                      | Parameter rename.                                               |
| `branchName`            | `name`                           | Parameter rename.                                               |
| `newBranchName`         | `newName`                        | Parameter rename.                                               |
| `show-current` (in `mode`) | -                             | `prod` has a specific mode to show the current branch.          |
| -                       | `merged` (boolean)               | `dev` adds a flag to list only branches merged into HEAD.       |
| -                       | `noMerged` (boolean)             | `dev` adds a flag to list only branches not merged into HEAD.   |

### `git_checkout`

| `git-mcp-server` (Prod) | `git-m-server-development` (Dev) | Notes                                                                      |
| :---------------------- | :------------------------------- | :------------------------------------------------------------------------- |
| `branchOrPath` (string) | `target` (string/ref)            | Parameter rename; `dev` schema is more specific about reference types.     |
| `newBranch` (string)    | `createBranch` (boolean)         | `prod` takes a branch name to create, whereas `dev` uses a boolean flag combined with `target`. |
| -                       | `paths` (array)                  | `dev` adds a parameter to restore specific file paths.                     |
| -                       | `track` (boolean)                | `dev` adds a flag to set up remote tracking for a new branch.              |

### `git_cherry_pick`

| `git-mcp-server` (Prod) | `git-m-server-development` (Dev) | Notes                                                              |
| :---------------------- | :------------------------------- | :----------------------------------------------------------------- |
| `commitRef` (string)    | `commits` (array)                | `dev` is explicit about accepting an array of commits.             |
| `mainline` (integer)    | -                                | `prod` has an option for specifying a parent number for merge commits. |
| `strategy` (enum)       | -                                | `prod` allows specifying a merge strategy.                         |
| `signoff` (boolean)     | -                                | `prod` allows adding a 'Signed-off-by' line to the commit message. |
| -                       | `continueOperation` (boolean)    | `dev` adds a flag to continue an operation after resolving conflicts. |
| -                       | `abort` (boolean)                | `dev` adds a flag to abort the current cherry-pick operation.      |

### `git_clone`

| `git-mcp-server` (Prod) | `git-m-server-development` (Dev) | Notes                                      |
| :---------------------- | :------------------------------- | :----------------------------------------- |
| `repositoryUrl`         | `url`                            | Parameter rename.                          |
| `targetPath`            | `localPath`                      | Parameter rename.                          |
| `quiet` (boolean)       | -                                | `prod` has a quiet flag to suppress output. |
| -                       | `bare` (boolean)                 | `dev` adds a flag to create a bare repository. |
| -                       | `mirror` (boolean)               | `dev` adds a flag to create a mirror clone. |

### `git_commit`

| `git-mcp-server` (Prod) | `git-m-server-development` (Dev) | Notes                                                                |
| :---------------------- | :------------------------------- | :------------------------------------------------------------------- |
| `forceUnsignedOnFailure` (boolean) | -                     | `prod` has a specific fallback for GPG signing failures.             |
| `filesToStage` (array)  | -                                | `prod` has a parameter to stage files immediately before committing. |
| -                       | `sign` (boolean)                 | `dev` has a simple boolean flag for GPG signing.                     |
| -                       | `noVerify` (boolean)             | `dev` adds a flag to bypass pre-commit and commit-msg hooks.         |

### `git_diff`

| `git-mcp-server` (Prod) | `git-m-server-development` (Dev) | Notes                                                                    |
| :---------------------- | :------------------------------- | :----------------------------------------------------------------------- |
| `commit1`, `commit2`, `file` | `target`, `source`, `paths` | `dev` uses different naming and an array for paths.                      |
| `includeUntracked` (boolean) | -                           | `prod` can show the content of untracked files in the diff.              |
| -                       | `nameOnly` (boolean)             | `dev` adds a flag to show only the names of changed files.               |
| -                       | `stat` (boolean)                 | `dev` adds a flag to show a summary diffstat instead of the full diff.   |
| -                       | `contextLines` (integer)         | `dev` allows specifying the number of context lines around changes.      |

### `git_fetch`

- `git-mcp-server` has an `all` flag to fetch from all remotes.
- `git-mcp-server-development` adds a `depth` parameter for shallow fetching.

### `git_log`

- **`git-mcp-server`**: Parameters include `maxCount`, `author`, `since`, `until`, `branchOrFile`, and `showSignature`.
- **`git-mcp-server-development`**: Considerably more extensive. It adds `skip` (for pagination), `grep` (for message searching), `oneline`, `stat`, and `patch`. It also uses more specific parameter names like `branch` and `filePath`.

### `git_merge`

| `git-mcp-server` (Prod) | `git-m-server-development` (Dev) | Notes                                                                    |
| :---------------------- | :------------------------------- | :----------------------------------------------------------------------- |
| `commitMessage`         | `message`                        | Parameter rename.                                                        |
| `noFf`                  | `noFastForward`                  | Parameter rename.                                                        |
| `abort` (boolean)       | -                                | `prod` supports aborting a merge that is in progress.                    |
| -                       | `strategy` (enum)                | `dev` adds support for specifying a merge strategy (e.g., `ort`, `ours`). |

### `git_pull`

- Parameter names differ slightly (`ffOnly` vs. `fastForwardOnly`), but functionality is largely the same.

### `git_push`

- `git-mcp-server` has a `remoteBranch` parameter to specify a destination branch name and a `delete` flag to remove a remote branch.
- `git-mcp-server-development` adds a `dryRun` flag.

### `git_rebase`

- `git-mcp-server`'s schema is more comprehensive for managing an in-progress rebase, with a `mode` parameter that supports `continue`, `abort`, and `skip`.
- `git-mcp-server-development`'s schema is simpler, focused on starting a rebase, and lacks the interactive `mode` for managing an ongoing rebase.

### `git_remote`

- `git-mcp-server-development` is significantly more capable. It adds support for `rename`, `get-url`, and `set-url`, which are not present in the production server's tool.

### `git_reset`

- `git-mcp-server` supports more reset modes, including `merge` and `keep`.
- `git-mcp-server-development` adds a `paths` parameter to reset specific files, rather than the entire HEAD.

### `git_show`

- The `dev` tool is more advanced, allowing for `json` output format and a `stat` summary. The `prod` tool can show a specific `filePath` within a ref, which the `dev` tool cannot.

### `git_stash`

- `git-mcp-server-development` renames the `save` mode to `push` and adds a `clear` mode. It also adds `includeUntracked` and `keepIndex` flags for more control over stashing.

### `git_status`

- **`git-mcp-server`**: Has no input parameters beyond the default `path`. The output schema is highly detailed, breaking down changes into many categories (`staged`, `not_added`, `modified`, etc.).
- **`git-mcp-server-development`**: Adds an `includeUntracked` input parameter. The output schema provided in the prompt is not detailed, but the input offers more control.

### `git_tag`

- `git-mcp-server-development` adds a `force` flag to allow overwriting existing tags. Parameter names also differ slightly (`commitRef` vs. `commit`, `annotate` vs. `annotated`).

### `git_worktree`

- While both support the same modes, `git-mcp-server` has a more extensive set of boolean flags for fine-tuning behavior (`force`, `detach`, `verbose`, `dryRun`).

---

## III. Identical Tools

Based on the schemas provided, the following tools appear to have identical or near-identical functionality and parameters across both servers:

-   `git_clean`
-   `git_init`
-   `git_set_working_dir`

---

## IV. Resource Comparison

-   **`git-mcp-server` (Production)**: Provides one primary resource, `git://working-directory`. This resource is crucial for the session-based workflow, as it allows tools to retrieve the current working directory set by the user.

-   **`git-mcp-server-development` (Development)**: Provides a templated resource `echo://{message}` and a direct resource `echo://hello`. These are simple echo resources designed for testing the MCP resource mechanism itself and do not provide application-specific data.

---
