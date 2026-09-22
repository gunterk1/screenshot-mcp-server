#!/usr/bin/env node
/**
 * MCP Screenshot Server - Uses existing Chrome session
 * Connects to running Chrome via CDP (Chrome DevTools Protocol)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

let puppeteer;
let browser = null;
let defaultViewport = { width: 1280, height: 800, deviceScaleFactor: 1 };

// Settings
const BLOCK_PRIVATE_NETWORKS = process.env.MCP_BLOCK_PRIVATE_NETWORKS !== 'false';
const ALLOWED_OUTPUT_DIR = process.env.MCP_ALLOWED_OUTPUT_DIR || path.join(process.cwd(), 'shots');
const CHROME_DEBUG_PORT = process.env.CHROME_DEBUG_PORT || '9222';

// JSON-RPC helpers
function send(resultOrError, id) {
  const payload = { jsonrpc: '2.0', id };
  if (resultOrError && resultOrError.__isError) {
    payload.error = {
      code: resultOrError.code ?? -32000,
      message: resultOrError.message || 'Error',
      data: resultOrError.data
    };
  } else {
    payload.result = resultOrError;
  }
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function rpcError(message, code = -32000, data) {
  return { __isError: true, message, code, data };
}

// Validation functions
function validateURL(url) {
  if (!url) throw new Error('URL is required');
  
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Protocol not allowed: ${parsed.protocol}`);
  }

  if (BLOCK_PRIVATE_NETWORKS) {
    const privatePatterns = [
      /^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./,
      /^169\.254\./, /^::1$/, /^fe80:/i, /^localhost$/i, /^.*\.local$/i
    ];
    if (privatePatterns.some(pattern => pattern.test(parsed.hostname))) {
      throw new Error(`Private/internal addresses not allowed: ${parsed.hostname}`);
    }
  }
  return url;
}

function validatePath(filePath) {
  if (!filePath) throw new Error('Path is required');
  const absolute = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(ALLOWED_OUTPUT_DIR, filePath);
  const normalized = path.normalize(absolute);
  const relative = path.relative(ALLOWED_OUTPUT_DIR, normalized);
  if (relative.startsWith('..')) {
    throw new Error(`Path traversal detected: ${filePath} is outside allowed directory`);
  }
  return normalized;
}

// Browser management - Try to connect to existing Chrome first
async function getBrowser() {
  if (!puppeteer) puppeteer = require('puppeteer');
  
  if (browser && (browser.isConnected ? browser.isConnected() : browser.process() && !browser.process().killed)) {
    return browser;
  }
  
  try {
    // Try to connect to existing Chrome instance
    browser = await puppeteer.connect({
      browserURL: `http://localhost:${CHROME_DEBUG_PORT}`,
      defaultViewport: null // Use Chrome's current viewport
    });
    return browser;
  } catch (err) {
    // Fallback: Launch new headless instance
    browser = await puppeteer.launch({ 
      headless: 'new', 
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] 
    });
    return browser;
  }
}

async function withPage(fn, createNew = false) {
  const br = await getBrowser();
  let page;
  const isConnectedToExistingChrome = br._connection && br._connection._url;
  
  try {
    if (isConnectedToExistingChrome) {
      // Connected to existing Chrome - use existing tab or create new one
      const pages = await br.pages();
      if (!createNew && pages.length > 0) {
        // Use existing tab (maintain session)
        page = pages[0];
      } else {
        // Create new tab but keep session
        page = await br.newPage();
      }
    } else {
      // Headless mode - always create new page
      page = await br.newPage();
      await page.setViewport(defaultViewport);
    }
    
    return await fn(page);
  } finally {
    // Don't close tabs in existing Chrome session unless explicitly requested
    if (!isConnectedToExistingChrome || createNew) {
      try { await page.close(); } catch (_) {}
    }
  }
}

// Tools
const tools = {
  screenshot: {
    name: 'screenshot',
    description: 'Navigate (optional) to a URL and capture a PNG screenshot using existing Chrome session if available.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate before taking the screenshot.' },
        path: { type: 'string', description: 'Optional file path to save the PNG.' },
        fullPage: { type: 'boolean', default: false },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], default: 'networkidle0' },
        timeoutMs: { type: 'number', default: 30000 },
        useNewTab: { type: 'boolean', default: false, description: 'Create new tab instead of using existing one' },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'number', default: 1280 },
            height: { type: 'number', default: 800 },
            deviceScaleFactor: { type: 'number', default: 1 }
          }
        }
      }
    },
    async handler(args = {}) {
      const { url, path: outPath, fullPage = false, waitUntil = 'networkidle0', timeoutMs = 30000, viewport, useNewTab = false } = args;
      
      if (url) validateURL(url);
      if (viewport) {
        const { width = 1280, height = 800, deviceScaleFactor = 1 } = viewport;
        defaultViewport = { width, height, deviceScaleFactor };
      }

      const result = await withPage(async (page) => {
        if (url) {
          const response = await page.goto(url, { waitUntil, timeout: timeoutMs });
          if (!response || !response.ok()) {
            const status = response ? response.status() : 'NO_RESPONSE';
            throw new Error(`Navigation failed (${status}) for ${url}`);
          }
        }
        
        // Wait a bit for any dynamic content
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const buf = await page.screenshot({ type: 'png', fullPage });
        let filePath;
        if (outPath) {
          const validatedPath = validatePath(outPath);
          fs.mkdirSync(path.dirname(validatedPath), { recursive: true });
          fs.writeFileSync(validatedPath, buf);
          filePath = validatedPath;
        }
        return { mimeType: 'image/png', data: buf.toString('base64'), filePath };
      }, useNewTab);

      const blocks = [{ type: 'image', mimeType: result.mimeType, data: result.data }];
      if (result.filePath) {
        blocks.push({ type: 'text', text: `Saved to: ${result.filePath}` });
      }
      
      // Add info about which Chrome instance was used
      const br = await getBrowser();
      const connectionType = br._connection && br._connection._url ? 'existing Chrome session' : 'new headless instance';
      blocks.push({ type: 'text', text: `Used: ${connectionType}` });
      
      return { content: blocks, structuredContent: result.filePath ? { filePath: result.filePath } : undefined };
    }
  },

  setViewport: {
    name: 'setViewport',
    description: 'Set default viewport for future screenshots.',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'number', default: 1280 },
        height: { type: 'number', default: 800 },
        deviceScaleFactor: { type: 'number', default: 1 }
      },
      required: ['width', 'height']
    },
    async handler({ width, height, deviceScaleFactor = 1 }) {
      defaultViewport = { width, height, deviceScaleFactor };
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, defaultViewport }, null, 2) }] };
    }
  },

  getHTML: {
    name: 'getHTML',
    description: 'Navigate to a URL and return page HTML using existing Chrome session if available.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], default: 'domcontentloaded' },
        timeoutMs: { type: 'number', default: 15000 },
        useNewTab: { type: 'boolean', default: false }
      },
      required: ['url']
    },
    async handler({ url, waitUntil = 'domcontentloaded', timeoutMs = 15000, useNewTab = false }) {
      validateURL(url);
      const data = await withPage(async (page) => {
        const response = await page.goto(url, { waitUntil, timeout: timeoutMs });
        if (!response || !response.ok()) {
          const status = response ? response.status() : 'NO_RESPONSE';
          throw new Error(`Navigation failed (${status}) for ${url}`);
        }
        return await page.content();
      }, useNewTab);
      return { content: [{ type: 'text', text: data }] };
    }
  }
};

// Request processing
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
const queue = [];
let processing = false;
let shutdownRequested = false;

function enqueue(msg) {
  queue.push(msg);
  if (!processing) void processQueue();
}

async function processQueue() {
  processing = true;
  while (queue.length) {
    const { id, method, params } = queue.shift();
    await handle(method, params, id);
  }
  processing = false;
  if (shutdownRequested) {
    try { if (browser && browser.disconnect) browser.disconnect(); } catch (_) {}
    process.exit(0);
  }
}

async function handle(method, params, id) {
  try {
    switch (method) {
      case 'initialize':
        return send({
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'mcp-screenshot-server-chrome', version: '1.1.0' },
          capabilities: { tools: { list: true, call: true } }
        }, id);

      case 'tools/list':
        const list = Object.values(tools).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          input_schema: t.inputSchema
        }));
        return send({ tools: list }, id);

      case 'tools/call':
        const { name, arguments: args } = params || {};
        if (!name || !tools[name]) return send(rpcError(`Unknown tool: ${name}`), id);
        try {
          const result = await tools[name].handler(args || {});
          return send(result, id);
        } catch (err) {
          const error = rpcError(err?.message || String(err));
          return send(error, id);
        }

      case 'shutdown':
        shutdownRequested = true;
        return send({ ok: true }, id);

      default:
        return send(rpcError(`Method not found: ${method}`, -32601), id);
    }
  } catch (err) {
    return send(rpcError(err?.message || String(err)), id);
  }
}

// Event handlers
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch (_) {
    return send(rpcError('Parse error', -32700), null);
  }
  const { id, method, params } = msg || {};
  if (!method) return send(rpcError('Invalid Request', -32600), id);
  enqueue({ id, method, params });
});

process.on('SIGINT', () => { shutdownRequested = true; if (!processing) process.exit(0); });
process.on('SIGTERM', () => { shutdownRequested = true; if (!processing) process.exit(0); });
process.on('uncaughtException', () => process.exit(1));
process.on('unhandledRejection', () => {});