/**
 * @fileoverview Tests for the ErrorHandler utility.
 * @module tests/utils/internal/errorHandler.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ErrorHandler,
  type ErrorHandlerOptions,
  type ErrorMapping,
} from "../../../src/utils/internal/errorHandler.js";
import { McpError, BaseErrorCode } from "../../../src/types-global/errors.js";
import { logger } from "../../../src/utils/internal/logger.js";

// Mock the logger
vi.mock("../../../src/utils/internal/logger.js", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("ErrorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("determineErrorCode", () => {
    it("should return the code from an McpError instance", () => {
      const mcpError = new McpError(BaseErrorCode.NOT_FOUND, "Not found");
      expect(ErrorHandler.determineErrorCode(mcpError)).toBe(
        BaseErrorCode.NOT_FOUND,
      );
    });

    it("should return VALIDATION_ERROR for a TypeError", () => {
      const typeError = new TypeError("Invalid type");
      expect(ErrorHandler.determineErrorCode(typeError)).toBe(
        BaseErrorCode.VALIDATION_ERROR,
      );
    });

    it("should return NOT_FOUND for an error message containing 'not found'", () => {
      const error = new Error("Item not found");
      expect(ErrorHandler.determineErrorCode(error)).toBe(
        BaseErrorCode.NOT_FOUND,
      );
    });

    it("should default to INTERNAL_ERROR for an unknown error", () => {
      const error = new Error("Something strange happened");
      expect(ErrorHandler.determineErrorCode(error)).toBe(
        BaseErrorCode.INTERNAL_ERROR,
      );
    });

    it("should map 'unauthorized access' to UNAUTHORIZED", () => {
      const error = new Error("unauthorized access");
      expect(ErrorHandler.determineErrorCode(error)).toBe(
        BaseErrorCode.UNAUTHORIZED,
      );
    });

    it("should map 'access denied' to FORBIDDEN", () => {
      const error = new Error("access denied");
      expect(ErrorHandler.determineErrorCode(error)).toBe(
        BaseErrorCode.FORBIDDEN,
      );
    });

    it("should map 'item not found' to NOT_FOUND", () => {
      const error = new Error("item not found");
      expect(ErrorHandler.determineErrorCode(error)).toBe(
        BaseErrorCode.NOT_FOUND,
      );
    });

    it("should map 'validation failed' to VALIDATION_ERROR", () => {
      const error = new Error("validation failed");
      expect(ErrorHandler.determineErrorCode(error)).toBe(
        BaseErrorCode.VALIDATION_ERROR,
      );
    });

    it("should map 'duplicate key' to CONFLICT", () => {
      const error = new Error("duplicate key");
      expect(ErrorHandler.determineErrorCode(error)).toBe(
        BaseErrorCode.CONFLICT,
      );
    });

    it("should map 'rate limit exceeded' to RATE_LIMITED", () => {
      const error = new Error("rate limit exceeded");
      expect(ErrorHandler.determineErrorCode(error)).toBe(
        BaseErrorCode.RATE_LIMITED,
      );
    });

    it("should map 'request timed out' to TIMEOUT", () => {
      const error = new Error("request timed out");
      expect(ErrorHandler.determineErrorCode(error)).toBe(
        BaseErrorCode.TIMEOUT,
      );
    });

    it("should map 'service unavailable' to SERVICE_UNAVAILABLE", () => {
      const error = new Error("service unavailable");
      expect(ErrorHandler.determineErrorCode(error)).toBe(
        BaseErrorCode.SERVICE_UNAVAILABLE,
      );
    });
  });

  describe("handleError", () => {
    it("should call logger.error with a structured payload", () => {
      const error = new Error("Something went wrong");
      const options: ErrorHandlerOptions = { operation: "testOperation" };
      ErrorHandler.handleError(error, options);
      expect(logger.error).toHaveBeenCalledWith(
        "Error in testOperation: Something went wrong",
        expect.any(Object),
      );
    });

    it("should return a new McpError instance", () => {
      const error = new Error("Something went wrong");
      const options: ErrorHandlerOptions = { operation: "testOperation" };
      const handledError = ErrorHandler.handleError(error, options);
      expect(handledError).toBeInstanceOf(McpError);
    });

    it("should include sanitized input in the log payload", () => {
      const error = new Error("Something went wrong");
      const options: ErrorHandlerOptions = {
        operation: "testOperation",
        input: { password: "123", user: "test" },
      };
      ErrorHandler.handleError(error, options);
      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input: { password: "[REDACTED]", user: "test" },
        }),
      );
    });

    it("should rethrow the error if rethrow is true", () => {
      const error = new Error("Something went wrong");
      const options: ErrorHandlerOptions = {
        operation: "testOperation",
        rethrow: true,
      };
      expect(() => ErrorHandler.handleError(error, options)).toThrow(McpError);
    });

    it("should use an explicit error code if provided", () => {
      const error = new Error("Something went wrong");
      const options: ErrorHandlerOptions = {
        operation: "testOperation",
        errorCode: BaseErrorCode.NOT_FOUND,
      };
      const handledError = ErrorHandler.handleError(error, options) as McpError;
      expect(handledError.code).toBe(BaseErrorCode.NOT_FOUND);
    });

    it("should use a custom error mapper if provided", () => {
      const error = new Error("Something went wrong");
      const customError = new Error("Custom error");
      const options: ErrorHandlerOptions = {
        operation: "testOperation",
        errorMapper: () => customError,
      };
      const handledError = ErrorHandler.handleError(error, options);
      expect(handledError).toBe(customError);
    });
  });

  describe("mapError", () => {
    it("should map an error based on the provided rules", () => {
      const error = new Error("Item not found");
      const mappings = [
        {
          pattern: /not found/,
          errorCode: BaseErrorCode.NOT_FOUND,
          factory: (err: unknown) =>
            new McpError(BaseErrorCode.NOT_FOUND, (err as Error).message),
        },
      ];
      const mappedError = ErrorHandler.mapError(error, mappings) as McpError;
      expect(mappedError).toBeInstanceOf(McpError);
      expect(mappedError.code).toBe(BaseErrorCode.NOT_FOUND);
    });

    it("should return the original error if no mapping matches", () => {
      const error = new Error("Something else");
      const mappings = [
        {
          pattern: /not found/,
          errorCode: BaseErrorCode.NOT_FOUND,
          factory: (err: unknown) =>
            new McpError(BaseErrorCode.NOT_FOUND, (err as Error).message),
        },
      ];
      const mappedError = ErrorHandler.mapError(error, mappings);
      expect(mappedError).toBe(error);
    });

    it("should use the default factory if no mapping matches", () => {
      const error = new Error("Something else");
      const mappings: ErrorMapping[] = [];
      const defaultFactory = (err: unknown) =>
        new McpError(BaseErrorCode.INTERNAL_ERROR, (err as Error).message);
      const mappedError = ErrorHandler.mapError(
        error,
        mappings,
        defaultFactory,
      ) as McpError;
      expect(mappedError.code).toBe(BaseErrorCode.INTERNAL_ERROR);
    });
  });

  describe("formatError", () => {
    it("should format an McpError correctly", () => {
      const mcpError = new McpError(BaseErrorCode.NOT_FOUND, "Not found", {
        id: 1,
      });
      const formatted = ErrorHandler.formatError(mcpError);
      expect(formatted).toEqual({
        code: BaseErrorCode.NOT_FOUND,
        message: "Not found",
        details: { id: 1 },
      });
    });

    it("should format a standard Error correctly", () => {
      const error = new Error("Something went wrong");
      error.name = "CustomError";
      const formatted = ErrorHandler.formatError(error);
      expect(formatted).toEqual({
        code: BaseErrorCode.INTERNAL_ERROR,
        message: "Something went wrong",
        details: { errorType: "CustomError" },
      });
    });

    it("should format a non-error value correctly", () => {
      const formatted = ErrorHandler.formatError("a string error");
      expect(formatted).toEqual({
        code: BaseErrorCode.UNKNOWN_ERROR,
        message: "a string error",
        details: { errorType: "string" },
      });
    });
  });

  describe("tryCatch", () => {
    it("should return the result of the function on success", async () => {
      const fn = async () => "success";
      const result = await ErrorHandler.tryCatch(fn, {
        operation: "test",
      });
      expect(result).toBe("success");
    });

    it("should re-throw the handled error on failure", async () => {
      const error = new Error("failure");
      const fn = async () => {
        throw error;
      };
      await expect(
        ErrorHandler.tryCatch(fn, { operation: "test" }),
      ).rejects.toThrow(McpError);
    });
  });
});
