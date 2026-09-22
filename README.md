# MCP Screenshot Server

A secure and robust Model Context Protocol (MCP) server for capturing screenshots and HTML content using Puppeteer.

> **Status: archived (August 2025).** This server was built to close one specific gap: a
> coding agent could write UI code but could not see the result, so a human had to look in
> the browser and report back. It gave the agent that sense — it compares the rendered page
> against the design spec itself and iterates the CSS until they match.
>
> It was in real use for about two weeks and then retired, once Chrome DevTools MCP and
> Playwright MCP covered the same ground better. It stays online as a reference, not as a
> maintained tool. An in-house tool is a bet that the gap stays open; in a field that moves
> monthly, the bet has to stay small enough to lose.

## Features

- **Screenshot Capture**: Take full-page or viewport screenshots of any URL
- **HTML Extraction**: Retrieve the rendered HTML content of web pages
- **Viewport Control**: Dynamically adjust browser viewport dimensions
- **Security**: Built-in protection against path traversal, SSRF attacks, and malicious inputs
- **Logging**: Structured logging with configurable levels and formats
- **Configuration**: Flexible configuration through environment variables
- **Testing**: Comprehensive test suite with unit and integration tests

## Installation

```bash
# Clone the repository
git clone https://github.com/gunterk1/screenshot-mcp-server.git
cd screenshot-mcp-server

# Install dependencies
npm install
```

## Usage

### Starting the Server

```bash
node mcp_screenshot_server_node.js
```

The server communicates via JSON-RPC 2.0 over stdio, making it compatible with MCP clients like VS Code extensions.

### Available Tools

#### 1. Screenshot Tool

Captures a PNG screenshot of a webpage or current viewport.

**Parameters:**
- `url` (optional): URL to navigate to before taking the screenshot
- `path` (optional): File path to save the screenshot
- `fullPage`: Whether to capture the entire page (default: false)
- `waitUntil`: Navigation wait strategy (default: 'networkidle0')
- `timeoutMs`: Navigation timeout in milliseconds (default: 30000)
- `viewport`: Custom viewport dimensions

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "screenshot",
    "arguments": {
      "url": "https://example.com",
      "path": "shots/example.png",
      "fullPage": true
    }
  }
}
```

#### 2. Set Viewport Tool

Updates the default viewport dimensions for future screenshots.

**Parameters:**
- `width`: Viewport width in pixels
- `height`: Viewport height in pixels
- `deviceScaleFactor`: Device scale factor (default: 1)

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "setViewport",
    "arguments": {
      "width": 1920,
      "height": 1080,
      "deviceScaleFactor": 2
    }
  }
}
```

#### 3. Get HTML Tool

Retrieves the rendered HTML content of a webpage.

**Parameters:**
- `url`: URL to navigate to
- `waitUntil`: Navigation wait strategy (default: 'domcontentloaded')
- `timeoutMs`: Navigation timeout in milliseconds (default: 15000)

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "getHTML",
    "arguments": {
      "url": "https://example.com"
    }
  }
}
```

## The five server variants — and why they exist

The repository contains five entry points. That is not indecision; each one answers a
problem the previous one had, and the sequence is the interesting part.

| File | Lines | What it is |
|---|---|---|
| `mcp_screenshot_server_node.js` | 351 | **The entry point** (`main` in `package.json`). JSON-RPC 2.0 over stdio. |
| `mcp_screenshot_server_node_refactored.js` | 195 | Same server, split into `lib/` — config, logger, validator, browser-manager, tools. |
| `mcp-minimal.js` | 281 | **No logging, pure JSON-RPC.** |
| `mcp-server-clean.js` | 175 | The same idea, reduced further. |
| `mcp-with-existing-chrome.js` | 328 | Attaches to an already-running Chrome over CDP instead of launching its own. |

**Why two of them exist purely to remove logging:** with the stdio transport, `stdout` *is*
the protocol channel. Every log line written to stdout lands in the middle of the JSON-RPC
stream and corrupts the message the client is parsing. The fix is not "log less" — it is
that diagnostics must never share a channel with the protocol. Logging belongs on `stderr`
or in a file, and the quickest way to prove that was to strip it out entirely.

## Configuration

The server can be configured using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_ALLOWED_OUTPUT_DIR` | Directory where screenshots can be saved | `./shots` |
| `MCP_MAX_TIMEOUT` | Maximum allowed timeout in milliseconds | `60000` |
| `MCP_BLOCK_PRIVATE_NETWORKS` | Block access to private/internal networks | `true` |
| `MCP_HEADLESS` | Puppeteer headless mode | `new` |
| `LOG_LEVEL` | Logging level (error, warn, info, debug, trace) | `info` |

## Known limitations

Found in a security review of this repository (2025-09-22) and left documented rather than
quietly patched, because the reasoning matters more than the code:

**SSRF protection was documented as on and shipped as off.** `lib/config.js` defaulted
`blockPrivateNetworks` to `false` ("to allow local development") and `start-server.sh`
exported `false` on top of it, while this README promised `true`. Both are fixed; the
default is now secure and local development opts out per run:

```bash
MCP_BLOCK_PRIVATE_NETWORKS=false ./start-server.sh
```

The instructive part is the test. A test named *"should reject private IPs by default"* was
green the whole time — it calls `validateURL(url)` with no options and therefore exercises
the function's own parameter default (`blockPrivate = true`), while the server passes
`config.security.blockPrivateNetworks`, which was `false`. A green test that proves nothing
about the deployed path. `test/validator.test.js` now asserts the value the server actually
passes, and that assertion was verified to fail when the default regresses.

**Host checks are string-based, not resolution-based.** Private ranges are matched against
the hostname as text (`/^127\./`, `/^10\./`, …). A hostname that *resolves* to a private
address passes the check — classic DNS rebinding. A correct implementation resolves with
`dns.lookup(host, { all: true })` and rejects if any returned address is loopback, private,
link-local, ULA or reserved. Not fixed here: this is a local developer tool, not an
internet-facing service.

**`mcp-with-existing-chrome.js` reuses the user's tab, cookies and all.** That is the
point of that variant — the agent needs to see the page behind a login, which a clean
context cannot reach. It also means a screenshot of an arbitrary URL runs inside an
authenticated session. Use the default server unless you specifically need the logged-in
view.

## Security Features

### Input Validation
- **Path Validation**: Prevents directory traversal attacks
- **URL Validation**: Blocks malicious protocols and private networks
- **Viewport Validation**: Ensures reasonable dimensions
- **Timeout Validation**: Prevents excessive resource consumption

### Network Security
- Blocks access to private/internal IP addresses by default
- Configurable protocol whitelist (HTTP/HTTPS only)
- Optional host whitelist for additional restrictions

### File System Security
- Restricted output directory for screenshots
- Path sanitization to prevent escaping allowed directories
- Validation against null bytes and suspicious patterns

## Testing

### Run Unit Tests
```bash
node test/validator.test.js
```

### Run Integration Tests
```bash
node test/integration.test.js
```

### Test Coverage
The test suite covers:
- Input validation functions
- Security mechanisms
- API functionality
- Error handling
- Edge cases

## Project Structure

```
screenshot-mcp-server/
├── mcp_screenshot_server_node.js  # Main server implementation
├── lib/
│   ├── config.js                  # Configuration management
│   ├── logger.js                  # Structured logging system
│   └── validator.js               # Input validation and security
├── test/
│   ├── validator.test.js          # Unit tests for validation
│   └── integration.test.js        # Integration tests
├── shots/                          # Default screenshot output directory
├── package.json                    # Project metadata and dependencies
└── README.md                       # Documentation
```

## Error Handling

The server implements comprehensive error handling:
- Graceful shutdown with queue draining
- Proper cleanup of browser resources
- Detailed error messages with appropriate JSON-RPC error codes
- Logging of all errors with context

## Performance Considerations

- **Browser Reuse**: Single browser instance shared across requests
- **Lazy Loading**: Puppeteer loaded only when needed
- **Resource Cleanup**: Pages properly closed after each operation
- **Queue System**: Serialized request processing prevents race conditions

## Contributing

Contributions are welcome! Please ensure:
1. All tests pass
2. New features include tests
3. Security best practices are followed
4. Code follows existing patterns

## License

ISC

## Roadmap

### Planned Features
- [ ] Browser connection pooling for concurrent operations
- [ ] Response caching for frequently accessed URLs
- [ ] Authentication mechanism (API keys/tokens)
- [ ] Rate limiting
- [ ] Metrics and monitoring
- [ ] Docker support
- [ ] TypeScript migration

### Known Limitations
- Sequential request processing (no concurrency)
- No built-in authentication
- Limited to Puppeteer-supported browsers

## Support

For issues, questions, or contributions, please open an issue on GitHub.