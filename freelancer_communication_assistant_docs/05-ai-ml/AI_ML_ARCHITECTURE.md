# AI/ML Architecture

## Pipeline
Input validation → normalization/optional PII masking → intent classification → tone classification → possible FTA/face prediction → assemble known P/D/R context → strategy engine → draft generation → output validation → response.

## Component responsibilities
- Classifier predicts labels and evaluated confidence.
- Strategy engine applies documented rules based on Brown & Levinson (1987) and project annotation policy.
- LLM drafts text from validated analysis, user's goal and constraints; it must not invent facts or override boundaries.

## Strategy set
Bald on Record; Positive Politeness; Negative Politeness; Off Record; Avoidance of FTA. Define operational labels and handling of mixed strategies before annotation.

## Model progression
Baseline TF-IDF + Logistic Regression/linear SVM; compact transformer such as DistilBERT only if dataset size and quality justify it; replaceable LLM provider for drafting. Do not train a large LLM from scratch.

## Output contract
```json
{
  "intent": {"label": "set_boundary", "confidence": null},
  "tone": {"label": "frustrated", "confidence": null},
  "fta": {"detected": true, "description": "Potential disagreement or refusal"},
  "face_concern": ["negative_face"],
  "context_factors": {"power": "unknown", "social_distance": "unknown", "imposition": "medium"},
  "strategy": {"label": "negative_politeness", "rationale": "Reason based on provided context"},
  "draft": "Editable suggested message",
  "limitations": ["Relationship context is incomplete"],
  "model_version": "prototype-0.1"
}
```

## Guardrails
Preserve user facts, goal and boundaries. Do not infer protected traits. Do not claim to know recipient's true intent/emotions. Expose uncertainty.
