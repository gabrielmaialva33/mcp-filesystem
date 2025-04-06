/**
 * Custom error classes for the MCP-Filesystem
 *
 * This module provides specialized error classes that help with:
 * - Proper error classification
 * - Consistent error formatting
 * - Additional context for debugging
 */

/**
 * Base error class for all filesystem errors
 * Provides structured error information with codes and metadata
 */
export class FileSystemError extends Error {
  /**
   * Create a new FileSystemError
   *
   * @param message Error message
   * @param code Machine-readable error code
   * @param path Optional path that caused the error
   * @param metadata Additional error context
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly path?: string,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'FileSystemError'
  }

  /**
   * Convert error to JSON for logging
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      path: this.path,
      ...this.metadata,
    }
  }
}

/**
 * Error thrown when accessing a path outside allowed directories
 */
export class AccessDeniedError extends FileSystemError {
  constructor(path: string, message?: string) {
    super(
      message || `Access denied - path outside allowed directories: ${path}`,
      'ACCESS_DENIED',
      path
    )
    this.name = 'AccessDeniedError'
  }
}

/**
 * Error thrown when a path doesn't exist
 */
export class PathNotFoundError extends FileSystemError {
  constructor(path: string) {
    super(`Path not found: ${path}`, 'PATH_NOT_FOUND', path)
    this.name = 'PathNotFoundError'
  }
}

/**
 * Error thrown when invalid arguments are provided
 */
export class InvalidArgumentsError extends FileSystemError {
  constructor(toolName: string, details?: unknown) {
    super(`Invalid arguments for ${toolName}`, 'INVALID_ARGS', undefined, { details })
    this.name = 'InvalidArgumentsError'
  }
}

/**
 * Error thrown when file size exceeds limits
 */
export class FileSizeError extends FileSystemError {
  constructor(path: string, size: number, maxSize: number) {
    super(`File size exceeds limit: ${size} > ${maxSize} bytes`, 'FILE_SIZE_EXCEEDED', path, {
      size,
      maxSize,
    })
    this.name = 'FileSizeError'
  }
}
