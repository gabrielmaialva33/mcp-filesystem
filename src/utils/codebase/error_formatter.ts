import { errorTypeToString } from './project_detector.js'

interface BuildErrorDetails {
  type: string
  message: string
  location?: {
    file?: string
    line?: number
    column?: number
  }
}

export function formatBuildError(stderr: string): BuildErrorDetails[] {
  const errorLines = stderr.split('\n').filter((line) => line.trim() !== '')
  const parsedErrors: BuildErrorDetails[] = []

  for (const line of errorLines) {
    // TypeScript error pattern matching
    const tsErrorMatch = line.match(/^(.+\.ts):(\d+):(\d+) - error (\w+): (.+)$/)
    if (tsErrorMatch) {
      const [, file, lineNum, colNum, errorCode, errorMessage] = tsErrorMatch

      parsedErrors.push({
        type: errorTypeToString(errorCode),
        message: errorMessage.trim(),
        location: {
          file,
          line: Number.parseInt(lineNum),
          column: Number.parseInt(colNum),
        },
      })

      continue
    }

    // Fallback for generic error parsing
    if (line.includes('error')) {
      parsedErrors.push({
        type: 'Unknown',
        message: line.trim(),
      })
    }
  }

  return parsedErrors
}
