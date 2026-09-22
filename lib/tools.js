/**
 * Tool implementations for MCP Screenshot Server
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const browserManager = require('./browser-manager');
const { validatePath, validateURL, validateViewport, validateTimeout } = require('./validator');

/**
 * Screenshot tool - captures webpage screenshots
 */
const screenshotTool = {
  name: 'screenshot',
  description: 'Navigate (optional) to a URL and capture a PNG screenshot. Supports fullPage and waitUntil.',
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate before taking the screenshot.' },
      path: { type: 'string', description: 'Optional file path to save the PNG.' },
      fullPage: { type: 'boolean', default: false },
      waitUntil: { 
        type: 'string', 
        enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], 
        default: 'networkidle0' 
      },
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
    const { 
      url, 
      path: outPath, 
      fullPage = false, 
      waitUntil = 'networkidle0', 
      timeoutMs = 30000, 
      viewport 
    } = args;
    
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
      browserManager.setDefaultViewport(validatedViewport);
    }

    const startTime = Date.now();
    logger.debug('Taking screenshot', { url, fullPage, waitUntil });

    const result = await browserManager.withPage(async (page) => {
      if (url) {
        const response = await page.goto(url, { waitUntil, timeout: validatedTimeout });
        if (!response || !response.ok()) {
          const status = response ? response.status() : 'NO_RESPONSE';
          logger.error('Navigation failed', { url, status });
          throw new Error(`Navigation failed (${status}) for ${url}`);
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
      return { 
        mimeType: 'image/png', 
        data: buf.toString('base64'), 
        filePath 
      };
    });

    return formatImageResponse(result);
  }
};

/**
 * Set viewport tool - updates default browser viewport
 */
const setViewportTool = {
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
    browserManager.setDefaultViewport(validatedViewport);
    logger.info('Viewport updated', validatedViewport);
    
    return formatTextResponse({ 
      ok: true, 
      defaultViewport: validatedViewport 
    });
  }
};

/**
 * Get HTML tool - retrieves rendered HTML content
 */
const getHTMLTool = {
  name: 'getHTML',
  description: 'Navigate to a URL and return page HTML after waitUntil.',
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      waitUntil: { 
        type: 'string', 
        enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], 
        default: 'domcontentloaded' 
      },
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
    
    const data = await browserManager.withPage(async (page) => {
      const response = await page.goto(url, { waitUntil, timeout: validatedTimeout });
      if (!response || !response.ok()) {
        const status = response ? response.status() : 'NO_RESPONSE';
        logger.error('Navigation failed', { url, status });
        throw new Error(`Navigation failed (${status}) for ${url}`);
      }
      const html = await page.content();
      logger.metric('getHTML.duration', Date.now() - startTime);
      return { html };
    });
    
    return formatTextResponse(data.html);
  }
};

/**
 * Format response as image content blocks
 */
function formatImageResponse(result) {
  if (!result) {
    return { content: [{ type: 'text', text: 'OK' }] };
  }

  const blocks = [{ 
    type: 'image', 
    mimeType: result.mimeType, 
    data: result.data 
  }];
  
  if (result.filePath) {
    blocks.push({ 
      type: 'text', 
      text: `Saved to: ${result.filePath}` 
    });
  }
  
  return { 
    content: blocks, 
    structuredContent: result.filePath ? { filePath: result.filePath } : undefined 
  };
}

/**
 * Format response as text content block
 */
function formatTextResponse(textOrObj) {
  const text = typeof textOrObj === 'string' 
    ? textOrObj 
    : JSON.stringify(textOrObj, null, 2);
    
  return { 
    content: [{ type: 'text', text }] 
  };
}

module.exports = {
  tools: {
    screenshot: screenshotTool,
    setViewport: setViewportTool,
    getHTML: getHTMLTool
  },
  formatImageResponse,
  formatTextResponse
};