#!/usr/bin/env node
/**
 * MCP Screenshot Server (Node.js + Puppeteer)
 * JSON-RPC 2.0 over stdio, compatible with MCP-style clients in VS Code.
 *
 * Methods:
 *  - initialize
 *  - tools/list
 *  - tools/call
 *  - shutdown (graceful; waits until queue is drained)
 *
 * Tools:
 *  - screenshot({ url?, path?, fullPage?, waitUntil?, timeoutMs?, viewport? })
 *  - setViewport({ width, height, deviceScaleFactor? })
 *  - getHTML({ url, waitUntil?, timeoutMs? })
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const config = require('./lib/config');
const logger = require('./lib/logger');
const { validatePath, validateURL, validateViewport, validateTimeout } = require('./lib/validator');

let puppeteer; // lazy load
let browser = null;
let defaultViewport = config.browser.defaultViewport;

// ---------------- JSON-RPC helpers ----------------
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

// ---------------- Puppeteer lifecycle ----------------
async function getBrowser() {
  if (!puppeteer) {
    logger.debug('Loading Puppeteer');
    puppeteer = require('puppeteer');
  }
  if (browser && browser.process() && !browser.process().killed) {
    return browser;
  }
  logger.info('Launching new browser instance');
  browser = await puppeteer.launch({
    headless: config.browser.headless,
    args: config.browser.args
  });
  return browser;
}

async function withPage(fn) {
  const br = await getBrowser();
  const page = await br.newPage();
  await page.setViewport(defaultViewport);
  try {
    return await fn(page);
  } finally {
    try { await page.close(); } catch (_) {}
  }
}

// ---------------- Tools ----------------
const tools = {
  screenshot: {
    name: 'screenshot',
    description: 'Navigate (optional) to a URL and capture a PNG screenshot. Supports fullPage and waitUntil.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate before taking the screenshot.' },
        path: { type: 'string', description: 'Optional file path to save the PNG.' },
        fullPage: { type: 'boolean', default: false },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], default: 'networkidle0' },
        timeoutMs: { type: 'number', default: 30000 },
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
      const { url, path: outPath, fullPage = false, waitUntil = 'networkidle0', timeoutMs = 30000, viewport } = args;
      
      // Validate inputs
      if (url) {
        validateURL(url, {
          allowedProtocols: config.security.allowedProtocols,
          blockPrivate: config.security.blockPrivateNetworks
        });
      }
      
      const validatedTimeout = validateTimeout(timeoutMs, config.security.maxTimeout);
      
      if (viewport) {
        const validatedViewport = validateViewport(viewport);
        defaultViewport = { ...defaultViewport, ...validatedViewport };
      }

      const startTime = Date.now();
      logger.debug('Taking screenshot', { url, fullPage, waitUntil });

      const result = await withPage(async (page) => {
        if (url) {
          const response = await page.goto(url, { waitUntil, timeout: validatedTimeout });
          if (!response || !response.ok()) {
            const status = response ? response.status() : 'NO_RESPONSE';
            logger.error('Navigation failed', { url, status });
            throw rpcError(`Navigation failed (${status}) for ${url}`);
          }
        }
        const buf = await page.screenshot({ type: 'png', fullPage });
        let filePath;
        if (outPath) {
          const validatedPath = validatePath(outPath, config.security.allowedOutputDir);
          fs.mkdirSync(path.dirname(validatedPath), { recursive: true });
          fs.writeFileSync(validatedPath, buf);
          filePath = validatedPath;
          logger.info('Screenshot saved', { filePath, size: buf.length });
        }
        
        logger.metric('screenshot.duration', Date.now() - startTime);
        return { mimeType: 'image/png', data: buf.toString('base64'), filePath };
      });

      return asContentBlocks(result);
    }
  },

  setViewport: {
    name: 'setViewport',
    description: 'Set default viewport for future screenshots.',
    input_schema: {
      type: 'object',
      properties: {
        width: { type: 'number', default: 1280 },
        height: { type: 'number', default: 800 },
        deviceScaleFactor: { type: 'number', default: 1 }
      },
      required: ['width', 'height']
    },
    async handler({ width, height, deviceScaleFactor = 1 }) {
      const validatedViewport = validateViewport({ width, height, deviceScaleFactor });
      defaultViewport = validatedViewport;
      logger.info('Viewport updated', defaultViewport);
      return asTextBlock({ ok: true, defaultViewport });
    }
  },

  getHTML: {
    name: 'getHTML',
    description: 'Navigate to a URL and return page HTML after waitUntil.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], default: 'domcontentloaded' },
        timeoutMs: { type: 'number', default: 15000 }
      },
      required: ['url']
    },
    async handler({ url, waitUntil = 'domcontentloaded', timeoutMs = 15000 }) {
      // Validate inputs
      validateURL(url, {
        allowedProtocols: config.security.allowedProtocols,
        blockPrivate: config.security.blockPrivateNetworks
      });
      const validatedTimeout = validateTimeout(timeoutMs, config.security.maxTimeout);
      
      const startTime = Date.now();
      logger.debug('Getting HTML', { url, waitUntil });
      
      const data = await withPage(async (page) => {
        const response = await page.goto(url, { waitUntil, timeout: validatedTimeout });
        if (!response || !response.ok()) {
          const status = response ? response.status() : 'NO_RESPONSE';
          logger.error('Navigation failed', { url, status });
          throw rpcError(`Navigation failed (${status}) for ${url}`);
        }
        const html = await page.content();
        logger.metric('getHTML.duration', Date.now() - startTime);
        return { html };
      });
      return asTextBlock(data.html);
    }
  }
};

// ---------------- Content helpers (MCP-style) ----------------
function asContentBlocks(raw) {
  // Normalize various handler returns into { content: ContentBlock[] }
  if (!raw) return { content: [{ type: 'text', text: 'OK' }] };

  // If already in blocks form
  if (Array.isArray(raw)) return { content: raw };
  if (raw.blocks && Array.isArray(raw.blocks)) return { content: raw.blocks };

  // Image
  if (raw.mimeType && String(raw.mimeType).startsWith('image/') && raw.data) {
    const blocks = [{ type: 'image', mimeType: raw.mimeType, data: raw.data }];
    if (raw.filePath) blocks.push({ type: 'text', text: `Saved to: ${raw.filePath}` });
    return { content: blocks, structuredContent: raw.filePath ? { filePath: raw.filePath } : undefined };
  }

  // Plain string
  if (typeof raw === 'string') return { content: [{ type: 'text', text: raw }] };

  // Object → stringify
  return { content: [{ type: 'text', text: JSON.stringify(raw, null, 2) }] };
}

function asTextBlock(textOrObj) {
  return { content: [{ type: 'text', text: typeof textOrObj === 'string' ? textOrObj : JSON.stringify(textOrObj, null, 2) }] };
}

// ---------------- RPC dispatch (serialized) ----------------
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
    try { if (browser) await browser.close(); } catch (_) {}
    process.exit(0);
  }
}

async function handle(method, params, id) {
  const startTime = Date.now();
  logger.setRequestId(id);
  logger.debug('Handling request', { method, params });
  
  try {
    switch (method) {
      case 'initialize': {
        logger.debug('Server initialized');
        return send({
          protocolVersion: config.server.protocolVersion,
          serverInfo: { name: config.server.name, version: config.server.version },
          capabilities: { tools: { list: true, call: true } }
        }, id);
      }

      case 'tools/list': {
        const list = Object.values(tools).map((t) => {
          const schema = t.inputSchema || t.input_schema;
          return { name: t.name, description: t.description, inputSchema: schema, input_schema: schema };
        });
        return send({ tools: list }, id);
      }

      case 'tools/call': {
        const { name, arguments: args } = params || {};
        if (!name || !tools[name]) return send(rpcError(`Unknown tool: ${name}`), id);
        try {
          const normalized = await tools[name].handler(args || {});
          return send(normalized, id);
        } catch (err) {
          const e = (err && err.__isError) ? err : rpcError(err?.message || String(err));
          return send(e, id);
        }
      }

      case 'shutdown': {
        // Defer actual exit until queue is drained
        logger.debug('Shutdown requested');
        shutdownRequested = true;
        return send({ ok: true }, id);
      }

      default:
        return send(rpcError(`Method not found: ${method}`, -32601), id);
    }
  } catch (err) {
    logger.error('Request failed', { method, error: err.message || String(err) });
    return send(rpcError(err?.message || String(err)), id);
  } finally {
    const duration = Date.now() - startTime;
    logger.debug('API call completed', { method, duration });
  }
}

// Read loop
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch (_) {
    return send(rpcError('Parse error', -32700), null);
  }
  const { id, method, params } = msg || {};
  if (!method) return send(rpcError('Invalid Request', -32600), id);
  enqueue({ id, method, params });
});

process.on('SIGINT', () => {
  logger.debug('Received SIGINT');
  shutdownRequested = true;
  if (!processing) process.exit(0);
});

process.on('SIGTERM', () => {
  logger.debug('Received SIGTERM');
  shutdownRequested = true;
  if (!processing) process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
});

// Only log startup message if debug level is enabled
if (config.logging.level === 'debug' || config.logging.level === 'trace') {
  logger.info('MCP Screenshot Server started', {
    version: config.server.version,
    nodeVersion: process.version,
    platform: process.platform
  });
}
