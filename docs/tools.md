# MCP-Filesystem Available Tools

This document provides detailed information about all tools available in the MCP-Filesystem server.

## File Operations

### read_file

Reads the complete contents of a file from the file system.

```json
{
  "name": "read_file",
  "arguments": {
    "path": "/path/to/file.txt",
    "encoding": "utf-8" // Optional, defaults to "utf-8"
  }
}
```

### read_multiple_files

Reads the contents of multiple files simultaneously.

```json
{
  "name": "read_multiple_files",
  "arguments": {
    "paths": ["/path/to/file1.txt", "/path/to/file2.txt"],
    "encoding": "utf-8" // Optional, defaults to "utf-8"
  }
}
```

### write_file

Creates a new file or completely overwrites an existing file with new content.

```json
{
  "name": "write_file",
  "arguments": {
    "path": "/path/to/file.txt",
    "content": "Hello, world!",
    "encoding": "utf-8" // Optional, defaults to "utf-8"
  }
}
```

### edit_file

Makes line-based edits to a text file. Each edit replaces exact line sequences with new content.

```json
{
  "name": "edit_file",
  "arguments": {
    "path": "/path/to/file.txt",
    "edits": [
      {
        "oldText": "Hello world",
        "newText": "Hello updated world"
      }
    ],
    "dryRun": false // Optional, defaults to false
  }
}
```

### move_file

Moves or renames files and directories.

```json
{
  "name": "move_file",
  "arguments": {
    "source": "/path/to/source.txt",
    "destination": "/path/to/destination.txt"
  }
}
```

## Directory Operations

### create_directory

Creates a new directory or ensures a directory exists.

```json
{
  "name": "create_directory",
  "arguments": {
    "path": "/path/to/new/directory"
  }
}
```

### list_directory

Gets a detailed listing of all files and directories in a specified path.

```json
{
  "name": "list_directory",
  "arguments": {
    "path": "/path/to/directory"
  }
}
```

### directory_tree

Gets a recursive tree view of files and directories as a JSON structure.

```json
{
  "name": "directory_tree",
  "arguments": {
    "path": "/path/to/directory"
  }
}
```

### search_files

Recursively searches for files and directories matching a pattern.

```json
{
  "name": "search_files",
  "arguments": {
    "path": "/path/to/search/in",
    "pattern": "keyword",
    "excludePatterns": ["node_modules", "*.tmp"] // Optional
  }
}
```

## Metadata and System Information

### get_file_info

Retrieves detailed metadata about a file or directory.

```json
{
  "name": "get_file_info",
  "arguments": {
    "path": "/path/to/file.txt"
  }
}
```

### list_allowed_directories

Returns the list of directories that this server is allowed to access.

```json
{
  "name": "list_allowed_directories",
  "arguments": {}
}
```

### get_metrics

Returns performance metrics about server operations.

```json
{
  "name": "get_metrics",
  "arguments": {}
}
```

## Command Execution (v0.3.1+)

### execute_command

Executes a system command with security restrictions and validation.

```json
{
  "name": "execute_command",
  "arguments": {
    "command": "ls -la",
    "workingDir": "/path/to/allowed/directory", // Optional
    "timeout": 5000, // Optional, in milliseconds, default: 5000, max: 30000
    "captureOutput": true // Optional, default: true
  }
}
```

#### Security Restrictions:

- Commands containing potentially dangerous operations (rm -rf, chmod 777, etc.) are blocked
- Commands with special characters or shell expansion are restricted
- Maximum execution time is capped at 30 seconds
- Commands are executed within allowed directories only
- All executions are logged for audit purposes

#### Example Usage:

```json
{
  "name": "execute_command",
  "arguments": {
    "command": "find . -name '*.js'",
    "workingDir": "/path/to/allowed/directory"
  }
}
```
