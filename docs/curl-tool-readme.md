# curl_request Tool for MCP-Filesystem

A simple and powerful tool to make HTTP requests to external APIs directly from the MCP-Filesystem project.

## Overview

The `curl_request` tool allows you to execute HTTP requests similar to the curl command but from within the MCP protocol. This enables your AI assistant to interact with external HTTP APIs and web services.

## Features

- Support for all HTTP methods (GET, POST, PUT, DELETE, PATCH, etc.)
- Custom headers including authentication tokens
- Request body data for POST/PUT operations
- Configurable timeout, redirect following, and SSL verification options
- Simple JSON interface

## Installation

Run the installation script to ensure all dependencies are properly installed:

```bash
./install-curl-tool.sh
```

## Basic Usage

Here's how to use the `curl_request` tool:

```javascript
// Simple GET request
curl_request({
  url: 'https://api.example.com/data',
  method: 'GET',
})

// GET request with authentication
curl_request({
  url: 'https://api.example.com/protected-data',
  method: 'GET',
  headers: {
    Authorization: 'Bearer your_token_here',
  },
})

// POST request with JSON data
curl_request({
  url: 'https://api.example.com/create',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  data: '{"name":"Example","value":123}',
})
```

## Documentation

For more detailed information:

- See [curl-tool-examples.md](curl-tool-examples.md) for comprehensive examples
- Check the [CURL_TOOL.md](CURL_TOOL.md) file for complete documentation
- Explore the [examples/curl-example.js](../examples/curl-example.js) file for JavaScript object examples

## Security Considerations

- Be cautious about storing sensitive credentials in your code
- The tool automatically redacts Authorization headers in logs
- Use the `insecure` option only when absolutely necessary
