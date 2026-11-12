# Release Checklist

## Product
- [ ] MVP requirements implemented and demo labels accurate.
- [ ] Known limitations documented.
- [ ] User-facing privacy notice and terms reviewed.

## Security
- [ ] HTTPS and secure production cookies.
- [ ] CORS/CSP/CSRF configured as applicable.
- [ ] Ownership tests pass.
- [ ] Rate limits and input limits enabled.
- [ ] No secrets in repository/build.
- [ ] Logs redacted.
- [ ] Backup restore tested.
- [ ] Security issues triaged.

## AI
- [ ] Model/version identified.
- [ ] Evaluation on held-out data completed.
- [ ] Unknown context remains unknown.
- [ ] Prompt-injection tests completed.
- [ ] Generated content is editable and never auto-sent.

## Operations
- [ ] Health checks and error monitoring.
- [ ] Rollback plan.
- [ ] Incident contact/owner identified.
