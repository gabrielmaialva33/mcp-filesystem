/**
 * Tool implementations for MCP-Filesystem
 *
 * This module contains the implementation of all filesystem tools,
 * separated from the MCP server handling code for better modularity.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { createTwoFilesPatch } from 'diff'
// We'll import minimatch in the function where it's needed
import { z } from 'zod'
import { Config } from '../config/index.js'
import { logger } from '../logger/index.js'
import { metrics } from '../metrics/index.js'
import { validateFileSize, validatePath } from './path.js'
import { FileSizeError, InvalidArgumentsError, PathNotFoundError } from '../errors/index.js'

/**
 * Schema for read_file arguments
 */
export const ReadFileArgsSchema = z.object({
  path: z.string().describe('Path to the file to read'),
  encoding: z
    .enum(['utf-8', 'utf8', 'base64'])
    .optional()
    .default('utf-8')
    .describe('File encoding'),
})

/**
 * Read a file with security validation
 *
 * @param args File path and options
 * @param config Application configuration
 * @returns File content
 */
export async function readFile(
  args: z.infer<typeof ReadFileArgsSchema>,
  config: Config
): Promise<string> {
  const endMetric = metrics.startOperation('read_file')
  try {
    const validPath = await validatePath(args.path, config)

    // Validate file size before reading
    if (config.security.maxFileSize > 0) {
      await validateFileSize(validPath, config.security.maxFileSize)
    }

    const content = await fs.readFile(validPath, args.encoding)
    await logger.debug(`Successfully read file: ${validPath}`)

    endMetric()
    return content
  } catch (error) {
    metrics.recordError('read_file')

    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PathNotFoundError(args.path)
    }

    throw error
  }
}

/**
 * Schema for read_multiple_files arguments
 */
export const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()).describe('List of file paths to read'),
  encoding: z
    .enum(['utf-8', 'utf8', 'base64'])
    .optional()
    .default('utf-8')
    .describe('File encoding'),
})

/**
 * Read multiple files at once
 *
 * @param args File paths and options
 * @param config Application configuration
 * @returns Object mapping file paths to contents
 */
export async function readMultipleFiles(
  args: z.infer<typeof ReadMultipleFilesArgsSchema>,
  config: Config
): Promise<Record<string, string | Error>> {
  const endMetric = metrics.startOperation('read_multiple_files')
  const results: Record<string, string | Error> = {}

  await Promise.all(
    args.paths.map(async (filePath: string) => {
      try {
        const validPath = await validatePath(filePath, config)

        // Validate file size
        if (config.security.maxFileSize > 0) {
          await validateFileSize(validPath, config.security.maxFileSize)
        }

        const content = await fs.readFile(validPath, args.encoding)
        results[filePath] = content
      } catch (error) {
        if (error instanceof Error) {
          results[filePath] = error
        } else {
          results[filePath] = new Error(String(error))
        }
      }
    })
  )

  endMetric()
  return results
}

/**
 * Schema for write_file arguments
 */
export const WriteFileArgsSchema = z.object({
  path: z.string().describe('Path where to write the file'),
  content: z.string().describe('Content to write to the file'),
  encoding: z
    .enum(['utf-8', 'utf8', 'base64'])
    .optional()
    .default('utf-8')
    .describe('File encoding'),
})

/**
 * Write content to a file
 *
 * @param args File path and content
 * @param config Application configuration
 * @returns Success message
 */
export async function writeFile(
  args: z.infer<typeof WriteFileArgsSchema>,
  config: Config
): Promise<string> {
  const endMetric = metrics.startOperation('write_file')
  try {
    const validPath = await validatePath(args.path, config)

    // Check if content size exceeds limits
    if (config.security.maxFileSize > 0) {
      const contentSize = Buffer.byteLength(args.content, args.encoding as BufferEncoding)
      if (contentSize > config.security.maxFileSize) {
        metrics.recordError('write_file')
        throw new FileSizeError(args.path, contentSize, config.security.maxFileSize)
      }
    }

    // Create parent directory if needed
    const parentDir = path.dirname(validPath)
    await fs.mkdir(parentDir, { recursive: true })

    // Write the file
    await fs.writeFile(validPath, args.content, args.encoding)
    await logger.debug(`Successfully wrote to file: ${validPath}`)

    endMetric()
    return `Successfully wrote to ${args.path}`
  } catch (error) {
    metrics.recordError('write_file')
    throw error
  }
}

/**
 * Schema for a single edit operation
 */
export const EditOperation = z.object({
  oldText: z.string().describe('Text to search for - must match exactly'),
  newText: z.string().describe('Text to replace with'),
})

/**
 * Schema for edit_file arguments
 */
export const EditFileArgsSchema = z.object({
  path: z.string().describe('Path to the file to edit'),
  edits: z.array(EditOperation).describe('List of edit operations to perform'),
  dryRun: z.boolean().default(false).describe('Preview changes using git-style diff format'),
})

/**
 * Apply edits to a file
 *
 * @param args Edit operations and file path
 * @param config Application configuration
 * @returns Diff of changes
 */
export async function editFile(
  args: z.infer<typeof EditFileArgsSchema>,
  config: Config
): Promise<string> {
  const endMetric = metrics.startOperation('edit_file')
  try {
    const validPath = await validatePath(args.path, config)

    // Read the original content
    const content = await fs.readFile(validPath, 'utf-8')
    let modifiedContent = content

    // Track whether any edit was applied
    let appliedAnyEdit = false

    // Apply each edit
    for (const edit of args.edits) {
      const contentLines = modifiedContent.split('\n')
      let matchFound = false

      // Normalize line endings
      const normalizedOld = edit.oldText.replace(/\r\n/g, '\n')
      const normalizedNew = edit.newText.replace(/\r\n/g, '\n')
      const oldLines = normalizedOld.split('\n')

      // Validate edit
      if (oldLines.length === 0) {
        throw new InvalidArgumentsError('edit_file', 'Edit operation contains empty oldText')
      }

      // Find and replace the text
      for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
        const potentialMatch = contentLines.slice(i, i + oldLines.length).join('\n')
        if (potentialMatch === normalizedOld) {
          // Preserve indentation
          const originalIndent = contentLines[i].match(/^\s*/)?.[0] || ''
          const newLines = normalizedNew.split('\n').map((line, j) => {
            if (j === 0) return originalIndent + line.trimStart()
            const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || ''
            const newIndent = line.match(/^\s*/)?.[0] || ''
            if (oldIndent && newIndent) {
              const relativeIndent = newIndent.length - oldIndent.length
              return originalIndent + ' '.repeat(Math.max(0, relativeIndent)) + line.trimStart()
            }
            return line
          })

          contentLines.splice(i, oldLines.length, ...newLines)
          modifiedContent = contentLines.join('\n')
          matchFound = true
          appliedAnyEdit = true
          break
        }
      }

      if (!matchFound) {
        throw new Error(`Could not find exact match for edit:\n${edit.oldText}`)
      }
    }

    // If no edits were applied, return early
    if (!appliedAnyEdit) {
      return 'No changes made - all edit patterns were empty or not found'
    }

    // Generate diff
    const diff = createUnifiedDiff(content, modifiedContent, validPath)

    // Write file if not a dry run
    if (!args.dryRun) {
      await fs.writeFile(validPath, modifiedContent, 'utf-8')
      await logger.debug(`Successfully edited file: ${validPath}`)
    }

    endMetric()
    return diff
  } catch (error) {
    metrics.recordError('edit_file')
    throw error
  }
}

/**
 * Helper function to create a unified diff
 *
 * @param originalContent Original file content
 * @param modifiedContent Modified file content
 * @param filePath File path for diff header
 * @returns Formatted diff
 */
function createUnifiedDiff(
  originalContent: string,
  modifiedContent: string,
  filePath: string
): string {
  const diff = createTwoFilesPatch(
    filePath,
    filePath,
    originalContent,
    modifiedContent,
    'Original',
    'Modified'
  )

  // Find enough backticks to safely wrap the diff
  let numBackticks = 3
  while (diff.includes('`'.repeat(numBackticks))) {
    numBackticks++
  }

  return `${'`'.repeat(numBackticks)}diff\n${diff}${'`'.repeat(numBackticks)}\n\n`
}

// Additional tool implementations would continue here...
// For brevity, only a few are shown - the rest would follow the same pattern
