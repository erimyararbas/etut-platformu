# Etüt Platformu

**A multi-tenant platform that runs a school's study sessions (etüt), student work tracking and parent communication in one place.**

Several schools run on a single deployment, each under its own URL slug, with data isolated by Postgres row-level security. Five roles — student, parent, teacher, guidance counselor and school admin — each get their own interface, and the UI is mobile-first because most students and parents use it on their phones.

**Live demo:** [etut-platformu.vercel.app](https://etut-platformu.vercel.app). On the login screen, choose *"Demo olarak incele"* and pick a role. The demo accounts are filled with sample data, so no sign-up is needed.

`Next.js 16` `React 19` `TypeScript` `Tailwind 4` `shadcn/ui` `Supabase (Postgres · Auth · RLS · Storage)` `Zod` `Vitest` `PGlite` `Playwright` `Vercel`

---

## What each role can do

| Role | Main flows |
|---|---|
| **Student** | Join or leave study sessions and get waitlisted automatically when full; weekly study plan; question counter and streak; post unsolved questions with a photo; practice-exam results; calendar |
| **Parent** | Child's attendance and upcoming sessions, teacher ratings and comments, exam results, appointment requests |
| **Teacher** | Create one-off or weekly recurring sessions, take attendance (locked after 24 h), rate students, follow students' study logs |
| **Guidance counselor** | Early-warning queue, meeting notes, practice exams, session requests from students |
| **School admin** | Excel bulk import with preview, invite codes, approving sessions (edit-and-approve or reject with a reason), user permissions, reports, audit log |

## Engineering highlights

- **Business rules live in the database, not just in the UI.** Session capacity and the waitlist are enforced in Postgres functions that lock the row (`for update`), so concurrent sign-ups can't overbook a session. Double-booking a teacher or a classroom is prevented by `btree_gist` exclusion constraints.
- **Row-level security on every table.** Cross-table checks sit behind `SECURITY DEFINER` helper functions so that policies don't recurse. A parent can see only their own children, and this is enforced in three layers: a view, a function check and the page.
- **Tests run against real RLS without Docker.** Database tests run on PGlite (an embedded Postgres) with a shim for Supabase's `auth` schema and roles. Tests execute as `authenticated`, so the policies are actually enforced. All migrations are applied from scratch on every run. Playwright covers the end-to-end flows on both desktop and mobile viewports.
- **Bulk import that can't destroy data.** Excel files are parsed and previewed without touching the database, then written in a single transaction that never deletes rows. The import is idempotent, so retrying a half-finished upload doesn't create duplicates.
- **Measured performance work.** Batching inserts with `unnest` cut a 158-row import from **33.5 s to 6.3 s**. Batched lookups plus parallel auth-user creation cut a 40-student import from **25 s to 6.1 s**.
- **Careful auth design.** Passwords are never distributed: each user gets a one-time invite code, stored only as a SHA-256 hash and checked in constant time, and sets their own password on first login. The login screen doesn't reveal whether an account exists. Audit logs can't be written or edited by any user session, including admins.
- **Channel-agnostic notifications.** In-app notifications and an outbox table are kept separate, so adding SMS later means writing one worker, not changing application code.

Design decisions and their reasoning are documented in Turkish in [`docs/MIMARI.md`](docs/MIMARI.md).

## Project structure

```
src/app/[okul]/        Routes per school (tenant resolved from the URL slug)
src/lib/               Domain logic: etut, calisma, rehberlik, rapor, import, auth …
supabase/migrations/   Schema, business-rule functions, RLS policies, grants
test/                  PGlite-based database, business-rule and RLS tests
e2e/                   Playwright flows (desktop + mobile)
scripts/               School setup, migrations, Excel template generator, demo seeding
docs/sablonlar/        Generated Excel templates sent to schools
```

## Running locally

```bash
npm install
cp .env.local.example .env.local     # fill in your own Supabase project keys
npm run db:push                       # apply migrations
npm run okul-olustur -- --slug ornek --ad "Örnek Koleji" --yonetici-eposta mudur@okul.k12.tr
npm run dev
```

| Command | What it does |
|---|---|
| `npm test` | Database schema, business-rule and RLS tests (PGlite) |
| `npm run e2e` / `npm run e2e:mobil` | Playwright end-to-end tests, desktop / mobile |
| `npm run dogrula` | Type check, lint, tests and production build in one go |
| `npm run sablonlar` | Regenerate the Excel import templates |
| `npm run ornek-veri` | Generate filled-in sample templates |

## Status

All four planned phases are implemented and deployed: sessions and attendance, student work tracking, guidance and reports, and administration. The first pilot school is being onboarded. SMS notifications are next, using the existing outbox.

---

Built by [Erim Yararbaş](https://www.linkedin.com/in/erimyararbas), with an AI-assisted workflow (Claude Code).
