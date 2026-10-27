# Test results

Date: 2026-10-27

## Commands

- `npm test` — `node --experimental-strip-types --test server/isolation.test.js`
- `npx tsc --noEmit`
- `npm run build`

## Automated

| Check | Result |
| --- | --- |
| `npm test` tenant isolation, waiter permission denial, idempotent order, single stock deduction, version conflict, unpaid table close, manual payment status, historical price snapshot | Passed |
| `tsc --noEmit` | Passed |
| `npx vite build` | Passed |

## Browser

Checked after the API and Vite proxy were running:

- Sign-in gate appears when there is no session.
- Demo owner sign-in loads the dashboard from SQLite. Main Branch showed settled sales; Mall Road showed ₹0 and 0 orders for the same restaurant menu.
- Branch selector returned to Main Branch. No Pet Pooja product name was visible.

## Not verified

- Physical printer output.
- Payment provider webhooks.
- Offline disconnect/reconnect.
- Backup restore into an empty database.
- Load tests and multi-device KDS.
- Mobile viewport was checked in the earlier UI pass, then the app gained a login gate. A full mobile regression of every page was not repeated.
