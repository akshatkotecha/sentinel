import json
import os

from groq import Groq

# Overridable so a faster/cheaper model can be swapped in without a code change.
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")

# Groq intermittently rejects this model's reply as invalid JSON, so one failed
# call shouldn't drop a submission to the neutral fallback score.
LLM_ATTEMPTS = 4


# Sends one request to Groq and returns the parsed JSON answer.
def _ask_llm(client, task, code_summary):

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{
            "role": "user",
            "content": f"""
You are a software reviewer judging whether a submission plausibly addresses a task.

You are given ONLY a structural summary: function signatures, class signatures and
the source length in characters. Function bodies are deliberately withheld. Never
penalise the submission for missing bodies, return statements or implementation
details, because you cannot see them. Judge only whether the names and parameters
fit the task.

Scoring guide:
- 80-100: the signatures clearly address the task
- 40-79: partly related, or the names are too generic to tell
- 0-39: the signatures are unrelated to the task, or there are none

Reply with JSON only:
{{
  "correctness_score": number between 0-100,
  "missing_components": [],
  "reason": "short explanation"
}}

TASK: {task.get("title")}
EXPECTED OUTPUTS (what the code should produce when run, NOT required function names): {task.get("expected_outputs")}
LANGUAGE: {code_summary['language']}
FUNCTIONS: {code_summary['functions']}
CLASSES: {code_summary['classes']}
SOURCE LENGTH: {code_summary['length']} characters
"""
        }],
        # temperature=0 makes answers as repeatable as possible, and response_format
        # asks the model for valid JSON that the code can read.
        temperature=0,
        response_format={"type": "json_object"},
    )

    return json.loads(response.choices[0].message.content)


# Tries several times. If every attempt fails, it returns a neutral score of 60,
# so an outage at Groq doesn't stop the app or give the user a zero.
def verify_code_with_llm(task, code_summary, api_key):

    for _ in range(LLM_ATTEMPTS):
        try:
            return _ask_llm(Groq(api_key=api_key), task, code_summary)

        except Exception as e:
            print("LLM ERROR:", e)

    return {
        "correctness_score": 60,
        "missing_components": [],
        "reason": "LLM unavailable - fallback mode"
    }
