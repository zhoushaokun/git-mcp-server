/**
 * Error Handling Service
 * ======================
 * 
 * Standardized error handling for Git operations and MCP server.
 */

/**
 * Standardized error category classification
 */
export const ErrorCategoryType = {
  CATEGORY_VALIDATION: 'VALIDATION',
  CATEGORY_GIT: 'GIT',
  CATEGORY_MCP: 'MCP',
  CATEGORY_SYSTEM: 'SYSTEM',
  CATEGORY_UNKNOWN: 'UNKNOWN'
} as const;

export type ErrorCategoryType = typeof ErrorCategoryType[keyof typeof ErrorCategoryType];

/**
 * Error severity classification
 */
export const ErrorSeverityLevel = {
  SEVERITY_DEBUG: 0,
  SEVERITY_INFO: 1,
  SEVERITY_WARN: 2,
  SEVERITY_ERROR: 3,
  SEVERITY_FATAL: 4
} as const;

export type ErrorSeverityLevel = typeof ErrorSeverityLevel[keyof typeof ErrorSeverityLevel];

/**
 * Standardized error structure for consistent error handling
 */
export interface StandardizedApplicationErrorObject {
  errorMessage: string;                      // Human-readable description
  errorCode: string;                         // Machine-readable identifier
  errorCategory: ErrorCategoryType;          // System area affected
  errorSeverity: ErrorSeverityLevel;         // How critical the error is
  errorTimestamp: string;                    // When the error occurred
  errorContext: Record<string, unknown>;     // Additional relevant data
  errorStack?: string;                       // Stack trace if available
}

/**
 * Creates a standardized success result
 */
export function createSuccessResult<DataType>(data: DataType): { resultSuccessful: true; resultData: DataType } {
  return { resultSuccessful: true, resultData: data };
}

/**
 * Creates a standardized failure result
 */
export function createFailureResult<ErrorType>(error: ErrorType): { resultSuccessful: false; resultError: ErrorType } {
  return { resultSuccessful: false, resultError: error };
}

/**
 * Creates a standardized error object
 */
export function createStandardizedError(
  message: string,
  code: string,
  category: ErrorCategoryType,
  severity: ErrorSeverityLevel,
  context: Record<string, unknown> = {}
): StandardizedApplicationErrorObject {
  return {
    errorMessage: message,
    errorCode: code,
    errorCategory: category,
    errorSeverity: severity,
    errorTimestamp: new Date().toISOString(),
    errorContext: context
  };
}

/**
 * Converts an exception to a standardized error object
 */
export function wrapExceptionAsStandardizedError(
  exception: unknown,
  defaultMessage: string
): StandardizedApplicationErrorObject {
  const errorMessage = exception instanceof Error ? exception.message : defaultMessage;
  const errorStack = exception instanceof Error ? exception.stack : undefined;
  
  return {
    errorMessage,
    errorCode: 'UNEXPECTED_ERROR',
    errorCategory: ErrorCategoryType.CATEGORY_UNKNOWN,
    errorSeverity: ErrorSeverityLevel.SEVERITY_ERROR,
    errorTimestamp: new Date().toISOString(),
    errorContext: { originalException: exception },
    errorStack
  };
}

/**
 * Handles Git-specific errors and converts them to standardized format
 */
export function createGitError(
  message: string,
  code: string,
  context: Record<string, unknown> = {}
): StandardizedApplicationErrorObject {
  return createStandardizedError(
    message,
    code,
    ErrorCategoryType.CATEGORY_GIT,
    ErrorSeverityLevel.SEVERITY_ERROR,
    context
  );
}

/**
 * Combined type for operation results
 */
export type OperationResult<DataType, ErrorType = StandardizedApplicationErrorObject> = 
  | { resultSuccessful: true; resultData: DataType }
  | { resultSuccessful: false; resultError: ErrorType };