# Deployment Guide

## Environments
Local development, staging and production/demo. Use separate databases, keys and provider credentials.

## Environment variable names
```env
APP_ENV=development
APP_SECRET_KEY=use-a-secret-manager
DATABASE_URL=postgresql://...
ALLOWED_ORIGINS=http://localhost:5173
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_SAMESITE=lax
AI_PROVIDER=
AI_API_KEY=
AI_MODEL=
```
Do not commit actual values. Production requires HTTPS and secure cookie settings.

## Steps
Run tests/scans → build frontend → apply reviewed migrations → deploy API with health checks → deploy frontend over HTTPS → configure CORS/CSP/cookies/rate limits → verify login/analysis/deletion/monitoring → test rollback.

Database must not be publicly exposed. Backups must be encrypted and access controlled.
