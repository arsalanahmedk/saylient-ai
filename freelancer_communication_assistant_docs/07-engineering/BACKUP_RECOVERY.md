# Backup and Recovery

Set realistic RPO/RTO targets with supervisor/owner; do not claim enterprise recovery without evidence.

- Encrypted automated database backups.
- Restricted backup access and retention schedule.
- Separate backup credentials.
- Periodic restore test in non-production.
- Document how deletion propagates to backups and when backup copies expire.

Recovery: declare incident → assign lead → identify affected service and restore point → preserve evidence → restore in isolation → validate integrity → approve cutover → rotate credentials if needed → document lessons.
