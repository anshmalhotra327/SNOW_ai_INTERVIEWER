import json
import re
import pdfplumber
from django.conf import settings
from openai import OpenAI

_client = None


def get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.GROQ_BASE_URL)
    return _client


def extract_resume_text(file_path):
    text_chunks = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_chunks.append(page_text)
    return "\n".join(text_chunks).strip()


def _call_llm(system_prompt, user_prompt, temperature=0.6):
    client = get_client()
    response = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.choices[0].message.content


def _extract_json(raw_text):
    cleaned = raw_text.strip()
    cleaned = re.sub(r"^```json\s*|^```\s*|```$", "", cleaned, flags=re.MULTILINE).strip()
    return json.loads(cleaned)


def generate_interview_questions(resume_text):
    system_prompt = (
        "You are a senior technical interviewer. You read resumes and produce "
        "sharp, relevant interview questions. You respond with valid JSON only, "
        "no commentary, no markdown fences. And keep questions short and precise maybe one word"
    )
    user_prompt = f"""
Read this resume and generate exactly 3 interview questions for the candidate.
Mix technical, situational, and experience-based questions grounded in the
resume's specific skills, projects, and roles.

Return JSON in this exact shape:
{{
  "questions": [
    {{"order": 1, "type": "technical|situational|experience", "question": "..."}},
    ...
    {{"order": 3, "type": "...", "question": "..."}}
  ]
}}

Resume:
\"\"\"
{resume_text[:8000]}
\"\"\"
"""
    raw = _call_llm(system_prompt, user_prompt, temperature=0.7)
    data = _extract_json(raw)
    questions = data["questions"]
    if len(questions) != 3:
        questions = (questions + questions)[:3]
        for i, q in enumerate(questions, start=1):
            q["order"] = i
    return questions


def evaluate_interview(candidate_name, qa_pairs):
    system_prompt = (
        "You are a strict but fair technical interview evaluator. You respond "
        "with valid JSON only, no commentary, no markdown fences."
    )
    transcript_block = "\n\n".join(
        f"Q{item['order']}: {item['question']}\nA: {item['answer']}"
        for item in qa_pairs
    )
    user_prompt = f"""
Evaluate this interview transcript for candidate {candidate_name or 'the candidate'}.

Score overall performance from 0 to 100. Identify key strengths, assess
technical accuracy, and write a detailed feedback summary (4-6 sentences)
covering communication, depth of knowledge, and areas to improve.

Return JSON in this exact shape:
{{
  "overall_score": 0,
  "strengths": "...",
  "technical_accuracy": "...",
  "feedback_summary": "..."
}}

Transcript:
\"\"\"
{transcript_block[:12000]}
\"\"\"
"""
    raw = _call_llm(system_prompt, user_prompt, temperature=0.3)
    return _extract_json(raw)


TRIGGER_PATTERN = re.compile(
    r"hi\s*,?\s*i\s*am\s+(?P<name>[a-zA-Z][a-zA-Z\s'.-]{1,60}?)\s+and\s+i\s*am\s+ready\s+to\s+start\s+the\s+interview",
    re.IGNORECASE,
)


def verify_trigger_phrase(spoken_text):
    match = TRIGGER_PATTERN.search(spoken_text or "")
    if not match:
        return None
    name = match.group("name").strip().strip(".").title()
    return name
