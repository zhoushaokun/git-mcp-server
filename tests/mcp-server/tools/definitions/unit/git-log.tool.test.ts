/**
 * @fileoverview Unit tests for git-log tool
 * @module tests/mcp-server/tools/definitions/unit/git-log.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitLogTool } from '@/mcp-server/tools/definitions/git-log.tool.js';
import {
  GitProviderFactory as GitProviderFactoryToken,
  StorageService as StorageServiceToken,
} from '@/container/tokens.js';
import {
  createTestContext,
  createTestSdkContext,
  createMockGitProvider,
  createMockStorageService,
  assertTextContent,
  assertMarkdownContent,
  assertLlmFriendlyFormat,
} from '../helpers/index.js';
import type { GitLogResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_log tool', () => {
  const mockProvider = createMockGitProvider();
  const mockStorage = createMockStorageService();
  const mockFactory = {
    getProvider: vi.fn(async () => mockProvider),
  } as unknown as GitProviderFactory;

  beforeEach(() => {
    mockProvider.resetMocks();
    mockStorage.clearAll();

    container.clearInstances();
    container.register(GitProviderFactoryToken, { useValue: mockFactory });
    container.register(StorageServiceToken, { useValue: mockStorage });

    const tenantId = 'test-tenant';
    const context = createTestContext({ tenantId });
    mockStorage.set(`session:workingDir:${tenantId}`, '/test/repo', context);
  });

  describe('Input Schema', () => {
    it('validates correct input with defaults', () => {
      const input = { path: '.' };
      const result = gitLogTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.oneline).toBe(false);
        expect(result.data.stat).toBe(false);
        expect(result.data.patch).toBe(false);
        expect(result.data.showSignature).toBe(false);
      }
    });

    it('accepts maxCount limit', () => {
      const input = { path: '.', maxCount: 10 };
      const result = gitLogTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxCount).toBe(10);
      }
    });

    it('accepts author filter', () => {
      const input = { path: '.', author: 'John Doe' };
      const result = gitLogTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.author).toBe('John Doe');
      }
    });

    it('accepts date filters', () => {
      const input = {
        path: '.',
        since: '2024-01-01T00:00:00Z',
        until: '2024-12-31T23:59:59Z',
      };
      const result = gitLogTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts grep pattern', () => {
      const input = { path: '.', grep: 'fix:' };
      const result = gitLogTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.grep).toBe('fix:');
      }
    });

    it('accepts boolean flags', () => {
      const input = { path: '.', oneline: true, stat: true };
      const result = gitLogTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.oneline).toBe(true);
        expect(result.data.stat).toBe(true);
      }
    });
  });

  describe('Tool Logic', () => {
    it('retrieves commit history successfully', async () => {
      const mockResult: GitLogResult = {
        commits: [
          {
            hash: 'abc123def456',
            shortHash: 'abc123d',
            author: 'John Doe',
            authorEmail: 'john@example.com',
            timestamp: 1609459200,
            subject: 'Add new feature',
            body: 'This adds a great new feature',
            parents: ['parent123'],
            refs: ['main', 'HEAD'],
          },
          {
            hash: 'def456ghi789',
            shortHash: 'def456g',
            author: 'Jane Smith',
            authorEmail: 'jane@example.com',
            timestamp: 1609372800,
            subject: 'Fix bug',
            parents: ['parent456'],
            refs: [],
          },
        ],
        totalCount: 2,
      };

      mockProvider.log.mockResolvedValue(mockResult);

      const parsedInput = gitLogTool.inputSchema.parse({ path: '.' });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitLogTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.log).toHaveBeenCalledTimes(1);
      const [_options, logContext] = mockProvider.log.mock.calls[0]!;
      expect(logContext.workingDirectory).toBe('/test/repo');

      expect(result.success).toBe(true);
      expect(result.commits).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.commits[0]?.hash).toBe('abc123def456');
    });

    it('passes maxCount to provider', async () => {
      const mockResult: GitLogResult = {
        commits: [],
        totalCount: 0,
      };

      mockProvider.log.mockResolvedValue(mockResult);

      const parsedInput = gitLogTool.inputSchema.parse({
        path: '.',
        maxCount: 5,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitLogTool.logic(parsedInput, appContext, sdkContext);

      const [logOptions] = mockProvider.log.mock.calls[0]!;
      expect(logOptions.maxCount).toBe(5);
    });

    it('passes author filter to provider', async () => {
      const mockResult: GitLogResult = {
        commits: [],
        totalCount: 0,
      };

      mockProvider.log.mockResolvedValue(mockResult);

      const parsedInput = gitLogTool.inputSchema.parse({
        path: '.',
        author: 'test@example.com',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitLogTool.logic(parsedInput, appContext, sdkContext);

      const [logOptions] = mockProvider.log.mock.calls[0]!;
      expect(logOptions.author).toBe('test@example.com');
    });

    it('passes date filters to provider', async () => {
      const mockResult: GitLogResult = {
        commits: [],
        totalCount: 0,
      };

      mockProvider.log.mockResolvedValue(mockResult);

      const parsedInput = gitLogTool.inputSchema.parse({
        path: '.',
        since: '2024-01-01',
        until: '2024-12-31',
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitLogTool.logic(parsedInput, appContext, sdkContext);

      const [logOptions] = mockProvider.log.mock.calls[0]!;
      expect(logOptions.since).toBe('2024-01-01');
      expect(logOptions.until).toBe('2024-12-31');
    });

    it('handles empty commit history', async () => {
      const mockResult: GitLogResult = {
        commits: [],
        totalCount: 0,
      };

      mockProvider.log.mockResolvedValue(mockResult);

      const parsedInput = gitLogTool.inputSchema.parse({ path: '.' });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitLogTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.commits).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('Response Formatter', () => {
    it('formats commit history with multiple commits', () => {
      const result = {
        success: true,
        commits: [
          {
            hash: 'abc123def456',
            shortHash: 'abc123d',
            author: 'John Doe',
            authorEmail: 'john@example.com',
            timestamp: 1609459200,
            subject: 'Add feature',
            body: 'Details here',
            parents: ['parent1'],
            refs: ['main'],
          },
          {
            hash: 'def456ghi789',
            shortHash: 'def456g',
            author: 'Jane Smith',
            authorEmail: 'jane@example.com',
            timestamp: 1609372800,
            subject: 'Fix bug',
            parents: [],
            refs: [],
          },
        ],
        totalCount: 2,
      };

      const content = gitLogTool.responseFormatter!(result);

      assertMarkdownContent(content, [
        '# Git Log',
        '## abc123d',
        'John Doe',
        'Add feature',
      ]);
      assertTextContent(content, 'jane@example.com');
      assertTextContent(content, 'Fix bug');
      assertLlmFriendlyFormat(content);
    });

    it('formats empty commit history', () => {
      const result = {
        success: true,
        commits: [],
        totalCount: 0,
      };

      const content = gitLogTool.responseFormatter!(result);

      assertTextContent(content, 'No commits found');
      assertLlmFriendlyFormat(content, 20);
    });

    it('includes commit count in header', () => {
      const result = {
        success: true,
        commits: [
          {
            hash: 'abc123',
            shortHash: 'abc123',
            author: 'Test',
            authorEmail: 'test@test.com',
            timestamp: 123,
            subject: 'Test commit',
            parents: [],
            refs: [],
          },
        ],
        totalCount: 1,
      };

      const content = gitLogTool.responseFormatter!(result);
      const text = (content[0] as { type: 'text'; text: string }).text;

      expect(text).toMatch(/1.*commit/i);
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitLogTool.name).toBe('git_log');
    });

    it('is marked as read-only operation', () => {
      expect(gitLogTool.annotations?.readOnlyHint).toBe(true);
    });

    it('has descriptive title and description', () => {
      expect(gitLogTool.title).toBe('Git Log');
      expect(gitLogTool.description).toBeTruthy();
      expect(gitLogTool.description.toLowerCase()).toContain('history');
    });

    it('has valid schemas', () => {
      expect(gitLogTool.inputSchema).toBeDefined();
      expect(gitLogTool.outputSchema).toBeDefined();

      const inputShape = gitLogTool.inputSchema.shape;
      expect(inputShape.maxCount).toBeDefined();
      expect(inputShape.author).toBeDefined();
      expect(inputShape.since).toBeDefined();

      const outputShape = gitLogTool.outputSchema.shape;
      expect(outputShape.commits).toBeDefined();
      expect(outputShape.totalCount).toBeDefined();
    });
  });
});
