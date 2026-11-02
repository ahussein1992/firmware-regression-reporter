import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLogFile } from '../src/parser.js';
import { compareRuns } from '../src/comparator.js';
import { generateMarkdownReport } from '../src/reporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baselinePath = path.resolve(__dirname, '../sample-data/baseline.log');
const candidatePath = path.resolve(__dirname, '../sample-data/candidate.log');

test('Log Parser correctly parses baseline and candidate logs', () => {
  const baseline = parseLogFile(baselinePath);
  const candidate = parseLogFile(candidatePath);

  assert.equal(baseline.metadata.board, 'VSPM350-GW');
  assert.equal(baseline.metadata.kernel, '5.10.138');
  assert.equal(baseline.tests.size, 7);
  assert.equal(baseline.metrics.bootDurationSec, 24.2);

  assert.equal(candidate.metadata.board, 'VSPM350-GW');
  assert.equal(candidate.metadata.buildTag, '#48');
  assert.equal(candidate.tests.size, 6); // 6 executed (dhcp missing)
  assert.equal(candidate.metrics.bootDurationSec, 35.8);
  assert.ok(candidate.diagnostics.length > 0);
});

test('Comparator correctly identifies regressions, missing tests, and metric anomalies', () => {
  const baseline = parseLogFile(baselinePath);
  const candidate = parseLogFile(candidatePath);

  const comparison = compareRuns(baseline, candidate);

  // 1. Regressions
  assert.equal(comparison.summary.totalRegressions, 2);
  const regressed = comparison.testResults.filter(t => t.category === 'REGRESSION');
  const regressedNames = regressed.map(t => t.name);
  assert.ok(regressedNames.includes('wifi_5g_dfs_cac'));
  assert.ok(regressedNames.includes('omci_voice_wan_provision'));

  // 2. Missing test coverage
  assert.equal(comparison.summary.totalMissing, 1);
  const missing = comparison.testResults.filter(t => t.category === 'MISSING_COVERAGE');
  assert.equal(missing[0].name, 'dhcp_client_binding');

  // 3. Verdict
  assert.equal(comparison.summary.verdict, 'CRITICAL_REGRESSION');

  // 4. Boot time diff
  assert.ok(comparison.metrics.bootTime.isRegressed);
  assert.equal(comparison.metrics.bootTime.diffSec, 11.6);

  // 5. Memory diff
  const omciMem = comparison.metrics.memory.find(m => m.service === 'omcid');
  assert.ok(omciMem);
  assert.ok(omciMem.isRegressed);
  assert.equal(omciMem.diffKb, 8300);
});

test('Markdown Reporter outputs well-formed markdown with critical citations', () => {
  const baseline = parseLogFile(baselinePath);
  const candidate = parseLogFile(candidatePath);
  const comparison = compareRuns(baseline, candidate);

  const report = generateMarkdownReport(baseline, candidate, comparison);

  assert.ok(report.includes('Firmware Regression Report'));
  assert.ok(report.includes('CRITICAL REGRESSIONS DETECTED'));
  assert.ok(report.includes('wifi_5g_dfs_cac'));
  assert.ok(report.includes('omci_voice_wan_provision'));
  assert.ok(report.includes('SIGSEGV'));
  assert.ok(report.includes('dhcp_client_binding'));
});
