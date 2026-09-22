/**
 * Tests for validator module
 */

const assert = require('assert');
const path = require('path');
const { validatePath, validateURL, validateViewport, validateTimeout } = require('../lib/validator');
const config = require('../lib/config');

// Test storage
const tests = [];
let currentSuite = '';

// Simple test runner setup if running directly
if (require.main === module) {
  global.describe = (name, fn) => {
    currentSuite = name;
    fn();
  };
  
  global.it = (name, fn) => {
    tests.push({ suite: currentSuite, name, fn });
  };
}

describe('Validator Tests', () => {
  
  describe('validatePath', () => {
    const baseDir = '/home/user/screenshots';
    
    it('should accept valid relative paths', () => {
      const result = validatePath('image.png', baseDir);
      assert(result.startsWith(baseDir));
    });
    
    it('should accept valid absolute paths within base', () => {
      const validPath = path.join(baseDir, 'subfolder', 'image.png');
      const result = validatePath(validPath, baseDir);
      assert.strictEqual(result, validPath);
    });
    
    it('should reject path traversal attempts', () => {
      assert.throws(() => {
        validatePath('../../../etc/passwd', baseDir);
      }, /Path traversal detected/);
    });
    
    it('should reject null bytes', () => {
      assert.throws(() => {
        validatePath('file\0.png', baseDir);
      }, /Invalid path characters/);
    });
    
    it('should reject empty paths', () => {
      assert.throws(() => {
        validatePath('', baseDir);
      }, /Path is required/);
    });
  });
  
  describe('validateURL', () => {
    it('should accept valid HTTP URLs', () => {
      const url = 'http://example.com';
      assert.strictEqual(validateURL(url), url);
    });
    
    it('should accept valid HTTPS URLs', () => {
      const url = 'https://example.com';
      assert.strictEqual(validateURL(url), url);
    });
    
    it('should reject invalid protocols', () => {
      assert.throws(() => {
        validateURL('file:///etc/passwd');
      }, /Protocol not allowed/);
    });
    
    it('should reject localhost by default', () => {
      assert.throws(() => {
        validateURL('http://localhost:8080');
      }, /Private\/internal addresses not allowed/);
    });
    
    it('should reject private IPs by default', () => {
      assert.throws(() => {
        validateURL('http://192.168.1.1');
      }, /Private\/internal addresses not allowed/);
      
      assert.throws(() => {
        validateURL('http://10.0.0.1');
      }, /Private\/internal addresses not allowed/);
    });
    
    it('should allow private IPs when configured', () => {
      const url = 'http://192.168.1.1';
      assert.strictEqual(
        validateURL(url, { blockPrivate: false }),
        url
      );
    });
    
    it('should enforce allowed hosts when specified', () => {
      assert.throws(() => {
        validateURL('https://evil.com', { allowedHosts: ['good.com'] });
      }, /Host not allowed/);
    });
    
    it('should reject invalid URLs', () => {
      assert.throws(() => {
        validateURL('not a url');
      }, /Invalid URL/);
    });
  });
  
  describe('validateViewport', () => {
    it('should accept valid viewport dimensions', () => {
      const viewport = { width: 1920, height: 1080, deviceScaleFactor: 2 };
      assert.deepStrictEqual(validateViewport(viewport), viewport);
    });
    
    it('should provide defaults for missing viewport', () => {
      const result = validateViewport(null);
      assert.strictEqual(result.width, 1280);
      assert.strictEqual(result.height, 800);
      assert.strictEqual(result.deviceScaleFactor, 1);
    });
    
    it('should reject invalid width', () => {
      assert.throws(() => {
        validateViewport({ width: -1, height: 800 });
      }, /Invalid viewport width/);
      
      assert.throws(() => {
        validateViewport({ width: 20000, height: 800 });
      }, /Invalid viewport width/);
    });
    
    it('should reject invalid height', () => {
      assert.throws(() => {
        validateViewport({ width: 1920, height: 0 });
      }, /Invalid viewport height/);
    });
    
    it('should reject invalid device scale factor', () => {
      assert.throws(() => {
        validateViewport({ width: 1920, height: 1080, deviceScaleFactor: 10 });
      }, /Invalid device scale factor/);
    });
  });
  
  describe('validateTimeout', () => {
    it('should accept valid timeout values', () => {
      assert.strictEqual(validateTimeout(5000), 5000);
      assert.strictEqual(validateTimeout(30000), 30000);
    });
    
    it('should provide default for undefined', () => {
      assert.strictEqual(validateTimeout(undefined), 30000);
    });
    
    it('should reject negative timeouts', () => {
      assert.throws(() => {
        validateTimeout(-1);
      }, /Invalid timeout/);
    });
    
    it('should reject timeouts exceeding maximum', () => {
      assert.throws(() => {
        validateTimeout(70000, 60000);
      }, /Invalid timeout/);
    });
  });
});


// Regression guard, added 2025-09-22 after a security review.
//
// The suite already had "should reject private IPs by default" — and it was green while
// SSRF protection was switched OFF in production. That test calls validateURL(url) with no
// options, so it exercises the function's own parameter default (blockPrivate = true).
// The running server passes config.security.blockPrivateNetworks instead, and that was
// false. A green test proving nothing about the deployed path.
//
// These tests assert the value the server actually uses.
describe('Security defaults (the value the server actually passes)', () => {
  it('config.security.blockPrivateNetworks defaults to true', () => {
    assert.strictEqual(
      config.security.blockPrivateNetworks, true,
      'SSRF protection must default to ON — opt out per run with MCP_BLOCK_PRIVATE_NETWORKS=false'
    );
  });

  it('validateURL rejects a private address when given the config value', () => {
    assert.throws(() => {
      validateURL('http://192.168.1.1', { blockPrivate: config.security.blockPrivateNetworks });
    }, /Private\/internal addresses not allowed/);
  });

  it('README documents http and https as the only allowed protocols', () => {
    assert.deepStrictEqual(config.security.allowedProtocols, ['http:', 'https:']);
  });
});

// Run tests if executed directly
if (require.main === module) {
  // Run all tests
  console.log('Running validator tests...\n');
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      test.fn();
      console.log(`✅ ${test.suite} - ${test.name}`);
      passed++;
    } catch (err) {
      console.error(`❌ ${test.suite} - ${test.name}`);
      console.error(`   ${err.message}`);
      failed++;
    }
  }
  
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}