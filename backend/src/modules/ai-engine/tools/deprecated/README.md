# Deprecated Tools

This directory contains tools that have been **disabled for security reasons**.

## Why These Tools Were Disabled

These tools pose significant **Remote Code Execution (RCE)** risks:

| Tool                     | Risk                            | Alternative             |
| ------------------------ | ------------------------------- | ----------------------- |
| `PythonExecutorTool`     | Arbitrary Python code execution | `ContainerExecutorTool` |
| `JavaScriptExecutorTool` | Arbitrary JavaScript execution  | `ContainerExecutorTool` |
| `ShellExecutorTool`      | Arbitrary shell commands        | `ContainerExecutorTool` |

## Security Reference

- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [CWE-78: OS Command Injection](https://cwe.mitre.org/data/definitions/78.html)

## Safe Alternative

Use `ContainerExecutorTool` which provides:

- Docker container isolation
- Resource limits (CPU, memory)
- Network isolation
- Timeout enforcement
- Sandboxed execution environment

## Re-enabling (Not Recommended)

If you absolutely need these tools for a controlled environment:

1. Understand the security implications
2. Implement proper input validation
3. Use sandboxing techniques
4. Add rate limiting
5. Enable comprehensive logging

**Warning**: Re-enabling these tools in a production environment is strongly discouraged.

---

_Last updated: 2025-01-24_
