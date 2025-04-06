/**
 * Path utilities for MCP-Filesystem
 *
 * Provides:
 * - Path normalization
 * - Home directory expansion
 * - Path validation
 * - Path caching for performance
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import { AccessDeniedError, PathNotFoundError } from '../errors/index.js'
import { logger } from '../logger/index.js'
import { Config } from '../config/index.js'

/**
 * Cache for path validation results to improve performance
 */
export class PathValidationCache {
  private cache = new Map<string, string>()
  private readonly maxSize: number
  private readonly ttl: number

  /**
   * Create a new path validation cache
   *
   * @param maxSize Maximum number of entries to cache
   * @param ttlMs Time-to-live for cache entries in milliseconds
   */
  constructor(maxSize = 1000, ttlMs = 60000) {
    this.maxSize = maxSize
    this.ttl = ttlMs
  }

  /**
   * Get a validated path from the cache
   *
   * @param path Original path
   * @returns Validated path if found in cache
   */
  public get(path: string): string | undefined {
    return this.cache.get(path)
  }

  /**
   * Add a validated path to the cache
   *
   * @param path Original path
   * @param validatedPath Validated path
   */
  public set(path: string, validatedPath: string): void {
    // If cache is full, remove oldest entry
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(path, validatedPath)

    // Set expiration for cache entry
    setTimeout(() => {
      this.cache.delete(path)
    }, this.ttl)
  }

  /**
   * Clear the cache
   */
  public clear(): void {
    this.cache.clear()
  }

  /**
   * Get current cache size
   */
  public size(): number {
    return this.cache.size
  }
}

/**
 * Global path validation cache
 */
export const pathCache = new PathValidationCache()

/**
 * Normalize a path to ensure consistent format
 *
 * @param p Path to normalize
 * @returns Normalized path
 */
export function normalizePath(p: string): string {
  return path.normalize(p)
}

/**
 * Expand ~ to user's home directory
 *
 * @param filepath Path potentially containing ~
 * @returns Expanded path
 */
export function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1))
  }
  return filepath
}

/**
 * Validate that a path is within allowed directories
 *
 * Performs these security checks:
 * - Ensures path is within allowed directories
 * - Resolves symlinks and checks their targets
 * - Verifies parent directories exist and are accessible
 *
 * @param requestedPath Path to validate
 * @param config Application configuration
 * @returns Validated absolute path
 * @throws AccessDeniedError if path is outside allowed directories
 * @throws PathNotFoundError if path doesn't exist
 */
export async function validatePath(requestedPath: string, config: Config): Promise<string> {
  // Check cache first for performance
  const cachedPath = pathCache.get(requestedPath)
  if (cachedPath) {
    return cachedPath
  }

  const expandedPath = expandHome(requestedPath)
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath)
  const normalizedRequested = normalizePath(absolute)

  // Check if path is within allowed directories
  const isAllowed = config.allowedDirectories.some((dir: string) =>
    normalizedRequested.startsWith(dir)
  )
  if (!isAllowed) {
    await logger.warn(`Access denied: ${absolute}`, {
      allowedDirs: config.allowedDirectories,
    })
    throw new AccessDeniedError(absolute)
  }

  try {
    // Check if path exists and verify its real path (for symlink security)
    const realPath = await fs.realpath(absolute)
    const normalizedReal = normalizePath(realPath)

    // Double-check the real path is also within allowed directories
    const isRealPathAllowed = config.allowedDirectories.some((dir: string) =>
      normalizedReal.startsWith(dir)
    )
    if (!isRealPathAllowed) {
      await logger.warn(`Symlink target outside allowed directories: ${realPath}`, {
        original: absolute,
      })
      throw new AccessDeniedError(
        absolute,
        'Access denied - symlink target outside allowed directories'
      )
    }

    // Store in cache and return
    pathCache.set(requestedPath, realPath)
    return realPath
  } catch (error) {
    // Special handling for non-existent paths
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const parentDir = path.dirname(absolute)
      try {
        // If parent directory exists and is allowed, permit the operation
        // (useful for file creation)
        const realParentPath = await fs.realpath(parentDir)
        const normalizedParent = normalizePath(realParentPath)
        const isParentAllowed = config.allowedDirectories.some((dir: string) =>
          normalizedParent.startsWith(dir)
        )

        if (!isParentAllowed) {
          await logger.warn(`Parent directory outside allowed directories: ${parentDir}`)
          throw new AccessDeniedError(
            parentDir,
            'Access denied - parent directory outside allowed directories'
          )
        }

        // Path is valid but doesn't exist
        pathCache.set(requestedPath, absolute)
        return absolute
      } catch (parentError) {
        if ((parentError as NodeJS.ErrnoException).code === 'ENOENT') {
          await logger.warn(`Parent directory does not exist: ${parentDir}`)
          throw new PathNotFoundError(parentDir)
        }
        throw parentError
      }
    }
    throw error
  }
}

/**
 * Check if a file exists and is within size limits
 *
 * @param filepath Path to check
 * @param maxSize Maximum allowed size in bytes
 * @returns File stats if valid
 * @throws FileSizeError if file exceeds size limit
 */
export async function validateFileSize(filepath: string, maxSize: number): Promise<any> {
  const stats = await fs.stat(filepath)

  if (stats.size > maxSize) {
    await logger.warn(`File size limit exceeded: ${filepath}`, {
      size: stats.size,
      maxSize,
    })
    throw new Error(`File size exceeds limit: ${stats.size} > ${maxSize} bytes`)
  }

  return stats
}
