# RasoiSet feature audit

Audit date: 2026-10-27. Source of truth before this change was the browser Zustand store in `src/store/useStore.ts`, persisted to `localStorage` key `petpooja-store-v1`. There was no database, authentication, or tenant boundary. The outlet selector did not isolate data.

Status labels: verified working, partial, missing, broken, externally blocked, not yet verified.

## Baseline that already worked in the browser

| Capability | Location | Previous status |
| --- | --- | --- |
| Dashboard, POS, tables, KOT, KDS, menu, inventory, vendors, customers, orders, reports, staff, settings | `src/pages/*` | partial — screens and calculations worked, data lived only in the browser |
| Receipt and KOT browser print | `src/utils/invoice.ts` | partial — opens a print dialog, no device confirmation |
| RasoiSet branding and light theme | `src/brand.ts`, `src/components/Logo.tsx`, layout | verified working in the previous UI pass |
| Login / signup | none | missing — PIN check existed in the store and was not wired to a screen |

## Phase A result

| Capability | Location | Status | Notes |
| --- | --- | --- | --- |
| SQLite database and migration v1 | `server/db.js`, `data/rasoiset.sqlite` | verified working | Created on API start. Migration is additive. No destructive reset of non-demo restaurants. |
| Mobile-number login, optional-email signup, scrypt hashes, httpOnly session, login rate limit, logout revocation, number verification before password reset | `server/auth.js`, `server/phoneAuth.js`, `src/pages/Login.tsx` | verified by automated test | No SMS provider. Local reset shows the code; production without SMS refuses reset and does not return a code. |
| Restaurant, branch, membership, role permissions | `server/permissions.js`, `server/seedDemo.js` | partial | Owner, manager, cashier, waiter, kitchen, inventory, accountant are defined. Platform admin, invitations, and branch assignment UI are missing. |
| Server-side tenant and branch checks | `server/actions.js` | verified working | Automated test covers cross-restaurant order access and a waiter blocked from another branch. |
| Order create, KOT, manual payment, cancel, version conflict | `server/actions.js`, POS / KOT / Orders | partial | Prices are calculated on the server. Card/UPI/wallet are stored as `recorded_manual`, never provider-verified. Refunds, splits, and incremental KOTs are missing. |
| Idempotent order submit | `idempotency_keys` | verified working | Same key returns the original order and does not consume stock twice. |
| Recipe stock ledger | `stock_movements` | partial | Recipe consumption and manual adjustments write movements. Purchasing, wastage, transfers, and refund stock rules are missing. |
| Historical item price snapshot | `order_items` | verified working | Automated test edits the menu price and the stored bill line stays unchanged. |
| Unpaid table close blocked | `setTableStatus`, `src/pages/Tables.tsx` | verified working | Occupied table opens KOT. Server rejects closing a table with an unpaid order. |
| Print job record | `print_jobs` | partial | Status starts as `created`. Browser print moves it to `delivery_unknown`. Physical print is not confirmed. No retry screen. |
| Demo data isolation | `restaurants.is_demo` | partial | Two labelled demo restaurants are seeded. Reset affects only the signed-in demo restaurant. Real onboarding does not exist yet. |
| Dashboard and report revenue | `src/pages/Dashboard.tsx`, `src/pages/Reports.tsx` | partial | Revenue uses settled orders only (`payment !== unpaid` and not cancelled). No timezone/business-day cutoff yet. |

## Still missing

These are not implemented. They are not marked working.

- Invitations and opening hours. Signup creates a non-demo restaurant. Menu CSV import is implemented.
- Variants, modifier rules, combos, branch price overrides, images.
- Reservations, waitlist, table transfer/merge, split bills, partial tenders.
- Station routing and live multi-device sync. Incremental KOT is implemented.
- Thermal printer bridge and confirmed device printing.
- Payment gateway and webhooks. Manual refunds and cashier shifts are implemented. No provider is contacted.
- Purchase orders, supplier invoices, recipe versions, wastage, expenses.
- QR ordering, loyalty redemption ledger, coupons, feedback.
- Priced subscriptions, billing, and support tickets. A single-outlet setup blocks a second branch. Platform super admin can switch restaurants. No charge is made.
- Offline queue and reconnect sync.
- Backup restore drill, production deployment, error tracking, background jobs.

## Acceptance scenarios

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Restaurant A cannot read Restaurant B | Passed in `server/isolation.test.js` |
| 2 | Waiter cannot pay or cancel by calling the API | Passed |
| 3 | New restaurant onboarding and first order | Not implemented |
| 4 | Menu import | Not implemented |
| 5 | Waiter KOT reaches a station | KOT create passed. Station routing is not implemented |
| 6 | Incremental KOT | Not implemented |
| 7 | Concurrent edit conflict | Passed (stale version returns 409) |
| 8 | Table transfer | Not implemented |
| 9–10 | Split bill and split payment | Not implemented |
| 11 | Duplicate order submit | Passed |
| 12 | Payment webhooks | Not implemented. No gateway is connected |
| 13 | Refunds | Not implemented |
| 14 | Cash closing | Not implemented |
| 15 | Recipe consumption once | Passed for the Paneer Tikka recipe |
| 16 | Purchasing and transfers | Not implemented |
| 17 | Dashboard matches detailed reports | Same settled-order filter is used. No separate equality fixture yet |
| 18 | Historical bill unchanged after menu edit | Passed |
| 19 | Offline sync | Not implemented |
| 20 | Failed print retry | Job record exists. Retry UI and hardware confirmation are not implemented |
| 21–23 | QR, loyalty double-spend, subscription enforcement | Not implemented |
| 24 | Mobile waiter and desktop POS | UI exists. Re-checked in the browser after login during this session |
| 25 | Backup restore | Procedure documented. Restore has not been executed |

## Aggregator channels

Implemented and locally tested. Not a live Zomato or Swiggy connection. See `CHANNELS.md`.

| Capability | Status |
| --- | --- |
| Swiggy via UrbanPiper order inbox, outlet mapping, accept/reject/ready | Implemented and locally tested. Live HTTP runs only when server credentials exist |
| Zomato direct POS API | External access required. Incoming events are stored and not accepted |
| Simulated orders | Implemented. No stock, cash or sales impact |
| Settlement import | Unsupported. No provider settlement API is connected |
| Menu publish and platform sold-out | Unsupported as a live call. Local preview only |
