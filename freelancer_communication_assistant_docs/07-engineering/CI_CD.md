# CI/CD Plan

## Pull request checks
- Install dependencies from lockfiles.
- Format/lint and type-check.
- Run unit and integration tests.
- Run dependency vulnerability scan.
- Run secret scan.
- Build frontend and backend package.
- Require review for auth, data access and extension permissions.

## Deployment
Use separate dev/staging/prod environments and secrets. Deploy only from protected branches/tags. Apply reviewed DB migrations. Run health checks and smoke tests. Keep rollback artifacts.

## Secrets
CI secrets must be scoped to the environment and least privilege. Never echo secrets in logs.
