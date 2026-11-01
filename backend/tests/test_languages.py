# Checks language detection, syntax checks, signatures and test detection.
import pytest

from services.code_analysis.code_summarizer import summarize_code
from services.code_analysis.languages import UnsupportedLanguage, detect_language, has_tests, language_for_path, resolve_language
from services.code_analysis.syntax_checker import check_syntax

SAMPLES = {
    "python": "class Auth:\n    def login(self, user):\n        return user\n\ndef logout(user):\n    return None\n",
    "javascript": "class Auth {\n  login(user) { return user; }\n}\nconst logout = (user) => null;\nfunction reset(user) {\n  return user;\n}\n",
    "typescript": "interface User {\n  name: string;\n}\nclass Auth {\n  login(user: User): User { return user; }\n}\nfunction logout(user: User): void {}\n",
    "java": "public class Auth {\n  public String login(String user) {\n    return user;\n  }\n}\n",
    "cpp": "#include <string>\nclass Auth {\n public:\n  std::string login(std::string user) { return user; }\n};\nint logout(int id) {\n  return id;\n}\n",
    "go": "package auth\n\ntype Auth struct {\n\tName string\n}\n\nfunc (a Auth) Login(user string) string {\n\treturn user\n}\n",
}

BROKEN = {
    "javascript": "function login(user {\n  return user;\n",
    "typescript": "function login(user: string {\n  return user;\n",
    "java": "public class Auth {\n  public String login(String user {\n    return user;\n",
    "cpp": "int login(int id {\n  return id;\n",
    "go": "package auth\n\nfunc Login(user string {\n\treturn user\n",
    "python": "def login(user:\n    return user\n",
}

TESTS = {
    "python": "def test_login():\n    assert True\n",
    "javascript": "test('login works', () => {});\n",
    "typescript": "describe('login', () => {});\n",
    "java": "class AuthTest {\n  @Test\n  void login() {}\n}\n",
    "cpp": "TEST(Auth, Login) {\n  int x = 1;\n}\n",
    "go": "package auth\n\nfunc TestLogin(t *testing.T) {}\n",
}


@pytest.mark.parametrize("language", SAMPLES)
def test_detects_each_language(language):
    assert detect_language(SAMPLES[language]) == language


@pytest.mark.parametrize("language", SAMPLES)
def test_valid_code_passes_syntax(language):
    assert check_syntax(SAMPLES[language], language) == (True, None)


@pytest.mark.parametrize("language", BROKEN)
def test_broken_code_fails_syntax(language):
    ok, error = check_syntax(BROKEN[language], language)
    assert ok is False and error


@pytest.mark.parametrize("language", SAMPLES)
def test_summary_finds_functions_and_classes(language):
    summary = summarize_code(SAMPLES[language], language)
    assert summary["functions"] and summary["classes"]


@pytest.mark.parametrize("language", SAMPLES)
def test_summary_never_contains_function_bodies(language):
    summary = summarize_code(SAMPLES[language], language)
    assert "return" not in " ".join(summary["functions"] + summary["classes"])


def test_anonymous_callbacks_are_not_counted_as_functions():
    assert summarize_code("items.map((x) => x + 1);\n", "javascript")["functions"] == []


@pytest.mark.parametrize("language", TESTS)
def test_finds_tests_in_each_language(language):
    assert has_tests(TESTS[language], language)


def test_words_in_comments_are_not_tests():
    assert not has_tests("# def test_login():\nx = 1\n", "python")
    assert not has_tests("// test('login')\nconst x = 1;\n", "javascript")


def test_untyped_javascript_is_not_mistaken_for_cpp():
    assert detect_language("function renderButton(color) {\n  return color;\n}\n") == "javascript"


def test_regex_test_calls_are_not_tests():
    assert not has_tests("const ok = /abc/.test(name);\n", "javascript")


# Each has one typo, a missing bracket, in otherwise complete code.
TYPOS = {
    "python": "def login(user:\n    return user\n\ndef logout(user):\n    return None\n",
    "javascript": "function login(user, password {\n  return user;\n}\nfunction logout(user) {\n  return null;\n}\n",
    "java": "public class Auth {\n  public String login(String user {\n    return user;\n  }\n}\n",
    "cpp": "#include <string>\nint login(int id {\n  return id;\n}\n",
    "go": "package auth\n\nfunc Login(user string {\n\treturn user\n}\n",
}


@pytest.mark.parametrize("language", TYPOS)
def test_typos_are_still_detected_as_their_language(language):
    assert detect_language(TYPOS[language]) == language


@pytest.mark.parametrize("code", [
    "This is just a normal sentence, and it isn't code at all!\nNeither is this one, sadly.\n",
    "<!doctype html>\n<html>\n<body>\n<h1>Hello there</h1>\n<p>Some text, here.</p>\n</body>\n</html>\n",
    "class Auth\n  def login(user)\n    puts user\n  end\nend\n",
    "<?php\nfunction login($user) {\n  echo $user;\n  return true;\n}\n",
    "use std::collections::HashMap;\n\nfn login(user: &str) -> Result<bool, String> {\n    let mut m: HashMap<&str, i32> = HashMap::new();\n    m.insert(user, 1);\n    match m.get(user) { Some(_) => Ok(true), None => Err(\"no\".into()) }\n}\n",
])
def test_unsupported_input_is_rejected(code):
    with pytest.raises(UnsupportedLanguage):
        detect_language(code)


def test_unknown_language_is_rejected():
    with pytest.raises(UnsupportedLanguage):
        resolve_language("x = 1", "cobol")


def test_chosen_language_skips_detection():
    assert resolve_language("x = 1", "go") == "go"


def test_file_extensions():
    assert language_for_path("src/App.tsx") == "typescript"
    assert language_for_path("Main.JAVA") == "java"
    assert language_for_path("README.md") is None
