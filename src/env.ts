import 'dotenv/config'
import { z } from 'zod'

// Define schema for environment variables with validation
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DEBUG: z.preprocess((val) => val === 'true' || val === '1', z.boolean().default(false)),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Add custom schema validations here as needed
})

// Function to validate and export environment variables
export function validateEnv() {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.flatten().fieldErrors)
    throw new Error('Invalid environment variables')
  }

  return result.data
}

// Export validated environment variables
export const env = validateEnv()
