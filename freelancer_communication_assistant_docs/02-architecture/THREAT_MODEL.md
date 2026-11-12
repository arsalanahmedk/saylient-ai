# Threat Model

## Assets
Credentials, sessions, messages, context, drafts, analysis results, model keys, backups, logs and extension permissions.

## Threat actors
Unauthenticated attacker, malicious authenticated user, compromised dependency, malicious webpage, prompt-injection author and over-privileged insider.

## Threats and mitigations
| Threat | Example | Mitigation |
|---|---|---|
| Account takeover | Stolen session | Secure cookies, rotation, revocation, MFA for admins |
| IDOR | User changes analysis ID | Ownership check on every request |
| SQL injection | Crafted message text | Parameterized ORM queries |
| XSS | HTML/script in pasted message | Text rendering, output encoding, CSP |
| CSRF | Cross-site settings change | CSRF token/SameSite controls |
| Prompt injection | Pasted text asks model to reveal secrets | Treat as untrusted data; no privileged tools |
| Data leakage | Message appears in logs | Redaction and log minimization |
| API abuse | Repeated generation calls | Rate limits, quotas, size limits |
| Supply-chain risk | Malicious dependency | Lockfiles, audits, review |
| Extension overreach | Reads unrelated pages | Minimal permissions and active-tab activation |
| Hallucination | Draft invents a delivery date | Grounding constraints, validation, human review |

## Abuse tests
Try cross-user IDs, oversized requests, HTML payloads, repeated login attempts, prompt injection, unexpected page DOM changes and attempts to trigger automatic sending.

Record likelihood, impact, owner, mitigation, residual risk and review date in the risk register.
