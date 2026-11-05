# Khao Piek POS — UI prototype

Lao-first restaurant POS, with a Thai language switch. Built with React and Vite. No backend or database.

## Run

```sh
npm install
npm start
```

Open the Local URL printed by Vite. `npm start` builds and serves the lightweight preview at port 5173; use `npm run dev` when editing source with hot reload. `npm run build` creates `dist/`; `npm test` verifies payment gating, preparation transitions and cart totals.

## Try the workflow

1. Select a table to inspect its order and take payment. Choose transfer or cash; for cash, enter or tap the amount received and the change is shown before the single confirm. The order then goes to the kitchen.
2. In the kitchen, start cooking and mark the order ready. Tickets are ordered by payment time, a strip at the top totals every dish still to cook, ready food moves to a compact strip with expandable details, and an optional sound plays for each new ticket. Return to the cashier to serve it and close the table.
3. Every status change shows a notice with **Undo** for 6 seconds. Undo is refused if someone else has already moved the order on, or if undoing payment would change sales in a closed shift. A payment dialog left open in another tab cannot confirm an order that has already been paid.
4. **Add order** on a table opens the quick order screen: tap dishes, open Edit for size, “no herbs” or a note, then take payment or save awaiting payment. Payment confirmation sends the order to the kitchen.
5. Open the customer menu, select food, customize size and notes, and submit. Its new order appears at the cashier in this browser, including other open tabs. The customer's third tab calls staff (help, pay at the table, water); the table shows a red badge and the cashier answers it from the table panel.
6. Menu management can mark dishes unavailable; the customer menu reflects that immediately, and a basket holding that dish cannot be sent until the dish is removed. Owners and managers can add, edit and delete dishes there; customers see the same categories.
7. Sales totals use only paid demo orders and can show today, the last 7 days or everything (Vientiane time). QR links include the selected table number.
8. Open a cash shift before taking payments, then close it by entering the counted cash; the shift history keeps the expected amount and the difference.

## Back office

The staff sidebar has three groups: daily work (Tables, Orders, Kitchen, Shift & cash), shop management (Menu, Tables & QR, Staff, Reports) and system (Settings, customer menu preview). On phones the bottom tabs are Tables, Orders, Kitchen and Shift; the rest, the customer preview and Switch user sit under More.

The counter starts with four large task filters: all tables, awaiting payment, ready to serve and guest calls. Other states sit in a separate selector. A table with several orders appears in every applicable filter; its amount is only the unpaid balance, and selecting a task opens the relevant order. The receipt distinguishes the selected order total from the whole table balance. Its primary action stays visible above the phone navigation or beneath a scrolling desktop receipt, including short screens. Serving and closing briefly guard repeated taps as the next order takes its place.

The kitchen puts ready food first, then separates waiting and cooking into desktop lanes. Phones use large queue selectors. Tickets show table, quantity, size, kitchen notes and one next action; only paid orders enter preparation. Batch preparation totals stay available in a collapsed disclosure. These screens still share browser-local prototype data, not a server or other devices.

Staff and table setup show compact counts above the records. Staff Edit actions stay visible, while the permission matrix opens on request. Settings use a plain section selector and divided rows. Tablet navigation keeps short text labels alongside icons. Quick-order choices are expandable, but kitchen notes remain visible; failed edits keep their retry and block checkout until saved.

Each person signs in with a 4-digit PIN from the profile at the bottom of the sidebar (More → Switch user on phones). The sidebar shows only the screens that person's role may open:

If a selected account is disabled or removed, its staff screens lock and require an active account's PIN to continue. Reloading keeps that lock; the account never falls back to the owner. Public customer QR ordering remains available.

| Role | Screens |
|---|---|
| Owner | Everything, including Settings |
| Manager | Everything except Settings |
| Cashier | Tables, quick order, Orders, Shift & cash (own shifts), Menu availability |
| Kitchen | Kitchen screen only |

Demo PINs: owner `1111`, manager `2222`, cashier `3333`, kitchen `4444`. They are stored in browser storage for this prototype only; a real backend must check hashed PINs on the server.

- **Shift & cash** opens a shift with the starting float and counts cash and transfer payments taken while it is open. Closing it records the counted cash and the difference.
- **Tables & QR** adds or removes the last table, sets each table's zone and seats, and prints QR codes for every table at once. A table with open orders cannot be removed.
- **Staff** adds people, sets roles and PINs, and switches accounts off. The shop always keeps one active owner, and nobody can change their own role.
- **Settings** holds the shop name, branch and phone, the payment methods customers and cashiers see, the activity log (who took payment, closed tables, changed menus, staff or settings), and a reset for the demo data.

The customer view opens at `/?table=3#customer`. It has its own orange/white mobile interface, six-language menu, search, grid/list views, full-page basket and per-table order history. The three bottom tabs lead to Menu, Orders and Call staff. A preview opened from the staff screens can return to them from the menu header or the call page; customer QR links show no staff access. A link whose table is not one of the shop's tables (1–12 by default) shows a “table not found” page instead of a menu. Browser back navigation works between customer subpages. Paid orders are excluded from the outstanding amount. Closing a table's last open order clears its customer history for the next guests.

Basket items can be edited before submission, retaining their size, quantity and kitchen note. Place order opens a final confirmation showing the table, food, quantities, options, notes, payment choice and total. Back keeps the basket unchanged; only Confirm sends it. Failed saves retain the review for retry, and a changed basket must be reviewed again before it can be submitted. Matching edits combine quantities without adding a duplicate line. Checkout and order-summary space adapt to their measured height. Customer status guidance states the next action; staff order selectors show individual statuses.

Basket rows keep their quoted prices when the menu price changes; differently priced rows do not merge, and option edits retain the original base quote. Store-edited English names are used for customer display and search. Shift forms accept every non-negative whole-kip amount. Clicking a staff dialog's inside padding keeps it open. Quick-order clearing offers Undo, preserving choices alongside newly added food; failed draft or call saves show a retry action. Undoing a final order close also restores the guest call that close removed, without replacing a current call.

UI verification covers browser widths 320, 390, 440, 768, 1024 and 1440px across the relevant customer/staff surfaces, plus short and landscape food-sheet viewports. Actual phone keyboard, Safari safe areas and touch behavior still need physical-device verification.

All values are illustrative. There is no actual payment, authentication, cross-device synchronization or QR-session security. Draft baskets and demo orders are saved together in localStorage in this browser, per origin; refreshing or reopening the page preserves them. Checkout clears a basket only after the same storage write has accepted its order. Storage failure leaves the basket unchanged and offers a retry. Open tabs of this browser follow the newest saved copy, and every save starts from that copy. Simultaneous browser writes are not transactional; a central database is still required for reliable multi-device service. Sold-out dishes are saved with the demo. Clearing browser site data removes this local preview data. Both in-app QR screens replace localhost with the computer’s detected private IPv4 address and preserve the selected table and port. The phone must use the same Wi-Fi and the computer must keep the preview running. If the computer changes networks, restart `npm start` to refresh the QR address. QR links on a hosted domain keep that domain. The hosted prototype provides a reachable QR URL, with browser-local demo state still separate per device.

## Assets

Food photography is illustrative, not a claim about a real restaurant's menu. Khao piak sen photograph by Spencer, CC BY-SA 4.0; source and license are linked in the customer menu and `/credits.txt`. Other stock food and beverage photos are from Unsplash. Fonts are self-hosted Noto Sans Lao and Noto Sans Thai from Google Fonts (SIL Open Font License). Icons: Lucide (ISC).
