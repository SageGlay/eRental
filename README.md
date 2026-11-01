# eRental

Responsive online rental marketplace for finding, listing, and requesting rentals in Iligan City, Philippines.

> **Project status: initial setup / planning.**
> No application code exists yet. This repository currently contains only project documentation and repository configuration files.

## Purpose

eRental is a college group project. It aims to make renting easier for people in **Iligan City, Philippines**, our initial target location. The goal is a responsive website (usable on phones, tablets, and computers) where people can find rentals, list their own rentals, and send rental requests.

## Planned technology stack

> ⚠️ **These technologies are planned, not yet implemented.** None of them are installed or configured in this repository yet.

| Area | Planned technology |
| --- | --- |
| UI library | React |
| Build tool / dev server | Vite |
| Language | JavaScript |
| Styling | Regular CSS |
| Backend services | Supabase (such as database and authentication) |
| Version control | Git and GitHub |

## Local setup (for later)

> ⚠️ **These steps will only work after the app has been scaffolded.** There is no `package.json` yet, so they cannot be run today. This section will be updated when the app is ready.

**You will need:** [Git](https://git-scm.com/), [Node.js](https://nodejs.org/) (current LTS version), and a code editor such as [VS Code](https://code.visualstudio.com/).

1. Clone the repository:
   ```bash
   git clone https://github.com/SageGlay/eRental.git
   cd eRental
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your local environment file (see the next section).
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open the local address shown in the terminal (Vite usually uses `http://localhost:5173`).

## Environment variables

The app will read its Supabase settings from a local `.env` file, which is **never** committed to Git.

1. Copy the example file:
   ```bash
   # macOS / Linux / Git Bash
   cp .env.example .env

   # Windows Command Prompt
   copy .env.example .env

   # Windows PowerShell
   Copy-Item .env.example .env
   ```
2. Open `.env` and replace the placeholders with your Supabase project's values (Supabase dashboard → Project Settings → API):

   | Variable | What it is |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase publishable / anon key |

3. If you don't have the values, ask a teammate who has access to the Supabase project, and share them privately (never in commits, issues, or screenshots).

**Only the publishable / anon key belongs in frontend environment variables.** Anything starting with `VITE_` is visible to everyone who uses the website. The anon key is designed to be public, but it is only safe when Row Level Security (RLS) is enabled on the database tables, which we will set up when Supabase is configured.

## ⚠️ Security warning

- **Never commit `.env` or any file containing secret keys.** The `.gitignore` is set up to block them, but always double-check with `git status` before committing.
- **Never use the Supabase `service_role` key (or "secret" key) in the frontend, in `.env.example`, or anywhere in this repository.**
- If a secret is ever committed or pushed by accident, tell the team immediately and **rotate (replace) the key in Supabase**. Deleting the file or the commit afterward is not enough, because the old key must be treated as exposed.

## Project status

🚧 **Initial setup / planning.** Repository hygiene (`.gitignore`, `.env.example`, this README) comes first. The Vite + React app, the Supabase configuration, and all features have not been started.
