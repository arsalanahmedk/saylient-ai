# Security Architecture

**Status:** Proposed design. Controls must be implemented and tested; this document is not a security certification.

## 1. Security objectives
Protect accounts, user messages, drafts, context, model credentials and service availability. Prevent cross-user access, injection, XSS, CSRF, prompt injection, abuse and unauthorized extension collection.

## 2. Trust boundaries
- Browser ↔ frontend.
- Frontend ↔ public API.
- API ↔ database.
- API ↔ external AI provider.
- Extension content script ↔ third-party page DOM.
- Extension ↔ API.

All user input, page DOM text, model output and provider responses are untrusted.

## 3. Authentication and authorization
- Use a mature auth library or identity provider; do not invent password cryptography.
- Hash passwords with Argon2id or a vetted equivalent.
- Prefer Secure, HttpOnly, SameSite cookies for browser sessions.
- Rotate session identifiers after login and privilege changes.
- Revoke sessions on logout/password reset.
- Enforce ownership on every analysis, draft and template request.
- Use MFA for privileged/admin accounts.
- Apply rate limits to login, reset, analysis and generation.
- Use generic login/reset errors to reduce account enumeration.

## 4. Browser/API controls
- HTTPS only in production; configure HSTS after HTTPS is stable.
- Restrictive CORS allowlist; never wildcard origins with credentialed requests.
- CSRF protection for cookie-authenticated state-changing requests.
- CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy` and frame protections.
- Validate schemas, content types, identifiers and request sizes server-side.
- Use parameterized SQL/ORM; never concatenate user input into SQL.
- Escape output by context; render pasted messages as text, not HTML.
- Avoid open redirects and unsafe server-side URL fetching.
- Never return stack traces, secrets or raw provider errors.

## 5. AI-specific security
- Treat pasted conversations as data, not instructions.
- Keep system instructions separate from user content.
- Defend against prompt injection; do not reveal system prompts, credentials or other users' data.
- Do not give the LLM shell, database, browser or arbitrary network tools.
- Validate model output against strict schemas; reject malformed output.
- Check output for fabricated facts, abusive language and unsafe content.
- Preserve the user's goal, facts, deadlines, prices and boundaries.
- Do not infer P/D/R from protected/sensitive personal attributes.
- Label output as a suggestion requiring human review.
- Minimize text sent to external providers and review their retention/training terms.

## 6. Data protection
- Treat messages, context and drafts as sensitive user content.
- Encrypt traffic with TLS and use managed encryption at rest.
- Keep API keys in server-side secret management; never in frontend bundles or extension code.
- Redact message bodies, tokens, passwords and personal data from logs.
- Define retention periods and provide deletion/export mechanisms.
- Restrict production database and backup access.
- Use synthetic or consented examples in development/research.

## 7. Extension controls
- Manifest V3 and least-privilege permissions.
- No `<all_urls>` or broad host access for the prototype.
- Require explicit user activation and supported-site allowlist.
- Read only visible messages in the active supported conversation.
- Never access cookies, passwords, auth tokens, hidden messages or unrelated tabs.
- Validate popup/content-script/service-worker messages.
- Never click Send or submit a message automatically.
- Package executable code locally; do not inject remote scripts.
- Review Chrome Web Store and platform terms before real-site integrations.

## 8. Secure development lifecycle
- Pin dependencies and scan for vulnerabilities.
- Run static analysis, dependency audit and secret scanning in CI.
- Separate development, staging and production.
- Use least-privilege CI/deployment credentials.
- Require code review for auth, authorization, data access and extension permissions.
- Perform pre-release security testing.

## 9. Release gate
- [ ] Cross-user authorization/IDOR tests pass.
- [ ] Session, CSRF and CORS controls reviewed.
- [ ] XSS, SQL injection and request-size tests pass.
- [ ] Rate limits enabled.
- [ ] No secrets in repository, frontend bundle or extension package.
- [ ] Logs contain no raw conversation bodies or credentials.
- [ ] Retention and deletion tested.
- [ ] Extension permission scope reviewed.
- [ ] Prompt-injection tests pass.
- [ ] HTTPS and backup restore tested.

## 10. References for verification
Use OWASP ASVS, OWASP Top 10 and OWASP guidance for LLM applications as review checklists. State the version and controls actually tested in the final report.
