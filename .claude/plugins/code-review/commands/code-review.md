# Code Review

Provide a comprehensive code review for the current project changes.

## Allowed tools
- Bash (git commands, gh CLI)
- Read, Glob, Grep
- Agent (for parallel review agents)

## Process

### Step 1: Gather context
- Run `git diff HEAD~3` to see recent changes
- Run `git log --oneline -10` for commit context
- Read CLAUDE.md for project guidelines

### Step 2: Launch parallel review agents

Launch 4 agents in parallel:

**Agent 1 - CLAUDE.md Compliance**
Check all recent changes against CLAUDE.md guidelines. Flag any violations with confidence scores.

**Agent 2 - Bug Detection**
Scan changed files for:
- Syntax errors, type errors, unresolved references
- Logic errors (off-by-one, null checks, race conditions)
- Missing error handling
- Memory leaks, unclosed resources

**Agent 3 - Security Audit**
Check for:
- SQL injection, XSS, command injection
- Hardcoded secrets, API keys
- Unsafe deserialization
- Missing input validation
- Authentication/authorization gaps

**Agent 4 - Code Quality**
Review for:
- Dead code, unused imports
- Inconsistent naming conventions
- Missing TypeScript types
- Performance issues (N+1 queries, unnecessary re-renders)

### Step 3: Score and filter
Each issue gets a confidence score 0-100:
- 0: Not confident, likely false positive
- 25: Somewhat confident
- 50: Moderately confident
- 75: Highly confident
- 100: Absolutely certain

Filter out issues below 80 confidence.

### Step 4: Output results
Format findings as:
```
## Code Review Results

### Critical Issues (confidence >= 90)
1. [Issue description]
   File: path/to/file.ts:L42
   Why: [explanation]

### Warnings (confidence >= 80)
1. [Issue description]
   File: path/to/file.ts:L88
   Why: [explanation]

### Summary
- X critical issues found
- Y warnings found
- Z files reviewed
```

## What counts as high-signal
- Definite syntax/type errors
- Clear logic failures
- Unresolved references
- Missing null checks on required paths
- Security vulnerabilities
- CLAUDE.md violations

## What to ignore
- Pre-existing issues not in the diff
- Pedantic style nitpicks
- Linter-catchable problems
- Subjective quality concerns
