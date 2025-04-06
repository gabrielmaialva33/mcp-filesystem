/**
 * Configuration management for MCP-Filesystem
 *
 * Provides:
 * - Configuration loading from file
 * - Command-line argument support
 * - Default configuration values
 * - Configuration validation
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { expandHome, normalizePath } from '../utils/path.js'
import { z } from 'zod'

/**
 * Configuration schema using zod
 */
const ConfigSchema = z.object({
  // Basic server configuration
  serverName: z.string().default('secure-filesystem-server'),
  serverVersion: z.string().default('0.3.0'),

  // Directory security
  allowedDirectories: z.array(z.string()).min(1, 'At least one allowed directory required'),

  // Logging configuration
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logFile: z.string().optional(),

  // Cache configuration
  cache: z
    .object({
      enabled: z.boolean().default(true),
      maxSize: z.number().positive().default(1000),
      ttlMs: z.number().positive().default(60000),
    })
    .default({}),

  // Metrics configuration
  metrics: z
    .object({
      enabled: z.boolean().default(true),
      reportIntervalMs: z.number().positive().default(60000),
    })
    .default({}),

  // Security settings
  security: z
    .object({
      maxFileSize: z
        .number()
        .nonnegative()
        .default(10 * 1024 * 1024), // 10MB
      allowSymlinks: z.boolean().default(true),
      validateRealPath: z.boolean().default(true),
    })
    .default({}),
})

/**
 * Typed configuration interface
 */
export type Config = z.infer<typeof ConfigSchema>

/**
 * Default configuration
 */
const defaultConfig: Partial<Config> = {
  allowedDirectories: [],
  logLevel: 'info',
  serverName: 'secure-filesystem-server',
  serverVersion: '0.3.0',
  cache: {
    enabled: true,
    maxSize: 1000,
    ttlMs: 60000,
  },
  metrics: {
    enabled: true,
    reportIntervalMs: 60000,
  },
  security: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowSymlinks: true,
    validateRealPath: true,
  },
}

/**
 * Load configuration from file or command-line arguments
 *
 * @param configPath Optional path to config file
 * @returns Validated configuration
 */
export async function loadConfig(configPath?: string): Promise<Config> {
  let userConfig: Partial<Config> = {}

  // Try to load from config file
  if (configPath) {
    try {
      const expandedPath = expandHome(configPath)
      const configContent = await fs.readFile(expandedPath, 'utf-8')
      userConfig = JSON.parse(configContent)

      // Log success but after parsing
      console.error(`Loaded config from ${expandedPath}`)
    } catch (error) {
      console.error(`Failed to load config from ${configPath}, using default config`)
    }
  }

  // If no allowed directories in config, use command-line args
  if (!userConfig.allowedDirectories || userConfig.allowedDirectories.length === 0) {
    const args = process.argv.slice(2)
    if (args.length > 0) {
      userConfig.allowedDirectories = args.map((dir) =>
        normalizePath(path.resolve(expandHome(dir)))
      )
    }
  } else {
    // Normalize paths from config
    userConfig.allowedDirectories = userConfig.allowedDirectories.map((dir) =>
      normalizePath(path.resolve(expandHome(dir)))
    )
  }

  // Merge with defaults and validate
  try {
    const mergedConfig = { ...defaultConfig, ...userConfig }
    return ConfigSchema.parse(mergedConfig)
  } catch (error) {
    console.error('Invalid configuration:', error)
    // Provide a minimal valid config to allow startup
    return ConfigSchema.parse({
      ...defaultConfig,
      allowedDirectories: userConfig.allowedDirectories || [process.cwd()],
    })
  }
}

/**
 * Create a sample configuration file
 *
 * @param outputPath Path to write sample config
 */
export async function createSampleConfig(outputPath: string): Promise<void> {
  const sampleConfig: Config = {
    allowedDirectories: ['/path/to/allowed/dir1', '/path/to/allowed/dir2'],
    logLevel: 'info',
    logFile: '/path/to/logs/mcp-filesystem.log',
    serverName: 'secure-filesystem-server',
    serverVersion: '0.3.0',
    cache: {
      enabled: true,
      maxSize: 1000,
      ttlMs: 60000,
    },
    metrics: {
      enabled: true,
      reportIntervalMs: 60000,
    },
    security: {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowSymlinks: true,
      validateRealPath: true,
    },
  }

  await fs.writeFile(outputPath, JSON.stringify(sampleConfig, null, 2), 'utf-8')
}
