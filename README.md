# RasoiSet — Restaurant OS

Restaurant operations app. The interface is React. Orders, menu, stock and accounts are stored in a local SQLite database and scoped to a restaurant and branch. See `SETUP_AND_OPERATIONS.md` for run, backup and demo-login details, and `FEATURE_AUDIT.md` for what is and is not finished.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5181. The API listens on 127.0.0.1:5182 and Vite proxies `/api`.

## Features built

### Core operations
- **Dashboard** — today's revenue, orders, table occupancy, low-stock alerts; 7-day revenue trend (line chart); order-type split (pie); top sellers (bar); recent orders feed
- **POS / Billing** — full ordering screen with category tabs, search, veg/non-veg markers, dine-in / takeaway / delivery / online order types, table & customer attach, line-item notes, qty controls, discount, GST, "Save as KOT" (sends to kitchen) or "Pay Now" (with cash / card / UPI / wallet options), auto-print thermal-receipt-style invoice
- **Tables** — floor plan grouped by area (Indoor / Outdoor / Private); free / occupied / reserved / cleaning status; click-to-seat flow that jumps to POS pre-filled
- **KOT (Kitchen Order Tickets)** — live active tickets, per-item status dots (new → preparing → ready → served), reprint, cancel
- **Kitchen Display System (KDS)** — kanban board (New / Cooking / Ready / Served); auto color-codes tickets by age (green / amber / red); per-line status dropdown

### Management
- **Menu** — items + categories; full CRUD; toggle availability; per-item tax %; veg / non-veg; description
- **Inventory** — ingredients with stock / min-stock / cost-per-unit / total value; low-stock alerts; quick +/- stock adjust
- **Vendors** — supplier directory with click-to-call
- **Customers** — full CRM: visits, lifetime spend, loyalty points (auto-earned at configurable %); search by name/phone
- **Orders** — full order log with filters (type, payment, status); detail modal; reprint; cancel
- **Reports & Analytics** — date-range selector (7 / 14 / 30 / 90 days); revenue trend; revenue-by-category (pie); payment-method split (bar); top-10 items by revenue table; AOV, total tax collected
- **Staff** — directory by role (admin / manager / cashier / waiter / chef / delivery); 4-digit PINs; active toggle
- **Settings** — restaurant info, currency, tax label & rate, service charge, loyalty %, printer width (58/80mm), invoice prefix, footer note, multi-outlet (add / edit / remove); reset-to-demo-data button

### Behind the scenes
- **State** — single Zustand store with persistence, all data in localStorage (`petpooja-store-v1`)
- **Inventory depletion** — placing an order deducts ingredients via item recipes (recipes empty in seed data; configurable on menu items)
- **Loyalty engine** — % of every paid total auto-credited to customer
- **Print** — thermal-style invoice and KOT printing via `window.open` + `window.print`
- **Routing** — React Router v6 with sidebar nav
- **Styling** — Tailwind 3, custom orange brand palette
- **Charts** — Recharts (line / bar / pie)
- **Icons** — Lucide

## Stack

Vite · React 18 · TypeScript · Tailwind CSS · Zustand · React Router · Recharts · Lucide

## Data

12 tables across 3 areas, 36 menu items across 9 categories, 4 customers, 10 ingredients, 4 vendors, 6 staff members, ~50 historical orders auto-generated across 7 days. Reset anytime from **Settings → Reset Demo Data**.

## Project layout

```
src/
  App.tsx               routes
  main.tsx              entry
  index.css             Tailwind + utilities
  types/                TypeScript domain types
  data/seed.ts          demo data
  store/useStore.ts     single Zustand store
  utils/format.ts       currency / time helpers
  utils/invoice.ts      thermal print templates
  components/           Layout, Sidebar, Topbar, Modal, StatCard, PageHeader
  pages/                Dashboard, POS, Tables, KOT, KDS, Menu, Inventory,
                        Vendors, Customers, Orders, Reports, Staff, Settings
```

## Not built (explicit scope cut)

These are real Pet Pooja features that I did **not** include because they require external services / hardware / months of work:

- Live aggregator integrations (Zomato / Swiggy / DoorDash) — would need their partner APIs
- Real thermal printer protocols (ESC/POS over USB / Bluetooth / network)
- Real-time websocket sync between POS / KDS / customer-facing screens
- Recipe-cost engine with wastage tracking and BOM versioning
- Accounting export (Tally / Zoho / QuickBooks)
- Customer-facing online ordering page + payment gateway
- SMS / WhatsApp notifications
- Outlet-level data isolation (current outlet selector is cosmetic)
- Authentication / user sessions (PIN field exists but no login wall — admin assumed)
- Server-side persistence (currently only browser localStorage)

Any of those can be layered on top of the existing data model.
