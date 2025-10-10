# Tool Comparison: `git-mcp-server` vs. `git-mcp-server-development`

**Test Date:** 2025-10-10

This document compares the behavior of three key tools between the production (`git-mcp-server`) and development (`git-mcp-server-development`) servers.

---

## 1. `git_status`

-   **Development Server:** Returns a human-readable, formatted markdown string.
-   **Production Server:** Returns a structured JSON object.
-   **Conclusion:** Both are functional, but offer different output formats. The production server's output is superior for programmatic use.

```json
{
  "path": "."
}
```

Response

Plain TextRich DisplayMarkdown

Success: { "current_branch": "master", "staged_changes": {}, "unstaged_changes": {}, "untracked_files": [], "conflicted_files": [], "is_clean": true }

---

## 2. `git_branch` (list operation)

-   **Development Server:** **CRITICAL FAILURE.** Fails with an "Unsafe shell character" error, making it impossible to list branches.
-   **Production Server:** **SUCCESS.** Works as expected, returning a structured JSON list of all branches and their details.
-   **Conclusion:** The development server has a critical bug that does not exist in production.

Arguments

```json
{
  "mode": "list"
}
```

Response

Plain TextRich DisplayMarkdown

Success: { "success": true, "mode": "list", "message": "Found 4 branches.", "branches": [ { "name": "cherry-pick-source", "isCurrent": false, "isRemote": false, "commitHash": "9c5c882", "commitSubject": "feat: add second cherry" }, { "name": "master", "isCurrent": true, "isRemote": false, "commitHash": "0340268", "commitSubject": "[ahead 4] feat: add first cherry" }, { "name": "rebase-test", "isCurrent": false, "isRemote": false, "commitHash": "3e5060a", "commitSubject": "feat: add rebase test file" }, { "name": "worktree-branch", "isCurrent": false, "isRemote": false, "commitHash": "0340268", "commitSubject": "feat: add first cherry" } ], "currentBranch": "master" }


---

## 3. `git_log` (with branch filter)

-   **Development Server:** **MAJOR FAILURE.** The tool ignores the `branch` filter parameter, always returning the log for the currently checked-out branch.
-   **Production Server:** **SUCCESS.** Correctly applies the branch filter and returns the appropriate commit log as a structured JSON object.
-   **Conclusion:** The filtering logic is broken on the development server but works correctly in production.
-   
Arguments

```json
{
  "maxCount": 3,
  "branchOrFile": "cherry-pick-source"
}
```

Response

Plain TextRich DisplayMarkdown

Success: { "success": true, "message": "Found 3 commit(s).", "commits": [ { "hash": "9c5c882208496ff8f545394aaee7dda2d2568ac9", "authorName": "cyanheads", "authorEmail": "casey@caseyjhand.com", "timestamp": 1760091619, "subject": "feat: add second cherry" }, { "hash": "fcaa6d059f0a2edfe24cd1a9adf201283b22399c", "authorName": "cyanheads", "authorEmail": "casey@caseyjhand.com", "timestamp": 1760091600, "subject": "feat: add first cherry" }, { "hash": "3e5060a7a1735f6309b7c5c789dae711b9508e3c", "authorName": "cyanheads", "authorEmail": "casey@caseyjhand.com", "timestamp": 1760091437, "subject": "feat: add rebase test file" } ] }


---

## Overall Summary

The production `git-mcp-server` is significantly more stable and reliable than the `git-mcp-server-development` version. The development server suffers from critical bugs in fundamental tools like `git_branch` and `git_log`, rendering them partially or completely unusable. The production server consistently provides robust, structured JSON responses suitable for automation, whereas the development server provides more user-friendly but less reliable markdown responses.
