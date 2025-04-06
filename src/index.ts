#!/usr/bin/env node

/**
 * MCP-Filesystem Server
 *
 * A secure filesystem server implementing the Model Context Protocol (MCP).
 * Provides controlled access to the filesystem with strict path validation
 * and comprehensive security measures.
 *
 * Features:
 * - Secure path validation
 * - Structured logging
 * - Performance metrics
 * - Configuration management
 * - Comprehensive error handling
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import fs from 'node:fs/promises'
import path from 'node:path'
import { minimatch } from 'minimatch'

// Import internal modules
import { logger } from './logger/index.js'
import { Config, createSampleConfig, loadConfig } from './config/index.js'
import { validatePath } from './utils/path.js'
import {
  editFile,
  EditFileArgsSchema,
  readFile,
  ReadFileArgsSchema,
  readMultipleFiles,
  ReadMultipleFilesArgsSchema,
  writeFile,
  WriteFileArgsSchema,
} from './utils/tools.js'
import { FileSystemError } from './errors/index.js'
import { executeCommand, ExecuteCommandArgsSchema } from './utils/exec/index.js'
// Import when needed
// import { handleBashCommand, BashCommandArgsSchema } from './utils/bash/index.js'
import { BashExecuteArgsSchema, BashPipeArgsSchema } from './utils/bash/bash_tools.js'
import { metrics } from './metrics/index.js'

// Command-line argument processing
const args = process.argv.slice(2)
let configPath: string | undefined

// Check for special commands
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
MCP-Filesystem Server

Usage:
  mcp-server-filesystem [options] <allowed-directory> [additional-directories...]

Options:
  --help, -h                Show this help message
  --version, -v             Show version information
  --config=<path>           Use configuration file at <path>
  --create-config=<path>    Create a sample configuration file at <path>

Examples:
  mcp-server-filesystem /path/to/directory            # Allow access to one directory
  mcp-server-filesystem --config=/path/to/config.json # Use a config file
  mcp-server-filesystem --create-config=config.json   # Create a sample config
`)
  process.exit(0)
}

if (args.includes('--version') || args.includes('-v')) {
  console.log('MCP-Filesystem Server v0.3.0')
  process.exit(0)
}

// Check for config creation request
const createConfigArg = args.find((arg) => arg.startsWith('--create-config='))
if (createConfigArg) {
  const configOutputPath = createConfigArg.split('=')[1]
  if (!configOutputPath) {
    console.error('Error: Missing path for --create-config')
    process.exit(1)
  }

  createSampleConfig(configOutputPath)
    .then(() => {
      console.log(`Sample configuration created at: ${configOutputPath}`)
      process.exit(0)
    })
    .catch((error: unknown) => {
      console.error(`Error creating sample configuration: ${error}`)
      process.exit(1)
    })
} else {
  // Check for config file path
  const configArg = args.find((arg) => arg.startsWith('--config='))
  if (configArg) {
    configPath = configArg.split('=')[1]
    if (!configPath) {
      console.error('Error: Missing path for --config')
      process.exit(1)
    }
  }
}

// Define tool schemas not imported from tools module
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

// Types used in tool implementations
const ToolInputSchema = ToolSchema.shape.inputSchema
type ToolInput = z.infer<typeof ToolInputSchema>

interface FileInfo {
  size: number
  created: Date
  modified: Date
  accessed: Date
  isDirectory: boolean
  isFile: boolean
  permissions: string
}

interface TreeEntry {
  name: string
  type: 'file' | 'directory'
  children?: TreeEntry[]
}

/**
 * Gets detailed file stats
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
 * Main server initialization and run function
 */
async function runServer(config: Config) {
  // Set up logger with configuration
  logger.setLogLevel(config.logLevel)
  if (config.logFile) {
    logger.setLogFile(config.logFile)
  }

  await logger.info('Starting MCP-Filesystem server', {
    version: config.serverVersion,
    allowedDirectories: config.allowedDirectories,
  })

  // Validate that all specified directories exist
  await Promise.all(
    config.allowedDirectories.map(async (dir: string) => {
      try {
        const stats = await fs.stat(dir)
        if (!stats.isDirectory()) {
          await logger.error(`Error: ${dir} is not a directory`)
          process.exit(1)
        }
      } catch (error) {
        await logger.error(`Error accessing directory ${dir}:`, { error })
        process.exit(1)
      }
    })
  )

  // Initialize the MCP server
  const server = new Server(
    {
      name: config.serverName,
      version: config.serverVersion,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const endMetric = metrics.startOperation('list_tools')
    try {
      await logger.debug('Handling ListTools request')

      const result = {
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
          {
            name: 'get_metrics',
            description:
              'Returns performance metrics about server operations. ' +
              'Useful for monitoring and debugging.',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'execute_command',
            description:
              'Execute a system command with security restrictions. ' +
              'Validates commands for safety and provides detailed output. ' +
              'Limited to basic system operations with security checks.',
            inputSchema: zodToJsonSchema(ExecuteCommandArgsSchema) as ToolInput,
          },
          {
            name: 'bash_execute',
            description:
              'Execute a Bash command directly with output capture. ' +
              'More flexible than execute_command but still with security restrictions. ' +
              'Allows for direct access to Bash functionality.',
            inputSchema: zodToJsonSchema(BashExecuteArgsSchema) as ToolInput,
          },
          {
            name: 'bash_pipe',
            description:
              'Execute a sequence of Bash commands piped together. ' +
              'Allows for powerful command combinations with pipes. ' +
              'Results include both stdout and stderr.',
            inputSchema: zodToJsonSchema(BashPipeArgsSchema) as ToolInput,
          },
        ],
      }

      endMetric()
      return result
    } catch (error) {
      metrics.recordError('list_tools')
      await logger.error('Error in ListTools handler', { error })
      throw error
    }
  })

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: a } = request.params
    const endMetric = metrics.startOperation(name)

    await logger.debug(`Handling tool call: ${name}`, { args: a })

    try {
      switch (name) {
        case 'read_file': {
          const parsed = ReadFileArgsSchema.safeParse(a)
          if (!parsed.success) {
            throw new FileSystemError(`Invalid arguments for ${name}`, 'INVALID_ARGS', undefined, {
              errors: parsed.error.format(),
            })
          }

          const content = await readFile(parsed.data, config)

          endMetric()
          return {
            content: [{ type: 'text', text: content }],
          }
        }

        case 'read_multiple_files': {
          const parsed = ReadMultipleFilesArgsSchema.safeParse(a)
          if (!parsed.success) {
            throw new FileSystemError(`Invalid arguments for ${name}`, 'INVALID_ARGS', undefined, {
              errors: parsed.error.format(),
            })
          }

          const results = await readMultipleFiles(parsed.data, config)
          const formattedResults = Object.entries(results)
            .map(([filePath, content]) => {
              if (content instanceof Error) {
                return `${filePath}: Error - ${content.message}`
              }
              return `${filePath}:\n${content}\n`
            })
            .join('\n---\n')

          endMetric()
          return {
            content: [{ type: 'text', text: formattedResults }],
          }
        }

        case 'write_file': {
          const parsed = WriteFileArgsSchema.safeParse(a)
          if (!parsed.success) {
            throw new FileSystemError(`Invalid arguments for ${name}`, 'INVALID_ARGS', undefined, {
              errors: parsed.error.format(),
            })
          }

          const result = await writeFile(parsed.data, config)

          endMetric()
          return {
            content: [{ type: 'text', text: result }],
          }
        }

        case 'edit_file': {
          const parsed = EditFileArgsSchema.safeParse(a)
          if (!parsed.success) {
            throw new FileSystemError(`Invalid arguments for ${name}`, 'INVALID_ARGS', undefined, {
              errors: parsed.error.format(),
            })
          }

          const result = await editFile(parsed.data, config)

          endMetric()
          return {
            content: [{ type: 'text', text: result }],
          }
        }

        case 'create_directory': {
          const parsed = CreateDirectoryArgsSchema.safeParse(a)
          if (!parsed.success) {
            throw new FileSystemError(`Invalid arguments for ${name}`, 'INVALID_ARGS', undefined, {
              errors: parsed.error.format(),
            })
          }

          const validPath = await validatePath(parsed.data.path, config)
          await fs.mkdir(validPath, { recursive: true })
          await logger.debug(`Created directory: ${validPath}`)

          endMetric()
          return {
            content: [{ type: 'text', text: `Successfully created directory ${parsed.data.path}` }],
          }
        }

        case 'list_directory': {
          const parsed = ListDirectoryArgsSchema.safeParse(a)
          if (!parsed.success) {
            throw new FileSystemError(`Invalid arguments for ${name}`, 'INVALID_ARGS', undefined, {
              errors: parsed.error.format(),
            })
          }

          const validPath = await validatePath(parsed.data.path, config)
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

          await logger.debug(`Listed directory: ${validPath}`, { entryCount: entries.length })

          endMetric()
          return {
            content: [{ type: 'text', text: formatted }],
          }
        }

        case 'directory_tree': {
          const parsed = DirectoryTreeArgsSchema.safeParse(a)
          if (!parsed.success) {
            throw new FileSystemError(`Invalid arguments for ${name}`, 'INVALID_ARGS', undefined, {
              errors: parsed.error.format(),
            })
          }

          async function buildTree(currentPath: string): Promise<TreeEntry[]> {
            const validPath = await validatePath(currentPath, config)
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
          await logger.debug(`Generated directory tree: ${parsed.data.path}`)

          endMetric()
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
            throw new FileSystemError(`Invalid arguments for ${name}`, 'INVALID_ARGS', undefined, {
              errors: parsed.error.format(),
            })
          }

          const validSourcePath = await validatePath(parsed.data.source, config)
          const validDestPath = await validatePath(parsed.data.destination, config)

          // Ensure the destination parent directory exists
          const destDir = path.dirname(validDestPath)
          await fs.mkdir(destDir, { recursive: true })

          await fs.rename(validSourcePath, validDestPath)
          await logger.debug(`Moved file from ${validSourcePath} to ${validDestPath}`)

          endMetric()
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
            throw new FileSystemError(`Invalid arguments for ${name}`, 'INVALID_ARGS', undefined, {
              errors: parsed.error.format(),
            })
          }

          const validPath = await validatePath(parsed.data.path, config)
          const patternLower = parsed.data.pattern.toLowerCase()
          const results: string[] = []

          async function search(currentPath: string) {
            try {
              const entries = await fs.readdir(currentPath, { withFileTypes: true })

              for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name)

                try {
                  await validatePath(fullPath, config)
                  const relativePath = path.relative(validPath, fullPath)

                  // Check if the path should be excluded
                  const shouldExclude =
                    parsed.data &&
                    parsed.data.excludePatterns.some((excludePattern) => {
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

          await search(validPath)
          await logger.debug(`Search complete: ${parsed.data.pattern}`, {
            resultCount: results.length,
          })

          endMetric()
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
            throw new FileSystemError(`Invalid arguments for ${name}`, 'INVALID_ARGS', undefined, {
              errors: parsed.error.format(),
            })
          }

          const validPath = await validatePath(parsed.data.path, config)
          const info = await getFileStats(validPath)
          await logger.debug(`Retrieved file info: ${validPath}`)

          endMetric()
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
          await logger.debug('Listed allowed directories')

          endMetric()
          return {
            content: [
              {
                type: 'text',
                text: `Allowed directories:\n${config.allowedDirectories.join('\n')}`,
              },
            ],
          }
        }

        case 'get_metrics': {
          const metricsData = metrics.getMetrics()
          await logger.debug('Retrieved metrics')

          endMetric()
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(metricsData, null, 2),
              },
            ],
          }
        }

        case 'execute_command': {
          const parsed = ExecuteCommandArgsSchema.safeParse(a)
          if (!parsed.success) {
            throw new FileSystemError(`Invalid arguments for ${name}`, 'INVALID_ARGS', undefined, {
              errors: parsed.error.format(),
            })
          }

          const result = await executeCommand(parsed.data, config)

          endMetric()
          return {
            content: [
              {
                type: 'text',
                text: `Command execution completed with exit code: ${result.exitCode}\n\nSTDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}`,
              },
            ],
          }
        }

        default:
          throw new FileSystemError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL')
      }
    } catch (error) {
      metrics.recordError(name)

      if (error instanceof FileSystemError) {
        await logger.error(
          `Error in ${name}:`,
          error instanceof FileSystemError ? error.toJSON() : { message: String(error) }
        )
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        }
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      await logger.error(`Unexpected error in ${name}:`, { error })

      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      }
    }
  })

  // Start the server
  const transport = new StdioServerTransport()
  await server.connect(transport)
  await logger.info('MCP-Filesystem Server running on stdio', {
    allowedDirectories: config.allowedDirectories,
    serverVersion: config.serverVersion,
  })

  // Periodic metrics reporting
  if (config.metrics.enabled && config.metrics.reportIntervalMs > 0) {
    setInterval(() => {
      const metricsData = metrics.getMetrics()
      logger.info('Performance metrics', { metrics: metricsData })
    }, config.metrics.reportIntervalMs)
  }
}

// Load configuration and start server
loadConfig(configPath)
  .then(runServer)
  .catch(async (error: unknown) => {
    console.error('Fatal error loading configuration or running server:', error)
    process.exit(1)
  })
