# Changelog

All notable changes to this project will be documented in this file.

## v2.3.3 - 2025-09-15

### Added

- **Documentation**: New guide on "How to Publish Your MCP Server" (`docs/publishing-mcp-server-registry.md`) including an all-in-one `publish-mcp` script.
- **Scripts**: Added `scripts/validate-mcp-publish-schema.ts` to automate version syncing, schema validation, and publishing workflow for MCP servers.

### Changed

- **Build & Configuration**:
  - Updated `.gitignore` with new categories and ignore patterns for `.vscode/`, `.history/`, `build/`, `dist/`, `out/`, `logs/`, `data/`, generated documentation, environment files, and MCP registry related files.
  - Added `mcpName` field to `package.json` for MCP registry identification.
  - `server.json` updated with new `mcpName` and version.
- **Dependencies**:
  - Updated `@modelcontextprotocol/sdk` to `^1.18.0`.
  - Updated `axios` to `^1.12.2`.
  - Updated `jose` to `^6.1.0`.
  - Updated `openai` to `^5.20.2`.
  - Updated `tiktoken` to `^1.0.22`.
  - Updated `@eslint/js` to `^9.35.0`.
  - Updated `@types/node` to `^24.4.0`.
  - Updated `@types/validator` to `13.15.3`.
  - Added `ajv` and `ajv-formats` as devDependencies. 
  - Updated `eslint` to `^9.35.0`.
  - Updated `globals` to `^16.4.0`.
  - Updated `msw` to `^2.11.2`.
  - Updated `tsx` to `^4.20.5`.
  - Updated `typedoc` to `^0.28.13`.
  - Updated `typescript-eslint` to `^8.43.0`.
- **Code Improvement**:
  - Modified `src/utils/metrics/tokenCounter.ts` to explicitly check `tool_call.type === "function"` before accessing function-specific properties; improves robustness for different tool call types.

## v2.3.2 - 2025-07-31

### Feature

- **Enhanced Tool Feedback**: Implemented an enhancement across multiple core Git tools to provide immediate, contextual feedback on the repository's state. The following tools now include the complete, structured output of `git status` in their JSON response upon successful execution:
  - `git_add`
  - `git_checkout`
  - `git_cherry_pick`
  - `git_clean`
  - `git_commit`
  - `git_merge`
  - `git_pull`
  - `git_rebase`
  - `git_reset`
  - `git_stash`
    This change allows agents and clients to instantly verify the outcome of an operation without needing to make a subsequent call to `git_status`.

### Chore

- **Build & Configuration**:
  - **ESLint**: Updated `eslint.config.js` to add `coverage/`, `dist/`, `logs/`, and `data/` to the ignored paths, preventing linting of generated or irrelevant files.
  - **MCP Configuration**: Modified `mcp.json` to use `npx @cyanheads/git-mcp-server` as the execution command, simplifying server startup and removing the need for a local build.
- **Dependencies**:
  - Bumped the package version to `2.3.2` in `package.json` and `package-lock.json`.
- **Testing**:
  - Performed minor refactoring in `tests/utils/internal/errorHandler.test.ts` and `tests/utils/internal/logger.test.ts` to align with recent code modifications and improve test clarity.

## v2.3.1 - 2025-07-31

### Added

- **Testing**:
  - Added a comprehensive test suite covering authentication (`auth.test.ts`, `authUtils.test.ts`, `oauthStrategy.test.ts`), core utilities (`errorHandler.test.ts`, `logger.test.ts`, `requestContext.test.ts`), and transports (`stdioTransport.test.ts`).
  - Integrated `msw` for mocking API requests during tests.
  - Added `@vitest/coverage-v8` for generating code coverage reports.
- **CI/CD**:
  - Added `logs/` to `.gitignore` to prevent log files from being committed.

### Changed

- **Error Handling**:
  - Improved `ErrorHandler` to provide more specific and consistent error messages.
  - Enhanced `jwtStrategy.ts` and `oauthStrategy.ts` to re-throw structured `McpError`s, ensuring consistent error propagation.
- **Logging**:
  - Refactored the `Logger` class in `logger.ts` to be exportable and added a `resetForTesting` method to support isolated test runs.
  - Corrected the parameter order in a `logger.fatal` call within `httpTransport.ts` for better error reporting.
- **Dependencies**:
  - Updated `@modelcontextprotocol/sdk` to `^1.17.1`.
  - Updated various development dependencies to their latest versions.

### Fixed

- **Path Sanitization**: Improved path validation in `sanitization.ts` to explicitly disallow null bytes, enhancing security.
- **Git Log Parsing**: Corrected the field destructuring in `gitLog/logic.ts` to prevent potential errors when parsing commit bodies.

## v2.3.0 - 2025-07-31

### Added

- **Development Tooling**:
  - **`tsx`**: Replaced `ts-node` with `tsx` for significantly faster TypeScript execution in development, improving the developer workflow.
  - **ESLint**: Integrated ESLint with TypeScript support (`typescript-eslint`) to enforce code quality, catch potential errors, and maintain a consistent coding style across the project. A new `eslint.config.js` file has been added.
  - **TypeDoc**: Added TypeDoc for generating comprehensive API documentation from JSDoc comments. New configuration files (`typedoc.json`, `tsconfig.typedoc.json`, `tsdoc.json`) have been included.
- **Scripts**:
  - Added new npm scripts: `lint`, `lint:fix`, `typecheck`, `dev`, `dev:stdio`, `dev:http`, `audit`, and `audit:fix` to support the new tooling and improve development workflows.
  - Added `scripts/fetch-openapi-spec.ts` to download and save API specifications.
  - Added `scripts/README.md` to document the utility scripts.

### Changed

- **Core Refactoring**:
  - **Architectural Alignment**: The entire codebase has been refactored to strictly adhere to the "Logic Throws, Handler Catches" principle, improving separation of concerns and error handling consistency.
  - **JSDoc**: Added comprehensive JSDoc comments to all core files, tools, utilities, and scripts, enabling clear API documentation and better maintainability.
  - **Type Safety**: Replaced ambiguous `any` types with specific, inferred types from Zod schemas, enhancing type safety throughout the application.
- **Logging & Error Handling**:
  - **`RequestContext`**: Consistently passed `RequestContext` through the entire call stack for improved traceability and contextual logging.
  - **`ErrorHandler`**: Centralized error handling to use the `ErrorHandler` utility and structured `McpError` objects for consistent, machine-readable error responses.
- **Dependencies**:
  - Updated all major dependencies, including `@modelcontextprotocol/sdk`, `hono`, `zod`, and `winston`.
  - Added new development dependencies like `eslint`, `typescript-eslint`, `tsx`, and `typedoc`.

## v2.2.4 - 2025-07-29

### Added

- **Git Working Directory Resource**: Introduced a new resource, `git://working-directory`, which allows clients to retrieve the currently configured working directory for a session. This enhances contextual awareness for tools and agents interacting with the server.

### Changed

- **Documentation**: Updated `README.md` to include the new "Resources" section, documenting the `git://working-directory` resource. Also updated the version badge to `2.2.4`.

## v2.2.3 - 2025-07-29

### Added

- **Testing Framework**: Initial setup of Vitest testing framework for unit and integration testing. Added initial test setup, configurations (`vitest.config.ts`, `tsconfig.vitest.json`), and coverage reporting.
- **Git Signing**: Implemented automatic GPG/SSH signing for commit-creating operations (`git_commit`, `git_merge`, `git_cherry_pick`, `git_tag`) when `GIT_SIGN_COMMITS=true` is set. Includes a fallback to unsigned commits on signing failure.

### Changed

- **mcp-ts-template Alignment**: Updated the server to align with the latest changes in the [`mcp-ts-template` v1.7.7](https://github.com/cyanheads/mcp-ts-template/releases/tag/v1.7.7), including improvements to the project structure and configuration.
- **Configuration Overhaul**: Completely refactored `src/config/index.ts`. It now uses Zod for robust, type-safe validation of all environment variables, provides clear startup errors for misconfigurations, and automatically determines the project root.
- **Authentication Architecture**: Refactored the entire authentication system to use a strategy pattern.
  - Created `JwtStrategy` and `OauthStrategy` classes implementing a common `AuthStrategy` interface.
  - A new `authFactory` selects the strategy based on configuration.
  - A unified `authMiddleware` now delegates verification to the selected strategy, decoupling the transport layer from authentication logic.
- **Transport Layer Abstraction**: Decoupled the Hono web server from the MCP SDK's transport logic.
  - Introduced `StatefulTransportManager` and `StatelessTransportManager` to handle all session and request lifecycle logic.
  - The Hono `httpTransport` is now a thin layer responsible for routing, middleware, and bridging Hono's web streams with the SDK's Node.js streams. Streamable HTTP should work much better now.
  - This refactoring resulted in a major file reorganization within `src/mcp-server/transports/`.
- **Error Handling**: Improved the `ErrorHandler` to prevent mutation of original error objects and added several new `BaseErrorCode`s for more precise error reporting.

### Dependencies

- **Added**: `vitest`, `@vitest/coverage-v8`, `supertest`, `msw`, `@faker-js/faker` and other testing-related packages.
- **Updated**: `@modelcontextprotocol/sdk` to `^1.17.0`, `hono` to `^4.8.10`, and various other dependencies.

## v2.2.1 - 2025-07-17

### Changed

- **Error Handling Refactor**: Executed a comprehensive, mandatory refactoring across all Git tools to strictly enforce the "Logic Throws, Handler Catches" architectural principle. All `try...catch` blocks have been removed from the `logic.ts` files. The logic layer now exclusively throws structured `McpError`s on failure, while the `registration.ts` handler layer is solely responsible for catching and processing these errors. This ensures a clean separation of concerns and standardizes the error handling pipeline.
- **Structured Error Responses**: Updated all tool registration handlers to return a structured error object in the `structuredContent` field upon failure, including the `code`, `message`, and `details` of the `McpError`. This provides richer, machine-readable error context to the MCP client.
- **Dependency Updates**: Updated `@modelcontextprotocol/sdk` to `^1.16.0` and `openai` to `^5.10.1`.
- **Configuration**: Added `zod` to the reject list in `.ncurc.json` to prevent unintended upgrades.

## v2.2.0 - 2025-07-16

### Fixed

- **Validation Enforcement**: Corrected a critical flaw in two tool registration handlers (`gitTag`, `gitWorktree`) where the base Zod schema was used for registration instead of the refined schema. This meant that conditional validation rules (e.g., required fields for specific modes) were not being enforced. The handlers now explicitly parse incoming parameters with the full, refined schema, ensuring all validation logic is correctly applied before execution.

### Changed

- **Architectural Refactor**: Aligned the entire server with the latest architectural standards and the MCP specification (2025-06-18). This includes:
  - **Standardized Schemas**: All tools now use explicit Zod schemas for both input and output, ensuring type safety and clear data contracts. This enables structured output, a newer feature of the MCP specification. Not all MCP Clients support structured output so we keep backwards compatibility by returning stringified JSON.
  - **Logic/Handler Separation**: Core tool logic is now isolated in `logic.ts` files, with error handling managed by a dedicated `ErrorHandler` in the `registration.ts` handlers. This enforces the 'Logic Throws, Handler Catches' principle.
  - **Simplified State Management**: Removed state accessor initializers in favor of passing `getWorkingDirectory` and `getSessionId` functions directly to tool registration, cleaning up the server initialization process.
- **Tool Response Cleanup**: Refactored `git_push` and `git_pull` tools to remove redundant `summary` fields from their output, providing a cleaner and more concise response.
- **Tool Annotations**: Added descriptive annotations to all tool registrations to provide richer metadata to the client/LLM, improving tool discovery and usage.

### Dependencies

- Updated the following dependencies:
  - `@modelcontextprotocol/sdk` to `^1.15.1`
  - `@hono/node-server` to `^1.16.0`
  - `@types/node` to `^24.0.14`
  - `hono` to `^4.8.5`
  - `jose` to `^6.0.12`
  - `openai` to `^5.9.2`
- Updated the following devDependencies:
  - `typedoc` to `^0.28.7`

## v2.1.8 - 2025-06-29

### Fixed

- Downgraded `dotenv` to `^16.6.1` to suppress `dotenvx` promotional logging messages in v17.0 that were interfering with the stdio transport.
- Added `dotenv` to the `reject` list in `.ncurc.json` to prevent future automatic upgrades to problematic versions.

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
