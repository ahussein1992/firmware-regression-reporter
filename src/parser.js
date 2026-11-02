import fs from 'node:fs';
import path from 'node:path';

/**
 * Parses an embedded Linux test log file into structured data.
 * @param {string} filePath - Path to log file
 * @returns {object} Structured parse results
 */
export function parseLogFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseLogContent(content, filePath);
}

/**
 * Parses log file content string.
 * @param {string} content
 * @param {string} filename
 * @returns {object}
 */
export function parseLogContent(content, filename = 'log') {
  const lines = content.split(/\r?\n/);
  
  const metadata = {
    filename: path.basename(filename),
    fullPath: filename,
    totalLines: lines.length,
    board: null,
    kernel: null,
    buildTag: null,
    uboot: null
  };

  const tests = new Map();
  const metrics = {
    bootDurationSec: null,
    memorySnapshots: []
  };

  const diagnostics = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i].trim();
    if (!line) continue;

    // 1. Board & Platform Metadata
    if (line.includes('[BOOT]') && line.includes('Board:')) {
      const match = line.match(/Board:\s*([A-Za-z0-9_-]+)/);
      if (match) metadata.board = match[1];
    }
    if (line.includes('[BOOT]') && line.includes('U-Boot')) {
      const match = line.match(/U-Boot\s+([^\s]+)/);
      if (match) metadata.uboot = match[1];
    }
    if (line.includes('[KERNEL]') && line.includes('Linux version')) {
      const match = line.match(/Linux version\s+([^\s]+)/);
      if (match) metadata.kernel = match[1];
      const buildMatch = line.match(/#(\d+)/);
      if (buildMatch) metadata.buildTag = `#${buildMatch[1]}`;
    }

    // 2. Metrics
    if (line.includes('boot_duration_sec:')) {
      const match = line.match(/boot_duration_sec:\s*([0-9.]+)/);
      if (match) metrics.bootDurationSec = parseFloat(match[1]);
    }
    if (line.includes('memory_snapshot:')) {
      const serviceMatch = line.match(/service:\s*([A-Za-z0-9_-]+)/);
      const rssMatch = line.match(/VmRSS_kB:\s*(\d+)/);
      const hwmMatch = line.match(/VmHWM_kB:\s*(\d+)/);
      if (serviceMatch && rssMatch) {
        metrics.memorySnapshots.push({
          service: serviceMatch[1],
          vmRssKb: parseInt(rssMatch[1], 10),
          vmHwmKb: hwmMatch ? parseInt(hwmMatch[1], 10) : null,
          lineNumber
        });
      }
    }

    // 3. Test Cases (PASS / FAIL / SKIP / TIMEOUT)
    if (line.includes('[TEST_PASS]')) {
      const suiteMatch = line.match(/suite:\s*([A-Za-z0-9_-]+)/);
      const testMatch = line.match(/test:\s*([A-Za-z0-9_-]+)/);
      const durMatch = line.match(/duration_ms:\s*(\d+)/);
      if (suiteMatch && testMatch) {
        const key = `${suiteMatch[1]}/${testMatch[1]}`;
        tests.set(key, {
          suite: suiteMatch[1],
          name: testMatch[1],
          status: 'PASS',
          durationMs: durMatch ? parseInt(durMatch[1], 10) : null,
          reason: null,
          lineNumber
        });
      }
    } else if (line.includes('[TEST_FAIL]')) {
      const suiteMatch = line.match(/suite:\s*([A-Za-z0-9_-]+)/);
      const testMatch = line.match(/test:\s*([A-Za-z0-9_-]+)/);
      const durMatch = line.match(/duration_ms:\s*(\d+)/);
      const reasonMatch = line.match(/reason:\s*"([^"]+)"/);
      if (suiteMatch && testMatch) {
        const key = `${suiteMatch[1]}/${testMatch[1]}`;
        tests.set(key, {
          suite: suiteMatch[1],
          name: testMatch[1],
          status: 'FAIL',
          durationMs: durMatch ? parseInt(durMatch[1], 10) : null,
          reason: reasonMatch ? reasonMatch[1] : 'Unspecified test assertion failure',
          lineNumber
        });
      }
    }

    // 4. Critical Diagnostic Log Events (Kernels, Segfaults, Alloc Errors, Warnings)
    if (
      line.includes('[ERROR]') ||
      line.includes('SIGSEGV') ||
      line.includes('do_page_fault') ||
      line.includes('Kernel panic') ||
      line.includes('ENOMEM') ||
      line.includes('[WARN]')
    ) {
      diagnostics.push({
        lineNumber,
        text: line,
        severity: line.includes('SIGSEGV') || line.includes('panic') || line.includes('[ERROR]') ? 'CRITICAL' : 'WARNING'
      });
    }
  }

  return {
    metadata,
    tests,
    metrics,
    diagnostics
  };
}
