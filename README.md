<h1 align="center">
  <br>
  <img src="https://raw.githubusercontent.com/gabrielmaialva33/mcp-filesystem/master/.github/assets/mcp.png" alt="MCP Filesystem" width="200">
  <br>
  Secure <a href="https://modelcontextprotocol.io/introduction">MCP</a> Filesystem Server
  <br>
</h1>

<p align="center">
  <strong>A secure Model Context Protocol (MCP) server providing filesystem access within predefined directories</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/github/license/gabrielmaialva33/mcp-filesystem?color=00b8d3?style=flat&logo=appveyor" alt="License" />
  <img src="https://img.shields.io/github/languages/top/gabrielmaialva33/mcp-filesystem?style=flat&logo=appveyor" alt="GitHub top language" >
  <img src="https://img.shields.io/github/languages/count/gabrielmaialva33/mcp-filesystem?style=flat&logo=appveyor" alt="GitHub language count" >
  <img src="https://img.shields.io/github/repo-size/gabrielmaialva33/mcp-filesystem?style=flat&logo=appveyor" alt="Repository size" >
  <a href="https://github.com/gabrielmaialva33/mcp-filesystem/commits/master">
    <img src="https://img.shields.io/github/last-commit/gabrielmaialva33/mcp-filesystem?style=flat&logo=appveyor" alt="GitHub last commit" >
    <img src="https://img.shields.io/badge/made%20by-Maia-15c3d6?style=flat&logo=appveyor" alt="Maia" >  
  </a>
</p>

<br>

<p align="center">
  <a href="#bookmark-about">About</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="#computer-technologies">Technologies</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="#wrench-tools">Tools</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="#package-installation">Installation</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="#gear-usage">Usage</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="#memo-license">License</a>
</p>

<br>

## :bookmark: About

**MCP Filesystem Server** provides secure filesystem access for AI models through the Model Context Protocol. It
enforces strict path validation and only allows access to predefined directories.

<br>

## :computer: Technologies

- **[TypeScript](https://www.typescriptlang.org/)**
- **[Node.js](https://nodejs.org/)**
- **[MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)**
- **[Zod](https://zod.dev/)**
- **[Docker](https://www.docker.com/)**
- **[pnpm](https://pnpm.io/)**

<br>

## :wrench: Tools

- **[Visual Studio Code](https://code.visualstudio.com/)**
- **[ESLint](https://eslint.org/)**
- **[Prettier](https://prettier.io/)**
- **[Vitest](https://vitest.dev/)**
- **[Docker Compose](https://docs.docker.com/compose/)**

<br>

## :package: Installation

### :heavy_check_mark: **Prerequisites**

The following software must be installed:

- **[Node.js](https://nodejs.org/en/)** (>=18.0.0)
- **[Git](https://git-scm.com/)**
- **[pnpm](https://pnpm.io/)** (>=8.0.0)
- **[Docker](https://www.docker.com/)** (optional)
- **[Docker Compose](https://docs.docker.com/compose/)** (optional)

<br>

### :arrow_down: **Cloning the repository**

```sh
  $ git clone https://github.com/gabrielmaialva33/mcp-filesystem.git
  $ cd mcp-filesystem
```

<br>

### :arrow_forward: **Running the application**

#### Local Development

```sh
  # Install dependencies
  $ pnpm install

  # Build the application
  $ pnpm build

  # Run the server (specify directory to allow access to)
  $ pnpm start /path/to/allowed/directory

  # Or use configuration file
  $ pnpm start --config=config.json
```

#### Using NPM Package

```sh
  # Install globally
  $ npm install -g @gabrielmaialva33/mcp-filesystem

  # Run the server
  $ mcp-filesystem /path/to/allowed/directory

  # Or use with npx (no installation needed)
  $ npx @gabrielmaialva33/mcp-filesystem /path/to/allowed/directory

  # Create a sample configuration file
  $ npx @gabrielmaialva33/mcp-filesystem --create-config=config.json
```

#### Using Docker

```sh
  # Build the Docker image
  $ docker build -t gabrielmaialva33/mcp-filesystem .

  # Run using Docker
  $ docker run -i --rm -v /path/to/data:/data:ro gabrielmaialva33/mcp-filesystem /data

  # Use with config file
  $ docker run -i --rm -v /path/to/config.json:/app/config.json -v /path/to/data:/data gabrielmaialva33/mcp-filesystem --config=/app/config.json
```

#### Using Docker Compose

```sh
  # Create a data directory
  $ mkdir -p data

  # Start the server
  $ docker-compose up -d
```

<br>

## :gear: Usage

### Using with Claude Desktop

Claude Desktop can be configured to use this MCP server for filesystem access. Add the following to your
`claude_desktop_config.json`:

#### Using Local Installation (Recommended)

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "mcp-filesystem",
      "args": [
        "/Users/gabrielmaia/Documents",
        "/Users/gabrielmaia/Desktop",
        "/Users/gabrielmaia/Downloads"
      ]
    }
  }
}
```

Make sure to make the executable available globally:

```sh
# Make the binary executable
chmod +x /Users/gabrielmaia/.nvm/versions/node/v22.14.0/bin/mcp-filesystem
```

#### Using NPX

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@gabrielmaialva33/mcp-filesystem",
        "/Users/username/Desktop",
        "/path/to/other/allowed/dir"
      ]
    }
  }
}
```

#### Using Docker

Note: When using Docker, all directories must be mounted to `/projects` by default. Adding the `ro` flag will make the
directory read-only.

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--mount",
        "type=bind,src=/Users/username/Desktop,dst=/projects/Desktop",
        "--mount",
        "type=bind,src=/path/to/other/allowed/dir,dst=/projects/other/allowed/dir,ro",
        "--mount",
        "type=bind,src=/path/to/file.txt,dst=/projects/path/to/file.txt",
        "gabrielmaialva33/mcp-filesystem",
        "/projects"
      ]
    }
  }
}
```

### Available Tools

The MCP Filesystem Server provides these tools:

- **read_file**: Read a file's content
- **read_multiple_files**: Read multiple files at once
- **write_file**: Create or overwrite a file
- **edit_file**: Make precise edits with diff preview
- **create_directory**: Create directories recursively
- **list_directory**: List directory contents
- **directory_tree**: Get a recursive tree view
- **move_file**: Move or rename files
- **search_files**: Find files matching patterns
- **get_file_info**: Get file metadata
- **list_allowed_directories**: See accessible directories
- **get_metrics**: View server performance metrics (v0.3.0+)
- **execute_command**: Execute system commands securely (v0.3.1+)
- **curl_request**: Execute HTTP requests to external APIs (v0.3.2+)

<br>

## :sparkles: Features

### Core Features

- **Secure Access**: Strict path validation prevents unauthorized access
- **File Operations**: Read, write, edit, and move files
- **Directory Operations**: Create, list, get tree views, and search directories
- **Metadata Access**: View file and directory information
- **Command Execution**: Securely execute system commands with strict validation
- **Docker Support**: Easy deployment with Docker and Docker Compose

### New Features in v0.3.0

- **Structured Logging**: Detailed logging with different levels (debug, info, warn, error)
- **Performance Metrics**: Track operation counts, errors, and execution times
- **Configuration Management**: Support for JSON configuration files
- **Path Caching**: Improved performance for frequently accessed paths
- **Improved Error Handling**: Specialized error types with structured information
- **File Size Validation**: Prevent loading excessively large files
- **CLI Improvements**: Help command, version info, and config generation

### Configuration Options

You can create a configuration file using:

```sh
$ mcp-filesystem --create-config=config.json
```

Example configuration:

```json
{
  "allowedDirectories": ["/path/to/allowed/dir1", "/path/to/allowed/dir2"],
  "logLevel": "info",
  "logFile": "/path/to/logs/mcp-filesystem.log",
  "serverName": "secure-filesystem-server",
  "serverVersion": "0.3.0",
  "cache": {
    "enabled": true,
    "maxSize": 1000,
    "ttlMs": 60000
  },
  "metrics": {
    "enabled": true,
    "reportIntervalMs": 60000
  },
  "security": {
    "maxFileSize": 10485760,
    "allowSymlinks": true,
    "validateRealPath": true
  }
}
```

<br>

### :writing_hand: **Author**

| [![Gabriel Maia](https://avatars.githubusercontent.com/u/26732067?size=100)](https://github.com/gabrielmaialva33) |
| ----------------------------------------------------------------------------------------------------------------- |
| [Gabriel Maia](https://github.com/gabrielmaialva33)                                                               |

## License

[MIT License](LICENSE)

<p align="center"><img src="https://raw.githubusercontent.com/gabrielmaialva33/gabrielmaialva33/master/assets/gray0_ctp_on_line.svg?sanitize=true" /></p>
<p align="center">&copy; 2024-present <a href="https://github.com/gabrielmaialva33/" target="_blank">Maia</a>
</p>
