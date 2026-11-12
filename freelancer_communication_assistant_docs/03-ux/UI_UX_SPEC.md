# UI/UX Specification

## Visual direction
Modern, premium and calm productivity tool. Initial dark theme:
- Background `#090B12`
- Surface `#101521`
- Card `#151C2B`
- Elevated `#1B2435`
- Primary purple `#8B5CF6`
- Indigo `#6366F1`
- Cyan `#22D3EE`
- Main text `#F8FAFC`
- Secondary text `#94A3B8`
- Border `#293449`
- Success `#22C55E`, warning `#F59E0B`, error `#F87171`

## Screens
Landing, register, login, dashboard, message assistant, analysis result, history, templates, theory/learning, profile, settings/privacy, extension information.

## Analysis result
Show original input; intent and tone; possible FTA; face concern; P/D/R values and unknowns; strategy and rationale; editable draft; copy/regenerate/save/delete; limitations/disclaimer.

## UX requirements
- Distinguish user-supplied context from model predictions.
- Show confidence only if calibrated and evaluated.
- Never rely on color alone.
- Provide loading, empty, success, error and retry states.
- Confirm destructive actions.
- Responsive design and keyboard operation.
- Avoid promises about how a recipient will react.
