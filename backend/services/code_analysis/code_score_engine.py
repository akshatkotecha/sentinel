import os
from .syntax_checker import check_python_syntax
from .quality_checker import run_quality_checks
from .code_summarizer import summarize_code
from .llm_code_verifier import verify_code_with_llm

def compute_quality_score(quality_results):
    score = 0

    if quality_results["has_functions"]:
        score += 40

    if not quality_results["too_small"]:
        score += 30

    if quality_results["has_tests"]:
        score += 30

    return score


def analyze_code_for_task(task, code: str):

    syntax_ok, error = check_python_syntax(code)
    syntax_score = 100 if syntax_ok else 0

    quality_results = run_quality_checks(code)
    quality_score = compute_quality_score(quality_results)

    code_summary = summarize_code(code)

    api_key = os.getenv("GROQ_API_KEY")
    llm_result = verify_code_with_llm(task, code_summary, api_key)
    llm_score = llm_result["correctness_score"]

    final_score = (
        0.2 * syntax_score +
        0.3 * quality_score +
        0.5 * llm_score
    )

    return {
        "syntax_ok": syntax_ok,
        "syntax_error": error,
        "quality": quality_results,
        "summary": code_summary,
        "llm_result": llm_result,
        "final_score": final_score
    }
