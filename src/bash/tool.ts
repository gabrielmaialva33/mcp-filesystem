/**
 * Bash Tool for MCP-Filesystem
 *
 * Implements the bash_command tool for executing bash commands with advanced features
 */

import { zodToJsonSchema } from 'zod-to-json-schema'
import { BashCommandArgsSchema, executeBashCommand } from './index.js'
import { Config } from '../config/index.js'
import { metrics } from '../metrics/index.js'
import { logger } from '../logger/index.js'
import { FileSystemError } from '../errors/index.js'

/**
 * Get the schema for the bash command tool
 */
export function getBashCommandToolSchema() {
  return {
    name: 'bash_command',
    description:
      'Execute a bash command with detailed output and monitoring. ' +
      'Validates commands for safety and captures stdout, stderr, exit code, and timing information. ' +
      'Supports both interactive and non-interactive commands with timeout protection.',
    inputSchema: zodToJsonSchema(BashCommandArgsSchema),
  }
}

/**
 * Handle bash command tool requests
 *
 * @param args Tool arguments
 * @param config Server configuration
 * @returns Tool response
 */
export async function handleBashCommand(args: any, _config: Config) {
  const endMetric = metrics.startOperation('bash_command')

  try {
    // Validate arguments
    const parsed = BashCommandArgsSchema.safeParse(args)
    if (!parsed.success) {
      throw new FileSystemError(`Invalid arguments for bash_command`, 'INVALID_ARGS', undefined, {
        errors: parsed.error.format(),
      })
    }

    // Execute the command
    const result = await executeBashCommand(parsed.data)

    // Format the response
    const formattedResponse = formatCommandResult(result)

    await logger.debug(`Bash command executed: ${args.command}`, {
      exitCode: result.exitCode,
      executionTime: result.executionTime,
    })

    endMetric()
    return {
      content: [
        {
          type: 'text',
          text: formattedResponse,
        },
      ],
    }
  } catch (error) {
    metrics.recordError('bash_command')

    if (error instanceof FileSystemError) {
      await logger.error(`Error in bash_command:`, error.toJSON())
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      }
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    await logger.error(`Unexpected error in bash_command:`, { error })

    return {
      content: [{ type: 'text', text: `Error: ${errorMessage}` }],
      isError: true,
    }
  }
}

/**
 * Format command result for display
 */
function formatCommandResult(result: any) {
  const executionTimeStr =
    result.executionTime > 1000
      ? `${(result.executionTime / 1000).toFixed(2)}s`
      : `${result.executionTime}ms`

  let output = `Command: ${result.command}\n`
  output += `Exit Code: ${result.exitCode}\n`
  output += `Execution Time: ${executionTimeStr}\n\n`

  if (result.stdout.trim()) {
    output += `STDOUT:\n${result.stdout}\n`
  }

  if (result.stderr.trim()) {
    output += `STDERR:\n${result.stderr}\n`
  }

  return output
}
