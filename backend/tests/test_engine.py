"""Unit tests for the analysis engine and request schemas.

Covers TEST_PLAN.md "Unit": input validation, P/D/R unknown handling,
strategy rules, schema validation — plus the golden-set evaluation
(05-ai-ml/MODEL_EVALUATION.md: report agreement, test that unknown P/D/R
values are not silently guessed).
"""

from __future__ import annotations

import json
import os

import pytest
from pydantic import ValidationError

from app.schemas import AnalysisCreateRequest, ContextFactors
from app.services.analysis_engine import (
    analyze,
    evaluate_examples,
    extract_facts,
)


# ---------------------------------------------------------------- validation


def test_message_validation_empty_and_too_long(client):
    from tests.conftest import auth_headers, make_user

    user = make_user(client)
    headers = auth_headers(user["token"])
    # Empty message -> 422.
    resp = client.post(
        "/api/v1/analyses",
        json={"message": "", "goal": "set_boundary"},
        headers=headers,
    )
    assert resp.status_code == 422
    # 2001 chars -> 422, and the raw text must NOT leak into the error.
    long_message = "x" * 2001
    resp = client.post(
        "/api/v1/analyses",
        json={"message": long_message, "goal": "set_boundary"},
        headers=headers,
    )
    assert resp.status_code == 422
    assert long_message not in resp.text
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_bad_goal_rejected():
    with pytest.raises(ValidationError):
        AnalysisCreateRequest(message="hello", goal="fly_to_the_moon")


def test_bad_pdr_level_rejected():
    with pytest.raises(ValidationError):
        ContextFactors(power="very_high")


def test_schema_accepts_api_spec_example():
    req = AnalysisCreateRequest.model_validate(
        {
            "message": "Could you also complete these extra revisions today?",
            "conversation_context": [],
            "goal": "set_boundary",
            "context": {
                "power": "unknown",
                "social_distance": "unknown",
                "imposition": "medium",
            },
        }
    )
    assert req.goal.value == "set_boundary"
    assert req.context.imposition == "medium"


# ---------------------------------------------------------------- P/D/R unknown


def test_pdr_unknown_stays_unknown():
    result = analyze(
        "Could you also complete these extra revisions today?",
        "set_boundary",
        {},
    )
    assert result["context_factors"] == {
        "power": "unknown",
        "social_distance": "unknown",
        "imposition": "unknown",
    }
    # The engine must say so, not guess.
    assert any("incomplete" in lim.lower() for lim in result["limitations"])
    # And it must not silently label the relationship as close.
    assert result["strategy"]["label"] == "negative_politeness"


def test_pdr_supplied_is_preserved():
    result = analyze(
        "Please send the files.",
        "clarify_requirements",
        {"power": "low", "social_distance": "low", "imposition": "low"},
    )
    assert result["context_factors"]["power"] == "low"
    assert result["context_factors"]["social_distance"] == "low"
    assert result["context_factors"]["imposition"] == "low"


# ---------------------------------------------------------------- strategy rules


@pytest.mark.parametrize(
    "message,goal,context,expected_strategy",
    [
        # R1: criticism + high imposition + high distance -> avoidance.
        (
            "Your last message said the work was poor quality, but I've followed every spec.",
            "respond_to_criticism",
            {"power": "unknown", "social_distance": "high", "imposition": "high"},
            "avoidance",
        ),
        # R1: criticism + high imposition, closer relationship -> off_record.
        (
            "You mentioned the design was wrong, but I'm not sure what's wrong with it.",
            "respond_to_criticism",
            {"power": "unknown", "social_distance": "medium", "imposition": "high"},
            "off_record",
        ),
        # R1: disagreement + medium imposition -> positive_politeness.
        (
            "I disagree with the last feedback — the design follows the brief we agreed on.",
            "resolve_disagreement",
            {"power": "unknown", "social_distance": "medium", "imposition": "medium"},
            "positive_politeness",
        ),
        # R2: payment pressure -> negative_politeness.
        (
            "Hi, I wanted to check in on invoice #1048 — it has been overdue for two weeks.",
            "request_payment",
            {"power": "unknown", "social_distance": "medium", "imposition": "high"},
            "negative_politeness",
        ),
        # R2: deadline pressure -> negative_politeness.
        (
            "Could we move the deadline to Friday? I need a bit more time.",
            "negotiate_deadline",
            {"power": "unknown", "social_distance": "medium", "imposition": "medium"},
            "negative_politeness",
        ),
        # R4: low imposition + low distance -> bald_on_record.
        (
            "I can't take on the extra pages — my week is already full.",
            "set_boundary",
            {"power": "unknown", "social_distance": "low", "imposition": "low"},
            "bald_on_record",
        ),
        # R5: clarifying with unknown imposition -> bald_on_record.
        (
            "I'm not sure I understood the requirements — could you clarify?",
            "clarify_requirements",
            {"power": "unknown", "social_distance": "unknown", "imposition": "unknown"},
            "bald_on_record",
        ),
        # R3: high imposition + unknown distance -> negative_politeness.
        (
            "The extra revisions are outside the agreed scope, so I'd like to treat them as a separate task.",
            "set_boundary",
            {"power": "unknown", "social_distance": "unknown", "imposition": "high"},
            "negative_politeness",
        ),
    ],
)
def test_strategy_rules(message, goal, context, expected_strategy):
    result = analyze(message, goal, context)
    assert result["strategy"]["label"] == expected_strategy, (
        f"message={message!r} goal={goal} context={context} "
        f"-> got {result['strategy']['label']}, expected {expected_strategy}"
    )


# ---------------------------------------------------------------- drafts + confidence


def test_draft_reuses_facts_and_invents_nothing():
    result = analyze(
        "Hi, I wanted to check in on invoice #1048 — it has been overdue for two weeks.",
        "request_payment",
        {"power": "unknown", "social_distance": "medium", "imposition": "high"},
    )
    assert "invoice #1048" in result["draft"]
    # No invented recipient name.
    assert "Alex" not in result["draft"]
    assert "Hi," in result["draft"]


def test_draft_reuses_date_fact():
    result = analyze(
        "Could we move the deadline to Friday? I need a bit more time.",
        "negotiate_deadline",
        {"power": "unknown", "social_distance": "medium", "imposition": "medium"},
    )
    assert "Friday" in result["draft"]


def test_confidence_is_honest_when_signal_is_weak():
    # One weak keyword: confidence must stay modest.
    result = analyze(
        "I need the final files today. This has been delayed twice already.",
        "negotiate_deadline",
        {"power": "unknown", "social_distance": "unknown", "imposition": "high"},
    )
    assert result["intent"]["label"] == "negotiate_deadline"
    assert result["intent"]["confidence"] < 0.75


def test_unknown_intent_when_no_signal():
    result = analyze(
        "Hello there.",
        "set_boundary",
        {"power": "unknown", "social_distance": "unknown", "imposition": "unknown"},
    )
    assert result["intent"]["label"] == "unknown"
    assert result["intent"]["confidence"] <= 0.30
    assert result["limitations"], "limitations must never be empty"
    assert any("intent" in lim.lower() for lim in result["limitations"])


def test_limitations_always_present():
    for message, goal in [
        ("Please pay invoice #9.", "request_payment"),
        ("Hello.", "set_boundary"),
        ("Could you clarify the details?", "clarify_requirements"),
    ]:
        result = analyze(message, goal, {})
        assert len(result["limitations"]) >= 1
        assert result["model_version"] == "prototype-0.1"


def test_extract_facts():
    facts = extract_facts("Invoice #1048 for $40 is due Friday.")
    assert facts["invoice"] == "#1048"
    assert facts["amount"] == "$ 40" or facts["amount"] == "$40"
    assert facts["date"] is not None and "Friday" in facts["date"]


# ---------------------------------------------------------------- golden-set evaluation


def test_golden_set_agreement():
    golden_path = os.path.join(
        os.path.dirname(__file__), "..", "eval", "golden.json"
    )
    with open(golden_path, encoding="utf-8") as fh:
        examples = json.load(fh)
    assert len(examples) == 12, "golden set must contain exactly 12 examples"

    report = evaluate_examples(examples)
    # Printed so the run shows the numbers (pytest -s).
    print(
        f"\nGolden-set agreement ({report['total']} examples): "
        f"intent {report['intent_agreement']}, "
        f"strategy {report['strategy_agreement']}"
    )
    for item in report["disagreements"]:
        print(f"  disagree: {item}")

    assert report["intent_correct"] >= 10, (
        f"intent agreement {report['intent_agreement']} is below 10/12: "
        f"{report['disagreements']}"
    )
    assert report["strategy_correct"] >= 10, (
        f"strategy agreement {report['strategy_agreement']} is below 10/12: "
        f"{report['disagreements']}"
    )


# ---------------------------------------------------------------- power in the strategy rules (R3)


def test_power_high_defers_with_medium_imposition():
    # R3: the recipient holds more power and the request is not trivial,
    # so the response defers and hedges. Without the power rule this
    # message would fall through to the R7 safe default (same label, but
    # a different rationale), so assert on the rationale to prove R3 fired.
    result = analyze(
        "The extra revisions are outside the agreed scope, so I'd like to treat them as a separate task.",
        "set_boundary",
        {"power": "high", "social_distance": "low", "imposition": "medium"},
    )
    assert result["strategy"]["label"] == "negative_politeness"
    assert "power" in result["strategy"]["rationale"].lower()


def test_power_unknown_does_not_trigger_deference():
    # Same message, power unknown: the power rule must not fire, and the
    # strategy comes from the other rules (here the safe default).
    result = analyze(
        "Could we move the deadline to Friday?",
        "negotiate_deadline",
        {"power": "unknown", "social_distance": "low", "imposition": "medium"},
    )
    assert result["strategy"]["label"] == "negative_politeness"


# ---------------------------------------------------------------- tone + directness restyle the draft


def test_draft_tone_changes_greeting():
    friendly = analyze(
        "Hi, I wanted to check in on invoice #1048 — it has been overdue for two weeks.",
        "request_payment",
        {},
        draft_tone="Friendly",
    )
    professional = analyze(
        "Hi, I wanted to check in on invoice #1048 — it has been overdue for two weeks.",
        "request_payment",
        {},
        draft_tone="Professional",
    )
    assert friendly["draft"].startswith("Hi there,")
    assert professional["draft"].startswith("Hello,")
    # Styling never changes the analysis itself.
    assert friendly["intent"] == professional["intent"]
    assert friendly["strategy"] == professional["strategy"]


def test_draft_directness_changes_hedging():
    direct = analyze(
        "Could we move the deadline to Friday? I need a bit more time.",
        "negotiate_deadline",
        {},
        draft_directness="direct",
    )
    gentle = analyze(
        "Could we move the deadline to Friday? I need a bit more time.",
        "negotiate_deadline",
        {},
        draft_directness="gentle",
    )
    assert "Would it be possible" not in direct["draft"]
    assert direct["draft"].rstrip().endswith("Please let me know.")
    assert gentle["draft"].rstrip().endswith("Whenever you have a moment.")


def test_payment_draft_invents_nothing_and_closes_on_payment():
    # Walkthrough defect (live site, commit 192e1d87): for a payment
    # chase with no "overdue" in the input, the draft said the invoice
    # was "now overdue" and closed with a scheduling line ("what works
    # for you"), which fits a meeting request, not a payment chase.
    # The draft must reuse only extracted facts and close on the goal.
    result = analyze(
        "Hi, I still haven't received the payment for invoice #1048. "
        "Could you please let me know when it will be sent?",
        "request_payment",
        {},
    )
    assert result["intent"]["label"] == "request_payment"
    assert "#1048" in result["draft"]
    assert "overdue" not in result["draft"].lower()
    assert result["draft"].rstrip().endswith("once the payment is on its way.")


def test_invalid_tone_or_directness_raises():
    with pytest.raises(ValueError):
        analyze("Please pay invoice #1.", "request_payment", {}, draft_tone="Sarcastic")
    with pytest.raises(ValueError):
        analyze(
            "Please pay invoice #1.",
            "request_payment",
            {},
            draft_directness="aggressive",
        )
