/**
 * Command Execution Utility for MCP-Filesystem
 *
 * This module provides secure command execution capabilities with:
 * - Command validation and sanitization
 * - Execution timeout limits
 * - Logging and auditing
 * - Security restrictions
 */

import { exec as execCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'
import { FileSystemError } from '../../errors/index.js'
import { Config } from '../../config/index.js'
import { metrics } from '../../metrics/index.js'
import { logger } from '../../logger/index.js'

// Promisify the exec function
const exec = promisify(execCallback)

// Regular expression to validate command safety
// This is a basic implementation - consider enhancing for production
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
 * Schema for execute_command arguments
 */
export const ExecuteCommandArgsSchema = z.object({
  command: z.string().describe('The command to execute'),
  workingDir: z.string().optional().describe('Working directory for command execution'),
  timeout: z
    .number()
    .int()
    .positive()
    .max(30000)
    .default(5000)
    .describe('Maximum execution time in milliseconds (max 30s)'),
  captureOutput: z.boolean().default(true).describe('Whether to capture and return command output'),
})

/**
 * Validate that a command is safe to execute
 *
 * @param command The command to validate
 * @returns true if command is safe, throws error otherwise
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
 * Execute a command with security validation
 *
 * @param args Command execution arguments
 * @param _config Application configuration (unused but kept for API consistency)
 * @returns Command execution result
 */
export async function executeCommand(
  args: z.infer<typeof ExecuteCommandArgsSchema>,
  _config: Config
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const endMetric = metrics.startOperation('execute_command')
  try {
    await logger.debug(`Executing command: ${args.command}`, { args })

    // Validate the command for security
    validateCommand(args.command)

    // Set working directory or use current directory
    const options = {
      cwd: args.workingDir || process.cwd(),
      timeout: args.timeout,
      encoding: 'utf-8' as const,
    }

    try {
      // Execute the command
      const { stdout, stderr } = await exec(args.command, options)
      await logger.debug(`Command executed successfully: ${args.command}`, {
        stdout: stdout.substring(0, 100) + (stdout.length > 100 ? '...' : ''),
      })

      endMetric()
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

      endMetric()
      return {
        stdout,
        stderr,
        exitCode,
      }
    }
  } catch (error) {
    metrics.recordError('execute_command')
    throw error
  }
}

/**
 * Stream output from a long-running command
 * This is a placeholder for a future implementation
 * Current implementation is not used and would need fixing
 */
/*
export async function streamCommandOutput(
  command: string,
  workingDir?: string
): Promise<string[]> {
  validateCommand(command);

  const parts = command.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);

  return new Promise<string[]>((resolve, reject) => {
    const childProcess = spawn(cmd, args, {
      cwd: workingDir || process.cwd(),
      shell: true
    });

    const outputLines: string[] = [];
    let buffer = '';

    childProcess.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        outputLines.push(line);
      }
    });

    childProcess.stderr.on('data', (data: Buffer) => {
      outputLines.push(`[stderr] ${data.toString().trim()}`);
    });

    childProcess.on('close', (code: number) => {
      // Add any remaining data
      if (buffer) {
        outputLines.push(buffer);
      }
      outputLines.push(`[Process exited with code ${code}]`);
      resolve(outputLines);
    });

    childProcess.on('error', (err: Error) => {
      reject(new Error(`Failed to start process: ${err.message}`));
    });
  });
}
*/
