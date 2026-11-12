# Risk Register

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---:|---:|---|---|
| Small/imbalanced dataset | Medium | High | Pilot, annotation QA, report limitations | AI/ML |
| Inconsistent strategy labels | Medium | High | Handbook, double annotation, adjudication | AI/ML |
| LLM hallucination | High | High | Schema/output checks, preserve facts, user review | AI/ML |
| Unauthorized data access | Medium | Critical | Ownership checks, IDOR tests, least privilege | Backend |
| Secret leakage | Medium | High | Secret manager, scans, rotation | Backend |
| Scope expansion | High | Medium | MVP acceptance criteria and change control | All |
| Platform blocks extension | Medium | Medium | Demo adapter first; platform review | Frontend |
| Free GPU unavailable | Medium | Medium | CPU baseline, hosted inference, compact models | AI/ML |
