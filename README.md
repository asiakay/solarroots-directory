# SolarRoots Directory

A scaffolded Cloudflare Workers project that powers a SolarRoots directory site backed by a D1 database. It serves a branded landing page, exposes a JSON API, and includes database migrations you can extend when building the full application.

## Features

- **Cloudflare Worker** entrypoint written in TypeScript
- **D1 database** schema with sample cooperative directory data
- **Dynamic HTML rendering** using an inline template bundled with the worker
- **JSON API** exposed at `/api/sites`
- Development tooling via `wrangler` and strict TypeScript configuration

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Authenticate Wrangler with your Cloudflare account (only needs to be done once):

   ```bash
   npx wrangler login
   ```

3. Create or bind a D1 database to the worker:

   ```bash
   # create the database
   npx wrangler d1 create solarroots-directory

   # update `wrangler.toml` with the generated `database_id`
   ```

4. Apply the initial migration:

   ```bash
   npx wrangler d1 migrations apply solarroots-directory
   ```

5. Start the local development server:

   ```bash
   npm run dev
   ```

   The worker runs on <http://localhost:8787>. Visit the root URL for the HTML view or `/api/sites` for JSON output.

## Project structure

```
.
├── db
│   └── migrations
│       └── 0001_create_sites.sql   # Initial schema and seed data
├── src
│   ├── index.ts                    # Worker fetch handler
│   ├── shims.d.ts                  # HTML module declaration for TypeScript
│   └── templates
│       └── index.html              # Base HTML template rendered by the worker
├── package.json
├── tsconfig.json
└── wrangler.toml
```

## Scripts

- `npm run dev` – Run the worker locally with live reload.
- `npm run deploy` – Deploy the worker to Cloudflare.
- `npm run lint` – Type-check the project.
- `npm test` – Placeholder script for future automated tests.

## Next steps

- Extend the D1 schema with additional tables for your directory needs.
- Add authentication and submission endpoints for new directory entries.
- Replace the simple HTML template with a component-driven renderer or framework.
- Wire the worker into a Cloudflare Pages frontend if you need multi-page navigation.
