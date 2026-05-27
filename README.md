# RolePilot

AI-powered job matching and application tracking platform.

RolePilot helps users analyse their experience, discover relevant live job opportunities, and manage their application pipeline through a streamlined AI-assisted workflow.

## Product Overview

RolePilot is designed for job seekers who want a faster way to turn their CV into practical job-search direction. Users can upload or paste their CV, receive structured role-fit insights, browse relevant opportunities from connected job sources, and keep track of saved roles in one place.

The product is currently focused on a clear V1 workflow: profile analysis, live job discovery, and lightweight application tracking.

## Features

- CV upload-first experience with manual paste fallback
- DOCX and PDF CV text extraction
- AI-powered CV analysis
- Structured profile output for roles, skills, industries, seniority, keywords, summary, and match score
- Live job search from Adzuna and Remotive
- Source filtering for All, Adzuna, and Remotive
- Location refresh for live job searches
- AI-generated job suggestions when live results are unavailable
- Local saved jobs and application status tracking
- Responsive RolePilot UI for desktop, tablet, and mobile

## Workflow

1. **Upload CV**  
   The user uploads a DOCX or PDF CV, or pastes CV text manually.

2. **Analyse Profile**  
   RolePilot returns structured role-fit guidance based on the user's CV.

3. **Discover Jobs**  
   The app searches connected job sources using the generated role and keyword signals.

4. **Save Jobs**  
   Users save interesting roles locally and manage them in a lightweight application pipeline.

## Tech Stack

- **Framework:** Next.js App Router
- **Language:** TypeScript
- **UI:** React, Tailwind CSS
- **AI:** OpenAI API
- **CV Extraction:** Mammoth for DOCX, pdf-parse for PDF
- **Job Sources:** Adzuna API, Remotive API
- **Persistence:** Browser localStorage for saved jobs and status tracking
- **Deployment Target:** Vercel

## Screenshots

Coming soon.

## Local Setup

Clone the repository:

```bash
git clone https://github.com/Sean-Jenkins/rolepilot-v1.git
cd rolepilot-v1
```

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
touch .env.local
```

Add the required environment variables listed below, then start the development server:

```bash
npm run dev
```

Open the local app in your browser:

```text
http://localhost:3000
```

Build the production version locally:

```bash
npm run build
```

## Environment Variables

Create `.env.local` for local development. Do not commit real API keys.

```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-mini

ADZUNA_APP_ID=your_adzuna_app_id
ADZUNA_APP_KEY=your_adzuna_app_key
ADZUNA_COUNTRY=gb
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Enables AI-powered CV analysis. |
| `OPENAI_MODEL` | No | Overrides the default OpenAI model. Defaults to `gpt-4.1-mini`. |
| `ADZUNA_APP_ID` | Recommended | Enables Adzuna live job search. |
| `ADZUNA_APP_KEY` | Recommended | Authenticates Adzuna live job search. |
| `ADZUNA_COUNTRY` | No | Sets the Adzuna country endpoint. Defaults to `gb`. |

Remotive does not require an API key.

## V1 Limitations

- Saved jobs are stored only in the user's browser via localStorage.
- There is no user account system or cross-device sync.
- Job search quality depends on the connected job sources and available API results.
- AI-generated suggestions are fallback guidance, not verified live vacancies.
- DOCX and PDF extraction may vary depending on file formatting and embedded content.
- Application statuses are lightweight tracking labels, not a full CRM workflow.

## V2 Roadmap

- User accounts and cloud-synced saved jobs
- More job board integrations
- Improved location and remote/hybrid matching
- Richer application pipeline views
- CV improvement recommendations
- Cover letter and outreach draft assistance
- Saved searches and alerts
- Better analytics for search progress and application outcomes

## Project Structure

```text
app/
  api/
    analyse-cv/
    extract-cv/
    search-jobs/
  page.tsx
```

Key routes:

- `/api/analyse-cv` handles AI-powered CV analysis.
- `/api/extract-cv` extracts text from DOCX and PDF uploads.
- `/api/search-jobs` searches Adzuna and Remotive.

## Notes For Collaborators

RolePilot V1 intentionally keeps persistence lightweight and browser-based to prioritise speed of iteration and deployment simplicity. The backend routes are serverless API endpoints, while saved jobs and application status data remain in browser localStorage. This keeps the product easy to run, review, and deploy while leaving a clear path for future account-based persistence.

When contributing, avoid committing secrets, keep API responses user-safe, and preserve the beginner-friendly structure of the current implementation.
