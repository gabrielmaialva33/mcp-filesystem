import { promisify } from 'node:util'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Placeholder for potential future use of execAsync
promisify(exec)
type PackageManager = 'npm' | 'pnpm' | 'yarn'

interface ProjectCommands {
  install: string
  build: string
  start: string
  test: string
  lint?: string
  dev?: string
  preview?: string
  serve?: string
}

export function errorTypeToString(errorCode: string): string {
  const errorTypes: { [key: string]: string } = {
    TS2339: 'Property Error',
    TS2393: 'Duplicate Implementation',
    TS2367: 'Type Comparison Error',
    TS2322: 'Type Assignment Error',
    TS6133: 'Unused Variable',
  }
  return errorTypes[errorCode] || 'Unknown Error'
}

export async function detectPackageManager(
  projectPath: string
): Promise<PackageManager | 'unknown'> {
  const lockFiles = {
    'pnpm-lock.yaml': 'pnpm',
    'yarn.lock': 'yarn',
    'package-lock.json': 'npm',
  }

  for (const [lockFile, manager] of Object.entries(lockFiles)) {
    if (fs.existsSync(path.join(projectPath, lockFile))) {
      return manager as PackageManager
    }
  }

  return 'unknown'
}

export function getProjectCommands(packageManager: PackageManager): ProjectCommands {
  const pmCmd = packageManager === 'pnpm' ? 'pnpm' : packageManager === 'yarn' ? 'yarn' : 'npm'

  const commands: ProjectCommands = {
    install: `${pmCmd} install`,
    build: `${pmCmd} run build`,
    start: `${pmCmd} run start`,
    test: `${pmCmd} run test`,
  }

  // Conditionally add optional commands
  if (packageManager === 'pnpm' || packageManager === 'npm') {
    commands.dev = `${pmCmd} run dev`
    commands.preview = `${pmCmd} run preview`
    commands.serve = `${pmCmd} run serve`
  }

  // Optional lint command
  if (packageManager === 'npm') {
    commands.lint = `${pmCmd} run lint`
  }

  return commands
}

export async function detectProjectType(_projectPath: string): Promise<string> {
  // Placeholder implementation
  return 'nodejs'
}
