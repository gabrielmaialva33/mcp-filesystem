#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { createTwoFilesPatch } from 'diff'
import { minimatch } from 'minimatch'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from '@modelcontextprotocol/sdk/types.js'

const args = process.argv.slice(2)

if (args.length === 0) {
  console.error('Usage: mcp-server-filesystem <allowed-directory> [additional-directories...]')
  process.exit(1)
}

/**
 * Normalizes a path to handle cross-platform differences
 */
function normalizePath(p: string): string {
  return path.normalize(p)
}

/**
 * Expands home directory tildes (~/path) to absolute paths
 */
function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1))
  }
  return filepath
}

// Validate and normalize all allowed directories
const allowedDirectories = args.map((dir) => normalizePath(path.resolve(expandHome(dir))))

// Verify that all specified directories exist and are actually directories
await Promise.all(
  args.map(async (dir) => {
    try {
      const stats = await fs.stat(expandHome(dir))
      if (!stats.isDirectory()) {
        console.error(`Error: ${dir} is not a directory`)
        process.exit(1)
      }
    } catch (error) {
      console.error(`Error accessing directory ${dir}:`, error)
      process.exit(1)
    }
  })
)

/**
 * Validates that a requested path is within the allowed directories
 * Handles symlinks by resolving real paths and checking against allowed directories
 */
async function validatePath(requestedPath: string): Promise<string> {
  const expandedPath = expandHome(requestedPath)
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath)

  const normalizedRequested = normalizePath(absolute)
  const isAllowed = allowedDirectories.some((dir) => normalizedRequested.startsWith(dir))

  if (!isAllowed) {
    throw new Error(
      `Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`
    )
  }

  try {
    // Check if the real path (resolving symlinks) is within allowed directories
    const realPath = await fs.realpath(absolute)
    const normalizedReal = normalizePath(realPath)
    const isRealPathAllowed = allowedDirectories.some((dir) => normalizedReal.startsWith(dir))

    if (!isRealPathAllowed) {
      throw new Error('Access denied - symlink target outside allowed directories')
    }

    return realPath
  } catch (error) {
    // Handle the case where the path doesn't exist yet but its parent directory does
    const parentDir = path.dirname(absolute)
    try {
      const realParentPath = await fs.realpath(parentDir)
      const normalizedParent = normalizePath(realParentPath)
      const isParentAllowed = allowedDirectories.some((dir) => normalizedParent.startsWith(dir))

      if (!isParentAllowed) {
        throw new Error('Access denied - parent directory outside allowed directories')
      }

      return absolute
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`)
    }
  }
}

// Schema definitions for tool arguments
const ReadFileArgsSchema = z.object({
  path: z.string().describe('Path to the file to read'),
})

const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()).describe('List of file paths to read'),
})

const WriteFileArgsSchema = z.object({
  path: z.string().describe('Path where to write the file'),
  content: z.string().describe('Content to write to the file'),
})

const EditOperation = z.object({
  oldText: z.string().describe('Text to search for - must match exactly'),
  newText: z.string().describe('Text to replace with'),
})

const EditFileArgsSchema = z.object({
  path: z.string().describe('Path to the file to edit'),
  edits: z.array(EditOperation).describe('List of edit operations to perform'),
  dryRun: z.boolean().default(false).describe('Preview changes using git-style diff format'),
})

const CreateDirectoryArgsSchema = z.object({
  path: z.string().describe('Path of the directory to create'),
})

const ListDirectoryArgsSchema = z.object({
  path: z.string().describe('Path of the directory to list'),
})

const DirectoryTreeArgsSchema = z.object({
  path: z.string().describe('Path of the directory to create a tree view for'),
})

const MoveFileArgsSchema = z.object({
  source: z.string().describe('Source path of the file or directory to move'),
  destination: z.string().describe('Destination path where to move the file or directory'),
})

const SearchFilesArgsSchema = z.object({
  path: z.string().describe('Root path to start searching from'),
  pattern: z.string().describe('Pattern to match against filenames and directories'),
  excludePatterns: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Patterns to exclude from search results'),
})

const GetFileInfoArgsSchema = z.object({
  path: z.string().describe('Path to the file or directory to get information about'),
})

const ToolInputSchema = ToolSchema.shape.inputSchema
type ToolInput = z.infer<typeof ToolInputSchema>

/**
 * Interface for file information returned by getFileStats
 */
interface FileInfo {
  size: number
  created: Date
  modified: Date
  accessed: Date
  isDirectory: boolean
  isFile: boolean
  permissions: string
}

/**
 * Interface for directory tree entries
 */
interface TreeEntry {
  name: string
  type: 'file' | 'directory'
  children?: TreeEntry[]
}

// Initialize the MCP server
const server = new Server(
  {
    name: 'secure-filesystem-server',
    version: '0.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

/**
 * Gets detailed file stats and returns them in a structured format
 */
async function getFileStats(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath)
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  }
}

/**
 * Creates a unified diff between original and modified content
 */
function createUnifiedDiff(
  originalContent: string,
  modifiedContent: string,
  filePath: string
): string {
  return createTwoFilesPatch(
    filePath,
    filePath,
    originalContent,
    modifiedContent,
    'Original',
    'Modified'
  )
}

/**
 * Applies a series of text edits to a file
 */
async function applyFileEdits(
  filePath: string,
  edits: z.infer<typeof EditOperation>[],
  dryRun = false
): Promise<string> {
  // Read the original file content
  const content = await fs.readFile(filePath, 'utf-8')
  let modifiedContent = content

  // Apply each edit sequentially
  for (const edit of edits) {
    const contentLines = modifiedContent.split('\n')
    let matchFound = false

    // Normalize line endings to ensure consistent matching
    const normalizedOld = edit.oldText.replace(/\r\n/g, '\n')
    const normalizedNew = edit.newText.replace(/\r\n/g, '\n')
    const oldLines = normalizedOld.split('\n')

    if (oldLines.length === 0) {
      throw new Error('Edit operation contains empty oldText')
    }

    // Try to find an exact match for the edit
    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      // Check if this position matches the whole block
      const potentialMatch = contentLines.slice(i, i + oldLines.length).join('\n')

      if (potentialMatch === normalizedOld) {
        // Preserve indentation from the first line
        const originalIndent = contentLines[i].match(/^\s*/)?.[0] || ''

        // Apply the edit with preserved indentation
        const newLines = normalizedNew.split('\n').map((line, j) => {
          if (j === 0) return originalIndent + line.trimStart()

          // Try to maintain relative indentation
          const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || ''
          const newIndent = line.match(/^\s*/)?.[0] || ''

          if (oldIndent && newIndent) {
            const relativeIndent = newIndent.length - oldIndent.length
            return originalIndent + ' '.repeat(Math.max(0, relativeIndent)) + line.trimStart()
          }

          return line
        })

        // Replace the matched lines with the new content
        contentLines.splice(i, oldLines.length, ...newLines)
        modifiedContent = contentLines.join('\n')
        matchFound = true
        break
      }
    }

    if (!matchFound) {
      throw new Error(`Could not find exact match for edit:\n${edit.oldText}`)
    }
  }

  // Generate a diff to show changes
  const diff = createUnifiedDiff(content, modifiedContent, filePath)

  // Format the diff with appropriate backticks that won't conflict with the content
  let numBackticks = 3
  while (diff.includes('`'.repeat(numBackticks))) {
    numBackticks++
  }

  const formattedDiff = `${'`'.repeat(numBackticks)}diff\n${diff}${'`'.repeat(numBackticks)}\n\n`

  // Actually write the changes if not in dry run mode
  if (!dryRun) {
    await fs.writeFile(filePath, modifiedContent, 'utf-8')
  }

  return formattedDiff
}

/**
 * Recursively searches for files matching a pattern
 */
async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = []
): Promise<string[]> {
  const results: string[] = []
  const patternLower = pattern.toLowerCase()

  async function search(currentPath: string) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name)

        try {
          await validatePath(fullPath)
          const relativePath = path.relative(rootPath, fullPath)

          // Check if the path should be excluded
          const shouldExclude = excludePatterns.some((excludePattern) => {
            const globPattern = excludePattern.includes('*')
              ? excludePattern
              : `**/${excludePattern}**`
            return minimatch(relativePath, globPattern, { nocase: true })
          })

          if (shouldExclude) {
            continue
          }

          // Check if the name matches the search pattern
          if (entry.name.toLowerCase().includes(patternLower)) {
            results.push(fullPath)
          }

          // Recursively search subdirectories
          if (entry.isDirectory()) {
            await search(fullPath)
          }
        } catch (error) {
          // Skip paths we can't access or validate
          continue
        }
      }
    } catch (error) {
      // Skip directories we can't read
      return
    }
  }

  await search(rootPath)
  return results
}

// Register the list of tools with the server
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'read_file',
        description:
          'Read the complete contents of a file from the file system. ' +
          'Handles various text encodings and provides detailed error messages ' +
          'if the file cannot be read. Use this tool when you need to examine ' +
          'the contents of a single file. Only works within allowed directories.',
        inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
      },
      {
        name: 'read_multiple_files',
        description:
          'Read the contents of multiple files simultaneously. This is more ' +
          'efficient than reading files one by one when you need to analyze ' +
          "or compare multiple files. Each file's content is returned with its " +
          "path as a reference. Failed reads for individual files won't stop " +
          'the entire operation. Only works within allowed directories.',
        inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema) as ToolInput,
      },
      {
        name: 'write_file',
        description:
          'Create a new file or completely overwrite an existing file with new content. ' +
          'Use with caution as it will overwrite existing files without warning. ' +
          'Handles text content with proper encoding. Only works within allowed directories.',
        inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
      },
      {
        name: 'edit_file',
        description:
          'Make line-based edits to a text file. Each edit replaces exact line sequences ' +
          'with new content. Returns a git-style diff showing the changes made. ' +
          'Only works within allowed directories.',
        inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
      },
      {
        name: 'create_directory',
        description:
          'Create a new directory or ensure a directory exists. Can create multiple ' +
          'nested directories in one operation. If the directory already exists, ' +
          'this operation will succeed silently. Perfect for setting up directory ' +
          'structures for projects or ensuring required paths exist. Only works within allowed directories.',
        inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
      },
      {
        name: 'list_directory',
        description:
          'Get a detailed listing of all files and directories in a specified path. ' +
          'Results clearly distinguish between files and directories with [FILE] and [DIR] ' +
          'prefixes. This tool is essential for understanding directory structure and ' +
          'finding specific files within a directory. Only works within allowed directories.',
        inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
      },
      {
        name: 'directory_tree',
        description:
          'Get a recursive tree view of files and directories as a JSON structure. ' +
          "Each entry includes 'name', 'type' (file/directory), and 'children' for directories. " +
          'Files have no children array, while directories always have a children array (which may be empty). ' +
          'The output is formatted with 2-space indentation for readability. Only works within allowed directories.',
        inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
      },
      {
        name: 'move_file',
        description:
          'Move or rename files and directories. Can move files between directories ' +
          'and rename them in a single operation. If the destination exists, the ' +
          'operation will fail. Works across different directories and can be used ' +
          'for simple renaming within the same directory. Both source and destination must be within allowed directories.',
        inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
      },
      {
        name: 'search_files',
        description:
          'Recursively search for files and directories matching a pattern. ' +
          'Searches through all subdirectories from the starting path. The search ' +
          'is case-insensitive and matches partial names. Returns full paths to all ' +
          "matching items. Great for finding files when you don't know their exact location. " +
          'Only searches within allowed directories.',
        inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
      },
      {
        name: 'get_file_info',
        description:
          'Retrieve detailed metadata about a file or directory. Returns comprehensive ' +
          'information including size, creation time, last modified time, permissions, ' +
          'and type. This tool is perfect for understanding file characteristics ' +
          'without reading the actual content. Only works within allowed directories.',
        inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
      },
      {
        name: 'list_allowed_directories',
        description:
          'Returns the list of directories that this server is allowed to access. ' +
          'Use this to understand which directories are available before trying to access files.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ],
  }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: a } = request.params

    switch (name) {
      case 'read_file': {
        const parsed = ReadFileArgsSchema.safeParse(a)
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_file: ${parsed.error}`)
        }

        const validPath = await validatePath(parsed.data.path)
        const content = await fs.readFile(validPath, 'utf-8')

        return {
          content: [{ type: 'text', text: content }],
        }
      }

      case 'read_multiple_files': {
        const parsed = ReadMultipleFilesArgsSchema.safeParse(a)
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`)
        }

        const results = await Promise.all(
          parsed.data.paths.map(async (filePath: string) => {
            try {
              const validPath = await validatePath(filePath)
              const content = await fs.readFile(validPath, 'utf-8')
              return `${filePath}:\n${content}\n`
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error)
              return `${filePath}: Error - ${errorMessage}`
            }
          })
        )

        return {
          content: [{ type: 'text', text: results.join('\n---\n') }],
        }
      }

      case 'write_file': {
        const parsed = WriteFileArgsSchema.safeParse(a)
        if (!parsed.success) {
          throw new Error(`Invalid arguments for write_file: ${parsed.error}`)
        }

        const validPath = await validatePath(parsed.data.path)

        // Ensure the parent directory exists
        const parentDir = path.dirname(validPath)
        await fs.mkdir(parentDir, { recursive: true })

        await fs.writeFile(validPath, parsed.data.content, 'utf-8')

        return {
          content: [{ type: 'text', text: `Successfully wrote to ${parsed.data.path}` }],
        }
      }

      case 'edit_file': {
        const parsed = EditFileArgsSchema.safeParse(a)
        if (!parsed.success) {
          throw new Error(`Invalid arguments for edit_file: ${parsed.error}`)
        }

        const validPath = await validatePath(parsed.data.path)
        const result = await applyFileEdits(validPath, parsed.data.edits, parsed.data.dryRun)

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'create_directory': {
        const parsed = CreateDirectoryArgsSchema.safeParse(a)
        if (!parsed.success) {
          throw new Error(`Invalid arguments for create_directory: ${parsed.error}`)
        }

        const validPath = await validatePath(parsed.data.path)
        await fs.mkdir(validPath, { recursive: true })

        return {
          content: [{ type: 'text', text: `Successfully created directory ${parsed.data.path}` }],
        }
      }

      case 'list_directory': {
        const parsed = ListDirectoryArgsSchema.safeParse(a)
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_directory: ${parsed.error}`)
        }

        const validPath = await validatePath(parsed.data.path)
        const entries = await fs.readdir(validPath, { withFileTypes: true })

        // Sort directories first, then files, both alphabetically
        entries.sort((c, d) => {
          if (c.isDirectory() && !d.isDirectory()) return -1
          if (!c.isDirectory() && d.isDirectory()) return 1
          return c.name.localeCompare(d.name)
        })

        const formatted = entries
          .map((entry) => `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`)
          .join('\n')

        return {
          content: [{ type: 'text', text: formatted }],
        }
      }

      case 'directory_tree': {
        const parsed = DirectoryTreeArgsSchema.safeParse(a)
        if (!parsed.success) {
          throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`)
        }

        async function buildTree(currentPath: string): Promise<TreeEntry[]> {
          const validPath = await validatePath(currentPath)
          const entries = await fs.readdir(validPath, { withFileTypes: true })

          // Sort directories first, then files, both alphabetically
          entries.sort((f, g) => {
            if (f.isDirectory() && !g.isDirectory()) return -1
            if (!f.isDirectory() && g.isDirectory()) return 1
            return f.name.localeCompare(g.name)
          })

          const result: TreeEntry[] = []

          for (const entry of entries) {
            const entryData: TreeEntry = {
              name: entry.name,
              type: entry.isDirectory() ? 'directory' : 'file',
            }

            if (entry.isDirectory()) {
              try {
                const subPath = path.join(currentPath, entry.name)
                entryData.children = await buildTree(subPath)
              } catch (error) {
                // If we can't access a subdirectory, represent it as empty
                entryData.children = []
              }
            }

            result.push(entryData)
          }

          return result
        }

        const treeData = await buildTree(parsed.data.path)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(treeData, null, 2),
            },
          ],
        }
      }

      case 'move_file': {
        const parsed = MoveFileArgsSchema.safeParse(a)
        if (!parsed.success) {
          throw new Error(`Invalid arguments for move_file: ${parsed.error}`)
        }

        const validSourcePath = await validatePath(parsed.data.source)
        const validDestPath = await validatePath(parsed.data.destination)

        // Ensure the destination parent directory exists
        const destDir = path.dirname(validDestPath)
        await fs.mkdir(destDir, { recursive: true })

        await fs.rename(validSourcePath, validDestPath)

        return {
          content: [
            {
              type: 'text',
              text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}`,
            },
          ],
        }
      }

      case 'search_files': {
        const parsed = SearchFilesArgsSchema.safeParse(a)
        if (!parsed.success) {
          throw new Error(`Invalid arguments for search_files: ${parsed.error}`)
        }

        const validPath = await validatePath(parsed.data.path)
        const results = await searchFiles(
          validPath,
          parsed.data.pattern,
          parsed.data.excludePatterns
        )

        return {
          content: [
            {
              type: 'text',
              text:
                results.length > 0
                  ? `Found ${results.length} matches:\n${results.join('\n')}`
                  : 'No matches found',
            },
          ],
        }
      }

      case 'get_file_info': {
        const parsed = GetFileInfoArgsSchema.safeParse(a)
        if (!parsed.success) {
          throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`)
        }

        const validPath = await validatePath(parsed.data.path)
        const info = await getFileStats(validPath)

        return {
          content: [
            {
              type: 'text',
              text: Object.entries(info)
                .map(([key, value]) => `${key}: ${value}`)
                .join('\n'),
            },
          ],
        }
      }

      case 'list_allowed_directories': {
        return {
          content: [
            {
              type: 'text',
              text: `Allowed directories:\n${allowedDirectories.join('\n')}`,
            },
          ],
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text', text: `Error: ${errorMessage}` }],
      isError: true,
    }
  }
})

/**
 * Starts the MCP server on stdio
 */
async function runServer() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Secure MCP Filesystem Server running on stdio')
  console.error('Allowed directories:', allowedDirectories)
}

runServer().catch((error) => {
  console.error('Fatal error running server:', error)
  process.exit(1)
})
