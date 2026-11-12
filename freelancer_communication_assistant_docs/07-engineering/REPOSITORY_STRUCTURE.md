# Suggested Repository Structure

```text
project-root/
  frontend/
    src/
      app/
      components/
      pages/
      features/
      services/
      hooks/
      types/
      utils/
      styles/
    public/
    package.json
  backend/
    app/
      api/v1/
      core/
      models/
      schemas/
      repositories/
      services/
      middleware/
      tests/
    migrations/
    requirements.txt
    .env.example
  extension/                 # separate optional Chrome extension
    manifest.json
    src/
    package.json
  docs/
    01-product/
    02-architecture/
    03-ux/
    04-data/
    05-ai-ml/
    06-api/
    07-engineering/
    08-project/
    09-operations/
  .gitignore
  README.md
```

Keep extension build configuration and permissions separate from the website. Never commit `.env`, keys, database dumps or real user conversations.
