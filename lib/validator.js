/**
 * Input validation and security utilities
 */

const path = require('path');
const { URL } = require('url');

/**
 * Validates and sanitizes file paths to prevent directory traversal
 * @param {string} filePath - The file path to validate
 * @param {string} allowedBase - The base directory for allowed operations
 * @returns {string} The sanitized absolute path
 * @throws {Error} If path is invalid or outside allowed directory
 */
function validatePath(filePath, allowedBase = process.cwd()) {
  if (!filePath) {
    throw new Error('Path is required');
  }

  // Resolve to absolute path
  const absolute = path.isAbsolute(filePath) 
    ? path.resolve(filePath)
    : path.resolve(allowedBase, filePath);

  // Normalize to remove ../.. etc
  const normalized = path.normalize(absolute);

  // Ensure the path is within allowed directory
  const relative = path.relative(allowedBase, normalized);
  if (relative.startsWith('..')) {
    throw new Error(`Path traversal detected: ${filePath} is outside allowed directory`);
  }

  // Check for suspicious patterns
  const suspicious = [
    /\0/,           // Null bytes
    /\.\.\/\.\./,   // Multiple traversals
    /[<>"|?*]/      // Invalid filename characters on Windows
  ];

  if (suspicious.some(pattern => pattern.test(filePath))) {
    throw new Error(`Invalid path characters detected in: ${filePath}`);
  }

  return normalized;
}

/**
 * Validates URLs to prevent SSRF attacks
 * @param {string} url - The URL to validate
 * @param {Object} options - Validation options
 * @returns {string} The validated URL
 * @throws {Error} If URL is invalid or dangerous
 */
function validateURL(url, options = {}) {
  const {
    allowedProtocols = ['http:', 'https:'],
    allowedHosts = null, // null means all hosts allowed
    blockPrivate = true
  } = options;

  if (!url) {
    throw new Error('URL is required');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Check protocol
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`Protocol not allowed: ${parsed.protocol}`);
  }

  // Check against allowed hosts if specified
  if (allowedHosts && !allowedHosts.includes(parsed.hostname)) {
    throw new Error(`Host not allowed: ${parsed.hostname}`);
  }

  // Block private/internal IPs if requested
  if (blockPrivate) {
    const privatePatterns = [
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^::1$/,
      /^fe80:/i,
      /^localhost$/i,
      /^.*\.local$/i
    ];

    if (privatePatterns.some(pattern => pattern.test(parsed.hostname))) {
      throw new Error(`Private/internal addresses not allowed: ${parsed.hostname}`);
    }
  }

  return url;
}

/**
 * Validates viewport dimensions
 * @param {Object} viewport - Viewport configuration
 * @returns {Object} Validated viewport
 * @throws {Error} If viewport is invalid
 */
function validateViewport(viewport) {
  const MIN_SIZE = 1;
  const MAX_SIZE = 10000;
  
  if (!viewport) {
    return { width: 1280, height: 800, deviceScaleFactor: 1 };
  }

  const { width, height, deviceScaleFactor = 1 } = viewport;

  if (typeof width !== 'number' || width < MIN_SIZE || width > MAX_SIZE) {
    throw new Error(`Invalid viewport width: ${width}`);
  }

  if (typeof height !== 'number' || height < MIN_SIZE || height > MAX_SIZE) {
    throw new Error(`Invalid viewport height: ${height}`);
  }

  if (typeof deviceScaleFactor !== 'number' || deviceScaleFactor < 0.1 || deviceScaleFactor > 5) {
    throw new Error(`Invalid device scale factor: ${deviceScaleFactor}`);
  }

  return { width, height, deviceScaleFactor };
}

/**
 * Validates timeout values
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} max - Maximum allowed timeout
 * @returns {number} Validated timeout
 */
function validateTimeout(timeout, max = 60000) {
  if (timeout === undefined) {
    return 30000; // Default 30 seconds
  }

  if (typeof timeout !== 'number' || timeout < 0 || timeout > max) {
    throw new Error(`Invalid timeout: ${timeout}. Must be between 0 and ${max}`);
  }

  return timeout;
}

module.exports = {
  validatePath,
  validateURL,
  validateViewport,
  validateTimeout
};