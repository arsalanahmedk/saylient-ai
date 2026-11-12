# System Architecture

## Components
1. React + TypeScript web client.
2. FastAPI backend and REST API.
3. Authentication/session service.
4. PostgreSQL database.
5. AI orchestration service.
6. Intent/tone/FTA classifier.
7. Politeness strategy/rule engine.
8. LLM generation adapter.
9. Optional separate Chrome extension.

## Data flow
Browser → HTTPS API → authenticate and authorize → validate and normalize → classify → assemble known context/P-D-R → strategy engine → generate draft → validate output schema/safety → return to user → persist only according to policy.

## Suggested stack
Frontend: React, TypeScript, Vite, Tailwind.  
Backend: Python FastAPI.  
Database: PostgreSQL.  
ORM/migrations: SQLAlchemy and Alembic.  
AI: scikit-learn baseline, compact transformer if justified, replaceable LLM provider.  
Hosting: static frontend + managed API host + managed database.

## Boundaries
- Provider keys exist only on the server.
- Browser never connects directly to database.
- Model provider receives minimum necessary text.
- Extension permissions are isolated and minimal.
- Database is not publicly exposed.

## Failure handling
If classifier fails, return a clear retryable error or documented fallback. If generator fails, return analysis without draft where possible. Never label fallback output as model output.
