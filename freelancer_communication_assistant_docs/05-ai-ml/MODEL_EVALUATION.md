# Model Evaluation Plan

## Classifiers
Report per-class precision, recall, F1, macro-F1, weighted-F1, confusion matrix and support. Use held-out test data; avoid conversation/source leakage.

## Strategy engine
Compare outputs with expert/annotator labels. Report agreement and inspect disagreement cases. Test that unknown P/D/R values are not silently guessed.

## Generated text
Blinded human ratings: goal preservation, context relevance, politeness appropriateness, clarity, professionalism, boundary preservation, unsupported facts and harmful language.

## Technical
API latency/error rate, model inference time/memory, extension capture accuracy on demo site, cross-user access tests and no-auto-send verification.

## Reporting
Document data composition, label definitions, model version, baseline comparisons, limitations and confidence calibration if scores are displayed.
