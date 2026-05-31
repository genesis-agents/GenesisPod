# Security Policy

We take the security of Genesis.ai seriously. Thank you for helping keep the
project and its users safe.

## Supported versions

This project is under active development. Security fixes are applied to the
latest release on the default branch. We do not backport fixes to older tags
unless otherwise noted.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, use one of the following private channels:

1. **GitHub private vulnerability reporting** (preferred): go to the
   repository's **Security** tab → **Report a vulnerability**. This opens a
   private advisory visible only to maintainers.
2. If that is unavailable, contact the maintainers privately and ask for a
   secure channel before sharing details.

When reporting, please include as much of the following as you can:

- A description of the vulnerability and its impact.
- Steps to reproduce or a proof of concept.
- Affected component(s) and version/commit.
- Any suggested remediation, if you have one.

## What to expect

- We will acknowledge your report within **5 business days**.
- We will provide an initial assessment and a plan for a fix or mitigation.
- We will keep you informed of progress and coordinate a disclosure timeline
  with you.
- With your permission, we are happy to credit you once the issue is resolved.

## Scope and good-faith research

We support good-faith security research. Please:

- Avoid privacy violations, data destruction, and service disruption.
- Only test against your own local or self-hosted deployment — **never** against
  production systems or other users' data.
- Give us reasonable time to remediate before any public disclosure.

## Handling secrets

Never include real credentials, API keys, or tokens in issues, PRs, logs, or
test fixtures. If you discover an exposed secret in the repository or its git
history, treat it as a security report and use the private channel above.
