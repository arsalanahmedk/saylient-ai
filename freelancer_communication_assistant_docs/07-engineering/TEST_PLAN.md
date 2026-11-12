# Test Plan

## Unit
Input validation; normalization; P/D/R unknown handling; strategy rules; schema validation; ownership helpers.

## Integration
Register/login/logout; create analysis; save draft; list/read/delete own data; model timeout/failure; migrations and deletion.

## Security
IDOR/cross-user access; SQL injection; XSS; CSRF; CORS; rate limits; oversized payloads; prompt injection; secret scan; dependency audit; extension permission and no-auto-send tests.

## UX
Keyboard navigation; responsive layouts; loading/error/empty states; copy/edit/save/delete; screen-reader labels.

## Release gate
Critical tests pass; high risks fixed or formally accepted; restore and rollback tested; no known cross-user exposure.
