import json
import os

from groq import Groq

# Overridable so a faster/cheaper model can be swapped in without a code change.
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")


def verify_code_with_llm(task, code_summary, api_key):

    try:
        client = Groq(api_key=api_key)

        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{
                "role": "user",
                "content": f"""
You are a strict software code evaluator.

Evaluate this code summary against the task and reply with JSON only:
{{
  "correctness_score": number between 0-100,
  "missing_components": [],
  "reason": "short explanation"
}}

TASK: {task.get("title")}
EXPECTED: {task.get("expected_outputs")}
FUNCTIONS: {code_summary['functions']}
CLASSES: {code_summary['classes']}
"""
            }],
            temperature=0.2,
            response_format={"type": "json_object"},
        )

        return json.loads(response.choices[0].message.content)

    except Exception as e:
        print("LLM ERROR:", e)

        return {
            "correctness_score": 60,
            "missing_components": [],
            "reason": "LLM unavailable - fallback mode"
        }
