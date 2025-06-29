# git-mcp-server - Directory Structure

Generated on: 2025-06-20 23:05:34

```
git-mcp-server
├── docs
    └── tree.md
├── logs
├── scripts
    ├── clean.ts
    ├── make-executable.ts
    └── tree.ts
├── src
    ├── config
    │   └── index.ts
    ├── mcp-server
    │   ├── tools
    │   │   ├── gitAdd
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitBranch
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitCheckout
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitCherryPick
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitClean
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitClearWorkingDir
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitClone
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitCommit
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitDiff
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitFetch
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitInit
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitLog
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitMerge
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitPull
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitPush
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitRebase
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitRemote
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitReset
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitSetWorkingDir
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitShow
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitStash
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitStatus
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitTag
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   ├── gitWorktree
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   │   └── gitWrapupInstructions
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
    │   ├── transports
    │   │   ├── auth
    │   │   │   ├── core
    │   │   │   │   ├── authContext.ts
    │   │   │   │   ├── authTypes.ts
    │   │   │   │   └── authUtils.ts
    │   │   │   ├── strategies
    │   │   │   │   ├── jwt
    │   │   │   │   │   └── jwtMiddleware.ts
    │   │   │   │   └── oauth
    │   │   │   │   │   └── oauthMiddleware.ts
    │   │   │   └── index.ts
    │   │   ├── httpErrorHandler.ts
    │   │   ├── httpTransport.ts
    │   │   └── stdioTransport.ts
    │   └── server.ts
    ├── types-global
    │   └── errors.ts
    ├── utils
    │   ├── internal
    │   │   ├── errorHandler.ts
    │   │   ├── index.ts
    │   │   ├── logger.ts
    │   │   └── requestContext.ts
    │   ├── metrics
    │   │   ├── index.ts
    │   │   └── tokenCounter.ts
    │   ├── parsing
    │   │   ├── dateParser.ts
    │   │   ├── index.ts
    │   │   └── jsonParser.ts
    │   ├── security
    │   │   ├── idGenerator.ts
    │   │   ├── index.ts
    │   │   ├── rateLimiter.ts
    │   │   └── sanitization.ts
    │   └── index.ts
    ├── .DS_Store
    └── index.ts
├── .clinerules
├── .env.example
├── .ncurc.json
├── CHANGELOG.md
├── Dockerfile
├── LICENSE
├── mcp.json
├── package-lock.json
├── package.json
├── README.md
├── repomix.config.json
├── smithery.yaml
└── tsconfig.json

```

_Note: This tree excludes files and directories matched by .gitignore and common patterns like node_modules._
