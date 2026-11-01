import ast

from .languages import first_error, parse


# None of these checks run the code, so they are safe on untrusted code.
# Python uses its own stricter parser, and the others use tree-sitter.
# Returns (True, None) or (False, the error message).
def check_syntax(code: str, language: str):
    if language == "python":
        try:
            ast.parse(code)
            return True, None
        except SyntaxError as e:
            return False, str(e)

    error = first_error(parse(code, language))
    return error is None, error
