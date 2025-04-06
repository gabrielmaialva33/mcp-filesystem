/**
 * Bash Tools for MCP-Filesystem
 *
 * Advanced bash command execution and piping functionality.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'

import { logger } from '../../logger/index.js'
import { FileSystemError } from '../../errors/index.js'
import { validatePath } from '../path.js'
import { Config } from '../../config/index.js'

// Promisify the exec function
const execPromise = promisify(exec)

// Regular expression to validate command safety
const SAFE_COMMAND_REGEX = /^[a-zA-Z0-9_\-./\s:;,|><&{}()\[\]'"$%+*!?~=]+$/

// Development-related commands that are allowed regardless of pattern matching
const DEV_COMMANDS = [
  'npm',
  'pnpm',
  'yarn',
  'npx', // Package managers
  'node',
  'ts-node',
  'tsc', // Node.js and TypeScript
  'eslint',
  'prettier', // Linting and formatting
  'jest',
  'vitest',
  'mocha', // Testing
  'git', // Version control
  'find',
  'grep',
  'sed',
  'awk', // File operations and text processing
  'cat',
  'ls',
  'cd',
  'cp',
  'mv', // Basic file operations
]

// List of explicitly forbidden commands
const FORBIDDEN_COMMANDS = [
  'rm -rf',
  'rm -rf /',
  'rm -rf /*',
  'rm -r /',
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
  'doas',
  ':(){:|:&};:', // Fork bomb
]

// Schema for bash_execute arguments
export const BashExecuteArgsSchema = z.object({
  command: z.string().describe('The bash command to execute'),
  workingDir: z.string().optional().describe('Working directory for command execution'),
  timeout: z
    .number()
    .int()
    .positive()
    .max(60000)
    .optional()
    .default(30000)
    .describe('Maximum execution time in milliseconds (max 60s)'),
  env: z.record(z.string()).optional().describe('Additional environment variables for the command'),
})

// Schema for bash_pipe arguments
export const BashPipeArgsSchema = z.object({
  commands: z.array(z.string()).min(1).describe('Array of commands to pipe together'),
  workingDir: z.string().optional().describe('Working directory for command execution'),
  timeout: z
    .number()
    .int()
    .positive()
    .max(60000)
    .optional()
    .default(30000)
    .describe('Maximum execution time in milliseconds (max 60s)'),
  env: z.record(z.string()).optional().describe('Additional environment variables for the command'),
})

/**
 * Check if a command is safe to execute
 */
function validateCommand(command: string): boolean {
  // Check for forbidden commands
  if (FORBIDDEN_COMMANDS.some((forbidden) => command.includes(forbidden))) {
    throw new FileSystemError(
      `Command contains forbidden operations`,
      'FORBIDDEN_COMMAND',
      undefined,
      { command }
    )
  }

  // Check if it's an allowed development command
  const baseCommand = command.split(' ')[0].trim()
  const isDevCommand = DEV_COMMANDS.some(
    (cmd) => baseCommand === cmd || baseCommand.endsWith(`/${cmd}`)
  )

  if (isDevCommand) {
    return true
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
 * Execute a bash command
 */
export async function bashExecute(
  args: z.infer<typeof BashExecuteArgsSchema>,
  config: Config
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Validate the command
  validateCommand(args.command)

  // Validate working directory if provided
  // Initialize cwd with the current directory and possibly override it
  const cwd = args.workingDir ? await validatePath(args.workingDir, config) : process.cwd()

  // Prepare execution options
  const options = {
    cwd,
    timeout: args.timeout || 30000,
    env: args.env ? { ...process.env, ...args.env } : process.env,
    encoding: 'utf8' as const,
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer for output
  }

  try {
    await logger.debug(`Executing bash command: ${args.command}`, {
      workingDir: cwd,
      timeout: options.timeout,
    })

    // Execute the command
    const { stdout, stderr } = await execPromise(args.command, options)

    await logger.debug(`Command executed successfully: ${args.command}`, {
      exitCode: 0,
      stdoutPreview: stdout.substring(0, 100) + (stdout.length > 100 ? '...' : ''),
    })

    return {
      stdout,
      stderr,
      exitCode: 0,
    }
  } catch (error: any) {
    // Handle command execution errors
    const stderr = error.stderr || ''
    const stdout = error.stdout || ''
    const exitCode = error.code || 1

    await logger.warn(`Command execution failed: ${args.command}`, {
      exitCode,
      stderr: stderr.substring(0, 100) + (stderr.length > 100 ? '...' : ''),
    })

    return {
      stdout,
      stderr,
      exitCode,
    }
  }
}

/**
 * Execute piped bash commands
 */
export async function bashPipe(
  args: z.infer<typeof BashPipeArgsSchema>,
  config: Config
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Validate each command
  for (const command of args.commands) {
    validateCommand(command)
  }

  // Validate working directory if provided
  args.workingDir ? await validatePath(args.workingDir, config) : process.cwd()
  // Construct the piped command
  const pipedCommand = args.commands.join(' | ')

  // Use bash to execute the piped command
  return bashExecute(
    {
      command: pipedCommand,
      workingDir: args.workingDir,
      timeout: args.timeout,
      env: args.env,
    },
    config
  )
}
