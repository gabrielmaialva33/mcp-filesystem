import { detectPackageManager, getProjectCommands } from './project_detector.js'

type PackageManager = 'npm' | 'pnpm' | 'yarn'

function isAutoPackageManager(input: string): input is 'auto' {
  return input === 'auto'
}

export async function getProjectDetails(validPath: string) {
  let packageManagerInput: PackageManager | 'auto' = 'npm' // Default to npm

  // Use a local variable to store the detected manager
  let finalPackageManager: PackageManager = 'npm'

  if (isAutoPackageManager(packageManagerInput)) {
    const detectedManager = await detectPackageManager(validPath)

    if (detectedManager !== 'unknown') {
      finalPackageManager = detectedManager
    }
  } else {
    finalPackageManager = packageManagerInput
  }

  const commands = getProjectCommands(finalPackageManager)

  return {
    packageManager: finalPackageManager,
    commands,
  }
}
