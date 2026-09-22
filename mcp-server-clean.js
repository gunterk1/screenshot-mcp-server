#!/usr/bin/env node
/**
 * Clean MCP Screenshot Server - No logs, only JSON-RPC
 */

const readline = require('readline');
const config = require('./lib/config');
const browserManager = require('./lib/browser-manager');
const { tools } = require('./lib/tools');

// Suppress all logging for VS Code compatibility
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  metric: () => {},
  setRequestId: () => {}
};

// Override logger in all modules
const loggerModule = require('./lib/logger');
loggerModule.setRequestId = () => {};
loggerModule.debug = () => {};
loggerModule.info = () => {};
loggerModule.warn = () => {};
loggerModule.error = () => {};
loggerModule.metric = () => {};

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

// Request processing
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
  try {
    switch (method) {
      case 'initialize': {
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
        shutdownRequested = true;
        return send({ ok: true }, id);
      }

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
  shutdownRequested = true;
  if (!processing) {
    browserManager.close().then(() => process.exit(0));
  }
});

process.on('SIGTERM', () => {
  shutdownRequested = true;
  if (!processing) {
    browserManager.close().then(() => process.exit(0));
  }
});

// Suppress uncaught exceptions from logging
process.on('uncaughtException', (err) => {
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  // Silent handling
});