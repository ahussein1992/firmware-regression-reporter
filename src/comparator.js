/**
 * Compares parsed baseline and candidate test execution results.
 * @param {object} baseline - Output from parser for baseline run
 * @param {object} candidate - Output from parser for candidate run
 * @returns {object} Structured regression analysis
 */
export function compareRuns(baseline, candidate) {
  const testResults = [];
  const baselineKeys = new Set(baseline.tests.keys());
  const candidateKeys = new Set(candidate.tests.keys());

  let totalRegressions = 0;
  let totalFixes = 0;
  let totalMissing = 0;
  let totalPassing = 0;

  // 1. Check all candidate tests against baseline
  for (const [key, candTest] of candidate.tests.entries()) {
    const baseTest = baseline.tests.get(key);

    if (!baseTest) {
      testResults.push({
        key,
        suite: candTest.suite,
        name: candTest.name,
        category: 'NEW_TEST',
        baselineStatus: 'N/A',
        candidateStatus: candTest.status,
        durationChangeMs: null,
        reason: candTest.reason,
        candidateLine: candTest.lineNumber
      });
      if (candTest.status === 'PASS') totalPassing++;
    } else if (baseTest.status === 'PASS' && candTest.status === 'FAIL') {
      totalRegressions++;
      testResults.push({
        key,
        suite: candTest.suite,
        name: candTest.name,
        category: 'REGRESSION',
        baselineStatus: 'PASS',
        candidateStatus: 'FAIL',
        durationChangeMs: candTest.durationMs && baseTest.durationMs ? candTest.durationMs - baseTest.durationMs : null,
        reason: candTest.reason,
        candidateLine: candTest.lineNumber,
        baselineLine: baseTest.lineNumber
      });
    } else if (baseTest.status === 'FAIL' && candTest.status === 'PASS') {
      totalFixes++;
      testResults.push({
        key,
        suite: candTest.suite,
        name: candTest.name,
        category: 'FIXED',
        baselineStatus: 'FAIL',
        candidateStatus: 'PASS',
        durationChangeMs: candTest.durationMs && baseTest.durationMs ? candTest.durationMs - baseTest.durationMs : null,
        reason: null,
        candidateLine: candTest.lineNumber,
        baselineLine: baseTest.lineNumber
      });
      totalPassing++;
    } else {
      testResults.push({
        key,
        suite: candTest.suite,
        name: candTest.name,
        category: candTest.status === 'PASS' ? 'UNCHANGED_PASS' : 'PERSISTENT_FAIL',
        baselineStatus: baseTest.status,
        candidateStatus: candTest.status,
        durationChangeMs: candTest.durationMs && baseTest.durationMs ? candTest.durationMs - baseTest.durationMs : null,
        reason: candTest.reason,
        candidateLine: candTest.lineNumber,
        baselineLine: baseTest.lineNumber
      });
      if (candTest.status === 'PASS') totalPassing++;
    }
  }

  // 2. Detect missing tests (executed in baseline, absent in candidate)
  for (const [key, baseTest] of baseline.tests.entries()) {
    if (!candidateKeys.has(key)) {
      totalMissing++;
      testResults.push({
        key,
        suite: baseTest.suite,
        name: baseTest.name,
        category: 'MISSING_COVERAGE',
        baselineStatus: baseTest.status,
        candidateStatus: 'MISSING',
        durationChangeMs: null,
        reason: 'Test executed in baseline but completely omitted from candidate run',
        baselineLine: baseTest.lineNumber,
        candidateLine: null
      });
    }
  }

  // 3. Metric Deviations (Boot time)
  let bootTimeComparison = null;
  if (baseline.metrics.bootDurationSec !== null && candidate.metrics.bootDurationSec !== null) {
    const diffSec = candidate.metrics.bootDurationSec - baseline.metrics.bootDurationSec;
    const pctChange = ((diffSec / baseline.metrics.bootDurationSec) * 100).toFixed(1);
    bootTimeComparison = {
      baselineSec: baseline.metrics.bootDurationSec,
      candidateSec: candidate.metrics.bootDurationSec,
      diffSec: parseFloat(diffSec.toFixed(2)),
      pctChange: parseFloat(pctChange),
      isRegressed: diffSec > 3.0 // Flag if boot time regressed by >3s
    };
  }

  // 4. Memory Profiling Comparison (VmRSS per service)
  const memoryComparisons = [];
  const baseMemMap = new Map(baseline.metrics.memorySnapshots.map(m => [m.service, m]));
  
  for (const candMem of candidate.metrics.memorySnapshots) {
    const baseMem = baseMemMap.get(candMem.service);
    if (baseMem) {
      const diffKb = candMem.vmRssKb - baseMem.vmRssKb;
      const pctChange = ((diffKb / baseMem.vmRssKb) * 100).toFixed(1);
      memoryComparisons.push({
        service: candMem.service,
        baselineRssKb: baseMem.vmRssKb,
        candidateRssKb: candMem.vmRssKb,
        diffKb,
        pctChange: parseFloat(pctChange),
        isRegressed: parseFloat(pctChange) >= 25.0 // Flag if memory increased >= 25%
      });
    }
  }

  return {
    summary: {
      totalRegressions,
      totalFixes,
      totalMissing,
      totalPassing,
      totalCandidateTests: candidate.tests.size,
      verdict: totalRegressions > 0 || totalMissing > 0 ? 'CRITICAL_REGRESSION' : 'CLEAN'
    },
    testResults,
    metrics: {
      bootTime: bootTimeComparison,
      memory: memoryComparisons
    },
    candidateDiagnostics: candidate.diagnostics
  };
}
