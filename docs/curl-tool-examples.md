# curl_request Tool - Usage Examples

The `curl_request` tool allows you to make HTTP requests to external APIs directly from MCP-Filesystem. Below are some examples of how to use this tool.

## Basic Examples

### Simple GET Request

```
curl_request({
  "url": "https://api.example.com/data",
  "method": "GET"
})
```

### GET Request with Authorization Header

```
curl_request({
  "url": "https://api.example.com/protected-data",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer your_token_here"
  }
})
```

### POST Request with JSON Data

```
curl_request({
  "url": "https://api.example.com/create",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer your_token_here"
  },
  "data": "{\"name\":\"Example\",\"value\":123}"
})
```

### PUT Request to Update Data

```
curl_request({
  "url": "https://api.example.com/items/123",
  "method": "PUT",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer your_token_here"
  },
  "data": "{\"name\":\"New Name\",\"value\":456}"
})
```

### DELETE Request

```
curl_request({
  "url": "https://api.example.com/items/123",
  "method": "DELETE",
  "headers": {
    "Authorization": "Bearer your_token_here"
  }
})
```

## Specific Use Cases

### Request with Basic Authentication

```
curl_request({
  "url": "https://api.example.com/secure-data",
  "method": "GET",
  "headers": {
    "Authorization": "Basic " + btoa("username:password")
  }
})
```

### Request with Custom Timeout

```
curl_request({
  "url": "https://api.example.com/slow-operation",
  "method": "GET",
  "timeout": 60  // 60 second timeout
})
```

### Request to API with Invalid SSL Certificate

```
curl_request({
  "url": "https://insecure-api.example.com/data",
  "method": "GET",
  "insecure": true  // Use with caution!
})
```

### Request with Redirect Following

```
curl_request({
  "url": "https://api.example.com/redirecting-endpoint",
  "method": "GET",
  "followRedirects": true
})
```

## Examples with Popular APIs

### GitHub API

```
curl_request({
  "url": "https://api.github.com/users/octocat",
  "method": "GET",
  "headers": {
    "Accept": "application/vnd.github.v3+json"
  }
})
```

### Weather API

```
curl_request({
  "url": "https://api.weatherapi.com/v1/current.json?key=YOUR_API_KEY&q=London",
  "method": "GET"
})
```

### Cryptocurrency API

```
curl_request({
  "url": "https://api.coinbase.com/v2/prices/BTC-USD/spot",
  "method": "GET"
})
```

## Security Notes

- Avoid storing authentication tokens or passwords in your code
- Use environment variables or secure files for sensitive data
- Be careful when using the `insecure: true` option, as it bypasses SSL security checks
- Remember that API calls may be logged, so sensitive information might appear in logs
