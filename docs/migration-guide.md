# Migration Guide: Git MCP Server v2.4 - Provider Pattern Architecture

**Version:** 2.0.0
**Last Updated:** 2025-10-09
**Status:** Active Development

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Design](#architecture-design)
3. [Git Service Provider Pattern](#git-service-provider-pattern)
4. [Configuration Updates](#configuration-updates)
5. [Implementation Phases](#implementation-phases)
6. [Tool Migration Examples](#tool-migration-examples)
7. [Provider Comparison](#provider-comparison)
8. [Testing Strategy](#testing-strategy)
9. [Deployment Guide](#deployment-guide)

---

## Overview

This migration implements a **clean, provider-based architecture** for git operations, enabling the server to run in **both local AND serverless environments** without compromise.

### What We're Building

**A Git Service with Provider Pattern:**
- ✅ **Local environments**: Native git CLI via `CliGitProvider` (full features, maximum performance)
- ✅ **Serverless/Edge**: Pure JavaScript via `IsomorphicGitProvider` (Cloudflare Workers, browser)
- ✅ **Auto-detection**: Automatically selects the right provider based on environment
- ✅ **Future-proof**: Easy to add new providers (GitHub API, GitLab API, etc.)
- ✅ **Type-safe**: Full TypeScript with comprehensive interfaces
- ✅ **DI-managed**: Follows template's dependency injection patterns

### Migration Scope

From `old_tools/` (3-file architecture, CLI-only):
- **25 Git tools** → New declarative tool definitions using Git service
- **1 Resource** → Git working directory resource
- **Direct CLI calls** → Provider abstraction layer
- **Mixed storage** → Unified `StorageService` for session state

---

## Architecture Design

### Directory Structure

```
src/
├── services/
│   └── git/
│       ├── core/
│       │   ├── IGitProvider.ts              # Provider interface contract
│       │   └── gitProviderFactory.ts        # Provider selection logic
│       ├── providers/
│       │   ├── cli.provider.ts              # Native git CLI (local/Node.js)
│       │   └── isomorphic.provider.ts       # isomorphic-git (serverless)
│       ├── types.ts                         # Shared Git operation types
│       └── index.ts                         # Barrel exports
│
├── mcp-server/
│   ├── tools/definitions/
│   │   ├── git-add.tool.ts
│   │   ├── git-commit.tool.ts
│   │   ├── git-status.tool.ts
│   │   ├── ... (22 more)
│   │   └── index.ts
│   └── resources/definitions/
│       ├── git-working-directory.resource.ts
│       └── index.ts
│
├── container/
│   ├── tokens.ts                            # Add GitProvider token
│   └── index.ts                             # Register Git provider
│
└── config/
    └── index.ts                             # Add git-specific config
```

### Architectural Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Client                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Tool Definition (git-commit.tool.ts)        │
│  • Schema validation (Zod)                                   │
│  • Auth enforcement (withToolAuth)                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Git Service (via DI - IGitProvider)             │
│  • Resolves provider from container                          │
│  • Calls provider.commit(params, context)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
        ┌──────────────────┐  ┌──────────────────┐
        │  CliGitProvider  │  │ IsomorphicGit    │
        │   (Local/Node)   │  │   (Serverless)   │
        └──────────────────┘  └──────────────────┘
                    │                   │
                    ▼                   ▼
        ┌──────────────────┐  ┌──────────────────┐
        │  execFile('git') │  │  isomorphic-git  │
        │  CLI execution   │  │  + LightningFS   │
        └──────────────────┘  └──────────────────┘
                    │                   │
                    ▼                   ▼
        ┌──────────────────┐  ┌──────────────────┐
        │  Local Git Repo  │  │  Durable Objects │
        │   (Filesystem)   │  │   or in-memory   │
        └──────────────────┘  └──────────────────┘
```

---

## Git Service Provider Pattern

*(This section would contain the complete provider interface and types - full content as drafted in the previous message)*

### Provider Interface

The complete contract is defined in `src/services/git/core/IGitProvider.ts` with all 25 operations.

### Provider Types

Comprehensive type definitions in `src/services/git/types.ts` for all Git operations.

---

## Configuration Updates

*(Configuration schema updates as detailed above)*

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
### Phase 2: CLI Provider (Week 2)
### Phase 3: Isomorphic Provider (Week 3)
### Phase 4: DI Integration & Provider Factory (Week 4)
### Phase 5: Tool Migration (Week 5)
### Phase 6: Testing & Documentation (Week 6)

*(Full details for each phase as outlined above)*

---

## Tool Migration Examples

*(Complete migration examples)*

---

## Provider Comparison

| Feature | CLI Provider | Isomorphic Provider |
|---------|-------------|---------------------|
| **Environment** | Local (Node.js/Bun) | Serverless/Browser |
| **Requirements** | Git binary in PATH | None (pure JS) |
| **Performance** | ⭐⭐⭐⭐⭐ Native | ⭐⭐⭐ JavaScript |
| **Repo Size** | Unlimited | < 100 MB recommended |
| **Signed Commits** | ✅ GPG/SSH | ❌ Not supported |
| **Worktrees** | ✅ Full support | ❌ Not supported |
| **Remote Ops** | ✅ All protocols | ✅ HTTP/HTTPS only |
| **Offline** | ✅ Works offline | ✅ Works offline |
| **CORS Issues** | ❌ N/A | ⚠️ Needs proxy |

---

## Testing Strategy

*(Testing details)*

---

## Deployment Guide

### Local Deployment
### Cloudflare Workers Deployment

*(Deployment instructions)*

---

## Summary

This architecture provides a clean, maintainable, and future-proof solution for git operations across all environments.