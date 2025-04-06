/**
 * Bash Tool Implementation for MCP-Filesystem
 *
 * Implements bash_execute and bash_pipe tools for the MCP filesystem server
 */

import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  BashExecuteArgsSchema,
  BashPipeArgsSchema,
  bashExecute,
  bashPipe,
} from '../../utils/bash/bash_tools.js'
import { Config } from '../../config/index.js'
import { metrics } from '../../metrics/index.js'
import { logger } from '../../logger/index.js'
import { FileSystemError } from '../../errors/index.js'

/**
 * Get the schemas for bash tools
 */
export function getBashToolsSchema() {
  return [
    {
      name: 'bash_execute',
      description:
        'Execute a Bash command directly with output capture. ' +
        'More flexible than execute_command but still with security restrictions. ' +
        'Allows for direct access to Bash functionality.',
      inputSchema: zodToJsonSchema(BashExecuteArgsSchema),
    },
    {
      name: 'bash_pipe',
      description:
        'Execute a sequence of Bash commands piped together. ' +
        'Allows for powerful command combinations with pipes. ' +
        'Results include both stdout and stderr.',
      inputSchema: zodToJsonSchema(BashPipeArgsSchema),
    },
  ]
}

/**
 * Handle bash_execute tool requests
 *
 * @param args Tool arguments
 * @param config Server configuration
 * @returns Tool response
 */
export async function handleBashExecute(args: any, config: Config) {
  const endMetric = metrics.startOperation('bash_execute')

  try {
    // Validate arguments
    const parsed = BashExecuteArgsSchema.safeParse(args)
    if (!parsed.success) {
      throw new FileSystemError(`Invalid arguments for bash_execute`, 'INVALID_ARGS', undefined, {
        errors: parsed.error.format(),
      })
    }

    // Execute the command
    const result = await bashExecute(parsed.data, config)

    // Format the response
    const formattedResponse = formatCommandResult(result, parsed.data.command)

    await logger.debug(`Bash command executed: ${args.command}`, {
      exitCode: result.exitCode,
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
    metrics.recordError('bash_execute')

    if (error instanceof FileSystemError) {
      await logger.error(`Error in bash_execute:`, error.toJSON())
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      }
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    await logger.error(`Unexpected error in bash_execute:`, { error })

    return {
      content: [{ type: 'text', text: `Error: ${errorMessage}` }],
      isError: true,
    }
  }
}

/**
 * Handle bash_pipe tool requests
 *
 * @param args Tool arguments
 * @param config Server configuration
 * @returns Tool response
 */
export async function handleBashPipe(args: any, config: Config) {
  const endMetric = metrics.startOperation('bash_pipe')

  try {
    // Validate arguments
    const parsed = BashPipeArgsSchema.safeParse(args)
    if (!parsed.success) {
      throw new FileSystemError(`Invalid arguments for bash_pipe`, 'INVALID_ARGS', undefined, {
        errors: parsed.error.format(),
      })
    }

    // Execute the command
    const result = await bashPipe(parsed.data, config)

    // Format the response
    const formattedResponse = formatCommandResult(result, parsed.data.commands.join(' | '))

    await logger.debug(`Bash pipe executed`, {
      commands: parsed.data.commands,
      exitCode: result.exitCode,
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
    metrics.recordError('bash_pipe')

    if (error instanceof FileSystemError) {
      await logger.error(`Error in bash_pipe:`, error.toJSON())
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      }
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    await logger.error(`Unexpected error in bash_pipe:`, { error })

    return {
      content: [{ type: 'text', text: `Error: ${errorMessage}` }],
      isError: true,
    }
  }
}

/**
 * Format command result for display
 */
function formatCommandResult(result: any, command: string) {
  let output = `Command: ${command}\n`
  output += `Exit Code: ${result.exitCode}\n\n`

  if (result.stdout.trim()) {
    output += `STDOUT:\n${result.stdout}\n`
  }

  if (result.stderr.trim()) {
    output += `STDERR:\n${result.stderr}\n`
  }

  return output
}
