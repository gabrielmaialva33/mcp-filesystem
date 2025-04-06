/**
 * Curl request tool
 *
 * Executes curl commands to external APIs and returns the response
 * Simple wrapper around bash_execute with curl-specific parameters
 */

import { z } from 'zod'
import { handleBashExecute } from '../../bash/tools/index.js'
import { Config } from '../../config/index.js'
import { logger } from '../../logger/index.js'

/**
 * Schema for curl request arguments
 */
export const CurlRequestArgsSchema = z.object({
  url: z.string().describe('Full URL to send the request to'),
  method: z
    .enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
    .default('GET')
    .describe('HTTP method'),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .default({})
    .describe('HTTP headers to include in the request'),
  data: z.string().optional().describe('Data to send in the request body'),
  timeout: z.number().positive().optional().default(30).describe('Request timeout in seconds'),
  followRedirects: z.boolean().optional().default(true).describe('Whether to follow redirects'),
  insecure: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to skip SSL certificate verification (use with caution)'),
})

export type CurlRequestArgs = z.infer<typeof CurlRequestArgsSchema>

/**
 * Handles curl request and returns the response
 */
export async function handleCurlRequest(args: CurlRequestArgs, config: Config) {
  try {
    const { url, method, headers, data, timeout, followRedirects, insecure } = args

    // Build curl command with appropriate options
    let command = `curl -X ${method} `

    // Add headers
    Object.entries(headers).forEach(([key, value]) => {
      command += `-H "${key}: ${value}" `
    })

    // Add data if present
    if (data) {
      command += `-d '${data}' `
    }

    // Add additional options
    command += `-s ` // Silent mode but show error messages
    command += `--connect-timeout ${timeout} `

    if (followRedirects) {
      command += `-L `
    }

    if (insecure) {
      command += `-k `
    }

    // Add URL (should be last)
    command += `"${url}"`

    // Log the command (without sensitive headers like Authorization)
    const logCommand = command.replace(
      /-H "Authorization: [^"]*"/,
      '-H "Authorization: [REDACTED]"'
    )
    await logger.debug(`Executing curl request: ${logCommand}`)

    // Execute the command using bash_execute
    const result = await handleBashExecute({ command, timeout: timeout * 1000 }, config)

    return result
  } catch (error) {
    await logger.error('Error executing curl request', { error })
    throw error
  }
}
