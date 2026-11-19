# Pariksha — Competitive Exam Preparation Platform

A platform for preparing for Indian competitive examinations: database-driven exam patterns, a reviewed question bank, and a computer-based test (CBT) engine whose clock is kept on the server.

**Milestone 1 (this release)** covers the core exam loop:

- Authentication with role-based access: student, admin, content editor, question reviewer, mentor
- Exam configuration engine: versioned patterns with a validator and preview
- Syllabus tree and a question bank with an editor → reviewer workflow
- Mock-test builder, the CBT engine, results and analysis
- Practice mode, bookmarks and a student dashboard

The roadmap at the end lists what comes next.

---

## Quick start

Requires **Node.js 22 or newer**. There is no build step.

### 1. Try it instantly (no database)

```bash
npm run demo
```

Open <http://localhost:3000>. Demo mode keeps data in memory (it resets on restart), seeds sample content, and shows one-click demo logins on the login page.

### 2. Run against MongoDB (Atlas or local)

```bash
npm install                    # installs the official mongodb driver
copy .env.example .env         # Windows   (macOS/Linux: cp .env.example .env)
# put your connection string in .env as MONGODB_URI
npm run seed                   # creates indexes and loads exams, syllabus, sample questions, tests
npm start
```

For development, `npm run dev` restarts on file changes. `npm run seed -- --reset` drops the database first (refused when `NODE_ENV=production`).

**Atlas checklist:** under *Network Access*, allow the IP address of the machine running the server. Under *Database Access*, the user needs read/write on the database named in `MONGODB_DB` (default `exam_prep`).

### Windows shortcuts

| File | What it does |
|---|---|
| `run.bat` | Menu to start the app: **demo** (no database), **start** / **dev** (MongoDB from `.env`), **seed**, **reset**, **install**. Also accepts the option directly, e.g. `run.bat demo`. Creates `.env` from the example and installs dependencies when needed, then opens the browser. |
| `test.bat` | Runs the test suite. `test.bat mongo` runs it against the MongoDB in `.env` (temporary database, deleted afterwards); `test.bat all` does both. |
| `push.bat` | Runs the tests, commits everything and pushes to `origin`. First run initialises git and asks for your GitHub repository URL. Usage: `push.bat "commit message"`; add `--skip-tests` to skip testing. Never commits `.env`. |

### Demo accounts (created by the seed)

| Role | Email | Password |
|---|---|---|
| Student | student@examprep.local | Student@12345 |
| Admin | admin@examprep.local | Admin@12345 |
| Content editor | editor@examprep.local | Editor@12345 |
| Question reviewer | reviewer@examprep.local | Reviewer@12345 |
| Mentor | mentor@examprep.local | Mentor@12345 |

**Change or remove these before going live.**

### Tests

```bash
npm test                                  # 33 tests against the in-memory database
set TEST_MONGODB_URI=mongodb+srv://…      # Windows (macOS/Linux: export TEST_MONGODB_URI=…)
npm test                                  # same suite against a real MongoDB, in a throwaway database
```

The suite covers the scoring and pattern engines plus full HTTP flows:

- Answer keys never leak during an attempt
- Stale and replayed saves are ignored
- Concurrent submissions produce one result
- The server decides when time is up, and sections lock
- "Answer any N" limits hold under parallel requests
- Mentor evaluation of descriptive answers
- Permission checks for every role
- Duplicate detection, bulk import and auditing

---

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | — | MongoDB connection string (required unless `DB_DRIVER=memory`) |
| `MONGODB_DB` | `exam_prep` | Database name |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Listen address |
| `NODE_ENV` | — | Set to `production` in production (enables secure cookies) |
| `SECURE_COOKIES` | prod: `true` | Mark session cookies `Secure` (requires HTTPS) |
| `TRUST_PROXY` | `false` | Use `X-Forwarded-For` for client IPs when behind a reverse proxy |
| `SESSION_TTL_HOURS` | `168` | Session lifetime |
| `SAVE_GRACE_MS` | `3000` | Grace window for answer saves already in flight when time runs out |
| `SWEEP_INTERVAL_MS` | `30000` | How often abandoned, expired attempts are finalised |
| `ALLOW_REGISTRATION` | `true` | Allow public sign-up |
| `SHOW_DEMO_ACCOUNTS` | `false` | Show one-click demo logins (always on in demo mode) |
| `DB_DRIVER` | `mongodb` | `memory` runs the in-process stand-in |

---

## Architecture

```
server/
  index.js              start-up, background sweeper, graceful shutdown
  app.js                router wiring, sessions, CSRF, permissions, rate limits, errors
  config.js             .env loader and settings
  db/index.js           MongoDB connection and indexes
  db/memory.js          in-memory stand-in for the subset of the driver API used (tests / demo)
  engine/pattern.js     pattern validation, marking-rule resolution, summaries (pure)
  engine/scoring.js     scoring for every question type (pure)
  engine/selection.js   seeded, difficulty-aware question selection (pure)
  modules/              auth, exams+patterns, syllabus, questions, tests, attempts (CBT),
                        practice, dashboard, admin
  seed/                 exam catalogue, syllabus, patterns, original sample questions
public/                 single-page app in plain ES modules (no build), KaTeX bundled locally
test/                   node:test suites
```

The backend uses only Node built-ins plus the official `mongodb` driver. Every permission is checked on the server: each route declares the permission it needs (`server/lib/rbac.js`), and the UI only hides what the server would refuse anyway.

### Collections

`users`, `sessions`, `categories`, `exams`, `patterns` (pattern versions), `syllabus` (subject → chapter → topic → subtopic), `questions`, `question_reviews`, `mock_tests`, `papers` (frozen snapshots of published tests, including answer keys), `attempts`, `active_attempts` (one open attempt per student per test), `practice_log`, `user_topic_stats`, `user_activity`, `bookmarks`, `announcements`, `audit_log`.

---

## Exam configuration engine

Nothing about JEE, NEET, UPSC or SSC is hard-coded. An examination has stages, and each stage has **pattern versions**. A version is a JSON document that is validated before publishing and is immutable after. Mock tests and attempts record the version they used, so a pattern change for next year never alters past results.

```jsonc
{
  "durationSec": 10800,
  "languages": ["en", "hi"],
  "navigation": { "mode": "free" },          // or "sequential" (sections in order, locked once left)
  "calculator": "none",                      // none | basic | scientific
  "review": { "allowMarkForReview": true, "evaluateAnsweredMarked": true },
  "result": { "showSolutions": "after_submit", "showRank": true },
  "marking": {                               // default rules per question type
    "mcq_single": { "correct": 4, "incorrect": -1 },
    "mcq_multi":  { "correct": 4, "incorrect": -2, "partial": { "perCorrectOption": 1 } },
    "numeric":    { "correct": 4, "incorrect": 0 }
  },
  "sections": [{
    "key": "physics", "name": "Physics",
    "durationSec": 3600,                     // optional: section-wise timing (all sections, sequential mode)
    "maxAttempted": 25,                      // optional: "answer any N"
    "marking": { },                          // optional: section-specific overrides
    "composition": [                         // question blocks, in display order
      { "type": "mcq_single", "count": 20 },
      { "type": "numeric", "count": 5, "marking": { "correct": 4, "incorrect": 0 } }
    ],
    "selection": {
      "subjectIds": ["<syllabus subject id>"],
      "topicIds": [], "difficultyMix": { "easy": 0.3, "medium": 0.5, "hard": 0.2 },
      "sourceKinds": ["pyq", "original"], "pyqYears": { "from": 2015, "to": 2025 }
    }
  }]
}
```

Supported question types:

- **Single correct** (`mcq_single`), including several accepted keys for bonus or dropped questions
- **Multiple correct** (`mcq_multi`), with optional partial marking
- **Numerical** (`numeric`), as an exact value, value ± tolerance, or a range
- **Descriptive** (`descriptive`), evaluated by a mentor

Seeded patterns include:

- JEE Main 2026, plus the retired 2024 version with "any 5 of 10" to show versioning
- NEET UG 2025
- SSC CGL Tier 1
- IBPS PO Prelims (section-timed)
- UPSC Prelims GS I
- Short practice formats for each examination

**Verify official patterns against each year's notification before real use.**

## CBT engine guarantees

- **The server owns time.** Start, expiry and section windows are stored on the attempt. Saves after expiry (plus a small grace window for in-flight requests) are refused. Expired attempts are finalised on the next request or by the background sweeper, and timed sections advance on the server clock.
- **Autosave is order-safe.** Every save carries a per-question sequence number, and stale or replayed saves are ignored. The browser keeps unsent answers in an on-device outbox, so refreshes, crashes and dropped connections lose nothing. Answers are retried with backoff and flushed before submission.
- **Writes are serialised per attempt** with an optimistic revision counter, so limits can't be raced.
- **Submission is idempotent.** An atomic `in_progress → submitting → submitted` transition means double clicks, retries and the sweeper produce exactly one result, and statistics are applied once. A crashed submission is retried after `SUBMIT_LOCK_STALE_MS`.
- **No answer leakage.** Attempt APIs send only stems and options. Content of locked sections is withheld. Keys and explanations appear only after submission (if the pattern allows).
- **Frozen papers.** Publishing a test snapshots its questions, so later edits never re-score past attempts.
- **Anti-abuse.** Full-screen exits, tab switches and copy attempts are logged per attempt. There are rate limits on login and autosave, and a CSRF header check on every write.

No multi-document transactions are needed, so this works on a standalone MongoDB as well as Atlas replica sets.

## Content workflow

1. An editor creates a question (draft) and submits it for review. Each save is validated for structure and syllabus placement, and checked for exact and near duplicates.
2. A reviewer approves it, or rejects it with notes. Reviewers can't approve questions they wrote or last edited.
3. Approving a previous-year question can also mark its source as verified; only verified PYQs are labelled as PYQs to students.
4. Editing an approved question (admin only) creates a new version that goes back to review.

Bulk import accepts up to 500 questions per batch as JSON and reports results row by row.

**Sample content:** the seeded questions are original questions written for this platform. None are presented as previous-year questions. Load real PYQs only from licensed sources, and have reviewers verify them.

## Production notes

- Run behind HTTPS (for example nginx or a managed load balancer) with `NODE_ENV=production` and `TRUST_PROXY=true`.
- Several server instances work against the same MongoDB, because all exam-critical state lives in the database. Two pieces of in-process state should move to a shared store such as Redis for a multi-instance setup: the rate limiter and the paper cache.
- Back up MongoDB (Atlas does this automatically). The `audit_log` collection records administrative and workflow actions.
- The near-duplicate check scans up to 3,000 questions per subject. For very large banks, move it to Atlas Search.

## Roadmap (next milestones)

1. **Subscriptions and payments:** plans, Razorpay integration, refunds, feature gating
2. **Learning material:** notes, PDFs and videos per topic; daily current affairs
3. **Study plans:** daily targets, revision reminders, notifications by email and push
4. **Mentor tools:** teacher-built practice tests, assignments, doubt threads, cohort performance views
5. **Analytics:** question difficulty calibration, cohort dashboards, percentile predictions
6. **Advertisements and platform settings**
7. **A form-based pattern builder** to complement the JSON editor
8. **Offline-capable app (PWA)**, and more question languages
