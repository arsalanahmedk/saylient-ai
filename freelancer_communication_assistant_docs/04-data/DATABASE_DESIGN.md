# Database Design

## Suggested tables
- `users`
- `sessions` (if server-managed sessions are stored in DB)
- `analyses`
- `analysis_context`
- `drafts`
- `templates`
- `security_events`
- `consent_records` (if optional research/training consent is collected)

## Relationships
- One user has many analyses.
- One analysis has zero or many drafts.
- One user has many templates.
- Security events may reference a user, but should not contain message text.
- Consent records should be versioned and timestamped.

## Indexes
- `users(email)` unique.
- `analyses(user_id, created_at DESC)`.
- `drafts(user_id, updated_at DESC)`.
- `templates(user_id, updated_at DESC)`.

## Integrity and privacy
Enforce foreign keys, ownership at service layer, safe cascade rules, data retention and deletion. Consider whether analyses should be deleted when the owning account is deleted. Backups expire according to documented schedule.
