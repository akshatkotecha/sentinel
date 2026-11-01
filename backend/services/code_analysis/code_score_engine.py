# THE SCORING PIPELINE: combines the syntax, quality and LLM checks into one score.
import os
from .languages import resolve_language
from .syntax_checker import check_syntax
from .quality_checker import run_quality_checks
from .code_summarizer import summarize_code
from .llm_code_verifier import verify_code_with_llm

# Points out of 100: functions 40, reasonable size 30, tests 30.
def compute_quality_score(quality_results):
    score = 0

    if quality_results["has_functions"]:
        score += 40

    if not quality_results["too_small"]:
        score += 30

    if quality_results["has_tests"]:
        score += 30

    return score


# Main entry point. Runs all the checks and returns the full result.
# With no language given, it is detected. Raises UnsupportedLanguage if it can't be.
def analyze_code_for_task(task, code: str, language=None):

    language = resolve_language(code, language)

    syntax_ok, error = check_syntax(code, language)
    syntax_score = 100 if syntax_ok else 0

    code_summary = summarize_code(code, language)

    quality_results = run_quality_checks(code, language, code_summary)
    quality_score = compute_quality_score(quality_results)

    api_key = os.getenv("GROQ_API_KEY")
    llm_result = verify_code_with_llm(task, code_summary, api_key)
    llm_score = llm_result["correctness_score"]

    # Each part is out of 100, so the final score is too. The LLM has the most weight,
    # but it can't decide the score alone.
    final_score = (
        0.2 * syntax_score +
        0.3 * quality_score +
        0.5 * llm_score
    )

    return {
        "language": language,
        "syntax_ok": syntax_ok,
        "syntax_error": error,
        "quality": quality_results,
        "summary": code_summary,
        "llm_result": llm_result,
        "final_score": final_score
    }
