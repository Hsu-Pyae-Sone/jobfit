# Jobfit

A web app that helps job seekers tailor a resume and cover letter to a specific job, truthfully. Set up as an invite-only private beta (Vercel + Supabase).

## Modules

All six modules are built, plus Career Profile, Settings and (for admins) Admin. The sidebar order is:

| Section | What it does |
|---|---|
| **Dashboard** | Progress summary, prioritized evidence-based next actions, recommended jobs (Feature 6) |
| **Career Profile** | Private master resume and career details, reused for every application |
| **Resume Studio** | Tailor a resume and cover letter to one job, truthfully; review and export (Feature 1) |
| **Job Explorer** | Real listings by city, country or region, with filters and ranking (Feature 2) |
| **Match Analysis** | Transparent match score, skills gaps, Prepare Application (Feature 3) |
| **Application Tracker** | Spreadsheet, board and calendar views; reminders, statistics, exports (Feature 4) |
| **Saved Documents** | Up to 3 resume + 3 cover letter templates, plus documents for each application (Feature 5) |
| **Settings** | Resume used for recommendations, AI permission and status, job sources, scoring weights, your files, data export, account deletion |

The UI is React + TypeScript with **Material UI v9** components (buttons, fields, selects, dialogs, drawers, tabs, menus, autocomplete, chips, progress). Tailwind CSS is used only for layout spacing. MUI styles sit in a CSS layer (`@layer theme, base, mui, components, utilities`) so the two don't conflict. Desktop has a permanent left sidebar; tablet and mobile have an app bar with a slide-out navigation drawer.

## Setup

Requires **Node.js 22.13+**.

```bash
npm install
cp .env.example .env.local
npm run dev                  # http://127.0.0.1:3000
```

The app runs in one of two modes:

| Mode | When | Accounts | Storage |
|---|---|---|---|
| **Supabase** (the private beta) | `NEXT_PUBLIC_SUPABASE_URL` and the publishable key are set | Invite-only sign-in, one private workspace per person | Postgres with row-level security, private file bucket |
| **Local** (development, tests) | Supabase variables empty, and `npm run dev` (or `CAREERFIT_LOCAL_MODE=1`) | One local user, no sign-in, localhost only | `./data` (SQLite + files) |

A production build without Supabase refuses to serve personal data (it never falls back to local mode by accident).

Without `ANTHROPIC_API_KEY`, uploading, text extraction (PDF/DOCX/on-device OCR), the automatic checks, job search, the tracker and export still work. Analysis, rewriting, cover letters, AI proofreading, AI match assessment and AI OCR need the key. The default model is `claude-opus-5-5` (override with `CAREERFIT_MODEL`).

### Career Profile, privacy and AI use

- **Career Profile** (`/profile`): each person keeps a private master resume (upload or paste, check the extracted text, confirm) plus additional career details. New Studio applications start from it; Job Explorer, Match Analysis and the Dashboard can rank against it ("My master profile"). Studio's "Save to my Career Profile" copies details back without overwriting what's there.
- **AI permission:** before the first AI request, a dialog explains what is sent to Anthropic and why. Nothing is sent until the user allows it; it can be withdrawn in Settings. Job boards only ever receive search keywords and location.
- **Fewer AI calls:** identical AI requests reuse the stored result for 14 days (per user, never shared). Generating a new draft on purpose (resume suggestions, cover letter, paragraph rewrite) always calls the AI. Each person has a daily limit (`AI_DAILY_LIMIT`, default 40).
- **Your data** (Settings): uploaded originals are kept privately and can be downloaded or deleted; **Export all my data** downloads a ZIP (`data.json` + original files); **Delete my account** permanently removes the account, all rows and stored files.

## Deploying the private beta (free tier)

Hosting: **Vercel Hobby** (app) + **Supabase Free** (auth, Postgres, storage). Both are free for a 5–10 person beta. Free-tier limits worth knowing:

- Supabase Free pauses a project after about a week with no activity (un-pause it in the dashboard) and its built-in email sender allows only a few emails per hour. Set up custom SMTP (below) before inviting several people at once.
- Vercel Hobby allows request bodies up to 4.5 MB, so uploads are limited to **4 MB**; functions run up to 300 s.
- Anthropic API usage is **paid per token** (there is no free tier). The cache and daily limit keep the cost predictable; set a monthly spend limit in the Anthropic Console.
- Jooble's free key has a lifetime limit of 500 requests shared by everyone; results are cached for 24 hours.

### 1. Create the Supabase project

1. At [supabase.com](https://supabase.com), create a free project (choose a region near your users and save the database password).
2. **Project Settings → API Keys**: copy the **Project URL**, the **publishable** key (`sb_publishable_…`, or the legacy `anon` key) and the **secret** key (`sb_secret_…`, or the legacy `service_role` key). The secret key bypasses row-level security: put it only in `.env.local` / Vercel, never in code or chat.
3. Put them in `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SECRET_KEY=sb_secret_...
   NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
   ADMIN_EMAILS=you@example.com
   ANTHROPIC_API_KEY=sk-ant-...
   ```

### 2. Create the database tables

Either paste `supabase/migrations/20261106000000_init.sql` into **SQL Editor → New query** and run it, or add the database connection string to `.env.local` (Dashboard → **Connect** → "Session pooler", with your database password):

```bash
SUPABASE_DB_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-....pooler.supabase.com:5432/postgres
```

then run `npm run db:migrate`.

This creates the tables, row-level-security policies (every row belongs to one user; `user_id = auth.uid()`), the 3-templates-per-kind limit, the per-user AI usage counter, and the private `uploads` storage bucket (4 MB per file, each user restricted to their own folder). `npm run test:rls` checks the policies against an in-memory Postgres.

### 3. Configure Supabase Auth

In **Authentication**:

1. **Sign In / Providers → Email**: keep Email enabled. **Turn off "Allow new users to sign up"** (accounts are created only by invitation).
2. **URL Configuration**: Site URL = your app URL (`http://127.0.0.1:3000` locally, later `https://your-app.vercel.app`). Add both to **Redirect URLs**, each with `/**` (e.g. `https://your-app.vercel.app/**`).
3. **Emails → Templates** (recommended, so links are verified on the server). Replace the link in:
   - **Invite user**: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Accept the invitation</a>`
   - **Reset password**: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a>`

   (The default templates also work; the app reads their session from the link once and moves it into a secure cookie.)
4. **Emails → SMTP Settings** (recommended): use your own SMTP sender (for example a free Resend or Brevo account) to lift the built-in hourly email limit.

### 4. Try it locally

```bash
npm run dev
```

Open http://127.0.0.1:3000, which redirects to the sign-in page. To create your own account, either invite yourself from the Supabase dashboard (**Authentication → Users → Invite user**) or temporarily turn sign-ups on. After setting a password you'll land on the Dashboard; because your email is in `ADMIN_EMAILS`, the sidebar shows **Admin**, where you invite friends by email.

### 5. Deploy to Vercel

1. Push the project to a GitHub repository (`.env.local` is ignored by git).
2. In Vercel, **Add New → Project**, import the repository (framework: Next.js, defaults are fine).
3. Add the environment variables from `.env.local` (not `SUPABASE_DB_URL` or `CAREERFIT_LOCAL_MODE`). Set `NEXT_PUBLIC_SITE_URL` to the Vercel URL.
4. Deploy, then add the Vercel URL to Supabase's Site URL / Redirect URLs (step 3).

### Opening registration later

Set `ALLOW_SIGNUPS=1` and enable sign-ups in Supabase. The sign-in page then offers "Create an account" (email confirmation required). Raise `BETA_MAX_USERS` for invitations. Nothing else in the data model changes: every record already belongs to a user.

## Studio workflow

1. **Documents**: upload a resume (PDF/DOCX/TXT) and a job description (paste, PDF/DOCX, screenshot, or link), plus optional additional info and company details. Extracted text is shown for correction and must be **confirmed** before analysis. Screenshots use on-device Tesseract OCR; scanned PDFs and low-quality images can use Claude's vision (AI OCR).
2. **Match analysis**: strong matches, partial matches, missing requirements, recommended improvements, keywords, weak bullets, missing info, formatting/ATS issues, industry terms. Quotes are verified against the source text.
3. **Your results**: targeted questions for bullets that lack a measurable result. Answers are the only source of numbers; "I don't have a number" makes the bullet specific without metrics.
4. **Resume changes**: side-by-side original/improved view with added/modified/removed/moved/unchanged highlighting and word-level diffs. Each suggestion has a reason and is accepted, rejected or edited individually. Nothing applies until accepted. The final resume is editable.
5. **Cover letter**: three tones; edit any paragraph, or regenerate one paragraph with optional instructions.
6. **Review & export**: automatic checks plus optional AI proofreading. Export to PDF/DOCX is enabled only after a review of the current content; must-fix issues need explicit acknowledgement.

## Job search (Feature 2)

- **Location is required**: a city, country, or continent/region (Europe, Asia, Nordic countries, EU, DACH, …).
  - **City**: jobs in the city first, then up to five of the most relevant jobs elsewhere in the country, plus **Show all jobs in country**.
  - **Country**: everything nationwide.
  - **Region**: combined results from the supported countries in that region.
  - **Remote**: remote jobs open to applicants in the chosen place appear in a separate section.
- **Filters** are optional and only restrict what you select: title, industry, experience level, remote/hybrid/on-site, employment type, salary range and currency (no currency conversion), date posted, company, required language, and visa sponsorship. If a posting doesn't state the information a filter needs, the job is kept and labelled "not stated", or hidden when strict mode is on.
- **Missing data** shows as "Not provided". Adzuna's *predicted* salaries are not shown because they aren't published figures.
- **Ranking**: pick a verified resume (a confirmed Studio resume or a Library resume).
  - A free keyword match ranks every job and explains the overlap. It is capped below 100%.
  - **Assess with AI** checks each requirement against your resume. Evidence must be quoted from your resume or the requirement is downgraded. "All essential qualifications met" is only shown when every essential requirement is met with verified evidence *and* the full posting was available.
- **Tailor my resume for this job** starts a Studio application with the posting (to confirm) and your resume.

### Sources

All sources are official APIs or public feeds, used within their terms. Nothing is scraped and no listings are generated.

| Source | Key | Coverage | Notes |
|---|---|---|---|
| [Arbeitnow](https://www.arbeitnow.com/blog/job-board-api) | none | Mostly DE, GB, NL, FR, CH | Full descriptions; visa-sponsorship flag; cached 1 h |
| [Remotive](https://github.com/remotive-com/remote-jobs-api) | none | Remote jobs | Public API currently returns ~10 jobs; 24 h display delay and ≤4 fetches/day per their terms |
| [Jobicy](https://jobicy.com/jobs-rss-feed) | none | Remote jobs with location limits | Credited; apply links go to Jobicy; cached 1 h |
| [Adzuna](https://developer.adzuna.com) | `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` | ~19 countries (not Finland) | Summaries only; cached 1 h |
| [Jooble](https://jooble.org/api/about) | `JOOBLE_KEYS` (per country) | Country of each key (incl. Finland) | Summaries only; 500-request lifetime limit per free key; cached 24 h |

**Finland/Oulu:** without a Jooble Finland key, only remote jobs open to Finland are available. Finland's official [Työmarkkinatori API](https://tyomarkkinatori.fi/en/info/kehittajille/tyopaikkailmoitusten-rajapinnat) requires a Finnish business ID and approval from the KEHA Centre, so it isn't integrated.

Place names come from GeoNames (CC BY 4.0) via `all-the-cities`. Duplicate postings are merged, keeping the fullest description. When a source is down or rate limited, the last cached results are shown and flagged.

## Job Match & Skills Gap (Feature 3)

- Start from a search result (**Analyze match & skills gap**), a Studio application's job, or a pasted description. The analysis runs automatically. Summary-only listings ask for the full description first.
- **Two AI steps:**
  1. Extract every requirement the posting states, as exact quotes, in five categories.
  2. Assess each requirement against your resume and evidence as **Verified Match**, **Partial Match**, **Not Demonstrated** or **Unknown**.

  Evidence must be quoted from your documents. A close paraphrase is capped at Partial; an invented quote counts as Not Demonstrated.
- **The score is computed in code, not by the AI** (`src/lib/match/score.ts`):
  - Each requirement counts Verified = 1, Partial = 0.5, Not demonstrated = 0. Unknown requirements are left out.
  - Category scores are averaged and weighted (default 35/25/15/15/10, configurable). Weights are re-normalised over the categories the posting covers.
  - The full calculation table is shown.
  - It is an estimated qualification match, not a hiring or ATS probability.
- **Skills gaps** are sorted by how many points each would add if verified (hypothetical). Each gap shows why it matters, its priority, resources, a project, estimated learning time when reasonable, and how to demonstrate it. Resources are named, not linked; links open a web search, so no URLs are made up.
- **Potential score** is clearly labelled hypothetical. Marking a gap *Completed* never changes the score. You add evidence (project, certification, experience, course), then **Recalculate verified score**. Each recalculation is logged.
- **Prepare Application:**
  1. Loads the job, your resume, and your evidence (as additional info) into a Studio application.
  2. Runs the analysis, suggestions and a cover letter.
  3. Links to the before/after comparison, editing and export.

  It also offers to add the application to the tracker. Nothing is ever submitted to an employer.

## Job Application Tracker (Feature 4)

- **Views:**
  - **Table:** a spreadsheet with inline-editable cells (Enter or leaving the cell saves, Esc cancels), sortable columns, a choice of visible columns, and a sticky first column.
  - **Board:** a Kanban board with drag-and-drop, plus a status menu on each card for keyboard and touch.
  - **Calendar:** a month calendar (an agenda list on phones) showing applied dates, deadlines, interviews and follow-ups.
- **Columns:** company, job title, location, employment type, work arrangement, salary, application URL, application date, deadline, status, match score (live from Job Match), resume version, cover letter version (linked to Library/Studio documents or free text), recruiter contact, interview date and stage, follow-up date, notes, last updated. Interview feedback notes and status history are in the details panel.
- **Creating records:** add manually, or use **Add to tracker** in Job Search (published fields only, status *Saved*) or Job Match (*Preparing* when documents were drafted).
- **Statuses:** the 10 defaults can be renamed, recoloured, reordered or extended. Each status belongs to a group (not applied / applied / in process / interview / offer / rejected / withdrawn), and the statistics count by group. Removing a status in use requires choosing where its applications go.
- **"Applied" only when you say so:** an application counts as submitted only when you move it past *not applied* or enter an application date. Downloading documents never changes a status, and marking *Applied* fills in today's date (editable).
- **Statistics:**
  - Total applications, awaiting response, interviews, offers, rejections.
  - Response rate = share of applications where the employer responded in any way.
  - Interview conversion = share of applications that reached an interview.
  - Interviews and offers are counted from status history, so a later rejection doesn't erase an interview.
- **Reminders:** deadlines (not yet applied), interviews and due/overdue follow-ups for the next 7 days. Export them as an **.ics** file with alarms to get notifications in any calendar app.
- **Export:** CSV (UTF-8 with BOM for Excel) and XLSX of the current filtered and sorted view. Cells starting with `=`, `+`, `-` or `@` are escaped to prevent formula injection.

## Saved Documents (Feature 5)

- **Templates:** up to **3 resume** and **3 cover letter** templates. Each can be named, previewed (page-like preview), edited, duplicated, exported to PDF/DOCX, deleted, or used as a starting point:
  - A resume template starts a new Studio application. The text must be reviewed and confirmed first.
  - A cover letter template becomes the editable draft for an application.
- **Starter structures:** UX/UI Designer, Software Engineer, Data Analyst and a general cover letter. They contain only section headings and `[placeholders]`. Nothing is invented, and the final review flags any placeholder left in.
- **No silent overwrites:** saving edits, replacing a template at the limit, and saving under an existing name all require explicit confirmation. The server rejects unconfirmed overwrites.
- **Application documents:** documents saved from the Studio ("Save to this application") are kept separately from the template limit, linked to the application and its tracker record (which also sets the record's resume/cover letter version). Saving never changes the application's status.

## Dashboard (Feature 6)

- Application statistics (submitted, awaiting response, interviews, offers, response rate, interview conversion), upcoming interviews (14 days) and pending deadlines for jobs not yet applied to.
- **Recommended jobs:** recent Job Explorer results ranked against the chosen resume, with the reasons shown. Keyword scoring only counts title overlap with roles the user has actually held, and needs several matching terms before it can score high.
- **Strongest matching roles**, **frequently missing skills** (across analysed jobs) and **skill development progress**, which counts evidence added, not boxes ticked.
- **Suggested next actions:** prioritized and rule-based (`src/lib/dashboard/actions.ts`). Each states the record that triggered it, e.g. "Interview tomorrow at 10:30", "Not demonstrated in 2 of 2 jobs you analysed", "Applied 17 days ago with no response recorded".

## Truthfulness safeguards

- The model is instructed to use only the user's information, and job-posting text is treated as untrusted data.
- **Deterministic claim checks** (`src/lib/claims.ts`) compare every generated line against the user's resume, additional info and answers. New numbers, and tools or skills the user never mentioned, are flagged. Flagged suggestions can't be bulk-accepted and need an explicit "these details are accurate" confirmation.
- Generic phrases ("team player", "results-driven", …) are detected.
- The app never claims a resume will pass every ATS.

## Security notes

- **Accounts and isolation:** sign-in via Supabase Auth (httpOnly session cookies, refreshed in `src/proxy.ts`). Every API route verifies the user (`resolveRequestContext`) and reads and writes through a store bound to that user's own session, so Postgres row-level security enforces isolation even if application code had a bug. Private files live in a private bucket under `<user id>/…`, guarded by storage policies.
- **Secrets stay on the server:** the Anthropic key and the Supabase secret key are read only by server code (`server-only` modules). The browser talks only to this app (enforced by the Content-Security-Policy `connect-src 'self'`). The secret key is used only for invitations, account deletion and the shared, non-personal job-listing cache.
- **Untrusted input:** job descriptions, web pages and uploaded documents are passed to the model as data, never as instructions; all request bodies are validated (Zod) with size limits; uploads are limited to 4 MB, identified by their contents rather than extension, and downloaded only as attachments.
- `src/proxy.ts` rejects cross-site API requests; local mode only answers on localhost.
- The link fetcher blocks private, loopback and link-local addresses (including via redirects and DNS).
- Security headers: CSP, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, HSTS in production.
- Admins (`ADMIN_EMAILS`) can invite, resend and remove accounts; they cannot read other people's data.

## Scripts

`npm run dev` · `npm run build` · `npm start` · `npm test` (Vitest, includes RLS tests) · `npm run test:rls` · `npm run db:migrate` · `npm run typecheck` · `npm run lint`
