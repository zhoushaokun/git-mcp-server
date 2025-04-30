# Git MCP Server - New Tool Implementation Plan

This document outlines the plan for implementing new Git tools in the MCP server, following the established pattern.

## Directory Structure

Each new tool will reside in its own directory under `src/mcp-server/tools/`:

```
src/mcp-server/tools/
├── gitRemote/
│   ├── index.ts
│   ├── logic.ts
│   └── registration.ts
├── gitTag/
│   ├── index.ts
│   ├── logic.ts
│   └── registration.ts
├── gitStash/
│   ├── index.ts
│   ├── logic.ts
│   └── registration.ts
├── gitShow/
│   ├── index.ts
│   ├── logic.ts
│   └── registration.ts
└── gitClean/
    ├── index.ts
    ├── logic.ts
    └── registration.ts
```

## Tool Definitions and Parameters

### 1. `git_remote`

-   **Description**: Manages remote repositories (list, add, remove, show).
-   **Input Schema (`GitRemoteInputSchema`)**:
    ```typescript
    z.object({
      path: z.string().min(1).optional().default('.').describe("Path to the Git repository. Defaults to the session's working directory if set."),
      mode: z.enum(['list', 'add', 'remove', 'show']).describe("Operation mode: 'list', 'add', 'remove', 'show'"),
      name: z.string().min(1).optional().describe("Remote name (required for 'add', 'remove', 'show')"),
      url: z.string().url().optional().describe("Remote URL (required for 'add')"),
      // Potentially add options like '-f' for add, etc. later if needed
    })
    ```
-   **Output (`GitRemoteResult`)**: JSON object varying by mode.
    -   `list`: `{ success: boolean, remotes: { name: string, fetchUrl: string, pushUrl: string }[] }`
    -   `add`: `{ success: boolean, message: string }`
    -   `remove`: `{ success: boolean, message: string }`
    -   `show`: `{ success: boolean, details: string }` (Raw output from `git remote show`)

### 2. `git_tag`

-   **Description**: Manages tags (list, create, delete).
-   **Input Schema (`GitTagInputSchema`)**:
    ```typescript
    z.object({
      path: z.string().min(1).optional().default('.').describe("Path to the Git repository. Defaults to the session's working directory if set."),
      mode: z.enum(['list', 'create', 'delete']).describe("Operation mode: 'list', 'create', 'delete'"),
      tagName: z.string().min(1).optional().describe("Tag name (required for 'create', 'delete')"),
      message: z.string().optional().describe("Annotation message (used with 'create' and annotate=true)"),
      commitRef: z.string().optional().describe("Commit or object to tag (defaults to HEAD if omitted for 'create')"),
      annotate: z.boolean().default(false).describe("Create an annotated tag (requires message if true)"),
      // force: z.boolean().default(false).describe("Force tag creation/update (use with caution)"), // Consider adding later
      // sign: z.boolean().default(false).describe("GPG sign the tag"), // Consider adding later
    })
    ```
-   **Output (`GitTagResult`)**: JSON object varying by mode.
    -   `list`: `{ success: boolean, tags: string[] }`
    -   `create`: `{ success: boolean, message: string, tagName: string }`
    -   `delete`: `{ success: boolean, message: string, tagName: string }`

### 3. `git_stash`

-   **Description**: Manages stashed changes (list, apply, pop, drop, save).
-   **Input Schema (`GitStashInputSchema`)**:
    ```typescript
    z.object({
      path: z.string().min(1).optional().default('.').describe("Path to the Git repository. Defaults to the session's working directory if set."),
      mode: z.enum(['list', 'apply', 'pop', 'drop', 'save']).describe("Operation mode: 'list', 'apply', 'pop', 'drop', 'save'"),
      stashRef: z.string().optional().describe("Stash reference (e.g., 'stash@{1}') (required for 'apply', 'pop', 'drop')"),
      message: z.string().optional().describe("Message for 'save' mode"),
      // includeUntracked: z.boolean().default(false).describe("Include untracked files in 'save' mode (-u)"), // Consider adding later
      // keepIndex: z.boolean().default(false).describe("Keep staged changes in 'save' mode (--keep-index)"), // Consider adding later
    })
    ```
-   **Output (`GitStashResult`)**: JSON object varying by mode.
    -   `list`: `{ success: boolean, stashes: { ref: string, description: string }[] }`
    -   `apply`/`pop`: `{ success: boolean, message: string, conflicts: boolean }` (Conflicts might require manual resolution)
    -   `drop`: `{ success: boolean, message: string }`
    -   `save`: `{ success: boolean, message: string, stashRef?: string }` (stashRef might not be easily available on save)

### 4. `git_show`

-   **Description**: Shows information about Git objects (commits, tags, blobs, trees).
-   **Input Schema (`GitShowInputSchema`)**:
    ```typescript
    z.object({
      path: z.string().min(1).optional().default('.').describe("Path to the Git repository. Defaults to the session's working directory if set."),
      ref: z.string().min(1).describe("The object reference (commit hash, tag name, branch name, HEAD, etc.) to show."),
      filePath: z.string().optional().describe("Optional specific file path within the ref to show (e.g., show a file at a specific commit).")
      // format: z.string().optional().describe("Optional format string for the output"), // Consider adding later
    })
    ```
-   **Output (`GitShowResult`)**:
    -   `{ success: boolean, content: string }` (Returns the raw output of `git show` as text)

### 5. `git_clean`

-   **Description**: Removes untracked files from the working directory. **Destructive operation.**
-   **Input Schema (`GitCleanInputSchema`)**:
    ```typescript
    z.object({
      path: z.string().min(1).optional().default('.').describe("Path to the Git repository. Defaults to the session's working directory if set."),
      force: z.boolean().refine(val => val === true, { message: "Force must be explicitly set to true to execute git clean." }).describe("Required confirmation to run the command. Must be true."),
      dryRun: z.boolean().default(false).describe("Show what would be deleted without actually deleting (-n)."),
      directories: z.boolean().default(false).describe("Remove untracked directories in addition to files (-d)."),
      ignored: z.boolean().default(false).describe("Remove ignored files as well (-x). Use with caution."),
      // exclude: z.string().optional().describe("Exclude files matching pattern (-e <pattern>)"), // Consider adding later
    })
    ```
-   **Output (`GitCleanResult`)**:
    -   `{ success: boolean, message: string, filesRemoved: string[] }` (List files removed, or files that *would* be removed if dryRun=true)

## Implementation Notes

-   All tools will follow the established pattern (`logic.ts`, `registration.ts`, `index.ts`).
-   Input validation will be handled by Zod schemas.
-   Path resolution and sanitization are critical, especially for commands like `git_clean`.
-   Session working directory state will be managed via context accessors/setters passed during registration.
-   Error handling will use `ErrorHandler.tryCatch` and `McpError`.
-   Output will be structured JSON returned as `TextContent` in the `CallToolResult`.
-   The `git_clean` tool will require explicit `force: true` and potentially additional user confirmation mechanisms within the host application due to its destructive nature. The `requires_approval` flag in the host's tool call mechanism should be set to `true` for this tool.
