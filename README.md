# SNOW — Your AI Interviewer

Django + Web Speech API app that reads a candidate's resume, generates
interview questions with an LLM (via Groq's free, OpenAI-compatible API),
conducts a fully voice-driven interview in the browser, and scores the
transcript when it's done.

## Project layout

```
interview_project/
├── interview_project/       # Django project (settings, urls, wsgi)
├── interviewer/              # App: models, services (PDF + LLM), views, urls
├── templates/index.html      # Single-page UI
├── static/js/app.js          # State machine + Web Speech API logic
├── static/css/style.css
├── requirements.txt
├── Procfile                  # Railway/Heroku-style start command
├── vercel.json / build.sh    # Vercel config (not recommended — see below)
└── .env.example
```

## 1. Run locally

```bash
cd interview_project
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# then edit .env and set GROQ_API_KEY=gsk_...
# get a free key at https://console.groq.com/keys

python manage.py migrate
python manage.py createsuperuser   # optional, for /admin/
python manage.py runserver
```

Open `http://localhost:8000` in **Chrome or Edge** (best Web Speech API
support). Safari works but is stricter about mic permissions and needs HTTPS
outside of localhost.

## 2. How it works end to end

1. **Page load**: SNOW speaks an intro (fixed line → random greeting → resume
   prompt), then reveals the name + resume upload form.
2. **Upload** a PDF resume → `POST /api/upload-resume/` extracts text with
   `pdfplumber`, sends it to the LLM, and stores the generated questions on a
   new `CandidateSession`.
3. **Mic check**: the browser speaks "Start now", listens with
   `SpeechRecognition`, and matches it against a regex to confirm the mic
   works before the interview begins.
4. **Interview loop**: for each question the AI speaks it
   (`SpeechSynthesisUtterance`), waits for `utterance.onend`, then starts
   listening (continuous recognition with a configurable silence timeout so
   brief pauses don't cut the answer short). After capturing the answer it
   speaks a random transition line before moving on.
5. **Submit**: `POST /api/submit-interview/` saves all Q&A pairs, sends the
   transcript to the LLM for scoring, and returns the evaluation.
6. **Results**: `GET /api/session-results/<id>/` returns the same data if you
   want to reload the report later.

## 3. Where things are stored

All Q&A data lives in the Django database (SQLite by default, Postgres if
`DATABASE_URL` is set):

- `interviewer_candidatesession` — one row per interview: resume path,
  extracted resume text, candidate name, and final score/feedback.
- `interviewer_interviewquestion` — one row per question, linked by
  `session_id`, with `question_text` and `answer_text`.

Uploaded PDFs sit on disk under `media/resumes/` (or the mounted volume path
on Railway — see below). Browse everything via Django admin at `/admin/`
after running `python manage.py createsuperuser`.

## 4. Deploying to Railway (recommended)

Railway gives you a persistent filesystem, so SQLite + local file uploads
work exactly like they do locally — no separate managed database required.

1. Push this project to a GitHub repo.
2. On https://railway.app → New Project → Deploy from GitHub repo.
3. Set these environment variables in the Railway dashboard:
   ```
   DJANGO_SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_urlsafe(50))">
   DJANGO_DEBUG=False
   DJANGO_ALLOWED_HOSTS=<your-app>.up.railway.app
   GROQ_API_KEY=gsk_your_key_here
   GROQ_MODEL=openai/gpt-oss-120b
   ANON_THROTTLE_RATE=10/hour
   ```
   Leave `DATABASE_URL` unset to keep using SQLite.
4. (Recommended) Attach a persistent volume: Service → Settings → Volumes →
   mount path `/app/data`. `settings.py` already reads
   `RAILWAY_VOLUME_MOUNT_PATH` automatically and points the database and
   `media/` there when it's set — without a volume, uploads and the DB reset
   on every redeploy (fine for a quick demo, not for real use).
5. Railway auto-detects Python and runs `Procfile`'s `web:` command, which
   migrates, collects static files, and starts `gunicorn` on boot.
6. Once deployed, Railway gives you a public URL automatically. If you also
   want CSRF to trust it explicitly, set:
   ```
   DJANGO_CSRF_TRUSTED_ORIGINS=https://<your-app>.up.railway.app
   ```

### Rate limiting note

`/api/upload-resume/` and `/api/submit-interview/` are open, unauthenticated
endpoints (anyone with the URL can call them), and each call burns LLM quota.
`ANON_THROTTLE_RATE` (default `10/hour` per IP) is enforced globally via DRF's
`AnonRateThrottle` — raise or lower it in the environment variables above
depending on expected traffic.

## 5. Deploying to Vercel (not recommended for this app)

Vercel's Python runtime is serverless with a **read-only, ephemeral**
filesystem per request. That breaks two things here:

- SQLite won't persist between invocations — you'd need a managed Postgres
  instance (Neon, Supabase, Vercel Postgres) via `DATABASE_URL`.
- Uploaded resumes won't persist on local disk — you'd need S3-compatible
  storage via `django-storages` instead of local `MEDIA_ROOT`.

`vercel.json` and `build.sh` are still included if you want to go this
route anyway, but Railway (or Render/Fly.io) avoids both problems with no
extra services required.

## 6. Swapping models or providers

`interviewer/services.py` isolates all LLM calls behind `_call_llm` and
points at Groq's OpenAI-compatible endpoint (`GROQ_BASE_URL` in
`settings.py`). To use a different Groq model, just change `GROQ_MODEL` in
your environment — no code changes needed. To switch to OpenAI directly or
Gemini, only `get_client()` and `_call_llm` need to change; the JSON
in/JSON out contract stays identical.

## Notes

- Question generation and evaluation both request strict JSON from the LLM
  and parse it — if the model ever wraps the JSON in prose, `services.py`
  strips markdown fences before parsing.
- The mic-check trigger phrase is intentionally simple ("start now") and
  matched case-insensitively so minor Web Speech mis-transcriptions don't
  cause false negatives.
- **Never commit a real `.env`.** It's already in `.gitignore`. If a real
  API key ever ends up in `.env.example` or any tracked file, treat it as
  compromised and rotate it immediately at the provider's dashboard.
