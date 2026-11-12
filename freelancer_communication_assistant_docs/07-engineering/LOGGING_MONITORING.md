# Logging and Monitoring

## Safe log fields
Timestamp, severity, service, environment, request ID, route name, status, duration, safe error code, model/provider version and security events.

## Never log
Passwords, reset tokens, cookies, access tokens, API keys, raw messages, full conversation context or unredacted personal data.

## Metrics
Request count, latency, error rate, provider availability/timeouts, analysis success/failure, rate-limit events, database capacity and backup status.

## Alerts
Repeated authentication abuse, error spikes, provider outage, database capacity and backup failures. Restrict monitoring access.
