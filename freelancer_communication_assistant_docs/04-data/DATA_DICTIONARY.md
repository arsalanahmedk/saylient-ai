# Data Dictionary

Conceptual schema; finalize exact types and constraints in migrations.

## User
`id` UUID; `email` unique normalized; `password_hash` nullable for external identity; `display_name`; `status`; `created_at`; `updated_at`.

## Analysis
`id`; `user_id`; `input_text`; optional `context_text`; `goal`; `context_factors`; `intent_label`; `tone_label`; `fta_label`; `face_concern`; `strategy_label`; `rationale`; nullable calibrated `confidence`; `model_version`; `created_at`.

## Draft
`id`; `analysis_id`; `user_id`; `draft_text`; `tone_setting`; `directness_setting`; timestamps.

## Template
`id`; `user_id`; `title`; `category`; `body`; timestamps.

## SecurityEvent
`id`; nullable actor ID; `event_type`; `result`; timestamp; `request_id`. Never store raw messages, passwords or tokens.

## Rules
Use UTC timestamps, foreign keys, owner indexes and deliberate deletion behavior. UUIDs do not replace authorization checks.
