/**
 * Bash Command Execution for MCP-Filesystem
 *
 * A simplified implementation for executing bash commands and capturing output.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from '../../logger/index.js'
import { FileSystemError } from '../../errors/index.js'

// Promisify the exec function
const execPromise = promisify(exec)

// Define the timeout for command execution (default: 30 seconds)
const DEFAULT_TIMEOUT_MS = 30000

// Regular expression to validate command safety
const SAFE_COMMAND_REGEX = /^[a-zA-Z0-9_\-./\s]+$/

// List of explicitly forbidden commands
const FORBIDDEN_COMMANDS = [
  'rm -rf',
  'rm -r',
  'rmdir',
  'dd',
  'mkfs',
  'format',
  'wget',
  'curl -O',
  'curl --output',
  'chmod 777',
  'chmod -R 777',
  'sudo',
  'su',
]

/**
 * Check if a command is safe to execute
 *
 * @param command The command to check
 * @returns True if the command is safe, false otherwise
 */
export function isCommandSafe(command: string): boolean {
  // Check for explicitly forbidden commands
  if (FORBIDDEN_COMMANDS.some((forbidden) => command.includes(forbidden))) {
    return false
  }

  // Check if the command matches the safe pattern
  if (!SAFE_COMMAND_REGEX.test(command)) {
    return false
  }

  return true
}

/**
 * Execute a command and return its output
 *
 * @param command The command to execute
 * @param options Command execution options
 * @returns The command output (stdout and stderr)
 */
export async function executeBashCommand(
  command: string,
  options: {
    workingDir?: string
    timeout?: number
    env?: Record<string, string>
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Validate the command
  if (!isCommandSafe(command)) {
    throw new FileSystemError(
      `Command contains forbidden operations or unsafe characters: ${command}`,
      'UNSAFE_COMMAND',
      undefined,
      { command }
    )
  }

  // Set execution options
  const execOptions = {
    cwd: options.workingDir || process.cwd(),
    timeout: options.timeout || DEFAULT_TIMEOUT_MS,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    encoding: 'utf8' as const,
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer for output
  }

  try {
    await logger.debug(`Executing bash command: ${command}`, {
      workingDir: execOptions.cwd,
      timeout: execOptions.timeout,
    })

    // Execute the command
    const { stdout, stderr } = await execPromise(command, execOptions)

    return {
      stdout,
      stderr,
      exitCode: 0,
    }
  } catch (error: any) {
    // Handle command execution errors
    await logger.warn(`Command execution failed: ${command}`, {
      error: error.message,
      stderr: error.stderr,
      code: error.code,
    })

    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || 'Unknown error',
      exitCode: error.code || 1,
    }
  }
}

/**
 * Schema for bash_command arguments
 */
export const BashCommandArgsSchema = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description: 'The bash command to execute',
    },
    workingDir: {
      type: 'string',
      description: 'Working directory for command execution (must be within allowed directories)',
    },
    timeout: {
      type: 'number',
      description: 'Maximum execution time in milliseconds (max 30s)',
    },
    env: {
      type: 'object',
      description: 'Additional environment variables for the command',
    },
  },
  required: ['command'],
}

/**
 * MCP tool handler for bash_command
 *
 * @param args Command arguments
 * @returns Formatted command output
 */
export async function handleBashCommand(args: any): Promise<string> {
  // Execute the command
  const result = await executeBashCommand(args.command, {
    workingDir: args.workingDir,
    timeout: args.timeout,
    env: args.env,
  })

  // Format the output
  const output = [
    `Command: ${args.command}`,
    `Exit Code: ${result.exitCode}`,
    '',
    'STDOUT:',
    result.stdout || '(empty)',
    '',
    'STDERR:',
    result.stderr || '(empty)',
  ].join('\n')

  return output
}
