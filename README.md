<div align="center">
  <h1>git-mcp-server</h1>
  <p><b>A comprehensive Git Model Context Protocol (MCP) server enabling AI agents to perform complete version control operations. Built for security and scalability with native support for both local and serverless deployment.</b></p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-2.4.2-blue.svg?style=flat-square)](./CHANGELOG.md) [![MCP Spec](https://img.shields.io/badge/MCP%20Spec-2025--06--18-8A2BE2.svg?style=flat-square)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/changelog.mdx) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-^1.20.0-green.svg?style=flat-square)](https://modelcontextprotocol.io/) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![Status](https://img.shields.io/badge/Status-Stable-brightgreen.svg?style=flat-square)](https://github.com/cyanheads/git-mcp-server/issues) [![TypeScript](https://img.shields.io/badge/TypeScript-^5.9.3-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun-v1.2.21-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

---

## 🛠️ Tools Overview

This server provides 26 comprehensive Git operations organized into six functional categories:

| Category                  | Tools                                                                                                 | Description                                                                              |
| :------------------------ | :---------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| **Repository Management** | `git_init`, `git_clone`, `git_status`, `git_clean`                                                    | Initialize repos, clone from remotes, check status, and clean untracked files            |
| **Staging & Commits**     | `git_add`, `git_commit`, `git_diff`                                                                   | Stage changes, create commits, and compare changes                                       |
| **History & Inspection**  | `git_log`, `git_show`, `git_blame`, `git_reflog`                                                      | View commit history, inspect objects, trace line-by-line authorship, and view ref logs   |
| **Branching & Merging**   | `git_branch`, `git_checkout`, `git_merge`, `git_rebase`, `git_cherry_pick`                            | Manage branches, switch contexts, integrate changes, and apply specific commits          |
| **Remote Operations**     | `git_remote`, `git_fetch`, `git_pull`, `git_push`                                                     | Configure remotes, download updates, synchronize repositories, and publish changes       |
| **Advanced Workflows**    | `git_tag`, `git_stash`, `git_reset`, `git_worktree`, `git_set_working_dir`, `git_wrapup_instructions` | Tag releases, stash changes, reset state, manage worktrees, and access workflow guidance |

### Key Capabilities

**Repository Operations**

- Initialize new repositories or clone from any Git remote
- Comprehensive status checking with detailed file states
- Safe cleanup of untracked files with force confirmation

**Commit Management**

- Create conventional commits with automatic message validation
- Full commit history with filtering by author, date, file, and message
- Inspect any Git object (commits, tags, trees) with detailed output
- Compare changes between commits, branches, or working tree states

**Branching & Integration**

- Complete branch lifecycle: create, list, rename, delete
- Smart merging with conflict detection and strategy selection
- Interactive rebasing for clean commit history
- Cherry-pick specific commits across branches

**Remote Collaboration**

- Manage multiple remotes with full CRUD operations
- Fetch updates with pruning and tag management
- Pull with automatic merge or rebase strategies
- Push with force-with-lease protection and upstream tracking

**Advanced Features**

- Tag management for releases and milestones
- Stash operations for temporary work storage
- Reset capabilities with safety confirmations
- Worktree support for parallel work on multiple branches
- Persistent working directory for session continuity
- Workflow instructions for best practices

## ✨ Features

This server is built on the [`mcp-ts-template`](https://github.com/cyanheads/mcp-ts-template) and inherits its rich feature set:

- **Declarative Tools**: Define agent capabilities in single, self-contained files. The framework handles registration, validation, and execution.
- **Robust Error Handling**: A unified `McpError` system ensures consistent, structured error responses.
- **Pluggable Authentication**: Secure your server with zero-fuss support for `none`, `jwt`, or `oauth` modes.
- **Abstracted Storage**: Swap storage backends (`in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2`) without changing business logic.
- **Full-Stack Observability**: Deep insights with structured logging (Pino) and optional, auto-instrumented OpenTelemetry for traces and metrics.
- **Dependency Injection**: Built with `tsyringe` for a clean, decoupled, and testable architecture.
- **Edge-Ready**: Write code once and run it seamlessly on your local machine or at the edge on Cloudflare Workers.

Plus, specialized features for **Git integration**:

- **Direct Git CLI Execution**: Secure interaction with the standard `git` command-line tool via process execution.
- **Comprehensive Coverage**: 23 tools covering all essential Git operations from init to push.
- **Working Directory Management**: Session-specific directory context for multi-repo workflows.
- **Safety Features**: Explicit confirmations for destructive operations like `git clean` and `git reset --hard`.
- **Commit Signing**: Optional GPG/SSH signing support for verified commits.

## 🚀 Getting Started

### MCP Client Settings/Configuration

Add the following to your MCP Client configuration file (e.g., `cline_mcp_settings.json`).

```json
{
  "mcpServers": {
    "git-mcp-server": {
      "command": "bunx",
      "args": ["@cyanheads/git-mcp-server@latest"],
      "env": {
        "MCP_LOG_LEVEL": "info",
        "GIT_SIGN_COMMITS": "false"
      }
    }
  }
}
```

### Prerequisites

- [Bun v1.2.0](https://bun.sh/) or higher
- [Git](https://git-scm.com/) installed and accessible in your system PATH

### Installation

1. **Clone the repository:**

```sh
git clone https://github.com/cyanheads/git-mcp-server.git
```

2. **Navigate into the directory:**

```sh
cd git-mcp-server
```

3. **Install dependencies:**

```sh
bun install
```

## ⚙️ Configuration

All configuration is centralized and validated at startup in `src/config/index.ts`. Key environment variables in your `.env` file include:

| Variable                       | Description                                                                                    | Default     |
| :----------------------------- | :--------------------------------------------------------------------------------------------- | :---------- |
| `MCP_TRANSPORT_TYPE`           | The transport to use: `stdio` or `http`.                                                       | `stdio`     |
| `MCP_HTTP_PORT`                | The port for the HTTP server.                                                                  | `3015`      |
| `MCP_HTTP_HOST`                | The hostname for the HTTP server.                                                              | `127.0.0.1` |
| `MCP_HTTP_ENDPOINT_PATH`       | The endpoint path for MCP requests.                                                            | `/mcp`      |
| `MCP_AUTH_MODE`                | Authentication mode: `none`, `jwt`, or `oauth`.                                                | `none`      |
| `STORAGE_PROVIDER_TYPE`        | Storage backend: `in-memory`, `filesystem`, `supabase`, `cloudflare-kv`, `r2`.                 | `in-memory` |
| `OTEL_ENABLED`                 | Set to `true` to enable OpenTelemetry.                                                         | `false`     |
| `MCP_LOG_LEVEL`                | The minimum level for logging (`debug`, `info`, `warn`, `error`).                              | `info`      |
| `GIT_SIGN_COMMITS`             | Set to `"true"` to enable GPG/SSH signing for commits. Requires server-side Git configuration. | `false`     |
| `GIT_WRAPUP_INSTRUCTIONS_PATH` | Optional path to custom markdown file with Git workflow instructions.                          | `(none)`    |
| `MCP_AUTH_SECRET_KEY`          | **Required for `jwt` auth.** A 32+ character secret key.                                       | `(none)`    |
| `OAUTH_ISSUER_URL`             | **Required for `oauth` auth.** URL of the OIDC provider.                                       | `(none)`    |

## ▶️ Running the Server

### Local Development

- **Build and run the production version**:

  ```sh
  # One-time build
  bun rebuild

  # Run the built server
  bun start:http
  # or
  bun start:stdio
  ```

- **Development mode with hot reload**:

  ```sh
  bun dev:http
  # or
  bun dev:stdio
  ```

- **Run checks and tests**:
  ```sh
  bun devcheck # Lints, formats, type-checks, and more
  bun test     # Runs the test suite
  ```

### Cloudflare Workers

1. **Build the Worker bundle**:

```sh
bun build:worker
```

2. **Run locally with Wrangler**:

```sh
bun deploy:dev
```

3. **Deploy to Cloudflare**:

```sh
bun deploy:prod
```

## 📂 Project Structure

| Directory                   | Purpose & Contents                                                               |
| :-------------------------- | :------------------------------------------------------------------------------- |
| `src/mcp-server/tools`      | Your tool definitions (`*.tool.ts`). This is where Git capabilities are defined. |
| `src/mcp-server/resources`  | Your resource definitions (`*.resource.ts`). Provides Git context data sources.  |
| `src/mcp-server/transports` | Implementations for HTTP and STDIO transports, including auth middleware.        |
| `src/storage`               | `StorageService` abstraction and all storage provider implementations.           |
| `src/services`              | Integrations with external services (LLMs, Speech, etc.).                        |
| `src/container`             | Dependency injection container registrations and tokens.                         |
| `src/utils`                 | Core utilities for logging, error handling, performance, and security.           |
| `src/config`                | Environment variable parsing and validation with Zod.                            |
| `tests/`                    | Unit and integration tests, mirroring the `src/` directory structure.            |

## 📦 Resources

The server provides resources that offer contextual information about the Git environment:

| Resource URI              | Description                                                                                   |
| :------------------------ | :-------------------------------------------------------------------------------------------- |
| `git://working-directory` | Returns the currently configured working directory for the session. Shows `NOT_SET` if unset. |

## 🎯 Prompts

The server provides structured prompt templates that guide AI agents through complex workflows:

| Prompt Name    | Description                                                                                                                                          | Parameters                                                                                              |
| :------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| `git_wrapup`   | A systematic workflow protocol for completing git sessions. Guides agents through reviewing changes, updating documentation, and creating commits. | `changelogPath`, `skipDocumentation`, `createTag`, `updateAgentFiles`                                   |

### Using Prompts

Prompts provide pre-configured workflows that agents can invoke to follow best practices. For example, the `git_wrapup` prompt creates a structured checklist for:
- Analyzing repository changes with `git_diff`
- Updating `CHANGELOG.md` with version entries
- Reviewing and updating documentation
- Creating atomic, conventional commits
- Verifying completion with `git_status`

Prompts are MCP primitives that LLM clients can discover and invoke through the protocol.

## 📤 Understanding Tool Responses

This server follows a dual-output architecture for all tools:

### What Users See (Human-Readable)
When you invoke a tool through your MCP client, you see a **formatted summary** designed for human consumption. For example, `git_status` might show:
```
# Git Status: main

## Staged (2)
- src/index.ts
- README.md

## Unstaged (1)
- package.json
```

### What the LLM Sees (Complete Structured Data)
Behind the scenes, the LLM receives **complete structured data** via the `responseFormatter` function. This includes:
- All metadata (commit hashes, timestamps, authors)
- Full file lists and change details
- Hierarchical summaries with markdown formatting
- Everything needed to answer follow-up questions

**Why This Matters**: The LLM can answer detailed questions like "Who made the last commit?" or "What files changed in commit abc123?" because it has access to the full dataset, even if you only saw a summary.

**For Developers**: When creating custom tools, always include complete data in your `responseFormatter`. Balance human-readable summaries with comprehensive structured information. See [`CLAUDE.md`](CLAUDE.md) for response formatter best practices.

## 🧑‍💻 Agent Development Guide

For strict rules when using this server with an AI agent, refer to the **`CLAUDE.md`** and **`AGENTS.md`** files in this repository. Key principles include:

- **Logic Throws, Handlers Catch**: Never use `try/catch` in your tool `logic`. Throw an `McpError` instead.
- **Pass the Context**: Always pass the `RequestContext` object through your call stack for logging and tracing.
- **Use the Barrel Exports**: Register new tools and resources only in the `index.ts` barrel files within their respective `definitions` directories.
- **Declarative Tool Pattern**: Each tool is defined in a single `*.tool.ts` file with schema, logic, and response formatting.

## 🔒 Security Features

- **Path Sanitization**: All file paths are validated and sanitized to prevent directory traversal attacks.
- **Command Injection Prevention**: Git commands are executed with carefully validated arguments.
- **Destructive Operation Protection**: Dangerous operations require explicit confirmation flags.
- **Authentication Support**: Built-in JWT and OAuth support for secure deployments.
- **Rate Limiting**: Optional rate limiting via the DI-managed `RateLimiter` service.
- **Audit Logging**: All Git operations are logged with full context for security auditing.

## 🧪 Testing

This server uses [Vitest](https://vitest.dev/) for testing.

- **Run all tests:**

  ```sh
  bun test
  ```

- **Run tests with coverage:**

  ```sh
  bun test:coverage
  ```

- **Run tests in watch mode:**
  ```sh
  bun test --watch
  ```

## 🤝 Contributing

Issues and pull requests are welcome! If you plan to contribute, please run the local checks and tests before submitting your PR.

```sh
bun run devcheck
bun test
```

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the existing patterns
4. Run `bun devcheck` to ensure code quality
5. Run `bun test` to verify all tests pass
6. Commit your changes with conventional commits
7. Push to your fork and open a Pull Request

## 📜 License

This project is licensed under the Apache 2.0 License. See the [LICENSE](./LICENSE) file for details.

---

<div align="center">
  <p>Built with ❤️ using the <a href="https://github.com/cyanheads/mcp-ts-template">mcp-ts-template</a></p>
  <p>
    <a href="https://github.com/sponsors/cyanheads">Sponsor this project</a> •
    <a href="https://www.buymeacoffee.com/cyanheads">Buy me a coffee</a>
  </p>
</div>
