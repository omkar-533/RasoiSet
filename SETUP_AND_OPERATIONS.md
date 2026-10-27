# Setup and operations

## What runs locally

- Vite UI: http://localhost:5181
- API: http://127.0.0.1:5182
- Database file: `data/rasoiset.sqlite` (created automatically, gitignored)

`npm run dev` starts both. Vite proxies `/api` to the API so the session cookie stays on port 5181.

## First-time setup

```bash
npm install
npm run dev
```

On the first API start, two **labelled demo** restaurants are created if the database is empty:

Sign in with a mobile number and password. Create account asks for name, mobile number, an optional email, and a password. Forgot password asks for the number, checks a verification code, then accepts a new password. No SMS provider is connected: locally the code is shown on the reset screen; with `NODE_ENV=production` the reset start returns an error and does not reveal a code.

| Account | Mobile | Default password | Access |
| --- | --- | --- | --- |
| Demo owner | 9000000001 | RasoiSet-demo-1 | Both RasoiSet demo branches |
| Demo waiter | 9000000002 | RasoiSet-demo-1 | Main branch, orders only |
| Other demo owner | 9000000003 | RasoiSet-demo-1 | A separate restaurant used to prove isolation |

Change the passwords before anyone else can reach the machine. Set `DEMO_OWNER_PASSWORD`, `DEMO_WAITER_PASSWORD`, and `DEMO_OTHER_PASSWORD` **before the database is created**. Existing databases keep the hashes already stored.

Copy `.env.example` to `.env` only when overriding defaults. The API process does not load `.env` automatically; export the variables in the shell or the process manager.

## Environment variables

| Name | Purpose | Default |
| --- | --- | --- |
| `PORT` | API port | `5182` |
| `RASOISET_DB` | SQLite file | `data/rasoiset.sqlite` |
| `CORS_ORIGIN` | Allowed browser origins, comma-separated | `http://localhost:5181,http://127.0.0.1:5181` |
| `DEMO_*_PASSWORD` | Initial demo passwords, first boot only | `RasoiSet-demo-1` |
| `NODE_ENV=production` | Marks the session cookie Secure | unset locally |

No payment, SMS, or printer secrets are required for the current build. Do not put live secrets in the frontend.

## Demo versus a real restaurant

Demo rows have `restaurants.is_demo = 1`. Settings → Reset Demo Data reloads sample menu and orders for that demo restaurant only. It refuses to run for a non-demo restaurant. There is no self-serve production onboarding yet.

Old `localStorage` data (`petpooja-store-v1`) is ignored so anonymous browser records are not inserted into an account.

## Demo requests

`POST /api/demo-requests` stores a public demo lead in `demo_requests`. There is no list endpoint. The same idempotency key is stored once. No mail provider is configured, so the API returns `notification: "not_configured"` and does not send email. A future provider would need a server-side sender; do not point this form at a public inbox from the browser.

## Payments and printing

Cash, card, UPI, and wallet buttons record a **manual** payment (`payments.status = recorded_manual`). They are not provider-verified.

Print jobs are stored as `created`. After the browser print dialog opens, the job becomes `delivery_unknown`. The app never marks a job physically printed.

## Backup

Stop the API, then copy `data/rasoiset.sqlite`. To restore, stop the API, replace the file, and start again. Restoring over a live file can corrupt it.

A restore into an isolated empty directory has **not** been executed yet. Do not treat backup as verified.

## Rollback

This change adds `server/`, `src/api/client.ts`, and `src/pages/Login.tsx`, and points the store at the API. Rolling back the code without the database leaves the UI unable to load. Keep the sqlite file if you need the demo orders created after this change. Migration v1 only creates tables; it does not drop them.

## Commands

```bash
npm run dev
npm test
npm run build
npm run server
```
