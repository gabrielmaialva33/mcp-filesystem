/**
 * Bash Command Executor for MCP-Filesystem
 *
 * This module provides direct access to execute Bash commands
 * with output capture and proper error handling.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from '../../logger/index.js'
import { metrics } from '../../metrics/index.js'

// Promisify the exec function
const execPromise = promisify(exec)

/**
 * Interface for command execution result
 */
export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Class to execute Bash commands
 */
class CommandExecutor {
  /**
   * Execute a Bash command and return the result
   *
   * @param command The command to execute
   * @param workingDir Optional working directory
   * @param timeout Optional timeout in milliseconds
   * @returns The command execution result
   */
  async executeCommand(
    command: string,
    workingDir?: string,
    timeout: number = 10000
  ): Promise<CommandResult> {
    const endMetric = metrics.startOperation('bash_execute')

    try {
      await logger.debug(`Executing Bash command: ${command}`, { workingDir, timeout })

      // Set options for execution
      const options = {
        cwd: workingDir || process.cwd(),
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        shell: '/bin/bash',
      }

      try {
        // Execute the command
        const { stdout, stderr } = await execPromise(command, options)

        await logger.debug(`Command executed successfully: ${command}`, {
          stdoutLength: stdout.length,
          stderrLength: stderr.length,
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

        await logger.warn(`Command execution failed: ${command}`, {
          exitCode,
          stderr: stderr.substring(0, 500) + (stderr.length > 500 ? '...' : ''),
        })

        endMetric()
        return {
          stdout,
          stderr,
          exitCode,
        }
      }
    } catch (error) {
      metrics.recordError('bash_execute')
      throw error
    }
  }

  /**
   * Execute a Bash command with a pipe
   *
   * @param commands Array of commands to pipe together
   * @param workingDir Optional working directory
   * @param timeout Optional timeout in milliseconds
   * @returns The command execution result
   */
  async executePipedCommand(
    commands: string[],
    workingDir?: string,
    timeout: number = 30000
  ): Promise<CommandResult> {
    const pipedCommand = commands.join(' | ')
    return this.executeCommand(pipedCommand, workingDir, timeout)
  }

  /**
   * Execute a Bash command and stream the output
   * (This is a placeholder for a future implementation)
   */
  async executeCommandWithStream(command: string, workingDir?: string): Promise<string[]> {
    const { stdout } = await this.executeCommand(command, workingDir)
    return stdout.split('\n').filter((line) => line.trim() !== '')
  }
}

// Export singleton instance
export const commandExecutor = new CommandExecutor()
export default CommandExecutor
