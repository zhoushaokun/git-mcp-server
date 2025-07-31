/**
 * @fileoverview Tests for the Logger utility.
 * @module tests/utils/internal/logger.test
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import type winston from "winston";
import { Logger } from "../../../src/utils/internal/logger";

// Define stable mock functions for logger methods at the top level
const mockLog = vi.fn();
const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockInfo = vi.fn();

const mockWinstonLogger = {
  log: mockLog,
  add: mockAdd,
  remove: mockRemove,
  info: mockInfo,
  level: "debug",
  transports: [],
};

describe("Logger", () => {
  let loggerInstance: Logger;
  let winstonMock: typeof winston;

  beforeEach(async () => {
    // 1. Reset module cache to ensure fresh imports with new mocks for each test
    vi.resetModules();

    // 2. Mock dependencies using vi.doMock to prevent hoisting issues
    vi.doMock("../../../src/config/index.js", () => ({
      config: {
        logsPath: "/tmp/test-logs",
        mcpServerName: "test-server",
      },
    }));

    vi.doMock("winston", () => {
      const createLogger = vi.fn();
      const mockWinstonModule = {
        createLogger,
        transports: {
          File: vi.fn(),
          Console: vi.fn(),
        },
        format: {
          combine: vi.fn((...args) => args),
          colorize: vi.fn(),
          timestamp: vi.fn(),
          printf: vi.fn(),
          errors: vi.fn(),
          json: vi.fn(),
        },
      };
      return {
        __esModule: true,
        default: mockWinstonModule,
        ...mockWinstonModule,
      };
    });

    // 3. Dynamically import modules AFTER mocks are in place
    winstonMock = (await import("winston")).default;
    const { Logger: LoggerClass } = await import(
      "../../../src/utils/internal/logger"
    );

    // 4. Set up the mock implementation for createLogger
    (winstonMock.createLogger as Mock).mockReturnValue(mockWinstonLogger);

    // 5. Reset the singleton instance AFTER dynamic import and BEFORE getInstance
    LoggerClass.resetForTesting();

    // 6. Get the fresh logger instance and initialize it
    loggerInstance = (await import("../../../src/utils/internal/logger"))
      .logger;
    await loggerInstance.initialize("debug");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be a singleton", async () => {
    const anotherInstance = (await import("../../../src/utils/internal/logger"))
      .logger;
    expect(loggerInstance).toBe(anotherInstance);
  });

  it("should initialize correctly by creating one logger", () => {
    expect(winstonMock.createLogger).toHaveBeenCalledOnce();
  });

  it("should log a debug message", () => {
    loggerInstance.debug("test debug");
    expect(mockLog).toHaveBeenCalledWith("debug", "test debug", {});
  });

  it("should not log messages below the current level", () => {
    loggerInstance.setLevel("info");
    vi.clearAllMocks(); // Clear mocks after setLevel's own logging
    loggerInstance.debug("this should not be logged");
    expect(mockLog).not.toHaveBeenCalled();
  });

  it("should change log level dynamically", () => {
    loggerInstance.setLevel("warning");
    vi.clearAllMocks(); // Clear mocks after setLevel's own logging
    loggerInstance.info("not logged");
    loggerInstance.warning("logged");
    expect(mockLog).toHaveBeenCalledOnce();
    expect(mockLog).toHaveBeenCalledWith("warn", "logged", {});
  });

  it("should send an MCP notification if a sender is set", () => {
    const sender = vi.fn();
    loggerInstance.setMcpNotificationSender(sender);
    vi.clearAllMocks(); // Clear mocks after setMcpNotificationSender's own logging
    loggerInstance.info("test info");
    expect(sender).toHaveBeenCalledWith(
      "info",
      { message: "test info" },
      "test-server",
    );
  });
});
