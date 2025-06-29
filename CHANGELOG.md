# Changelog

All notable changes to this project will be documented in this file.

## v2.1.7 - 2025-06-29

### Changed
- Suppressed `dotenv` debug output to prevent interference with the stdio transport.
- Updated the fallback package name in the configuration for better error identification.


## v2.1.6 - 2025-06-29

### Dependencies
- Updated the following dependencies:
  - `@modelcontextprotocol/sdk` to `^1.13.2`
  - `@types/node` to `^24.0.7`
  - `dotenv` to `^17.0.0`
  - `hono` to `^4.8.3`
  - `openai` to `^5.8.2`
  - `winston-transport` to `^4.9.0`
- Updated the following devDependencies:
  - `prettier` to `^3.6.2`
  - `typedoc` to `^0.28.6`

### Changed
- Minor formatting changes across several files.

## v2.1.5 - 2025-06-29

### Security

- Patched a command injection vulnerability where unsanitized user input could be passed to `child_process.exec`. All `exec` calls have been replaced with the safer `execFile` method, which treats arguments as distinct values rather than executable script parts. Thank you to [@dellalibera](https://github.com/dellalibera) for the disclosure. For more details, see the security advisory: [GHSA-3q26-f695-pp76](https://github.com/cyanheads/git-mcp-server/security/advisories/GHSA-3q26-f695-pp76).

## v2.1.4 - 2025-06-20

### Changed

- **HTTP Transport Layer**: Migrated the entire HTTP transport from Express to Hono for improved performance and a more modern API. This includes new middleware for CORS, rate limiting, and error handling.
- **Authentication Architecture**: Refactored the authentication system into a modular, strategy-based architecture.
  - Supports both JWT and OAuth 2.1 bearer token validation.
  - Configuration is managed via `MCP_AUTH_MODE` environment variable.
  - Uses `AsyncLocalStorage` for safer, context-aware access to authentication info.
- **Session Management**: Simplified session state management by centralizing the working directory logic within the main server instance, removing transport-specific state handlers.

## v2.1.3 - 2025-06-20

### Changed

- (docs) Updated `README.md` to improve clarity, add a core capabilities table, and reflect new dependency versions.
- (docs) Updated `README.md` installation instructions to recommend `npx` for easier setup.

### Dependencies

- Updated the following dependencies:
  - `@modelcontextprotocol/inspector` to `^0.14.3`
  - `@modelcontextprotocol/sdk` to `^1.13.0`
  - `@types/jsonwebtoken` to `^9.0.10`
  - `@types/node` to `^24.0.3`
  - `@types/validator` to `^13.15.2`
  - `openai` to `^5.6.0`
  - `zod` to `^3.25.67`

## v2.1.2 - 2025-06-14

### Fixed

- (tools) `gitCommit` tool now provides a specific, clearer error message when a pre-commit hook fails, preventing confusion with merge conflicts. (Addresses GitHub Issue [#13](https://github.com/cyanheads/git-mcp-server/issues/13))

### Changed

- (tools) Refactored error handling across all Git tools to use structured `McpError` exceptions with specific `BaseErrorCode`s (e.g., `CONFLICT`, `NOT_FOUND`, `VALIDATION_ERROR`) instead of returning `{ success: false, ... }` objects. This provides more consistent and machine-readable error responses.
- (tools) Improved logging across all Git tools for better traceability and debugging, ensuring structured context is always included.
- (tools) Refined success and result objects for several tools (`gitPull`, `gitPush`, `gitMerge`, etc.) to be more consistent and structured.

### Dependencies

- Updated the following dependencies:
  - `@modelcontextprotocol/inspector` to `^0.14.1`
  - `@modelcontextprotocol/sdk` to `^1.12.3`

## v2.1.1 - 2025-06-13

### Changed

- (docs) Updated `README.md` to reflect the new version `2.1.1`.
- (docs) Updated `git_wrapup_instructions` tool description for clarity.
- (docs) Updated `git_wrapup_instructions` tool logic to include a prompt for the agent.

### Dependencies

- Updated the following dependencies:
  - `@modelcontextprotocol/inspector` to `^0.14.0`
  - `@types/node` to `^24.0.1`
  - `openai` to `^5.3.0`
  - `zod` to `^3.25.64`
  - `@types/express` to `^5.0.3` (devDependency)

### Other

- Bump version to 2.1.1.

## v2.1.0 - 2025-06-03

### Changed

- (tools) `gitStatus` tool:
  - Reworked JSON output structure to provide more detailed and categorized information for staged and unstaged changes (e.g., `Added`, `Modified`, `Deleted` arrays under `staged_changes` and `unstaged_changes`).
  - Updated tool description to accurately reflect the new, richer output format.
- (tools) `gitWrapupInstructions` tool:
  - Now includes the full JSON output of the `git_status` tool in its own result, providing immediate context on repository status when initiating a wrap-up.
  - Updated internal logic to fetch and integrate the `git_status` output.
  - Enhanced registration to initialize and utilize necessary session state accessors (`getWorkingDirectory`, `getSessionId`) for fetching Git status.
- (core) `server.ts`: Added initialization call for `gitWrapupInstructionsStateAccessors` to ensure the tool has access to session-specific context.
- (docs) `docs/tree.md`: Updated timestamp.

### Dependencies

- Updated the following dependencies:
  - `@types/node` to `^22.15.29`
  - `ignore` to `^7.0.5`
  - `openai` to `^5.0.2`
  - `zod` to `^3.25.49`

### Other

- Bump version to 2.1.0.

## v2.0.15 - 2025-05-30

### Changed

- (deps) Updated `@modelcontextprotocol/sdk` to `^1.12.1`.
- (deps) Downgraded `chrono-node` from `2.8.1` to `2.8.0`.
- (tools) Refined the instructional text within the `git_wrapup_instructions` tool for clarity and better formatting.
- (docs) Updated `README.md` to reflect new SDK version and project version.
- (docs) Updated `docs/tree.md` to reflect current project structure and new files.

### Added

- (config) Added `.ncurc.json` to specify `chrono-node` as a rejected update, pinning it to `2.8.0`.

### Other

- Bump version to 2.0.15.

## v2.0.14 - 2025-05-30

### Changed

- (tools) `git_diff` tool now supports an `includeUntracked` boolean parameter. If true, the diff output will also include the content of untracked files by comparing them against `/dev/null`.
- (docs) Updated `README.md` to reflect the new `includeUntracked` parameter in `git_diff` tool description and arguments table.
- (docs) Updated version badge in `README.md` to `v2.0.14`.
- (docs) Updated version in `README.md` Resources section to `v2.0.14`.

### Other

- Bump version to 2.0.14.

## v2.0.13 - 2025-05-30

### Added

- (tools) Added `git_wrapup_instructions` tool to provide a standard Git wrap-up workflow, including reviewing changes, updating documentation (README, CHANGELOG), and making logical commits.
- (core) Integrated the `git_wrapup_instructions` tool into the server by adding its registration in `src/mcp-server/server.ts`.

### Changed

- (docs) Updated `README.md` to include the new `git_wrapup_instructions` tool in the tools table.

### Other

- Bump version to 2.0.13 (implicitly).

## v2.0.12 - 2025-05-25

### Added

- (tools) Added `git_worktree` tool to manage Git worktrees, including listing, adding, removing, moving, and pruning.
- (tools) `gitSetWorkingDir` tool can now optionally initialize a new Git repository with `git init --initial-branch=main` if `initializeIfNotPresent: true` is set and the target directory is not already a Git repository.

### Changed

- (tools) `gitInit` tool now defaults the initial branch to `main` if no `initialBranch` is specified in the input.
- (security) Refactored `authMiddleware.ts` to align with MCP SDK's `AuthInfo` type, improving JWT claim handling for `clientId` and `scopes`. Invalid or missing scopes now default to an empty array.
- (deps) Updated various dependencies, including:
  - `@modelcontextprotocol/inspector` to `^0.13.0`
  - `@modelcontextprotocol/sdk` to `^1.12.0`
  - `@types/node` to `^22.15.21`
  - `@types/validator` to `^13.15.1`
  - `openai` to `^4.103.0`
  - `zod` to `^3.25.28`
  - `@types/express` to `^5.0.2` (devDependency)
- (docs) Updated `docs/tree.md` to include the new `gitWorktree` tool.
- (docs) Updated `README.md` to reflect the new `gitWorktree` tool, changes to `gitInit` and `gitSetWorkingDir`, and updated dependency versions.

### Fixed

- (http) Added a workaround in `httpTransport.ts` to sanitize `req.auth` for SDK compatibility, addressing potential type mismatches.

### Other

- Bump version to 2.0.12.

## v2.0.11 - 2025-05-14

### Fixed

- (logging) Replaced direct `console.log` calls for server startup messages in HTTP and STDIO transports with `logger.notice()` to ensure MCP client compatibility and prevent parsing issues. (Addresses GitHub Issue #9)
- (logging) Refactored internal logger (`utils/internal/logger.ts`):
  - Deferred informational setup messages (e.g., logs directory creation, console logging status) to use the logger's own `info()` method after Winston is initialized.
  - Made critical pre-initialization `console.error` and `console.warn` calls conditional on TTY to prevent non-JSONRPC output when running in stdio mode with an MCP client.
  - Extracted console formatting logic into a reusable helper function (`createWinstonConsoleFormat`) to reduce duplication.
  - Added comments explaining TTY-conditional logging for clarity.

### Changed

- (chore) Updated various dependencies (e.g., `@modelcontextprotocol/sdk`, `@types/node`, `openai`).
- (docs) Refreshed `docs/tree.md` to include `mcp.json` and reflect current structure.

### Other

- Bump version to 2.0.11.

## v2.0.10 - 2025-05-07

### Added

- (dev) Added MCP Inspector configuration (`mcp.json`) to define server settings for `git-mcp-server` and `git-mcp-server-http` when using the inspector. (bf3a164)
- (dev) Added npm scripts `inspector` and `inspector:http` to easily launch the MCP Inspector with the defined configurations. (bf3a164)

### Dependencies

- Added `@modelcontextprotocol/inspector: ^0.11.0` to `dependencies`. (bf3a164)

### Changed

- (docs) Updated version badge in `README.md` to `2.0.10`. (bf3a164)

### Other

- Bump version to 2.0.10. (bf3a164)

## v2.0.9 - 2025-05-07

### Added

- (gitLog) Group commit logs by author in the JSON response, providing a more structured view of commit history. (5b5e037)

### Changed

- (security) Refactored path sanitization (`sanitizePath`) across all tools to use an object response (`SanitizedPathInfo`), improving robustness and providing more context. This includes updated JSDoc, standardized error handling within sanitization, and minor refactors to other sanitization functions. (5b5e037)
- (gitDiff) The 'diff' field in the `gitDiff` tool's response now includes the string "No changes found." directly when no differences are detected, ensuring consistent output format. (5b5e037)

### Other

- Bump version to 2.0.9. (bfe23ea)

## v2.0.8 - 2025-05-07

### Fixed

- Resolved issue where Windows drive letters could be stripped from absolute paths during sanitization when `allowAbsolute` was not explicitly true. This primarily affected `git_set_working_dir` and other tools when absolute paths were provided. The `sanitizePath` calls in git tool logic now correctly pass `{ allowAbsolute: true }`. Fixes GitHub Issue #8. (`6f405a1`)

### Changed

- (security) Update `sanitizePath` calls in all git tool logic to explicitly pass `{ allowAbsolute: true }` ensuring correct handling of absolute paths. (`6f405a1`)

### Dependencies

- Update `@types/node` from `^22.15.9` to `^22.15.15`. (`c28fe86`)

### Other

- Bump version to 2.0.8 (implicitly, as part of user's update process and reflected in package.json by commit `c28fe86` which was intended for 2.0.7 but now aligns with 2.0.8)

## v2.0.5 - 2025-05-05

### Added

- (tools) Enhance `git_commit` tool result to include commit message and committed files list (`1f74915`)

### Changed

- (core) Alphabetize tool imports and initializers in `server.ts` for better organization (`1f74915`)
- (docs) Refine `git_commit` tool description for clarity (`1f74915`)

### Other

- Bump version to 2.0.5 (`1f74915`)

## v2.0.4 - 2025-05-05

- (docs): Added smithery.yaml

## v2.0.3 - 2025-05-05

### Added

- (tools) Enhance git_commit escaping & add showSignature to git_log (`312d431`)

### Changed

- (core) Update server logic and configuration (`75b6683`)
- (tools) Update git tool implementations (`8b9ddaf`)
- (transport) Update transport implementations and add auth middleware (`a043d20`)
- (internal) Consolidate utilities and update types (`051ad9f`)
- Reorganize utilities and server transport handling (`b5c5840`)

### Documentation

- Update project structure in README and tree (`bc8f033`)
- (signing) Improve commit signing docs and add fallback logic (`de28bef`)
- Update README and file tree, remove temporary diff file (`3f86039`)

### Other

- **test**: Test automatic commit signing (commit.gpgsign=true) (`ef094d3`)
- **chore**: Update dependencies (`3cb662a`)
