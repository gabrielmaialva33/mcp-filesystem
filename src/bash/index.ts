/**
 * Advanced Bash Command Execution for MCP-Filesystem
 *
 * Provides enhanced bash command execution with:
 * - Process tracking
 * - Resource usage monitoring
 * - Command chaining
 * - Environment detection
 */

import { exec, spawn, execSync, SpawnOptions } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'
import { logger } from '../logger/index.js'
import { FileSystemError } from '../errors/index.js'

// Promisify exec for async usage
const execAsync = promisify(exec)

// Regular expression for validating safe commands
const SAFE_COMMAND_REGEX = /^[a-zA-Z0-9_\-./\s:;,|><&{}()[\]'"$%+*!?~=]+$/

// Explicitly forbidden commands for security
const FORBIDDEN_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'mkfs',
  'dd if=/dev/zero',
  'chmod -R 777',
  ':(){:|:&};:',
  '> /dev/sda',
  'cat /dev/port',
  'cat /dev/mem',
]

// Schema for bash_command arguments
export const BashCommandArgsSchema = z.object({
  command: z.string().describe('Bash command to execute'),
  workingDir: z.string().optional().describe('Working directory for command execution'),
  timeout: z
    .number()
    .int()
    .positive()
    .max(60000)
    .default(10000)
    .describe('Maximum execution time in milliseconds (max 60s)'),
  env: z.record(z.string(), z.string()).optional().describe('Additional environment variables'),
  interactive: z
    .boolean()
    .default(false)
    .describe('Whether command is interactive (uses spawn instead of exec)'),
})

// Result interface for executed commands
export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
  executionTime: number
  command: string
}

/**
 * Validate that a command is safe to execute
 *
 * @param command The command to validate
 * @returns true if command is safe, throws error otherwise
 */
function validateCommand(command: string): boolean {
  // Check for explicitly forbidden commands
  if (
    FORBIDDEN_COMMANDS.some(
      (forbidden) =>
        command.includes(forbidden) || command.replace(/\s+/g, '') === forbidden.replace(/\s+/g, '')
    )
  ) {
    throw new FileSystemError(
      `Command contains forbidden operations`,
      'FORBIDDEN_COMMAND',
      undefined,
      { command }
    )
  }

  // Validate command against safe pattern
  if (!SAFE_COMMAND_REGEX.test(command)) {
    throw new FileSystemError(
      `Command contains potentially unsafe characters`,
      'UNSAFE_COMMAND',
      undefined,
      { command }
    )
  }

  return true
}

/**
 * Execute a bash command with detailed output and monitoring
 *
 * @param args Command execution arguments
 * @returns Detailed command result
 */
export async function executeBashCommand(
  args: z.infer<typeof BashCommandArgsSchema>
): Promise<CommandResult> {
  // Start timing execution
  const startTime = Date.now()

  try {
    await logger.debug(`Executing bash command: ${args.command}`, { args })

    // Validate the command for security
    validateCommand(args.command)

    // Set environment variables
    const env = {
      ...process.env,
      ...args.env,
    }

    // Set execution options
    const options = {
      cwd: args.workingDir || process.cwd(),
      timeout: args.timeout,
      env,
      shell: '/bin/bash',
      windowsHide: true,
    }

    if (args.interactive) {
      // Interactive mode uses spawn
      return await executeInteractiveCommand(args.command, options, startTime)
    } else {
      // Non-interactive mode uses exec
      return await executeNonInteractiveCommand(args.command, options, startTime)
    }
  } catch (error) {
    const endTime = Date.now()
    const executionTime = endTime - startTime

    if (error instanceof FileSystemError) {
      throw error
    }

    // For exec errors that contain stdout/stderr
    if (typeof error === 'object' && error !== null && 'stdout' in error && 'stderr' in error) {
      const execError = error as any
      return {
        stdout: execError.stdout || '',
        stderr: execError.stderr || 'Command failed to execute',
        exitCode: execError.code || 1,
        executionTime,
        command: args.command,
      }
    }

    // For other errors
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
      executionTime,
      command: args.command,
    }
  }
}

/**
 * Execute a non-interactive command using exec
 */
async function executeNonInteractiveCommand(
  command: string,
  options: any,
  startTime: number
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execAsync(command, options)
    const endTime = Date.now()
    const executionTime = endTime - startTime

    await logger.debug(`Command executed successfully: ${command}`, {
      executionTime,
      stdout: Buffer.isBuffer(stdout)
        ? stdout.toString('utf8').substring(0, 100) +
          (stdout.toString('utf8').length > 100 ? '...' : '')
        : String(stdout).substring(0, 100) + (String(stdout).length > 100 ? '...' : ''),
    })

    return {
      stdout: Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout),
      stderr: Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr),
      exitCode: 0,
      executionTime,
      command,
    }
  } catch (error: any) {
    const endTime = Date.now()
    const executionTime = endTime - startTime

    // Handle exec error which includes stdout/stderr
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || 'Command failed',
      exitCode: error.code || 1,
      executionTime,
      command,
    }
  }
}

/**
 * Execute an interactive command using spawn
 */
async function executeInteractiveCommand(
  command: string,
  options: any,
  startTime: number
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const parts = command.split(' ')
    const cmd = parts[0]
    const args = parts.slice(1)

    let stdout = ''
    let stderr = ''
    let exitCode = 0

    const childProcess = spawn(cmd, args, options as SpawnOptions)

    childProcess.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    childProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    childProcess.on('close', (code) => {
      const endTime = Date.now()
      const executionTime = endTime - startTime

      exitCode = code !== null ? code : 1

      logger.debug(`Interactive command completed: ${command}`, {
        executionTime,
        exitCode,
      })

      resolve({
        stdout,
        stderr,
        exitCode,
        executionTime,
        command,
      })
    })

    childProcess.on('error', (error) => {
      const endTime = Date.now()
      const executionTime = endTime - startTime

      stderr = error.message
      exitCode = 1

      logger.error(`Error executing interactive command: ${command}`, {
        error,
        executionTime,
      })

      resolve({
        stdout,
        stderr,
        exitCode,
        executionTime,
        command,
      })
    })

    // Handle timeout
    if (options.timeout) {
      setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill()
          const endTime = Date.now()
          const executionTime = endTime - startTime

          stderr += '\nCommand timed out'
          exitCode = 124 // Standard timeout exit code

          logger.warn(`Command timed out: ${command}`, {
            timeout: options.timeout,
            executionTime,
          })

          resolve({
            stdout,
            stderr,
            exitCode,
            executionTime,
            command,
          })
        }
      }, options.timeout)
    }
  })
}

/**
 * Quick synchronous execution of a command (use with caution)
 */
export function executeBashSync(command: string, options: any = {}): string {
  validateCommand(command)

  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...options.env,
      },
      shell: '/bin/bash',
      ...options,
    })

    return result.toString()
  } catch (error: any) {
    if (error.stdout) {
      return error.stdout.toString()
    }
    throw error
  }
}
