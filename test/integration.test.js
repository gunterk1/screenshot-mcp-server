/**
 * Integration tests for MCP Screenshot Server
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class MCPTestClient {
  constructor(serverPath) {
    this.serverPath = serverPath;
    this.server = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = spawn('node', [this.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.server.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            if (response.id && this.pendingRequests.has(response.id)) {
              const { resolve, reject } = this.pendingRequests.get(response.id);
              this.pendingRequests.delete(response.id);
              
              if (response.error) {
                reject(new Error(response.error.message));
              } else {
                resolve(response.result);
              }
            }
          } catch (e) {
            // Ignore non-JSON output (e.g., logs)
          }
        }
      });

      this.server.stderr.on('data', (data) => {
        console.error('Server error:', data.toString());
      });

      this.server.on('error', reject);
      
      // Give server time to start
      setTimeout(resolve, 500);
    });
  }

  async sendRequest(method, params = {}) {
    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.server.stdin.write(JSON.stringify(request) + '\n');
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  async stop() {
    if (this.server) {
      await this.sendRequest('shutdown');
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.server.kill();
      this.server = null;
    }
  }
}

async function runTests() {
  const serverPath = path.join(__dirname, '..', 'mcp_screenshot_server_node.js');
  const client = new MCPTestClient(serverPath);
  
  console.log('Starting MCP Screenshot Server for testing...\n');
  
  try {
    await client.start();
    
    // Test 1: Initialize
    console.log('Test 1: Initialize server');
    const initResult = await client.sendRequest('initialize');
    console.assert(initResult.protocolVersion === '2024-11-05', 'Protocol version mismatch');
    console.assert(initResult.serverInfo.name === 'mcp-screenshot-server', 'Server name mismatch');
    console.log('✅ Initialize test passed\n');
    
    // Test 2: List tools
    console.log('Test 2: List available tools');
    const toolsResult = await client.sendRequest('tools/list');
    console.assert(Array.isArray(toolsResult.tools), 'Tools should be an array');
    console.assert(toolsResult.tools.length === 3, 'Should have 3 tools');
    const toolNames = toolsResult.tools.map(t => t.name);
    console.assert(toolNames.includes('screenshot'), 'Should have screenshot tool');
    console.assert(toolNames.includes('setViewport'), 'Should have setViewport tool');
    console.assert(toolNames.includes('getHTML'), 'Should have getHTML tool');
    console.log('✅ List tools test passed\n');
    
    // Test 3: Set viewport
    console.log('Test 3: Set viewport');
    const viewportResult = await client.sendRequest('tools/call', {
      name: 'setViewport',
      arguments: { width: 1920, height: 1080, deviceScaleFactor: 2 }
    });
    console.assert(viewportResult.content[0].type === 'text', 'Should return text content');
    console.log('✅ Set viewport test passed\n');
    
    // Test 4: Get HTML (with validation)
    console.log('Test 4: Get HTML with URL validation');
    try {
      await client.sendRequest('tools/call', {
        name: 'getHTML',
        arguments: { url: 'file:///etc/passwd' }
      });
      console.assert(false, 'Should have rejected file:// protocol');
    } catch (err) {
      console.assert(err.message.includes('Protocol not allowed'), 'Should reject invalid protocol');
    }
    console.log('✅ URL validation test passed\n');
    
    // Test 5: Screenshot with path validation
    console.log('Test 5: Screenshot with path validation');
    try {
      await client.sendRequest('tools/call', {
        name: 'screenshot',
        arguments: { 
          url: 'https://example.com',
          path: '../../../etc/passwd'
        }
      });
      console.assert(false, 'Should have rejected path traversal');
    } catch (err) {
      console.assert(err.message.includes('Path traversal'), 'Should reject path traversal');
    }
    console.log('✅ Path validation test passed\n');
    
    // Test 6: Valid screenshot (without URL, just viewport)
    console.log('Test 6: Take screenshot without URL');
    const screenshotResult = await client.sendRequest('tools/call', {
      name: 'screenshot',
      arguments: { 
        fullPage: false
      }
    });
    console.assert(screenshotResult.content[0].type === 'image', 'Should return image content');
    console.assert(screenshotResult.content[0].mimeType === 'image/png', 'Should be PNG');
    console.log('✅ Screenshot test passed\n');
    
    // Test 7: Shutdown
    console.log('Test 7: Graceful shutdown');
    const shutdownResult = await client.sendRequest('shutdown');
    console.assert(shutdownResult.ok === true, 'Should acknowledge shutdown');
    console.log('✅ Shutdown test passed\n');
    
    console.log('All tests passed! ✅');
    
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  } finally {
    await client.stop();
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(err => {
    console.error('Test runner failed:', err);
    process.exit(1);
  });
}