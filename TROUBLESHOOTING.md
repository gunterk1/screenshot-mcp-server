# Troubleshooting Guide

## Common Issues and Solutions

### 1. "TypeError: o.content is not iterable" in VS Code

**Problem**: The MCP client expects a specific response format with content array.

**Solution**: Make sure you're using the correct version of the server. The response should have this structure:
```json
{
  "content": [
    {
      "type": "image",
      "mimeType": "image/png",
      "data": "base64-encoded-data"
    }
  ]
}
```

### 2. "Private/internal addresses not allowed" Error

**Problem**: Trying to screenshot local development URLs (localhost, .local domains, 192.168.x.x, etc.)

**Solutions**:

#### Option 1: Set Environment Variable (Recommended)
```bash
export MCP_BLOCK_PRIVATE_NETWORKS=false
node mcp_screenshot_server_node.js
```

#### Option 2: Create .env file
```bash
# Create .env file in project root
echo "MCP_BLOCK_PRIVATE_NETWORKS=false" > .env
```

#### Option 3: Modify config.js
Change `blockPrivateNetworks: true` to `blockPrivateNetworks: false` in `lib/config.js`

### 3. "Path traversal detected" Error

**Problem**: Trying to save screenshots outside the allowed directory.

**Solution**: 
- Save screenshots only to the `shots/` directory or subdirectories
- Or configure `MCP_ALLOWED_OUTPUT_DIR` to your preferred directory:
```bash
export MCP_ALLOWED_OUTPUT_DIR=/path/to/your/screenshots
```

### 4. Browser Launch Errors

**Problem**: Puppeteer fails to launch Chrome/Chromium.

**Solutions**:
- Install required dependencies:
```bash
# Ubuntu/Debian
sudo apt-get install -y \
  libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2

# macOS (usually works out of the box)
# If issues persist, install Chrome manually
```

### 5. Timeout Errors

**Problem**: Screenshots timing out for slow-loading pages.

**Solution**: Increase the timeout:
```json
{
  "name": "screenshot",
  "arguments": {
    "url": "https://slow-site.com",
    "timeoutMs": 60000,
    "waitUntil": "networkidle2"
  }
}
```

### 6. VS Code MCP Extension Not Finding Server

**Problem**: VS Code can't locate or start the server.

**Solution**: Make sure the server path is correct in VS Code settings:
```json
{
  "mcp.servers": {
    "screenshot": {
      "command": "node",
      "args": ["/absolute/path/to/mcp_screenshot_server_node.js"]
    }
  }
}
```

### 7. Memory Issues with Large Screenshots

**Problem**: Out of memory errors with full-page screenshots of long pages.

**Solutions**:
- Increase Node.js memory limit:
```bash
node --max-old-space-size=4096 mcp_screenshot_server_node.js
```
- Take viewport screenshots instead of full-page when possible

### 8. Debugging Tips

#### Enable Debug Logging
```bash
export LOG_LEVEL=debug
node mcp_screenshot_server_node.js
```

#### Test Server Manually
```bash
# Test initialization
echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | node mcp_screenshot_server_node.js

# Test screenshot
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"screenshot","arguments":{"url":"https://example.com"}}}' | node mcp_screenshot_server_node.js
```

#### Check Server Output
The server logs to stderr, so you can separate logs from JSON-RPC responses:
```bash
node mcp_screenshot_server_node.js 2>server.log
```

## Getting Help

If you're still experiencing issues:

1. Check the logs (stderr output)
2. Run the integration tests: `npm test`
3. Verify your Node.js version: `node --version` (requires v14+)
4. Ensure Puppeteer is properly installed: `npm install`

## Local Development Setup

For local development with URLs like `http://localhost` or `http://myapp.local`:

1. Copy `.env.example` to `.env`
2. Set `MCP_BLOCK_PRIVATE_NETWORKS=false`
3. Restart the server

This allows you to screenshot local development servers while maintaining security in production.