# Zomato and Swiggy channels

Status date: 2026-10-27.

This is not a live Zomato or Swiggy integration. RasoiSet can store outlet mappings, item mappings, simulated orders, and UrbanPiper webhooks. It does not call either platform unless the server environment has real UrbanPiper credentials, and even then Swiggy stays in Testing until a separate live-activation flag is set.

## Selected route

| Channel | Route | Why |
| --- | --- | --- |
| Zomato | Direct Zomato POS Integration API | Zomato publishes a restaurant POS platform, separate from the consumer app. |
| Swiggy | UrbanPiper middleware | Swiggy's public developer site (`https://developers.swiggy.com/` and `https://mcp.swiggy.com/builders/docs/`) is a consumer ordering API. It is not a merchant POS API and is not used. |

UrbanPiper is not configured in this installation. No API username, key, business id, or webhook token is stored in the database or the browser.

Direct Zomato and UrbanPiper are not both active for the same outlet. A Zomato order that arrives through UrbanPiper is quarantined instead of being assigned to a restaurant.

## Documentation used

- Zomato POS overview: https://www.zomato.com/developer/integration/docs/overview
- Zomato pre-integration (POS ID, API keys, NDA, webhook headers come from a Zomato contact): https://www.zomato.com/developer/integration/docs/getting-started/development-for-integration/pre-integration
- Zomato order endpoint names: https://www.zomato.com/developer/integration/docs/api-documentation/order-management
- Zomato order-relay acknowledgement example, with the rest of the body marked as other fields: https://www.zomato.com/developer/integration/docs/getting-started/development-for-integration/live-order-flow/qr-bar-code
- UrbanPiper POS overview and webhooks: https://api-docs.urbanpiper.com/downstream/getting-started/overview
- UrbanPiper order relay, order status, and rider status: https://api-docs.urbanpiper.com/downstream/llms-full.txt
- UrbanPiper staging host used by their samples: `https://pos-int.urbanpiper.com`

Zomato's public pages name `/online-ordering/v1/order/confirm`, `reject`, `ready`, `pickedup`, `assigned`, and `delivered`, then say the detailed request format is in an API reference that is not published there. RasoiSet does not invent those bodies.

## Capability matrix

| Action | Zomato direct | Swiggy through UrbanPiper |
| --- | --- | --- |
| Connection check | Unsupported until Zomato approves the POS. No request is sent. | Implemented. `GET /external/api/v1/webhooks/` only when credentials exist. It does not publish a menu or close a store. |
| Outlet discovery | Unsupported | Not called. Staff enter the UrbanPiper store `merchant_ref_id`. |
| Receive orders | Blocked. A matching webhook token stores the event and returns HTTP 503. The kitchen does not get the order. | Implemented for the published order-relay shape. |
| Accept, reject, mark ready | Hidden. Request bodies are not published. | Implemented with `PUT /external/api/v1/orders/:id/status/`. Swiggy rejection is sent only when the relay said `can_reject_order` and uses `extra.swiggy_direct_cancellation` plus a documented `reason_code`. |
| Mark delivered or picked up | Hidden | Hidden. UrbanPiper says an India aggregator-delivered order is completed by the aggregator. |
| Menu publish | Not sent | Not sent. UrbanPiper catalogue updates can remove existing items when flush flags are used. The screen only previews local mappings. |
| Item or outlet availability on the platform | Not sent | Not sent. A sold-out button records `not_sent` and does not change the dine-in item. |
| Rider updates | Not sent | Name and delivery state are stored. Phone numbers and OTPs are redacted. |
| Settlement | Unsupported | Unsupported. Customer total is not treated as money received. |

## Status labels

- Not configured: Swiggy has no UrbanPiper credentials on the server.
- Awaiting provider approval: Zomato.
- Outlet mapping pending: credentials exist, no outlet id yet.
- Testing: outlet mapped, or a connection check has run, but live activation is off.
- Active: only after a successful UrbanPiper check, a mapped outlet, a non-sandbox base URL, and `URBANPIPER_ALLOW_LIVE=1`.
- Degraded: the last UrbanPiper check failed.
- Disconnected: disabled inside RasoiSet. This does not close the store on Swiggy or Zomato.

Entering an outlet id does not make the card Active.

## Data

Migration version 5 adds `channel_connections`, `channel_audits`, `channel_item_maps`, `channel_events`, `channel_orders`, `channel_lines`, `channel_actions`, and `channel_jobs`. Orders gain `channel`, `external_order_id`, and `channel_alert`.

One external outlet id can belong to one active branch. An unknown outlet is stored as quarantined and is visible to the super admin only. It is not given to the demo restaurant.

Dine-in price stays on `menu_items.price_paise`. A channel price is optional and separate. Orders match `external_item_id`, not the dish name. Unmapped lines stay on the order, show as unmapped, and do not consume a recipe.

Provider amounts are stored as paise snapshots. Delivery charges are stored separately and are excluded from dashboard and report sales. If the supplied parts do not match the provider payable, the payable is kept and a discrepancy is shown.

Aggregator orders use payment `channel`. They do not insert a cashier payment, so they do not change expected cash. Cancelling them does not put stock back.

Personal fields (phone, email, address, OTP, coordinates) are replaced with `[redacted]` before the event is stored. Processed event bodies older than 30 days are deleted on API start. Quarantined and failed events are kept.

## Environment

Copy names only. Do not commit values.

- `URBANPIPER_API_USERNAME`
- `URBANPIPER_API_KEY`
- `URBANPIPER_BIZ_ID`
- `URBANPIPER_WEBHOOK_TOKEN`
- `URBANPIPER_BASE_URL` (default `https://pos-int.urbanpiper.com`, which stays in Testing)
- `URBANPIPER_ALLOW_LIVE=1` together with a production base URL before Active is allowed
- `ZOMATO_WEBHOOK_TOKEN` only stores Zomato events for investigation. It does not accept orders.

Provider secrets are read from the server environment. The settings screen does not ask for them and the channel API does not return them. Rotating a key means replacing the environment value and restarting the API. There is no second copy in the database to rotate.

## Webhooks to register in UrbanPiper Atlas

RasoiSet expects `Authorization: Bearer <URBANPIPER_WEBHOOK_TOKEN>`.

- Order relay: `POST /api/channels/urbanpiper/order`
- Order status: `POST /api/channels/urbanpiper/status`
- Rider status: `POST /api/channels/urbanpiper/rider`

A stored event returns HTTP 200 and `{ "order_ref_id": "..." }`, including the duplicate of an event that was already stored. Invalid tokens return 401. Zomato's URL is `POST /api/channels/zomato/order` with header `x-zomato-token`. A valid token still returns 503 because the order is not accepted.

## Operating procedure

1. Get UrbanPiper staging credentials and a store `merchant_ref_id` from UrbanPiper. RasoiSet cannot create that account.
2. Set the environment variables and restart the API.
3. Settings → Integrations. Map the outlet to the correct branch. Validate connection. The status becomes Testing, not Active.
4. Map each Swiggy item id to a RasoiSet item. Preview the mapping. Nothing is published.
5. Place a test order in UrbanPiper's developer tools. It appears under Online orders. Accept or reject there. The kitchen ticket is created once, on acceptance, or immediately when Swiggy already marks the order accepted.
6. Live activation is a separate explicit action and stays blocked on the staging host.
7. Disable in RasoiSet stops new outlet routing. It does not close the Swiggy outlet. Closing the outlet still has to be done in the provider's own tools.
8. If a status call times out, RasoiSet marks it for reconciliation and refuses a second send until a status webhook arrives. Rate limits and network failures can be retried by the inbox, up to five attempts, with a short jittered delay.
9. While the browser is offline, new online orders are not shown. Refresh Online orders after the connection returns. There is no second device push channel.
10. Settlement files are not imported. Do not treat the customer total as a bank receipt.

## Zomato, still blocked

1. Submit Zomato's vendor onboarding form and NDA through a Zomato POS contact.
2. Receive a POS ID, API key, and the webhook authentication header they will send.
3. Obtain the full order-relay and confirm/reject schemas. The public pages do not include them.
4. Only then can a direct adapter send confirm, reject, or ready. Until that schema is in the repo, RasoiSet will keep returning 503 for stored Zomato events.

## Verification

`server/channels.test.js` passed locally against a temporary database. It is not a provider sandbox and not a production pilot.

Covered: one order per relay, replay without a second ticket, cancel-before-create then a late placed event stays cancelled, bad webhook token, unknown outlet quarantine, another restaurant cannot use the outlet or the order, modifiers kept, unmapped item flagged without a recipe deduction, Swiggy rejection blocked when `can_reject_order` is false, timeout not sent twice, one recipe deduction, cancellation does not restore stock, no cashier payment, channel price does not change dine-in price, menu preview and sold-out are not sent, print failure can be queued again, waiting events are applied by the inbox drain, secrets are absent from the channel response, and a dine-in cash order still saves.

Not verified: a real UrbanPiper sandbox call, Zomato's unpublished order schema, menu publication, platform sold-out confirmation, settlement files, thermal printing, and multi-device live updates.
