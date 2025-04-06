# Command Execution Feature for MCP-Filesystem

This document describes the command execution capability added to the MCP-Filesystem project.

## Overview

The command execution feature allows executing system commands through the MCP protocol in a secure and controlled manner. This enables AI models or other MCP clients to perform basic system operations without requiring direct shell access.

## Security Considerations

The implementation includes several security measures:

1. **Command Validation**: All commands are validated against a safe pattern regex and checked against a list of forbidden commands.
2. **Execution Timeouts**: Commands have a configurable timeout (default: 5 seconds, maximum: 30 seconds).
3. **Working Directory Constraints**: Commands execute within allowed directories only.
4. **Comprehensive Logging**: All command executions are logged for audit purposes.
5. **Error Handling**: Robust error handling prevents security bypasses.

## Usage

### Basic Command Execution

```json
{
  "command": "ls -la",
  "workingDir": "/path/to/allowed/directory"
}
```

### With Timeout

```json
{
  "command": "find . -name '*.js'",
  "workingDir": "/path/to/allowed/directory",
  "timeout": 10000
}
```

## Limitations

- Certain potentially dangerous commands are blocked (rm -rf, chmod 777, etc.)
- Commands with special characters or shell expansion are restricted
- Maximum execution time is capped at 30 seconds
- Interactive commands are not supported

## Implementation Details

The execution feature is implemented with Node.js child_process module using promisified versions of the exec and spawn functions:

- `exec` for basic command execution with output capture
- `spawn` for streaming output from long-running commands (future enhancement)

## Error Handling

Errors are categorized into several types:

- `FORBIDDEN_COMMAND`: Command contains operations that are explicitly disallowed
- `UNSAFE_COMMAND`: Command contains potentially unsafe characters or patterns
- `EXECUTION_TIMEOUT`: Command exceeded the allowed execution time
- `EXECUTION_ERROR`: Command execution failed for other reasons

## Future Enhancements

Planned enhancements for the command execution feature include:

1. More granular permission controls
2. Command whitelisting
3. Resource usage limitations
4. Real-time output streaming
5. Improved pattern matching for security validation
