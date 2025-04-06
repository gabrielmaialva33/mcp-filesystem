/**
 * Structured logging system for MCP-Filesystem
 *
 * Provides a consistent logging interface with:
 * - Log levels (debug, info, warn, error)
 * - Structured metadata support
 * - File logging capabilities
 * - Singleton pattern for global access
 */

import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Log levels supported by the logger
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Structured log entry format
 */
export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  metadata?: Record<string, unknown>
}

/**
 * Singleton logger implementation
 */
export class Logger {
  private static instance: Logger
  private logFile?: string
  private logLevel: LogLevel = 'info'
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton logger instance
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  /**
   * Set the log file path
   *
   * @param filePath Path to write logs
   */
  public setLogFile(filePath: string): void {
    this.logFile = filePath
  }

  /**
   * Set the minimum log level
   *
   * @param level Minimum level to log
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  /**
   * Check if a log level should be recorded based on current settings
   *
   * @param level Log level to check
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.logLevel]
  }

  /**
   * Write a log entry to configured outputs
   *
   * @param entry Log entry to write
   */
  private async writeLog(entry: LogEntry): Promise<void> {
    if (!this.shouldLog(entry.level)) {
      return
    }

    const logMessage = JSON.stringify(entry)

    // Always log to stderr (doesn't interfere with stdout used by MCP)
    if (entry.level === 'error' || entry.level === 'warn') {
      console.error(logMessage)
    } else {
      console.error(`[${entry.level.toUpperCase()}] ${entry.message}`)
    }

    if (this.logFile) {
      try {
        // Create parent directory if it doesn't exist
        const logDir = path.dirname(this.logFile)
        await fs.mkdir(logDir, { recursive: true }).catch(() => {})

        await fs.appendFile(this.logFile, logMessage + '\n')
      } catch (error) {
        console.error(`Failed to write to log file: ${error}`)
      }
    }
  }

  /**
   * Log a debug message
   *
   * @param message Message to log
   * @param metadata Optional structured data
   */
  public async debug(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'debug',
      message,
      metadata,
    })
  }

  /**
   * Log an info message
   *
   * @param message Message to log
   * @param metadata Optional structured data
   */
  public async info(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      metadata,
    })
  }

  /**
   * Log a warning message
   *
   * @param message Message to log
   * @param metadata Optional structured data
   */
  public async warn(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      metadata,
    })
  }

  /**
   * Log an error message
   *
   * @param message Message to log
   * @param metadata Optional structured data
   */
  public async error(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      metadata,
    })
  }
}

/**
 * Global logger instance
 */
export const logger = Logger.getInstance()
