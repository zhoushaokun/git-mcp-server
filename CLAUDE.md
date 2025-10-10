# Agent Protocol & Architectural Mandate

**Version:** 2.4.0
**Target Project:** git-mcp-server
**Last Updated:** 2025-10-09

This document defines the operational rules for contributing to this codebase. Follow it exactly.

> **Note on File Synchronization**: This file (`AGENTS.md`), along with `CLAUDE.md` and `.clinerules/AGENTS.md`, are hard-linked on the filesystem for tool compatibility (e.g., Cline does not work with symlinks). **Edit only the root `AGENTS.md`** – changes will automatically propagate to the other copies. DO NOT TOUCH THE OTHER TWO AGENTS.md & CLAUDE.md FILES.

---

## I. Core Principles (Non‑Negotiable)

1.  **The Logic Throws, The Handler Catches**
    - **Your Task (Logic):**
      - **Tools:** Implement pure, stateless business logic inside the `logic` function of a `ToolDefinition`.
      - **Resources:** Implement pure, stateless read logic inside the `logic` function of a `ResourceDefinition`.
      - **Do not add `try...catch` in these logic functions.**
    - **On Failure:** You must throw `new McpError(...)` with the appropriate `JsonRpcErrorCode` and context.
    - **Framework's Job (Handlers):**
      - **Tools** are wrapped by `createMcpToolHandler`, which creates the `RequestContext`, measures execution via `measureToolExecution`, formats the response, and is the only place that catches errors.
      - **Resources** are wrapped by `registerResource` (`resourceHandlerFactory`). The handler validates params, invokes logic, applies `responseFormatter` (defaulting to JSON), and catches errors.

2.  **Full‑Stack Observability**
    - **Tracing:** OpenTelemetry is preconfigured. Logs and errors are automatically correlated to traces.
    - **Performance:** `measureToolExecution` automatically records duration, success, payload sizes, and error codes for every tool call.
    - **No Manual Instrumentation:** Do not add custom spans in your logic. Use the provided utilities and structured logging. The framework handles the single wrapper span per tool invocation.

3.  **Structured, Traceable Operations**
    - Your logic functions will receive two context objects: `appContext` (for internal logging/tracing) and `sdkContext` (for SDK-level operations like Elicitation, Sampling, and Roots).
    - The `sdkContext` provides methods (like `elicitInput` and `createMessage`) for client interaction.
    - Pass the _same_ `appContext` through your internal call stack for continuity.
    - Use the global `logger` for all logging; include the `appContext` in every log call.

4.  **Decoupled Storage**
    - Never directly access persistence backends (`fs`, `supabase-js`, Worker KV/R2) from tool/resource logic.
    - **Default: Use the `StorageService`**, injected via DI, for simple key-value persistence.
    - **Advanced: Create domain-specific providers** when your data has rich structure beyond key-value storage (e.g., relational queries, complex filtering, recursive loading). See **When to Create Custom Providers** below.
    - The concrete storage provider is configured via environment variables and initialized at startup.
    - **Note for git-mcp-server:** This server uses `StorageService` primarily for session state (working directory persistence). Git operations execute directly via CLI.

5.  **Local ↔ Edge Runtime Parity**
    - All features must work with both local transports (`bun run dev:stdio`, `bun run dev:http`) and the Worker bundle (`bun run build:worker` + `bunx wrangler dev`/`deploy`).
    - Guard non-portable dependencies so the bundle stays edge-compatible.
    - Prefer runtime-agnostic abstractions (Hono + `@hono/mcp`, Fetch APIs) to keep Bun/Node on localhost identical to Cloudflare Workers.
    - **Note for git-mcp-server:** Git CLI operations are local-only and not compatible with edge deployment. Edge deployment should be considered experimental.

6.  **Use Elicitation for Missing Input**
    - If a tool requires a parameter that was not provided, use the `elicitInput` function from the `sdkContext`.
    - This allows the tool to interactively request the necessary information from the user instead of failing.
    - **Note for git-mcp-server:** Elicitation is available but not currently used in git tools. All required parameters are explicitly defined in schemas.

7.  **Graceful Degradation in Development**
    - When context values like `tenantId` are missing, default to permissive behavior instead of throwing errors.
    - **Pattern:** `const tenantId = appContext.tenantId || 'default-tenant';`
    - This aligns with the philosophy that auth/scope checks default to allowed when auth is disabled.
    - Production environments with auth enabled will provide real `tenantId` from JWT claims automatically.

---

## II. Architectural Overview & Directory Structure

Separation of concerns maps directly to the filesystem. Always place files in their designated locations.

| Directory                                   | Purpose & Guidance                                                                                                                                                                                                                                                                                                                |
| :------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`src/mcp-server/tools/definitions/`**     | **MCP Tool definitions.** Add new capabilities here as `[tool-name].tool.ts`. Follow the **Tool Development Workflow**.                                                                                                                                                                                                           |
| **`src/mcp-server/resources/definitions/`** | **MCP Resource definitions.** Add data sources or contexts as `[resource-name].resource.ts`. Follow the **Resource Development Workflow**.                                                                                                                                                                                        |
| **`src/mcp-server/tools/utils/`**           | **Shared tool utilities,** including `ToolDefinition` and tool handler factory.                                                                                                                                                                                                                                                   |
| **`src/mcp-server/resources/utils/`**       | **Shared resource utilities,** including `ResourceDefinition` and resource handler factory.                                                                                                                                                                                                                                       |
| **`src/mcp-server/transports/`**            | **Transport implementations:**<br>- `http/` (Hono + `@hono/mcp` Streamable HTTP)<br>- `stdio/` (MCP spec stdio transport)<br>- `auth/` (strategies and helpers). HTTP mode can enforce JWT or OAuth. Stdio mode should not implement HTTP-based auth.                                                                             |
| **`src/services/`**                         | **External service integrations** following a consistent domain-driven pattern:<br>- Each service domain (e.g., `llm/`, `speech/`) contains: `core/` (interfaces, orchestrators), `providers/` (implementations), `types.ts`, and `index.ts`<br>- Use DI for all service dependencies. See **Service Development Pattern** below. |
| **`src/storage/`**                          | **Abstractions and provider implementations** (in-memory, filesystem, supabase, cloudflare-r2, cloudflare-kv).                                                                                                                                                                                                                    |
| **`src/container/`**                        | **Dependency Injection (`tsyringe`).** Service registration and tokens.                                                                                                                                                                                                                                                           |
| **`src/utils/`**                            | **Global utilities.** Includes logging, performance, parsing, network, security, and telemetry. Note: The error handling module is located at `src/utils/internal/error-handler/`.                                                                                                                                                |
| **`tests/`**                                | **Unit/integration tests.** Mirrors `src/` for easy navigation and includes compliance suites.                                                                                                                                                                                                                                    |

---

## III. Architectural Philosophy: Pragmatic SOLID

- **Single Responsibility:** Group code that changes together.
- **Open/Closed:** Prefer extension via abstractions (interfaces, plugins/middleware).
- **Liskov Substitution:** Subtypes must be substitutable without surprises.
- **Interface Segregation:** Keep interfaces small and focused.
- **Dependency Inversion:** Depend on abstractions (DI-managed services).

**Complementary principles:**

- **KISS:** Favor simplicity.
- **YAGNI:** Don't build what you don't need yet.
- **Composition over Inheritance:** Prefer composable modules.

---

## IV. Tool Development Workflow

This is the only approved workflow for authoring or modifying tools.

#### Step 1 — File Location

- Place new tools in `src/mcp-server/tools/definitions/`.
- Name files `[tool-name].tool.ts`.
- Use existing template tools as reference (e.g., `template-echo-message.tool.ts`).
- **For git-mcp-server:** Git tools follow the naming pattern `git-[operation].tool.ts` (e.g., `git-commit.tool.ts`, `git-clone.tool.ts`).

#### Step 2 — Define the ToolDefinition

Export a single `const` named `[toolName]Tool` of type `ToolDefinition` with:

- `name`: Programmatic tool name (`snake_case` is recommended).
- `title` (optional): Human-readable title for UIs.
- `description`: Clear, LLM-facing description of what the tool does.
- `inputSchema`: A `z.object({ ... })`. **Every field must have a `.describe()`**.
- `outputSchema`: A `z.object({ ... })` describing the successful output structure.
- `logic`: An `async` function with the signature `(input, appContext, sdkContext) => Promise<Output>`. This function should contain pure business logic.
  - **No `try/catch` blocks**; throw `McpError` on failure.
  - **For dependencies, resolve them inside the logic function** using the global `container`. Do not use `@injectable` classes for tool logic. The framework is designed for stateless, function-based logic.
- `annotations` (optional): UI/behavior hints such as `readOnlyHint`, `openWorldHint`, and others (flexible dictionary).
- `responseFormatter` (optional): Map successful output to `ContentBlock[]` for the LLM to consume. **CRITICAL**: The LLM receives this formatted output, not the raw result. Include all data the LLM needs to answer questions. Balance human-readable summaries with complete structured data. If omitted, a default JSON string is used.

**Git Tool Naming Convention:**

```typescript
/**
 * Programmatic tool name (must be unique).
 * Naming convention for git-mcp-server: git_<operation>_<object>
 * - Use 'git_' prefix for all git operations
 * - Use lowercase snake_case
 * - Examples: 'git_commit', 'git_clone', 'git_status', 'git_branch'
 */
const TOOL_NAME = 'git_commit';
const TOOL_TITLE = 'Git Commit';
const TOOL_DESCRIPTION =
  'Create a new commit with staged changes in the repository.';
```

#### Step 2.5 — Apply Authorization (Mandatory for most tools)

- Wrap `logic` with `withToolAuth`.
- **Example:**
  ```ts
  import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
  // ...
  logic: withToolAuth(['tool:git:write'], yourToolLogic),
  ```

#### Step 3 — Register via Barrel Export

- Add your tool to `src/mcp-server/tools/definitions/index.ts` in `allToolDefinitions`.
- The DI container discovers and registers all tools from that array. No further registration is necessary.

---

### Response Formatter Best Practices

The `responseFormatter` function determines what the LLM receives. Follow these guidelines:

**❌ DO NOT:**

- Return only a summary with "Full details in structured output" (there is no separate structured output for the LLM)
- Omit critical data that the LLM needs to answer follow-up questions
- Assume the LLM can access the raw result object

**✅ DO:**

- Include both human-readable summaries AND complete data
- Structure output hierarchically (summary → details)
- Truncate extremely long fields (commit messages, diffs) but include key information
- For comparisons, show both commonalities/differences AND detailed breakdowns
- Use markdown formatting for clarity (headings, lists, code blocks)

**Examples for Git Operations:**

```typescript
// BAD: Summary only - LLM cannot answer detailed questions
function badFormatter(result: CommitOutput): ContentBlock[] {
  return [
    {
      type: 'text',
      text: 'Commit created successfully. See structured output for details.',
    },
  ];
}

// GOOD: Summary + Details - LLM has everything it needs
function goodFormatter(result: CommitOutput): ContentBlock[] {
  const summary = `# Commit Created Successfully\n\n`;
  const commitInfo =
    `**Commit Hash:** ${result.commitHash}\n` +
    `**Author:** ${result.author}\n` +
    `**Date:** ${result.date}\n` +
    `**Message:** ${result.message}\n\n`;

  const filesChanged =
    result.files.length > 0
      ? `## Files Changed (${result.files.length})\n${result.files.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';

  return [{ type: 'text', text: `${summary}${commitInfo}${filesChanged}` }];
}

// ALSO GOOD: Pure JSON for maximum flexibility
function jsonFormatter(result: CommitOutput): ContentBlock[] {
  return [{ type: 'text', text: JSON.stringify(result, null, 2) }];
}
```

**When to use each approach:**

- **Summary + Details**: Best for commits, logs, status, branch operations
- **Pure JSON**: Best for simple operations like init, fetch confirmation
- **Hybrid**: Use for complex operations like diff, log with many entries

#### Real-World Example: Git Log Formatter

```typescript
// Git log returns multiple commit entries
type GitLogOutput = {
  commits: Array<{
    hash: string;
    author: string;
    date: string;
    message: string;
    files?: string[];
  }>;
  totalCount: number;
};

// ❌ BAD: Only a summary
function badFormatter(result: GitLogOutput): ContentBlock[] {
  return [
    {
      type: 'text',
      text: `Found ${result.totalCount} commits.`,
    },
  ];
}

// ✅ GOOD: Summary + formatted commit history
function goodFormatter(result: GitLogOutput): ContentBlock[] {
  const header = `# Git Log (${result.totalCount} commits)\n\n`;

  const commits = result.commits
    .map(
      (commit) =>
        `## ${commit.hash.substring(0, 7)}\n` +
        `**Author:** ${commit.author}\n` +
        `**Date:** ${commit.date}\n` +
        `**Message:** ${commit.message}\n` +
        (commit.files ? `**Files:** ${commit.files.join(', ')}\n` : ''),
    )
    .join('\n---\n\n');

  return [
    {
      type: 'text',
      text: `${header}${commits}`,
    },
  ];
}
```

**Key principles demonstrated:**

1. **Hierarchy:** Header → Individual commits with metadata
2. **Complete data:** All commit hashes, authors, dates, messages included
3. **LLM-friendly:** LLM can answer "Who made the last commit?" or "What files changed?"
4. **Human-readable:** Clear formatting with markdown headers and separators

---

#### Example Tool Definition (Git-specific with Dependency Injection):

```ts
/**
 * @fileoverview Git status tool - shows working tree status.
 * @module
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { container } from 'tsyringe';
import { z } from 'zod';

import { StorageService } from '@/container/tokens.js';
import type { IStorageService } from '@/storage/core/IStorageService.js';
import type {
  SdkContext,
  ToolAnnotations,
  ToolDefinition,
} from '@/mcp-server/tools/utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { JsonRpcErrorCode, McpError } from '@/types-global/errors.js';
import { type RequestContext, logger } from '@/utils/index.js';
import { execGitCommand } from '@/utils/git-helpers.js'; // hypothetical helper

const TOOL_NAME = 'git_status';
const TOOL_TITLE = 'Git Status';
const TOOL_DESCRIPTION =
  'Show the working tree status including staged, unstaged, and untracked files.';

const TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
};

const InputSchema = z.object({
  workingDirectory: z
    .string()
    .optional()
    .describe(
      'The repository path. Uses session working directory if not provided.',
    ),
});

const OutputSchema = z.object({
  branch: z.string().describe('Current branch name.'),
  staged: z.array(z.string()).describe('Files staged for commit.'),
  unstaged: z.array(z.string()).describe('Files with unstaged changes.'),
  untracked: z.array(z.string()).describe('Untracked files.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

// Pure business logic function
async function gitStatusLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  logger.debug('Executing git status', {
    ...appContext,
    toolInput: input,
  });

  // Get working directory from input or session storage
  let workingDir = input.workingDirectory;
  if (!workingDir) {
    const storage = container.resolve<IStorageService>(StorageService);
    const tenantId = appContext.tenantId || 'default-tenant';
    workingDir = await storage.get(`session:workingDir:${tenantId}`);

    if (!workingDir) {
      throw new McpError(
        JsonRpcErrorCode.InvalidRequest,
        'No working directory specified and no session directory set.',
      );
    }
  }

  // Execute git status command
  const result = await execGitCommand('status', ['--porcelain', '-b'], {
    cwd: workingDir,
    context: appContext,
  });

  // Parse the output (simplified example)
  const lines = result.stdout.split('\n');
  const branch = lines[0].replace('## ', '').split('...')[0];
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  lines.slice(1).forEach((line) => {
    if (!line) return;
    const status = line.substring(0, 2);
    const file = line.substring(3);

    if (status[0] !== ' ' && status[0] !== '?') staged.push(file);
    if (status[1] !== ' ' && status[1] !== '?') unstaged.push(file);
    if (status === '??') untracked.push(file);
  });

  return { branch, staged, unstaged, untracked };
}

// Formatter for the final output to the LLM
function responseFormatter(result: ToolOutput): ContentBlock[] {
  const summary = `# Git Status: ${result.branch}\n\n`;

  const stagedSection =
    result.staged.length > 0
      ? `## Staged (${result.staged.length})\n${result.staged.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';

  const unstagedSection =
    result.unstaged.length > 0
      ? `## Unstaged (${result.unstaged.length})\n${result.unstaged.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';

  const untrackedSection =
    result.untracked.length > 0
      ? `## Untracked (${result.untracked.length})\n${result.untracked.map((f) => `- ${f}`).join('\n')}\n\n`
      : '';

  const text =
    result.staged.length === 0 &&
    result.unstaged.length === 0 &&
    result.untracked.length === 0
      ? `${summary}Working directory is clean.`
      : `${summary}${stagedSection}${unstagedSection}${untrackedSection}`;

  return [{ type: 'text', text }];
}

// The final tool definition
export const gitStatusTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: TOOL_ANNOTATIONS,
  logic: withToolAuth(['tool:git:read'], gitStatusLogic),
  responseFormatter,
};
```

---

## V. Resource Development Workflow

Resources mirror the tool pattern with a declarative `ResourceDefinition`. Use existing resources as reference templates.

#### Step 1 — File Location

- Place new resources in `src/mcp-server/resources/definitions/`.
- Name files `[resource-name].resource.ts`.
- **For git-mcp-server:** The primary resource is `git-working-directory.resource.ts` which provides session context.

#### Step 2 — Define the ResourceDefinition

Export a single `const` of type `ResourceDefinition` with:

- `name`: Unique programmatic resource name.
- `title` (optional): Human-readable title for UIs.
- `description`: Clear, LLM-facing description of what the resource returns.
- `uriTemplate`: A template like `git://working-directory`.
- `paramsSchema`: A `z.object({ ... })` for template/route params. **Every field must have a `.describe()`**.
- `outputSchema` (optional): A `z.object({ ... })` describing output.
- `mimeType` (optional): Default mime type for the response.
- `examples` (optional): Helpful discovery samples.
- `annotations` (optional): UI/behavior hints (flexible dictionary).
- `list` (optional): Provides `ListResourcesResult` for discovery.
- `logic`: `(uri, params, context) => { ... }` pure read logic. No `try/catch` here. Throw `McpError` on failure.
- `responseFormatter` (optional): `(result, { uri, mimeType }) => contents` array. If omitted, a default JSON formatter is used.

**Important:**

- The handler validates params via Zod before invoking `logic`.
- The `responseFormatter` must return an array of content blocks (`ReadResourceResult['contents']`). The handler performs a shallow validation (each item must be an object with a `uri`).
- Resource logic can be `async`; the handler `await`s it.

#### Step 2.5 — Apply Authorization

- Wrap `logic` with `withResourceAuth`.
- **Example:**
  ```ts
  import { withResourceAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
  // ...
  logic: withResourceAuth(['resource:git:read'], yourResourceLogic),
  ```

#### Step 3 — Register via Barrel Export

- Add your resource to `src/mcp-server/resources/definitions/index.ts` in `allResourceDefinitions`.
- The DI container discovers and registers all resources from that array.

---

## VI. Service Development Pattern

All external service integrations (LLM providers, speech services, email, etc.) follow a consistent domain-driven architecture pattern.

**Note for git-mcp-server:** This server does not currently use external service integrations beyond the core storage and utility services. Git operations are performed via direct CLI execution.

#### Standard Service Structure

Every service domain follows this organization:

```
src/services/<service-name>/
├── core/                          # Interfaces and abstractions
│   ├── I<Service>Provider.ts     # Provider interface contract
│   └── <Service>Service.ts       # (Optional) Multi-provider orchestrator
├── providers/                     # Concrete implementations
│   ├── <provider-name>.provider.ts
│   └── ...
├── types.ts                       # Domain-specific types and DTOs
└── index.ts                       # Barrel export (public API)
```

#### When to Use a Service Orchestrator

Create a `<Service>Service.ts` class in `core/` when you need:

- **Multi-provider orchestration** (e.g., Speech uses different providers for TTS vs STT)
- **Provider routing logic** (e.g., fallback chains, load balancing)
- **Capability aggregation** (e.g., combined health checks)
- **Cross-provider state management**
- **Complex business logic** with multi-step operations, state transformations, or conditional flows
- **Stateful operations** like session management, progress tracking, or eligibility evaluation

If your service uses a **single provider pattern**, skip the service class and inject the provider directly via DI.

**Decision Matrix:**

| Scenario                               | Pattern                          | Example                                     |
| -------------------------------------- | -------------------------------- | ------------------------------------------- |
| Simple CRUD with key-value storage     | Use `StorageService` directly    | User preferences, session working directory |
| Single external API integration        | Provider only (no service class) | Not used in git-mcp-server                  |
| Multiple providers for same capability | Service orchestrator             | Not used in git-mcp-server                  |
| Git CLI operations                     | Direct execution with helpers    | Git command execution utilities             |

#### Provider Implementation Guidelines

1. **Interface compliance**: All providers implement `I<Service>Provider`
2. **DI-injectable**: Mark with `@injectable()` decorator
3. **Health checks**: Implement `healthCheck(): Promise<boolean>`
4. **Error handling**: Throw `McpError` for failures (no try/catch in provider logic)
5. **Naming convention**: `<provider-name>.provider.ts` (lowercase, kebab-case)

#### When to Create Custom Providers

Create a custom provider (instead of using `StorageService`) when:

- **Rich data structure:** Your domain has complex nested objects, relationships, or metadata
- **Query capabilities:** You need filtering, searching, or aggregation beyond key-value lookup
- **Recursive operations:** Loading hierarchical data structures (e.g., directory trees)
- **Format transformation:** Reading/writing specific file formats (JSON, CSV, YAML)
- **Domain-specific validation:** Type-safe loading with Zod schemas for your domain
- **Cross-entity operations:** Joining data from multiple sources

**For git-mcp-server:**

The server uses `StorageService` for simple session state (working directory persistence). Git repository data is accessed directly through CLI commands, not through storage providers.

```typescript
// ✅ StorageService is sufficient for git-mcp-server session state:
const tenantId = appContext.tenantId || 'default-tenant';
const workingDir = await storage.get(`session:workingDir:${tenantId}`);

// ✅ Git data is accessed via CLI, not storage:
const status = await execGitCommand('status', ['--porcelain'], {
  cwd: workingDir,
});
```

**When to stick with StorageService:**

- Simple key-value data (session working directory, user preferences)
- Flat data structures without complex relationships
- Basic CRUD operations without specialized queries

---

## VII. Core Services & Utilities

#### DI-Managed Services (tokens in `src/container/tokens.ts`)

**Services Used in git-mcp-server:**

- **`StorageService`**
  - **Token:** `StorageService`
  - **Usage:** `@inject(StorageService) private storage: StorageService`
  - **Purpose:** Session state (working directory persistence)
  - **Note:** Requires `context.tenantId`; `StorageService` enforces presence and throws if missing.

- **`Logger`** (pino-backed singleton)
  - **Token:** `Logger`
  - **Usage (in injectable classes):** `@inject(Logger) private logger: typeof logger`
  - **Purpose:** Structured logging for all operations

- **`App Config`**
  - **Token:** `AppConfig`
  - **Usage:** `@inject(AppConfig) private config: typeof configModule`
  - **Purpose:** Access to validated environment configuration

- **`RateLimiter`**
  - **Token:** `RateLimiterService`
  - **Usage:** `@inject(RateLimiterService) private rateLimiter: RateLimiter`
  - **Purpose:** Optional rate limiting for HTTP transport

- **`CreateMcpServerInstance`** (factory function)
  - **Token:** `CreateMcpServerInstance`
  - **Usage:** Resolved by the `TransportManager` to create/configure the `McpServer`.

- **`TransportManager`**
  - **Token:** `TransportManagerToken`
  - **Usage:** `@inject(TransportManagerToken) private transportManager: TransportManager`
  - **Purpose:** Manages stdio/HTTP transport lifecycle

**Services NOT Used in git-mcp-server:**

The following services are available in the template but not used in this project:

- ❌ `ILlmProvider` (no LLM integration needed)
- ❌ `SupabaseAdminClient` (not used for git operations)
- ❌ Speech services (not needed)

#### Storage Providers (configured in `src/storage/core/storageFactory.ts`)

- Supported values (env `STORAGE_PROVIDER_TYPE`):
  - `in-memory` (default) - **Recommended for git-mcp-server**
  - `filesystem` (requires `STORAGE_FILESYSTEM_PATH`, Node only)
  - `supabase` (requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`)
  - `cloudflare-r2` (Worker-only)
  - `cloudflare-kv` (Worker-only)
- In serverless environments (Workers), non-Cloudflare providers are forced to `in-memory`.
- **Always use `StorageService` from DI to interact with storage.**

#### Directly Imported Utilities (for function-style logic)

- `logger` from `src/utils/index.js`
- `requestContextService` from `src/utils/index.js`
- `ErrorHandler.tryCatch` from `src/utils/index.js` (NOT in tool/resource logic; OK in services or setup code)
- `sanitization` from `src/utils/index.js` - **Critical for git-mcp-server to prevent path traversal**
- `fetchWithTimeout` from `src/utils/index.js` (for robust network calls with timeouts)
- `measureToolExecution` from `src/utils/index.js` (used by handlers)

#### Key Utilities (`src/utils/`)

The `src/utils/` directory contains a rich set of directly importable utilities for common tasks.

| Module            | Description & Key Exports (git-mcp-server specific)                                                                                                                                                                                                                                                                             |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`parsing/`**    | Robust parsers for various data formats. <br>- `jsonParser`: For parsing git command JSON output. <br>- `yamlParser`: For Git config files. <br>- Not typically needed: `csvParser`, `xmlParser`, `pdfParser`.                                                                                                                  |
| **`security/`**   | Security utilities - **CRITICAL for git operations**. <br>- `sanitization`: **MANDATORY** for validating file paths and preventing directory traversal. <br>- `rateLimiter`: Optional DI-managed service for enforcing rate limits. <br>- `idGenerator`: For creating unique identifiers (request IDs, session IDs).            |
| **`network/`**    | Networking helpers (not typically used in git-mcp-server). <br>- `fetchWithTimeout`: Available if needed for remote git operations.                                                                                                                                                                                             |
| **`scheduling/`** | Task scheduling (not typically used in git-mcp-server). <br>- `scheduler`: Available but git operations are on-demand.                                                                                                                                                                                                          |
| **`internal/`**   | Core internal machinery. <br>- `logger`: The global Pino logger instance - **use for all logging**. <br>- `requestContextService`: AsyncLocalStorage-based context propagation. <br>- `ErrorHandler`: Centralized error handling. <br>- `performance`: Utilities for performance measurement, including `measureToolExecution`. |
| **`telemetry/`**  | OpenTelemetry instrumentation and tracing helpers.                                                                                                                                                                                                                                                                              |

---

## VIII. Authentication & Authorization

#### HTTP Transport (configurable)

- **Modes:** `MCP_AUTH_MODE` = `'none' | 'jwt' | 'oauth'`
- When not `'none'`, the HTTP `/mcp` endpoint requires a `Bearer` token:
  - **JWT mode** uses a local secret (`MCP_AUTH_SECRET_KEY`).
    - In production, the secret is required; startup fails otherwise.
    - In development without the secret, verification is bypassed for template usability and a dev-mode `AuthInfo` is provided using `DEV_MCP_CLIENT_ID` and `DEV_MCP_SCOPES` (or sane defaults).
  - **OAuth mode** verifies JSON Web Tokens via a remote JWKS:
    - Requires `OAUTH_ISSUER_URL` and `OAUTH_AUDIENCE`; optionally `OAUTH_JWKS_URI`.
- **Extracted claims:**
  - `clientId`: token claim `'cid'` or `'client_id'`
  - `scopes`: array claim `'scp'` or space-delimited string `'scope'`
  - `subject`: `'sub'` (optional)
  - `tenantId`: `'tid'` (optional; if present, it becomes `context.tenantId` via `requestContextService`)
- **Scope enforcement inside logic:**
  - **Always wrap tool/resource logic with `withToolAuth` or `withResourceAuth`.**
  - If no auth context exists (e.g., auth disabled), the scope check defaults to allowed for development usability.

**Recommended scopes for git-mcp-server:**

- `tool:git:read` - For read-only operations (status, log, diff, show)
- `tool:git:write` - For write operations (commit, push, tag, branch create)
- `resource:git:read` - For resource access (working directory)

#### STDIO Transport

- Follows MCP spec guidance: no HTTP-based auth flows over stdio.
- Authorization is expected to be handled by the host application controlling the process.

#### CORS and Endpoints

- CORS is enabled with allowed origins from `MCP_ALLOWED_ORIGINS` or `'*'` as fallback.
- `GET /healthz`: unprotected health endpoint.
- `GET /mcp`: unprotected endpoint returning server identity and config summary.
- `POST`/`OPTIONS` `/mcp`: JSON-RPC transport; protection enforced when auth mode is not `'none'`.

---

## IX. Transports & Server Lifecycle

#### `createMcpServerInstance` (`src/mcp-server/server.ts`)

- Initializes `RequestContext` global config.
- Creates `McpServer` with identity and capabilities (logging, `resources/tools listChanged`, **elicitation**, **sampling**, **prompts**, **roots**).
- Registers all capabilities via DI-managed registries.
- Returns a configured `McpServer`.

#### `TransportManager` (`src/mcp-server/transports/manager.ts`)

- Resolves the `CreateMcpServerInstance` factory to get a configured `McpServer`.
- Based on `MCP_TRANSPORT_TYPE`, it instantiates and manages the lifecycle of the appropriate transport (`http` or `stdio`).
- Handles graceful startup and shutdown of the active transport.

#### Worker (Edge)

- `worker.ts` adapts the same `McpServer` and Hono app to Cloudflare Workers.
- Sets a `serverless` flag to guide storage provider selection.
- Uses `requestContextService` and `logger` for structured, traceable startup.
- **Note for git-mcp-server:** Edge deployment is experimental. Git CLI operations require local filesystem access.

---

## X. Code Style, Validation, and Security

- **JSDoc:** Every file must start with `@fileoverview` and `@module`. Exported APIs must be documented.
- **Validation:** All inputs are validated via Zod schemas. Ensure every field in schemas has a `.describe()`.
- **Logging:** Always include `RequestContext`; use `logger.debug/info/notice/warning/error/crit/emerg` appropriately.
- **Error Handling:** Logic throws `McpError`; handlers catch and standardize. Use `ErrorHandler.tryCatch` in services/infrastructure (not in tool/resource logic).
- **Secrets:** Access secrets only through `src/config/index.ts`. Never hard-code credentials.
- **Rate Limiting:** Use DI-injected `RateLimiter` where needed.
- **Telemetry:** Instrumentation is auto-initialized when enabled. Avoid manual spans.

**Git-Specific Security Requirements:**

- **Path Sanitization:** ALL file paths and repository paths MUST be validated using `sanitization` utilities to prevent directory traversal attacks.
- **Command Injection Prevention:** Git command arguments must be validated and never constructed from unsanitized user input.
- **Working Directory Validation:** Verify working directory exists and is a valid git repository before operations.
- **Destructive Operation Protection:** Operations like `git reset --hard`, `git clean -fd` must require explicit confirmation flags.

---

## XI. Checks & Workflow Commands

Use scripts from `package.json`:

- `bun rebuild`: cleans and rebuilds; also clears logs. Run after dependency changes.
- `bun devcheck` or `bun run devcheck`: lint, format, typecheck, security. Use flags like `--no-fix`, `--no-lint`, `--no-audit` to tailor.
- `bun test`: run unit/integration tests.
- `bun run dev:stdio` / `bun run dev:http`: run server in development mode.
- `bun run start:stdio` / `bun run start:http`: run after build.
- `bun run build:worker`: build Cloudflare Worker bundle.

---

## XII. Configuration & Environment

- All configuration is validated via Zod in `src/config/index.ts`.
- Derives `serviceName` and `version` from `package.json` if not provided via env.
- **Key variables:**
  - **Transport:** `MCP_TRANSPORT_TYPE` (`'stdio'`|`'http'`), `MCP_HTTP_PORT/HOST/PATH`
  - **Auth:** `MCP_AUTH_MODE` (`'none'`|`'jwt'`|`'oauth'`), `MCP_AUTH_SECRET_KEY` (jwt), `OAUTH_*` (oauth)
  - **Storage:** `STORAGE_PROVIDER_TYPE` (`'in-memory'`|`'filesystem'`|`'supabase'`|`'cloudflare-r2'`|`'cloudflare-kv'`)
  - **Git-Specific:**
    - `GIT_SIGN_COMMITS` (`'true'`|`'false'`) - Enable GPG/SSH commit signing
    - `GIT_WRAPUP_INSTRUCTIONS_PATH` - Path to custom workflow instructions markdown file
  - **Telemetry:** `OTEL_ENABLED`, `OTEL_SERVICE_NAME`, `OTEL_SERVICE_VERSION`, `OTEL_EXPORTER_OTLP_*`

---

## XIII. Local & Edge Targets

- **Local parity:** Ensure both stdio and HTTP transports run and behave identically for your feature.
- **Worker compatibility:** `bun run build:worker` and `wrangler dev --local` must succeed before merging.
- `wrangler.toml` should use a `compatibility_date` of `2025-09-01` or later and `nodejs_compat` enabled.
- **Git-specific limitation:** Git CLI operations require local filesystem access and are not compatible with edge deployment in their current form.

---

## XIV. Multi-Tenancy & Storage Context

### Storage Tenancy Requirements

**`StorageService` requires `context.tenantId`** and will throw `McpError` with `JsonRpcErrorCode.ConfigurationError` if it's missing.

### Automatic Tenancy (HTTP Transport with Auth)

When using HTTP transport with authentication enabled (`MCP_AUTH_MODE='jwt'` or `'oauth'`):

- The `tenantId` is automatically extracted from the JWT token claim `'tid'`
- It's propagated to `RequestContext` via `requestContextService.withAuthInfo()`
- All tool/resource invocations automatically receive the correct `tenantId`

### TenantID Handling in Tools

**For tools that use `StorageService` or other tenant-scoped services:**

Follow the graceful degradation pattern to support both development and production:

```typescript
async function myToolLogic(
  input: ToolInput,
  appContext: RequestContext,
  _sdkContext: SdkContext,
): Promise<ToolOutput> {
  // ✅ Graceful degradation: default to 'default-tenant' in development
  const tenantId = appContext.tenantId || 'default-tenant';

  const service = container.resolve<MyService>(MyServiceToken);
  const result = await service.doSomething(input.param, tenantId);

  return result;
}
```

**Why this pattern?**

- **Development (STDIO/no auth):** Works out-of-the-box without configuration
- **Production (HTTP + auth):** Real `tenantId` from JWT automatically available
- **Aligns with template philosophy:** Permissive in development, strict in production

**Alternative - Explicit Tenant Check:**

```typescript
// ❌ Don't throw errors for missing tenantId - breaks development experience
if (!appContext.tenantId) {
  throw new McpError(JsonRpcErrorCode.InvalidRequest, 'Tenant ID required');
}

// ✅ Use default instead
const tenantId = appContext.tenantId || 'default-tenant';
```

**When to use explicit tenant checking:**

- Security-critical operations where you must verify tenant isolation
- Production-only tools that should never run in development mode
- Audit trails where the actual tenant must be logged

**Troubleshooting:**

- **Error:** `"Storage operation requires a tenantId in the request context"`
- **Cause:** Tool passed `undefined` to a service expecting `tenantId`
- **Solution:** Apply the graceful degradation pattern: `const tenantId = appContext.tenantId || 'default-tenant';`

---

## XV. Quick Checklist

Before completing your task, ensure you have:

- [ ] Implemented tool/resource logic in a `*.tool.ts` or `*.resource.ts` file.
- [ ] Kept `logic` functions pure (no `try...catch`).
- [ ] Thrown `McpError` for failures within logic.
- [ ] Applied authorization with `withToolAuth` or `withResourceAuth`.
- [ ] Used `logger` with `appContext` for all significant operations.
- [ ] Used `StorageService` (DI) for session persistence (working directory).
- [ ] **Validated all file paths** using `sanitization` utilities (git-specific).
- [ ] **Prevented command injection** by validating git command arguments (git-specific).
- [ ] Registered definitions in the corresponding `index.ts` barrel files (Tools, Resources).
- [ ] Added or updated tests (`bun test`).
- [ ] Ran `bun run devcheck` to ensure code quality.
- [ ] Smoke-tested local transports (`bun run dev:stdio`/`http`).
- [ ] Validated the Worker bundle (`bun run build:worker`) if applicable.

That's it. Follow these guidelines to ensure consistency, security, and maintainability across the git-mcp-server codebase.
