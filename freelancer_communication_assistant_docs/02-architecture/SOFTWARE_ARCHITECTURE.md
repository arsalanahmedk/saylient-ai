# Software Architecture

## Layers
- Presentation: pages, components, forms and state.
- API: route handlers, request/response schemas and auth dependencies.
- Application services: analysis orchestration, draft management and user workflows.
- Domain: labels, P/D/R context, strategy rules and validation.
- Infrastructure: database repositories, model adapters, logging and external providers.

## Dependency direction
Presentation → API → application/domain → infrastructure interfaces. Domain rules should not depend on React, FastAPI or a specific LLM vendor.

## Suggested backend modules
`auth`, `users`, `analyses`, `drafts`, `templates`, `privacy`, `ai`, `security`, `audit`.

## Suggested frontend modules
`auth`, `dashboard`, `assistant`, `analysis`, `history`, `templates`, `theory`, `settings`.

## Replaceability
Use provider interfaces so classifier and generation models can be changed without rewriting API routes or UI.
