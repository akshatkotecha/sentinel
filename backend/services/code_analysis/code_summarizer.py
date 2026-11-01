from .languages import extract_signatures


# Extracts only function and class signatures. This summary is all the LLM sees, so
# the code inside functions is never sent to an outside service. The parser recovers
# from mistakes, so this still works when the code has syntax errors.
def summarize_code(code: str, language: str):
    functions, classes = extract_signatures(code, language)

    return {
        "language": language,
        "functions": functions,
        "classes": classes,
        "length": len(code)
    }
