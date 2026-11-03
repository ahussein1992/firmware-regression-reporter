# 🛡️ Firmware Regression Reporter
> **Automated build-to-build test log comparison, evidence-linked regression detection, and AI-assisted triage for embedded Linux & networking platforms.**

[![CI](https://github.com/ahussein1992/firmware-regression-reporter/actions/workflows/ci.yml/badge.svg)](https://github.com/ahussein1992/firmware-regression-reporter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)

---

## 🛑 The Problem

Embedded Linux, OpenWrt, and IoT development teams frequently struggle with:
1. **Noisy, multi-megabyte testbed logs:** Pinpointing why a build suddenly failed involves sifting through thousands of lines of serial console, kernel dmesg, and daemon chatter.
2. **Silent metric degradation:** Boot time regressions and slow memory leaks (`VmRSS`) go undetected in standard pass/fail CI pipelines until hardware runs out of RAM in the field.
3. **Missing test coverage:** When a test case is silently omitted or crashes before reporting, standard tools often overlook the absence.
4. **Time-consuming manual triage:** Senior engineers spend hours cross-referencing log timestamps and addresses instead of fixing the root cause.

---

## 💡 The Solution

`firmware-regression-reporter` compares test execution outputs between a **known-good baseline** and a **candidate build**.

- 🔍 **Deterministic Regression Diffing:** Immediately flags tests that went from `PASS` → `FAIL`.
- ⚠️ **Missing Coverage Alerts:** Detects test cases present in baseline but omitted from candidate runs.
- 📈 **Performance & Memory Profiling:** Monitors boot duration and daemon memory (`/proc/<pid>/status` `VmRSS`) for anomalies exceeding threshold limits.
- 🎯 **Line-by-Line Evidence Citations:** Cites exact log file lines and kernel error signatures (e.g. `SIGSEGV` offsets, `ENOMEM`, CAC timeouts).
- 🧠 **Optional Human-in-the-Loop AI Triage:** Passes structured findings to an LLM to formulate clear, evidence-linked hypotheses and recommended next checks. **Hypotheses are strictly labeled as hypotheses—never ungrounded claims.**

---

## 📊 Sample Output Preview

Check out a full rendered sample report in [`examples/sample-regression-report.md`](examples/sample-regression-report.md).

```markdown
# 🛡️ Firmware Regression Report

> **Status:** **🔴 CRITICAL REGRESSIONS DETECTED**
> **Baseline:** `baseline.log` (5.10.138, Build: #1)
> **Candidate:** `candidate.log` (5.10.138, Build: #48)

| Total Tests | Passing | Regressions | Missing Tests | Boot Time Delta | Memory Anomalies |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 6 | 4 | **2** ❌ | **1** ⚠️ | +11.6s (+47.9%) | **2 Alert(s)** ⚠️ |

### 🤖 Engineering Triage Summary (Automated Diagnostics)
- **OMCI Voice WAN Crash (`omcid` SIGSEGV at `libomci_proto.so`):**
  - **Evidence:** Candidate line 23 logs table inconsistency (*"table reports 3 entries, active MEs count is 1"*), followed immediately by `SIGSEGV` invalid read from `00000014` at line 24.
  - **[HYPOTHESIS]:** Pointer arithmetic offset anomaly or uninitialized struct pointer dereference when looping over reported WAN entry count beyond active ME bounds.
- **Recommended Check:** Inspect `libomci_proto.so` source using `addr2line -e libomci_proto.so 0x77b42ef0`.
```

---

## ⚡ Quickstart

### 1. Requirements
- Node.js `>= 18.0.0` (Zero external npm dependencies required for core analysis).

### 2. Run with Sample Data
Clone the repository and run:

```bash
# Clone the repository
git clone https://github.com/ahussein1992/firmware-regression-reporter.git
cd firmware-regression-reporter

# Run deterministic regression analysis
node src/cli.js --baseline sample-data/baseline.log --candidate sample-data/candidate.log --output report.md

# Run with AI-assisted engineering triage (works offline or with OPENAI_API_KEY / OPENROUTER_API_KEY)
node src/cli.js --baseline sample-data/baseline.log --candidate sample-data/candidate.log --output report.md --ai
```

### 3. Run Automated Tests
```bash
npm test
```

---

## ⚙️ CLI Reference

```text
Usage:
  node src/cli.js --baseline <path> --candidate <path> [options]

Options:
  -b, --baseline <file>   Path to baseline test log (Required)
  -c, --candidate <file>  Path to candidate test log (Required)
  -o, --output <file>     Output Markdown report destination (Default: stdout)
      --ai                Enable LLM-assisted root-cause triage & hypothesis engine
      --model <name>      Model identifier (e.g. gpt-4o-mini, claude-3.5-sonnet)
      --api-key <key>     API key (defaults to OPENAI_API_KEY / OPENROUTER_API_KEY)
      --base-url <url>    Custom OpenAI-compatible base URL (e.g. http://localhost:11434/v1 for Ollama)
      --strict            Exit with code 2 if regressions or missing tests are detected (ideal for CI)
  -q, --quiet             Suppress informational console output
  -h, --help              Display this help message
```

---

## 🔒 Privacy & Architecture Principles

- **Zero-Data-Exfiltration by Default:** The core comparison engine runs 100% locally and deterministically.
- **Strict Evidence Grounding:** The AI engine is fed structured JSON diffs and is explicitly instructed never to fabricate line numbers, invent symptoms, or present speculative ideas as definitive facts.
- **Offline Fallback:** If `--ai` is enabled without an API key or when offline, a structured deterministic triage is generated without network calls.

---

## 🤝 Fixed-Scope Integration Pilots

Do you have proprietary firmware test logs, custom serial consoles, or CI pipelines that require customized regression reporting?

I offer **fixed-scope integration pilots** for embedded Linux, IoT, and networking device teams:
1. **Custom Log Adapters:** Writing dedicated parsers for your proprietary or vendor-specific test log formats.
2. **CI Pipeline Integration:** Automating report generation and Slack/Email/GitHub PR comment notifications on every firmware build.
3. **Deep Crash & Regression Triage:** Investigating stubborn kernel, driver, or network protocol failures.

**Contact & Inquiries:**
- **Engineer:** Ahmed Hussein (Senior Embedded Linux & Networking Software Engineer)
- **GitHub:** [@ahussein1992](https://github.com/ahussein1992)
- **LinkedIn:** [linkedin.com/in/ahmedhussein1](https://www.linkedin.com/in/ahmedhussein1/)
- **Email:** [a.husseinfarag@gmail.com](mailto:a.husseinfarag@gmail.com)
