# Checks the score formula. The LLM is replaced, so these run offline and for free.
from unittest.mock import patch

import pytest

from services.code_analysis import code_score_engine
from services.code_analysis.languages import UnsupportedLanguage

TASK = {"title": "Fix login", "expected_outputs": []}
JS_WITH_TESTS = "function login(user) {\n  return user;\n}\ntest('login works', () => {\n  login('a');\n});\n"


def score(code, llm_score=80, language=None):
    llm = {"correctness_score": llm_score, "missing_components": [], "reason": "stub"}
    with patch.object(code_score_engine, "verify_code_with_llm", return_value=llm):
        return code_score_engine.analyze_code_for_task(TASK, code, language)


def test_weights_are_20_30_50():
    # Syntax 100, quality 100 (functions, size, tests), LLM 80: 20 + 30 + 40.
    assert score(JS_WITH_TESTS)["final_score"] == pytest.approx(90)


def test_javascript_is_no_longer_marked_as_broken():
    result = score(JS_WITH_TESTS)
    assert result["language"] == "javascript"
    assert result["syntax_ok"] is True
    assert result["quality"]["has_functions"] is True


def test_syntax_error_scores_zero_for_syntax_only():
    # Syntax 0, quality 70 (no tests), LLM 80: 0 + 21 + 40.
    code = "public class Auth {\n  public String login(String user) {\n    return user\n  }\n}\n// padding padding padding\n"
    result = score(code, language="java")
    assert result["syntax_ok"] is False
    assert result["final_score"] == pytest.approx(61)


def test_unreadable_input_raises_instead_of_scoring():
    with pytest.raises(UnsupportedLanguage):
        score("This is just a normal sentence, and it isn't code at all!\nNeither is this one, sadly.\n")
