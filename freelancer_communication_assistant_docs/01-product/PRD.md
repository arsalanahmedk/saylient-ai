# Product Requirements Document (PRD)

**Product:** Freelancer–Client Communication Assistant  
**Version:** 1.0 | **Status:** Proposed FYP baseline

## 1. Problem
Freelancers regularly need to handle scope changes, delayed payments, deadline negotiations, criticism, clarification requests and disagreements. Generic writing tools may rewrite text but may not explicitly analyze the relationship context and politeness strategy.

## 2. Vision
A context-aware assistant grounded in Brown and Levinson's Politeness Theory (1987) that analyzes a message, explains possible face concerns and recommends an editable professional response.

## 3. Users
- Freelancers and independent contractors.
- Students/researchers evaluating the prototype.
- Project supervisor/evaluators.

## 4. Goals
1. Analyze a message and optional preceding conversation.
2. Classify communication intent and tone.
3. Identify a possible Face-Threatening Act (FTA) and face concern.
4. consider Power (P), Social Distance (D) and Ranking of Imposition (R), marking unknown factors as unknown.
5. Recommend a strategy and explain why.
6. Generate a draft that preserves the user's goal, facts and boundaries.
7. Let users edit, copy, save and delete drafts.

## 5. Non-goals for MVP
- Autonomous sending or replying.
- Claiming to know a recipient's actual emotions or intent.
- Legal, HR, therapeutic or crisis advice.
- Monitoring all browser tabs or hidden messages.
- Unapproved scraping or integrations with marketplaces.
- Multilingual support or voice transcription.

## 6. MVP features
- Authentication and account settings.
- Dashboard.
- Message analysis form with optional conversation context.
- User-selected communication goal and context.
- Analysis result: intent, tone, possible FTA, positive/negative face concern, P/D/R, strategy, rationale and limitations.
- Editable draft with tone/directness controls.
- Copy, regenerate, save and delete.
- History and saved templates.
- Politeness Theory learning page.
- Privacy, export and account deletion controls where feasible.

## 7. Success measures
- Classifier macro-F1 and per-class precision/recall.
- Annotator agreement for FTA/face/strategy labels.
- Human ratings for goal preservation, relevance, clarity, appropriateness and boundary preservation.
- Task completion/usability.
- No automatic sending and no unauthorized data collection.

## 8. Acceptance criteria
- User can submit a message and receive structured analysis.
- Unknown context is explicitly shown as unknown.
- Strategy includes a rationale and limitations.
- Draft is editable and never sent automatically.
- User can delete saved content.
- All resource endpoints enforce user ownership.
- Sensitive message bodies are excluded from logs.
- Simulated results are clearly marked as demo data.

## 9. Constraints and risks
Politeness is context- and culture-dependent; P/D/R can be subjective; datasets may be small or imbalanced; LLMs can hallucinate or weaken boundaries; external platform terms may restrict integrations.
