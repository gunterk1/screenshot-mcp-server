#!/usr/bin/env node
/**
 * MCP Screenshot Server (Refactored)
 * Modular architecture with separated concerns
 */

const readline = require('readline');
const config = require('./lib/config');
const logger = require('./lib/logger');
const browserManager = require('./lib/browser-manager');
const { tools } = require('./lib/tools');

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

// ---------------- RPC dispatch (serialized) ----------------
const rl = readline.createInterface({ 
  input: process.stdin, 
  output: process.stdout, 
  terminal: false 
});

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
    await browserManager.close();
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
        logger.info('Server initialized');
        return send({
          protocolVersion: config.server.protocolVersion,
          serverInfo: { 
            name: config.server.name, 
            version: config.server.version 
          },
          capabilities: { 
            tools: { list: true, call: true } 
          }
        }, id);
      }

      case 'tools/list': {
        const list = Object.values(tools).map((t) => {
          const schema = t.inputSchema || t.input_schema;
          return { 
            name: t.name, 
            description: t.description, 
            inputSchema: schema, 
            input_schema: schema 
          };
        });
        return send({ tools: list }, id);
      }

      case 'tools/call': {
        const { name, arguments: args } = params || {};
        if (!name || !tools[name]) {
          return send(rpcError(`Unknown tool: ${name}`), id);
        }
        
        try {
          const result = await tools[name].handler(args || {});
          return send(result, id);
        } catch (err) {
          const error = (err && err.__isError) 
            ? err 
            : rpcError(err?.message || String(err));
          return send(error, id);
        }
      }

      case 'shutdown': {
        logger.info('Shutdown requested');
        shutdownRequested = true;
        return send({ ok: true }, id);
      }

      default:
        return send(rpcError(`Method not found: ${method}`, -32601), id);
    }
  } catch (err) {
    logger.error('Request failed', { 
      method, 
      error: err.message || String(err) 
    });
    return send(rpcError(err?.message || String(err)), id);
  } finally {
    const duration = Date.now() - startTime;
    logger.apiCall(method, params, duration, !shutdownRequested);
  }
}

// ---------------- Event handlers ----------------
rl.on('line', (line) => {
  let msg;
  try { 
    msg = JSON.parse(line); 
  } catch (_) {
    return send(rpcError('Parse error', -32700), null);
  }
  
  const { id, method, params } = msg || {};
  if (!method) {
    return send(rpcError('Invalid Request', -32600), id);
  }
  
  enqueue({ id, method, params });
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT');
  shutdownRequested = true;
  if (!processing) {
    browserManager.close().then(() => process.exit(0));
  }
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM');
  shutdownRequested = true;
  if (!processing) {
    browserManager.close().then(() => process.exit(0));
  }
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { 
    error: err.message, 
    stack: err.stack 
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
});

// ---------------- Startup ----------------
logger.info('MCP Screenshot Server started', {
  version: config.server.version,
  nodeVersion: process.version,
  platform: process.platform,
  config: {
    security: {
      blockPrivateNetworks: config.security.blockPrivateNetworks,
      allowedOutputDir: config.security.allowedOutputDir
    },
    performance: {
      maxTimeout: config.security.maxTimeout
    },
    logging: {
      level: config.logging.level
    }
  }
});