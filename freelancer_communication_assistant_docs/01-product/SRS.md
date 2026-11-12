# Software Requirements Specification (SRS)

## 1. System
A responsive web application with API, database and AI services. A browser extension may be delivered separately later.

## 2. Functional requirements
| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Register, sign in, sign out and reset password | Must |
| FR-02 | Submit message and optional preceding context | Must |
| FR-03 | Validate input size, type and schema | Must |
| FR-04 | Predict intent and tone | Must |
| FR-05 | Identify possible FTA and face concern | Must |
| FR-06 | Represent P/D/R context, including unknown | Must |
| FR-07 | Recommend strategy and rationale | Must |
| FR-08 | Generate editable response draft | Must |
| FR-09 | Copy, edit, regenerate, save and delete drafts | Must |
| FR-10 | View and delete analysis history | Should |
| FR-11 | Manage templates | Should |
| FR-12 | Export/delete account data | Should |
| FR-13 | Optional extension reads active supported conversation only after user action | Later |
| FR-14 | Extension inserts only after explicit action; never sends | Later |

## 3. Non-functional requirements
- Security: HTTPS, authorization, secure secrets, validation and rate limits.
- Privacy: minimization, consent, retention and deletion.
- Performance: prototype target p95 under 8 seconds for analysis, excluding slow external providers.
- Availability: graceful degradation when model provider is unavailable.
- Accessibility: keyboard support, labels, focus visibility and contrast.
- Maintainability: modular frontend, API, model and strategy engine.
- Explainability: show factors used and identify unknowns.
- Portability: no local GPU requirement for web runtime.

## 4. Input constraints
English MVP; configurable character limits; user text is untrusted; HTML is safely rendered as text; server validation is authoritative.

## 5. Analysis response
`intent`, `tone`, `fta`, `face_concern`, `context_factors`, `strategy`, `rationale`, `draft`, `limitations`, `model_version`.

## 6. Verification
Each Must requirement must map to one or more tests in `07-engineering/TEST_PLAN.md`.
