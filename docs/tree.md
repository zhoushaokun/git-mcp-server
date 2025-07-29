# git-mcp-server - Directory Structure

Generated on: 2025-07-29 19:59:41


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
    │   ├── resources
    │   │   └── gitWorkingDir
    │   │   │   ├── index.ts
    │   │   │   ├── logic.ts
    │   │   │   └── registration.ts
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
    │   │   │   ├── lib
    │   │   │   │   ├── authContext.ts
    │   │   │   │   ├── authTypes.ts
    │   │   │   │   └── authUtils.ts
    │   │   │   ├── strategies
    │   │   │   │   ├── authStrategy.ts
    │   │   │   │   ├── jwtStrategy.ts
    │   │   │   │   └── oauthStrategy.ts
    │   │   │   ├── authFactory.ts
    │   │   │   ├── authMiddleware.ts
    │   │   │   └── index.ts
    │   │   ├── core
    │   │   │   ├── baseTransportManager.ts
    │   │   │   ├── honoNodeBridge.ts
    │   │   │   ├── statefulTransportManager.ts
    │   │   │   ├── statelessTransportManager.ts
    │   │   │   └── transportTypes.ts
    │   │   ├── http
    │   │   │   ├── httpErrorHandler.ts
    │   │   │   ├── httpTransport.ts
    │   │   │   ├── httpTypes.ts
    │   │   │   ├── index.ts
    │   │   │   └── mcpTransportMiddleware.ts
    │   │   └── stdio
    │   │   │   ├── index.ts
    │   │   │   └── stdioTransport.ts
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
├── tsconfig.json
├── tsconfig.vitest.json
└── vitest.config.ts

```

_Note: This tree excludes files and directories matched by .gitignore and common patterns like node_modules._
