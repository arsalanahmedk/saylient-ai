# Backend Engineering Guide

- Python FastAPI with typed request/response schemas.
- Environment-based configuration validated at startup.
- Commit `.env.example`, never actual `.env`.
- Use SQLAlchemy and Alembic migrations or an equivalent reviewed stack.
- Keep route handlers thin; put logic in services.
- Use parameterized ORM operations and enforce ownership.
- Add rate limits, request IDs, redacted structured logs and bounded timeouts.
- Separate classifier/generator provider adapters from business logic.
- Never log raw message bodies or secrets.
