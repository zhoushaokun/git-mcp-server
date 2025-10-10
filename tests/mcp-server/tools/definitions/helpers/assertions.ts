/**
 * @fileoverview Custom test assertions for git tool testing.
 * @module tests/mcp-server/tools/definitions/helpers/assertions
 */
import { expect } from 'vitest';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { McpError, JsonRpcErrorCode } from '@/types-global/errors.js';

/**
 * Assert that a value is a valid McpError with expected properties
 */
export function assertMcpError(
  error: unknown,
  expectedCode: JsonRpcErrorCode,
  messagePattern?: string | RegExp,
): asserts error is McpError {
  expect(error).toBeInstanceOf(McpError);
  const mcpError = error as McpError;
  expect(mcpError.code).toBe(expectedCode);

  if (messagePattern) {
    if (typeof messagePattern === 'string') {
      expect(mcpError.message).toContain(messagePattern);
    } else {
      expect(mcpError.message).toMatch(messagePattern);
    }
  }
}

/**
 * Assert that content blocks contain text content
 */
export function assertTextContent(
  content: ContentBlock[],
  expectedPattern: string | RegExp,
): void {
  expect(content).toHaveLength(1);
  expect(content[0]).toHaveProperty('type', 'text');
  const textContent = (content[0] as { type: 'text'; text: string }).text;

  if (typeof expectedPattern === 'string') {
    expect(textContent).toContain(expectedPattern);
  } else {
    expect(textContent).toMatch(expectedPattern);
  }
}

/**
 * Assert that content blocks contain properly formatted markdown
 */
export function assertMarkdownContent(
  content: ContentBlock[],
  expectedSections: string[],
): void {
  expect(content).toHaveLength(1);
  expect(content[0]).toHaveProperty('type', 'text');
  const textContent = (content[0] as { type: 'text'; text: string }).text;

  // Check for markdown sections
  for (const section of expectedSections) {
    expect(textContent).toContain(section);
  }
}

/**
 * Assert that a tool output has the expected structure
 */
export function assertToolOutput<T extends Record<string, unknown>>(
  output: unknown,
  expectedFields: (keyof T)[],
): asserts output is T {
  expect(output).toBeDefined();
  expect(typeof output).toBe('object');
  expect(output).not.toBeNull();

  for (const field of expectedFields) {
    expect(output).toHaveProperty(field as string);
  }
}

/**
 * Assert that provider was called with expected context
 */
export function assertProviderCalledWithContext(
  providerCall: unknown[],
  expectedWorkingDir: string,
  expectedTenantId: string,
): void {
  expect(providerCall).toHaveLength(2);

  const [_options, context] = providerCall;
  expect(context).toMatchObject({
    workingDirectory: expectedWorkingDir,
    tenantId: expectedTenantId,
  });
  expect(context).toHaveProperty('requestContext');
}

/**
 * Assert that an error contains specific data fields
 */
export function assertErrorData(
  error: McpError,
  expectedData: Record<string, unknown>,
): void {
  expect(error.data).toBeDefined();
  expect(error.data).toMatchObject(expectedData);
}

/**
 * Assert that content is properly escaped/sanitized
 */
export function assertSanitizedContent(content: ContentBlock[]): void {
  expect(content).toHaveLength(1);
  const textContent = (content[0] as { type: 'text'; text: string }).text;

  // Check for common XSS patterns that should be escaped
  expect(textContent).not.toMatch(/<script>/i);
  expect(textContent).not.toMatch(/javascript:/i);
  expect(textContent).not.toMatch(/onerror=/i);
}

/**
 * Assert that response formatter output is LLM-friendly
 */
export function assertLlmFriendlyFormat(
  content: ContentBlock[],
  minLength = 50,
): void {
  expect(content).toHaveLength(1);
  const textContent = (content[0] as { type: 'text'; text: string }).text;

  // Should have meaningful content
  expect(textContent.length).toBeGreaterThan(minLength);

  // Should use markdown formatting
  expect(textContent).toMatch(/^#\s+/m); // Has headers

  // Should not be pure JSON (unless intentionally)
  const isJsonOnly =
    textContent.trim().startsWith('{') && textContent.trim().endsWith('}');
  if (isJsonOnly) {
    // If it's JSON, it should be formatted
    expect(textContent).toMatch(/\n/);
  }
}
