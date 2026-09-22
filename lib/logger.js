/**
 * Structured logging system for MCP Screenshot Server
 */

const config = require('./config');

class Logger {
  constructor(options = {}) {
    this.level = options.level || config.logging.level;
    this.format = options.format || config.logging.format;
    this.includeTimestamp = options.includeTimestamp !== false;
    this.includeRequestId = options.includeRequestId !== false;
    this.requestId = null;
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };
    
    this.currentLevel = this.levels[this.level] || 2;
  }

  setRequestId(id) {
    this.requestId = id;
  }

  _format(level, message, meta = {}) {
    const entry = {
      level,
      message,
      ...meta
    };

    if (this.includeTimestamp) {
      entry.timestamp = new Date().toISOString();
    }

    if (this.includeRequestId && this.requestId) {
      entry.requestId = this.requestId;
    }

    if (this.format === 'json') {
      return JSON.stringify(entry);
    } else {
      const timestamp = entry.timestamp ? `[${entry.timestamp}] ` : '';
      const requestId = entry.requestId ? `[${entry.requestId}] ` : '';
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp}${requestId}${level.toUpperCase()}: ${message}${metaStr}`;
    }
  }

  _log(level, message, meta) {
    if (this.levels[level] <= this.currentLevel) {
      const formatted = this._format(level, message, meta);
      // Always output to stderr to avoid interfering with JSON-RPC on stdout
      console.error(formatted);
    }
  }

  error(message, meta) {
    this._log('error', message, meta);
  }

  warn(message, meta) {
    this._log('warn', message, meta);
  }

  info(message, meta) {
    this._log('info', message, meta);
  }

  debug(message, meta) {
    this._log('debug', message, meta);
  }

  trace(message, meta) {
    this._log('trace', message, meta);
  }

  // Log performance metrics
  metric(name, value, unit = 'ms', meta = {}) {
    this.info(`Metric: ${name}`, {
      metric: name,
      value,
      unit,
      ...meta
    });
  }

  // Log API calls
  apiCall(method, params, duration, success, error = null) {
    const logData = {
      method,
      params,
      duration,
      success
    };

    if (error) {
      logData.error = error.message || error;
      this.error('API call failed', logData);
    } else {
      this.info('API call completed', logData);
    }
  }

  // Create child logger with context
  child(context) {
    const child = new Logger({
      level: this.level,
      format: this.format,
      includeTimestamp: this.includeTimestamp,
      includeRequestId: this.includeRequestId
    });
    child.requestId = this.requestId;
    child.context = context;
    return child;
  }
}

// Export singleton instance
module.exports = new Logger();