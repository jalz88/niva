# Technology Stack and Architecture

## Decision summary

NIVA will use a standards-based TypeScript web application hosted on Cloudflare Pages, backed by Supabase PostgreSQL and Supabase Auth. It is a PWA, not a native iOS or Android application.

The selected stack prioritizes maintainability, a small operational footprint, strong relational data modelling, and broad AI/developer familiarity. Specific package versions belong in the application manifest and lockfile, not this strategy document.

## Chosen technologies

| Layer | Choice | Role and rationale |
| --- | --- | --- |
| Application | Vue 3 + TypeScript | A mature component model with readable templates, strong TypeScript support, and an appropriate footprint for a responsive business app. |
| Tooling | Vite | Fast local development and production builds; the standard build path for a Vue SPA. |
| Routing / state | Vue Router / Pinia | Official ecosystem choices for routes and focused client state. Server data should not be duplicated as global state without a reason. |
| Styling | Tailwind CSS | Consistent responsive tokens and efficient implementation of a bespoke NIVA interface. It must be governed by a design system, not used as ad-hoc styling. |
| Accessible primitives | shadcn-vue or equivalent audited primitives | Composable building blocks rather than a visually dominant component suite. Select and document the exact library during foundation work. |
| Forms and validation | VeeValidate + Zod | Typed, explicit validation and user-friendly field feedback. |
| Icons | Lucide | Familiar, lightweight SVG icons; every icon-only control needs an accessible label. |
| Charts | Apache ECharts | Capable reporting charts, loaded only on report/dashboard routes where useful. Tables and totals remain the authoritative representation. |
| Dates | Day.js | Small, explicit date handling. Store instants and business dates carefully; display in the property/report context. |
| PWA | Vite PWA plugin / Workbox | Manifest and application-shell caching. No offline financial writes in Release 1. |
| Database | PostgreSQL via Supabase | Mature relational database suited to transactions, reporting, constraints, and future expansion. |
| Authentication | Supabase Auth | Managed identity integrated with PostgreSQL access control. Release 1 uses email/password sign-in (decided 2026-07-19); magic link may be reconsidered later if password reset friction becomes a real problem. |
| Authorization | Supabase Row Level Security (RLS) | Database-enforced workspace and role boundaries; defence in depth for browser-originated requests. |
| Hosting | Cloudflare Pages | Static SPA hosting, HTTPS, CDN, preview deployments, and Git-connected deployment without server administration. |
| Server logic | Thin Cloudflare Workers only when needed | A boundary for privileged operations, aggregation, webhooks, or secrets. Do not create a generic API layer merely by habit. |
| Tests | Vitest + Playwright | Unit tests for logic/formatting and browser tests for critical flows. |
| Documentation | Markdown in Git | Long-lived product context travels with the code and remains available to humans and AI tools. |

## Architecture

```text
Installed PWA / browser
        │ HTTPS
        ▼
Vue 3 single-page application ── Cloudflare Pages
        │                          (static files, previews)
        │ authenticated data access
        ▼
Supabase Auth + PostgreSQL
        │
        ├── Row Level Security policies
        └── migrations and backups

Optional, only for privileged/server tasks:
Vue application → Cloudflare Worker → Supabase / approved service
```

Cloudflare Pages supports Git-connected automatic production and preview deployments, which fits a small project’s review workflow. Supabase Auth integrates with Postgres and RLS; RLS must be enabled and tested on all exposed application tables. See the official [Cloudflare Pages Git integration documentation](https://developers.cloudflare.com/pages/configuration/git-integration/) and [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Data-access posture

1. Start with direct browser-to-Supabase access only for operations safely covered by RLS and input validation.
2. Use a Worker for secret-bearing, privileged, cross-workspace, webhook, or otherwise unsuitable browser operations.
3. Never expose a Supabase service-role key in the client.
4. Treat RLS as mandatory, not optional. Every table, view, function, and storage policy must be reviewed for access scope.
5. Keep database migrations in version control. Dashboard-only schema edits are not the source of truth.

## Security and reliability baseline

- HTTPS only; secrets live in deployment environment variables, never in client source or Git.
- Authentication is required for all business data.
- Authorization is enforced in the database with role-aware RLS policies and tested with representative users.
- Use `numeric`/decimal-safe database amounts; never use JavaScript floating point as the financial source of truth.
- Store the currency code with each transaction. Do not silently convert currencies in Release 1.
- Create immutable audit timestamps and creator/updater references. Detailed audit history requirements will be defined with the schema.
- Validate both in the client for usability and at the database/server boundary for integrity.
- Backups, retention, restore testing, and export requirements must be finalized before production financial data is relied on.

## Deliberate non-choices

| Not chosen now | Reason |
| --- | --- |
| Native mobile apps / React Native | A PWA serves iOS, Android, and desktop from one codebase without app-store release overhead. |
| Next.js / Vercel | Strong option, but NIVA does not need a server-rendered React-first architecture. |
| Firebase / Firestore | NIVA’s reporting and financial relationships fit PostgreSQL more naturally. |
| MongoDB | The domain is relational and benefits from constraints and SQL reporting. |
| Cloudflare D1 | A reasonable future option, but PostgreSQL offers the preferred financial/reporting foundation and portability. |
| Heavy UI framework | NIVA needs a distinct, calm interface and a minimal dependency footprint. |
| GraphQL | The initial data needs do not justify its client/server complexity. |
| Docker | Not needed for the initial managed-service deployment; reconsider only if it earns its operational cost. |
| Offline financial editing | Conflict handling and user trust add substantial complexity; defer until a proven need exists. |

## Deployment workflow

1. Work in a short-lived branch.
2. Run formatting, type checks, unit tests, and applicable browser tests.
3. Use a preview deployment to review UI and flows.
4. Merge reviewed changes to the production branch.
5. Cloudflare Pages builds and deploys the web app.
6. Apply reviewed, version-controlled database migrations through the approved migration process.

Database migrations must be backwards-compatible with the currently deployed app, or releases must be coordinated so users never encounter a mismatched schema.

## Revisit triggers

Re-evaluate the architecture—not merely package versions—when NIVA needs reliable offline writes, a formal accounting integration, high-volume data imports, external webhooks, local data residency requirements, or substantially more users/properties.
