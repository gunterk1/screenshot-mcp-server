/**
 * Configuration management for MCP Screenshot Server
 */

const path = require('path');

const config = {
  // Server configuration
  server: {
    protocolVersion: '2024-11-05',
    name: 'mcp-screenshot-server',
    version: '1.0.0'
  },

  // Puppeteer configuration
  browser: {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage', // Overcome limited resource problems
      '--disable-setuid-sandbox',
      '--no-first-run',
      '--no-zygote'
    ],
    defaultViewport: {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1
    }
  },

  // Security configuration
  security: {
    allowedOutputDir: path.join(process.cwd(), 'shots'),
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedProtocols: ['http:', 'https:'],
    // Secure by default. Override per run with MCP_BLOCK_PRIVATE_NETWORKS=false when
    // you deliberately need to screenshot localhost during development.
    blockPrivateNetworks: true,
    maxTimeout: 60000, // 60 seconds
    rateLimit: {
      enabled: false, // Can be enabled in production
      maxRequests: 100,
      windowMs: 60000 // 1 minute
    }
  },

  // Performance configuration
  performance: {
    maxConcurrentPages: 5,
    pageTimeout: 30000,
    navigationTimeout: 30000,
    screenshotTimeout: 15000,
    cacheEnabled: false,
    cacheTTL: 3600 // 1 hour in seconds
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json', // 'json' or 'text'
    includeTimestamp: true,
    includeRequestId: true
  },

  // Feature flags
  features: {
    authentication: false,
    caching: false,
    metrics: false,
    healthCheck: true
  }
};

// Override with environment variables if present
if (process.env.MCP_ALLOWED_OUTPUT_DIR) {
  config.security.allowedOutputDir = process.env.MCP_ALLOWED_OUTPUT_DIR;
}

if (process.env.MCP_MAX_TIMEOUT) {
  config.security.maxTimeout = parseInt(process.env.MCP_MAX_TIMEOUT, 10);
}

if (process.env.MCP_BLOCK_PRIVATE_NETWORKS) {
  config.security.blockPrivateNetworks = process.env.MCP_BLOCK_PRIVATE_NETWORKS === 'true';
}

if (process.env.MCP_HEADLESS) {
  config.browser.headless = process.env.MCP_HEADLESS;
}

module.exports = config;