# RasoiSet implementation plan

Checkpoint: 2026-10-27, after the persistence and tenant foundation.

The product is not complete. This checkpoint is the highest-priority dependency: a real database, authenticated sessions, and restaurant/branch isolation under the existing screens.

## Why this order

The repository had no server and no database. Every later workflow (payments, stock, subscriptions, offline sync) would have been another browser-only copy. Phase A therefore landed before menu import, QR, or subscriptions.

## Completed in this session

- Inspected the order path: `placeOrder` and `saveAsKOT` in the old store calculated totals in the browser and wrote `localStorage`.
- Added SQLite (`server/db.js`) with migration version 1.
- Added session auth and role permissions.
- Moved menu, tables, customers, stock, vendors, staff directory, settings, orders, payments, and print jobs behind `/api/actions/*`.
- Kept the existing React pages and pointed the Zustand store at that API. The cart stays on the device until submit.
- Stopped treating the outlet selector as cosmetic. Orders and tables are loaded for the active branch only.
- Seeded two labelled demo restaurants so isolation can be tested without touching a future production account.
- Added `server/isolation.test.js`.

## Preserved

- Routes and navigation.
- RasoiSet visual system.
- Browser receipt/KOT layout.
- Existing demo menu, customers, and branch addresses.
- Package name `petpooja-clone` and the old localStorage key is no longer read. Anonymous browser data is not copied into a tenant.

## Done after the foundation

- Incremental KOT: `addItemsToOrder` appends only the new quantities, stores `kot_batch`, and creates one print job for that delta.
- Refund rows keep the original payment and do not put cooked stock back.
- Cashier shift open/close records expected cash against counted cash.
- Menu CSV import previews row errors, then saves only valid new items.
- Signup already creates a non-demo restaurant. A `starter` restaurant cannot add a second outlet. Demo restaurants are marked `multi-outlet`. No prices or charges were added.

## Explicitly not started

Payment gateways, WhatsApp/SMS, live Zomato or Swiggy calls, thermal hardware, live multi-device sync, split bills, offline replay, backup restore execution, and platform billing. The aggregator inbox, outlet mapping, and simulated orders are implemented. See CHANNELS.md. Live provider calls stay blocked until credentials and approval exist.

## Blockers that are not local code

- A payment provider account, webhook secret, and sandbox keys.
- A printer bridge or ESC/POS device.
- A place to run and verify a backup restore.
