/**
 * Browser lifecycle management for Puppeteer
 */

const config = require('./config');
const logger = require('./logger');

class BrowserManager {
  constructor() {
    this.puppeteer = null;
    this.browser = null;
    this.defaultViewport = config.browser.defaultViewport;
  }

  /**
   * Get or create a browser instance
   * @returns {Promise<Browser>} Puppeteer browser instance
   */
  async getBrowser() {
    if (!this.puppeteer) {
      logger.debug('Loading Puppeteer');
      this.puppeteer = require('puppeteer');
    }

    if (this.browser && this.browser.process() && !this.browser.process().killed) {
      return this.browser;
    }

    logger.info('Launching new browser instance');
    this.browser = await this.puppeteer.launch({
      headless: config.browser.headless,
      args: config.browser.args
    });

    // Handle browser disconnect
    this.browser.on('disconnected', () => {
      logger.warn('Browser disconnected');
      this.browser = null;
    });

    return this.browser;
  }

  /**
   * Execute a function with a new page
   * @param {Function} fn - Function to execute with the page
   * @returns {Promise<*>} Result from the function
   */
  async withPage(fn) {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    
    // Set default viewport
    await page.setViewport(this.defaultViewport);
    
    // Set default timeout
    page.setDefaultTimeout(config.performance.pageTimeout);
    page.setDefaultNavigationTimeout(config.performance.navigationTimeout);

    try {
      return await fn(page);
    } finally {
      try {
        await page.close();
      } catch (err) {
        logger.error('Failed to close page', { error: err.message });
      }
    }
  }

  /**
   * Update default viewport
   * @param {Object} viewport - New viewport settings
   */
  setDefaultViewport(viewport) {
    this.defaultViewport = viewport;
    logger.debug('Default viewport updated', viewport);
  }

  /**
   * Get current default viewport
   * @returns {Object} Current viewport settings
   */
  getDefaultViewport() {
    return this.defaultViewport;
  }

  /**
   * Close the browser instance
   */
  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
        logger.info('Browser closed');
      } catch (err) {
        logger.error('Failed to close browser', { error: err.message });
      } finally {
        this.browser = null;
      }
    }
  }
}

// Export singleton instance
module.exports = new BrowserManager();