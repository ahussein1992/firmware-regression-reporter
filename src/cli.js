#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseLogFile } from './parser.js';
import { compareRuns } from './comparator.js';
import { generateMarkdownReport } from './reporter.js';
import { generateAiSummary } from './ai-summarizer.js';

function parseArgs(args) {
  const options = {
    baseline: null,
    candidate: null,
    output: null,
    ai: false,
    model: null,
    apiKey: null,
    baseUrl: null,
    quiet: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--baseline' || arg === '-b') {
      options.baseline = args[++i];
    } else if (arg === '--candidate' || arg === '-c') {
      options.candidate = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i];
    } else if (arg === '--ai') {
      options.ai = true;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--model') {
      options.model = args[++i];
    } else if (arg === '--api-key') {
      options.apiKey = args[++i];
    } else if (arg === '--base-url') {
      options.baseUrl = args[++i];
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
firmware-regression-reporter
Automated firmware test log comparison, regression triage, and evidence extraction.

Usage:
  node src/cli.js --baseline <path> --candidate <path> [options]

Options:
  -b, --baseline <file>   Path to baseline test log (Required)
  -c, --candidate <file>  Path to candidate test log (Required)
  -o, --output <file>     Output Markdown report destination (Default: stdout)
      --ai                Enable LLM-assisted root-cause triage & hypothesis engine
      --model <name>      Model identifier (e.g. gpt-4o-mini, claude-3.5-sonnet)
      --api-key <key>     API key (defaults to OPENAI_API_KEY / OPENROUTER_API_KEY)
      --base-url <url>    Custom OpenAI-compatible base URL
  -q, --quiet             Suppress informational console logs
  -h, --help              Display this help message
`);
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (!options.baseline || !options.candidate) {
    console.error('Error: Both --baseline and --candidate log files are required.');
    printHelp();
    process.exit(1);
  }

  const baselinePath = path.resolve(process.cwd(), options.baseline);
  const candidatePath = path.resolve(process.cwd(), options.candidate);

  if (!fs.existsSync(baselinePath)) {
    console.error(`Error: Baseline file not found: ${baselinePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(candidatePath)) {
    console.error(`Error: Candidate file not found: ${candidatePath}`);
    process.exit(1);
  }

  if (!options.quiet) {
    console.log(`[INFO] Parsing baseline log:  ${path.basename(baselinePath)}`);
    console.log(`[INFO] Parsing candidate log: ${path.basename(candidatePath)}`);
  }

  const baseline = parseLogFile(baselinePath);
  const candidate = parseLogFile(candidatePath);

  if (!options.quiet) {
    console.log(`[INFO] Comparing runs (${baseline.tests.size} baseline tests vs ${candidate.tests.size} candidate tests)...`);
  }

  const comparison = compareRuns(baseline, candidate);

  let aiSummary = null;
  if (options.ai) {
    if (!options.quiet) {
      console.log('[INFO] Generating evidence-linked AI diagnostic triage...');
    }
    aiSummary = await generateAiSummary(comparison, {
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      model: options.model
    });
  }

  const markdownReport = generateMarkdownReport(baseline, candidate, comparison, aiSummary);

  if (options.output) {
    const outputPath = path.resolve(process.cwd(), options.output);
    const parentDir = path.dirname(outputPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, markdownReport, 'utf-8');
    if (!options.quiet) {
      console.log(`[SUCCESS] Regression report generated: ${outputPath}`);
      console.log(`[SUMMARY] Regressions: ${comparison.summary.totalRegressions} | Missing: ${comparison.summary.totalMissing} | Verdict: ${comparison.summary.verdict}`);
    }
  } else {
    console.log(markdownReport);
  }

  // Exit with code 2 if critical regressions detected and --strict is set
  if (options.strict && comparison.summary.verdict === 'CRITICAL_REGRESSION') {
    process.exitCode = 2;
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
