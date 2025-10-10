/**
 * @fileoverview Unit tests for git-add tool
 * @module tests/mcp-server/tools/definitions/unit/git-add.tool.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container } from 'tsyringe';

import { gitAddTool } from '@/mcp-server/tools/definitions/git-add.tool.js';
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
import type { GitAddResult } from '@/services/git/types.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';

describe('git_add tool', () => {
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
      const input = { path: '.', files: ['file.txt'] };
      const result = gitAddTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.update).toBe(false);
        expect(result.data.all).toBe(false);
        expect(result.data.force).toBe(false);
      }
    });

    it('accepts multiple files', () => {
      const input = { path: '.', files: ['file1.txt', 'file2.txt', 'dir/'] };
      const result = gitAddTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.files).toHaveLength(3);
      }
    });

    it('accepts all files shorthand', () => {
      const input = { path: '.', files: ['.'] };
      const result = gitAddTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts update flag', () => {
      const input = { path: '.', files: ['.'], update: true };
      const result = gitAddTool.inputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.update).toBe(true);
      }
    });

    it('rejects empty files array', () => {
      const input = { path: '.', files: [] };
      const result = gitAddTool.inputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Logic', () => {
    it('stages single file successfully', async () => {
      const mockResult: GitAddResult = {
        success: true,
        stagedFiles: ['file.txt'],
      };

      mockProvider.add.mockResolvedValue(mockResult);

      const parsedInput = gitAddTool.inputSchema.parse({
        path: '.',
        files: ['file.txt'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitAddTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(mockProvider.add).toHaveBeenCalledTimes(1);
      const [addOptions, addContext] = mockProvider.add.mock.calls[0]!;
      expect(addOptions.paths).toEqual(['file.txt']);
      expect(addContext.workingDirectory).toBe('/test/repo');

      expect(result.success).toBe(true);
      expect(result.stagedFiles).toEqual(['file.txt']);
      expect(result.totalFiles).toBe(1);
    });

    it('stages multiple files', async () => {
      const mockResult: GitAddResult = {
        success: true,
        stagedFiles: ['file1.txt', 'file2.txt', 'dir/file3.txt'],
      };

      mockProvider.add.mockResolvedValue(mockResult);

      const parsedInput = gitAddTool.inputSchema.parse({
        path: '.',
        files: ['file1.txt', 'file2.txt', 'dir/file3.txt'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      const result = await gitAddTool.logic(
        parsedInput,
        appContext,
        sdkContext,
      );

      expect(result.totalFiles).toBe(3);
      expect(result.stagedFiles).toHaveLength(3);
    });

    it('passes update flag to provider', async () => {
      const mockResult: GitAddResult = {
        success: true,
        stagedFiles: ['modified.txt'],
      };

      mockProvider.add.mockResolvedValue(mockResult);

      const parsedInput = gitAddTool.inputSchema.parse({
        path: '.',
        files: ['.'],
        update: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitAddTool.logic(parsedInput, appContext, sdkContext);

      const [addOptions] = mockProvider.add.mock.calls[0]!;
      expect(addOptions.update).toBe(true);
    });

    it('passes force flag to provider', async () => {
      const mockResult: GitAddResult = {
        success: true,
        stagedFiles: ['ignored.txt'],
      };

      mockProvider.add.mockResolvedValue(mockResult);

      const parsedInput = gitAddTool.inputSchema.parse({
        path: '.',
        files: ['ignored.txt'],
        force: true,
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitAddTool.logic(parsedInput, appContext, sdkContext);

      const [addOptions] = mockProvider.add.mock.calls[0]!;
      expect(addOptions.force).toBe(true);
    });

    it('uses absolute path when provided', async () => {
      const mockResult: GitAddResult = {
        success: true,
        stagedFiles: ['file.txt'],
      };

      mockProvider.add.mockResolvedValue(mockResult);

      const parsedInput = gitAddTool.inputSchema.parse({
        path: '/absolute/path',
        files: ['file.txt'],
      });
      const appContext = createTestContext({ tenantId: 'test-tenant' });
      const sdkContext = createTestSdkContext();

      await gitAddTool.logic(parsedInput, appContext, sdkContext);

      const [_options, addContext] = mockProvider.add.mock.calls[0]!;
      expect(addContext.workingDirectory).toBe('/absolute/path');
    });
  });

  describe('Response Formatter', () => {
    it('formats single file staging', () => {
      const result = {
        success: true,
        stagedFiles: ['README.md'],
        totalFiles: 1,
      };

      const content = gitAddTool.responseFormatter!(result);

      assertMarkdownContent(content, [
        '# Files Staged Successfully',
        '**Total Files Staged:** 1',
        '## Staged Files',
        'README.md',
      ]);
      assertTextContent(content, 'ready to be committed');
      assertLlmFriendlyFormat(content);
    });

    it('formats multiple files staging', () => {
      const result = {
        success: true,
        stagedFiles: ['file1.txt', 'file2.txt', 'src/index.ts'],
        totalFiles: 3,
      };

      const content = gitAddTool.responseFormatter!(result);

      assertTextContent(content, 'Total Files Staged:** 3');
      assertTextContent(content, 'file1.txt');
      assertTextContent(content, 'file2.txt');
      assertTextContent(content, 'src/index.ts');
    });

    it('lists all staged files', () => {
      const result = {
        success: true,
        stagedFiles: [
          'package.json',
          'src/main.ts',
          'tests/main.test.ts',
          'docs/README.md',
        ],
        totalFiles: 4,
      };

      const content = gitAddTool.responseFormatter!(result);
      const text = (content[0] as { type: 'text'; text: string }).text;

      expect(text).toContain('package.json');
      expect(text).toContain('src/main.ts');
      expect(text).toContain('tests/main.test.ts');
      expect(text).toContain('docs/README.md');
      expect(text).toMatch(/Staged Files/);
    });
  });

  describe('Tool Metadata', () => {
    it('has correct tool name', () => {
      expect(gitAddTool.name).toBe('git_add');
    });

    it('is marked as write operation', () => {
      expect(gitAddTool.annotations?.readOnlyHint).toBe(false);
    });

    it('has descriptive title and description', () => {
      expect(gitAddTool.title).toBe('Git Add');
      expect(gitAddTool.description).toBeTruthy();
      expect(gitAddTool.description.toLowerCase()).toContain('stage');
    });

    it('has valid schemas', () => {
      expect(gitAddTool.inputSchema).toBeDefined();
      expect(gitAddTool.outputSchema).toBeDefined();

      const inputShape = gitAddTool.inputSchema.shape;
      expect(inputShape.files).toBeDefined();
      expect(inputShape.update).toBeDefined();

      const outputShape = gitAddTool.outputSchema.shape;
      expect(outputShape.success).toBeDefined();
      expect(outputShape.stagedFiles).toBeDefined();
      expect(outputShape.totalFiles).toBeDefined();
    });
  });
});
