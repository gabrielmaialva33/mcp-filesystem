# Codebase Features in MCP-Filesystem

This document describes the codebase features available in MCP-Filesystem, which allow you to work with code projects more effectively.

## Available Tools

### 1. `codebase_analyze`

Analyzes a codebase structure and provides detailed information about the project.

```json
{
  "directory": "/path/to/your/project"
}
```

Returns information about:

- Project name and version
- Dependencies and dev dependencies
- Available scripts
- Configuration files
- Source files structure
- Detected package manager

### 2. `codebase_build`

Builds a codebase using its package manager and scripts.

```json
{
  "directory": "/path/to/your/project",
  "packageManager": "pnpm", // or "npm", "yarn"
  "script": "build", // defaults to "build"
  "timeout": 120000 // timeout in ms, defaults to 120 seconds
}
```

Returns the build output including:

- Exit code
- Stdout and stderr
- Execution time

## Working with Codebases

### Typical Workflow

1. **Analyze the codebase** to understand its structure:

   - Use `codebase_analyze` to get project information
   - Examine scripts and dependencies

2. **Build the codebase**:

   - Use `codebase_build` to run the build script
   - Check for errors and warnings

3. **Read and modify files**:
   - Use `read_file` to view source code
   - Use `edit_file` to make changes
   - Use `write_file` to create new files

### Tips for Effective Use

- **Understanding build errors**: The build output includes formatted errors with suggestions
- **Working with TypeScript**: Look for common type issues in the error output
- **Package management**: The tool automatically detects the appropriate package manager

## Security Considerations

- Commands are validated for safety before execution
- Only commands explicitly allowed by the server configuration can be run
- File operations are restricted to allowed directories

## Examples

### Analyzing a React Project

```javascript
const result = await codebase_analyze({
  directory: '/path/to/react-project',
})

console.log(`Project: ${result.name} v${result.version}`)
console.log(`Scripts: ${Object.keys(result.scripts).join(', ')}`)
console.log(`Dependencies: ${Object.keys(result.dependencies).length}`)
console.log(`Source files: ${result.sourceFiles.count}`)
```

### Building a Node.js Project

```javascript
const result = await codebase_build({
  directory: '/path/to/node-project',
  packageManager: 'npm',
  script: 'build',
})

if (result.exitCode === 0) {
  console.log('Build succeeded')
} else {
  console.error('Build failed:', result.stderr)
}
```
