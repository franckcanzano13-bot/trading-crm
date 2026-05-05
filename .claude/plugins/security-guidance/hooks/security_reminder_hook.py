#!/usr/bin/env python3
"""Security reminder hook for Claude Code.
Checks file edits for common security anti-patterns and warns about them.
"""

import json
import os
import sys
import datetime
import random

def debug_log(msg):
    """Write debug messages to log file."""
    try:
        with open(os.path.expanduser("~/.claude/security-warnings-log.txt"), "a") as f:
            f.write(f"[{datetime.datetime.now().isoformat()}] {msg}\n")
    except:
        pass

# Security patterns to check
SECURITY_PATTERNS = [
    {
        "name": "command_injection_exec",
        "description": "child_process.exec() is vulnerable to command injection. Use execFile() or spawn() with array args instead.",
        "file_check": lambda path: path.endswith((".js", ".ts", ".tsx", ".jsx")),
        "content_check": "child_process.exec(",
    },
    {
        "name": "new_function_injection",
        "description": "new Function() allows arbitrary code execution. Avoid dynamic code generation.",
        "file_check": lambda path: path.endswith((".js", ".ts", ".tsx", ".jsx")),
        "content_check": "new Function(",
    },
    {
        "name": "eval_injection",
        "description": "eval() allows arbitrary code execution. Use JSON.parse() or safer alternatives.",
        "file_check": lambda path: path.endswith((".js", ".ts", ".tsx", ".jsx", ".py")),
        "content_check": "eval(",
    },
    {
        "name": "dangerous_innerhtml",
        "description": "dangerouslySetInnerHTML can lead to XSS. Sanitize input with DOMPurify or similar.",
        "file_check": lambda path: path.endswith((".tsx", ".jsx")),
        "content_check": "dangerouslySetInnerHTML",
    },
    {
        "name": "document_write",
        "description": "document.write() can be exploited for XSS. Use DOM methods instead.",
        "file_check": lambda path: path.endswith((".js", ".ts", ".tsx", ".jsx")),
        "content_check": "document.write(",
    },
    {
        "name": "innerHTML_xss",
        "description": ".innerHTML assignment can lead to XSS. Use .textContent or sanitize first.",
        "file_check": lambda path: path.endswith((".js", ".ts", ".tsx", ".jsx")),
        "content_check": ".innerHTML",
    },
    {
        "name": "pickle_deserialization",
        "description": "pickle.loads() can execute arbitrary code. Use json or safer serialization.",
        "file_check": lambda path: path.endswith(".py"),
        "content_check": "pickle.loads(",
    },
    {
        "name": "os_system_injection",
        "description": "os.system() is vulnerable to command injection. Use subprocess.run() with list args.",
        "file_check": lambda path: path.endswith(".py"),
        "content_check": "os.system(",
    },
    {
        "name": "sql_injection",
        "description": "String concatenation in SQL queries can lead to SQL injection. Use parameterized queries.",
        "file_check": lambda path: path.endswith((".js", ".ts", ".py")),
        "content_check": "SELECT * FROM",
    },
]

def get_state_file(session_id):
    """Get session-specific state file path."""
    claude_dir = os.path.expanduser("~/.claude")
    os.makedirs(claude_dir, exist_ok=True)
    return os.path.join(claude_dir, f"security-warnings-{session_id}.json")

def load_shown_warnings(session_id):
    """Load previously shown warnings for this session."""
    state_file = get_state_file(session_id)
    try:
        if os.path.exists(state_file):
            with open(state_file, "r") as f:
                return json.load(f)
    except:
        pass
    return []

def save_shown_warning(session_id, warning_name):
    """Save a shown warning to avoid repetition."""
    shown = load_shown_warnings(session_id)
    if warning_name not in shown:
        shown.append(warning_name)
    state_file = get_state_file(session_id)
    try:
        with open(state_file, "w") as f:
            json.dump(shown, f)
    except:
        pass

def check_patterns(file_path, content, session_id):
    """Check content against security patterns."""
    shown = load_shown_warnings(session_id)
    warnings = []

    for pattern in SECURITY_PATTERNS:
        if pattern["name"] in shown:
            continue
        if not pattern["file_check"](file_path):
            continue
        if pattern["content_check"] in content:
            warnings.append(pattern)

    return warnings

def main():
    """Main entry point - reads tool use from stdin."""
    try:
        input_data = json.loads(sys.stdin.read())
    except:
        sys.exit(0)

    session_id = input_data.get("session_id", "default")
    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    # Only check Edit, Write, MultiEdit
    if tool_name not in ("Edit", "Write", "MultiEdit"):
        sys.exit(0)

    file_path = tool_input.get("file_path", "")
    content = ""

    if tool_name == "Write":
        content = tool_input.get("content", "")
    elif tool_name == "Edit":
        content = tool_input.get("new_string", "")
    elif tool_name == "MultiEdit":
        edits = tool_input.get("edits", [])
        content = " ".join(e.get("new_string", "") for e in edits)

    if not file_path or not content:
        sys.exit(0)

    warnings = check_patterns(file_path, content, session_id)

    if warnings:
        for w in warnings:
            print(f"⚠️  SECURITY WARNING: {w['description']}", file=sys.stderr)
            save_shown_warning(session_id, w["name"])
        # Exit code 2 = warn but don't block
        sys.exit(0)

    sys.exit(0)

if __name__ == "__main__":
    main()
