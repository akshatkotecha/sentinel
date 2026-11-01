# LANGUAGE SUPPORT: turns source code into a syntax tree using tree-sitter.
# tree-sitter only reads the code and never runs it, so untrusted code is safe here.
# To add a language: add its grammar, file extensions, node types and test pattern.
import os
import re

import tree_sitter_cpp
import tree_sitter_go
import tree_sitter_java
import tree_sitter_javascript
import tree_sitter_python
import tree_sitter_typescript
from tree_sitter import Language, Parser

# The tsx grammar also reads plain TypeScript, so one grammar covers both.
GRAMMARS = {
    "python": Language(tree_sitter_python.language()),
    "javascript": Language(tree_sitter_javascript.language()),
    "typescript": Language(tree_sitter_typescript.language_tsx()),
    "java": Language(tree_sitter_java.language()),
    "cpp": Language(tree_sitter_cpp.language()),
    "go": Language(tree_sitter_go.language()),
}

LANGUAGE_NAMES = {
    "python": "Python",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "java": "Java",
    "cpp": "C/C++",
    "go": "Go",
}

EXTENSIONS = {
    ".py": "python",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".java": "java",
    ".c": "cpp", ".h": "cpp", ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp",
    ".go": "go",
}

# Which kinds of tree node count as a function in each language.
FUNCTION_NODES = {
    "python": {"function_definition"},
    "javascript": {"function_declaration", "generator_function_declaration", "method_definition"},
    "typescript": {"function_declaration", "generator_function_declaration", "method_definition"},
    "java": {"method_declaration", "constructor_declaration"},
    "cpp": {"function_definition"},
    "go": {"function_declaration", "method_declaration"},
}

# Which kinds of tree node count as a class or type in each language.
CLASS_NODES = {
    "python": {"class_definition"},
    "javascript": {"class_declaration"},
    "typescript": {"class_declaration", "interface_declaration"},
    "java": {"class_declaration", "interface_declaration", "enum_declaration", "record_declaration"},
    "cpp": {"class_specifier", "struct_specifier"},
    "go": {"type_spec"},
}

# How each language's test code usually looks. Comments are removed before this runs.
TEST_PATTERNS = {
    "python": r"\bdef test_|\bclass Test",
    # The lookbehind skips calls like regex.test(text), which aren't tests.
    "javascript": r"(?<![.\w])(describe|it|test)\s*\(",
    "typescript": r"(?<![.\w])(describe|it|test)\s*\(",
    "java": r"@Test\b",
    "cpp": r"\bTEST(_F)?\s*\(",
    "go": r"\bfunc Test[A-Z_]",
}

# In JavaScript, a function can be stored in a variable: const add = (a, b) => a + b.
# Anonymous callbacks have no useful name, so only these parents count.
_INLINE_FUNCTIONS = {"arrow_function", "function_expression"}
_NAMED_PARENTS = {"variable_declarator", "public_field_definition", "pair"}

# Errors allowed per line before we decide the code isn't in that language.
_MAX_ERROR_RATE = 0.15


class UnsupportedLanguage(ValueError):
    """The code isn't in a language we can read. Routes turn this into a 400."""


def supported_names():
    return ", ".join(LANGUAGE_NAMES.values())


def parse(code, language):
    return Parser(GRAMMARS[language]).parse(code.encode("utf-8"))


# Visits every node in the tree, parents before children.
def walk(node):
    yield node
    for child in node.children:
        yield from walk(child)


# Parsers keep going after a mistake, marking the bad parts as ERROR or MISSING.
def count_errors(tree):
    return sum(1 for node in walk(tree.root_node) if node.type == "ERROR" or node.is_missing)


# The first problem in the code, with a line number people can look for.
def first_error(tree):
    for node in walk(tree.root_node):
        if node.type == "ERROR" or node.is_missing:
            return f"Syntax error near line {node.start_point[0] + 1}"
    return None


# The part of a function or class before its body, so the body is never included.
def _signature(node, code_bytes):
    if node.type == "type_spec":
        return "type " + code_bytes[node.child_by_field_name("name").start_byte:node.child_by_field_name("name").end_byte].decode()

    start = node.parent.start_byte if node.type in _INLINE_FUNCTIONS else node.start_byte
    body = node.child_by_field_name("body")
    end = body.start_byte if body else node.end_byte
    return " ".join(code_bytes[start:end].decode("utf-8", errors="replace").split())


# Finds the signatures of every function and class in the code.
def extract_signatures(code, language, tree=None):
    tree = tree or parse(code, language)
    code_bytes = code.encode("utf-8")
    functions = []
    classes = []

    for node in walk(tree.root_node):
        if node.type in FUNCTION_NODES[language]:
            functions.append(_signature(node, code_bytes))
        elif node.type in _INLINE_FUNCTIONS and language in ("javascript", "typescript"):
            if node.parent is not None and node.parent.type in _NAMED_PARENTS:
                functions.append(_signature(node, code_bytes))
        elif node.type in CLASS_NODES[language]:
            # In C++, `struct Point p;` only uses a struct, so a body is required.
            if language != "cpp" or node.child_by_field_name("body"):
                classes.append(_signature(node, code_bytes))

    return functions, classes


# The code with comments blanked out, so words in comments don't count as code.
def strip_comments(code, language):
    code_bytes = bytearray(code.encode("utf-8"))
    for node in walk(parse(code, language).root_node):
        if "comment" in node.type:
            code_bytes[node.start_byte:node.end_byte] = b" " * (node.end_byte - node.start_byte)
    return code_bytes.decode("utf-8", errors="replace")


def has_tests(code, language):
    return bool(re.search(TEST_PATTERNS[language], strip_comments(code, language)))


# Tries every grammar and picks the one that reads the code with the fewest errors.
# On a tie, the one finding more functions and classes wins, then the earlier one in
# GRAMMARS. Untyped JavaScript also reads as valid C++, so that order matters.
def detect_language(code):
    line_count = max(1, len(code.strip().splitlines()))
    candidates = []

    for language in GRAMMARS:
        tree = parse(code, language)
        functions, classes = extract_signatures(code, language, tree)
        candidates.append((count_errors(tree), -(len(functions) + len(classes)), language))

    errors, found, best = min(candidates, key=lambda c: (c[0], c[1]))

    # A typo in real code leaves few errors and still has a function or class. Other
    # languages and plain text leave many errors, or no recognisable structure.
    too_many_errors = errors > max(1, line_count * _MAX_ERROR_RATE)
    no_structure = errors > 0 and found == 0
    if too_many_errors or no_structure:
        raise UnsupportedLanguage(
            f"Couldn't recognise this language. Supported: {supported_names()}. "
            "If it has many errors, choose its language from the list."
        )
    return best


# Checks a language chosen by the user, or works it out when none was chosen.
def resolve_language(code, language=None):
    if not language or language == "auto":
        return detect_language(code)
    if language not in GRAMMARS:
        raise UnsupportedLanguage(f"'{language}' isn't supported. Supported: {supported_names()}.")
    return language


# Used by the webhook: None means this file type can't be scored.
def language_for_path(path):
    return EXTENSIONS.get(os.path.splitext(path)[1].lower())
