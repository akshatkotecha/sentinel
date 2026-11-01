from .languages import has_tests


# Simple checks that use the syntax tree, so words inside comments don't count.
# Their limit: they show that functions and tests exist, not that they are any good.
def run_quality_checks(code: str, language: str, summary: dict):
    return {
        "has_functions": bool(summary["functions"]),
        "has_tests": has_tests(code, language),
        "too_small": len(code.strip()) < 50,
        "line_count": len(code.split("\n"))
    }
