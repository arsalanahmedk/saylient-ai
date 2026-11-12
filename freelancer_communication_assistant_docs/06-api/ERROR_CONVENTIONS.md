# API Error Conventions

Use a consistent envelope:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please review the submitted fields.",
    "request_id": "opaque-id",
    "details": []
  }
}
```

Status codes: 400 malformed request; 401 unauthenticated; 403 forbidden; 404 absent/not owned; 409 conflict; 413 too large; 422 validation; 429 rate limited; 500 internal; 502/503 upstream provider unavailable.

Never include stack traces, SQL, credentials or sensitive input text in client-facing errors.
