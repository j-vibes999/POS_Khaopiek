# Khao Piek POS — UI prototype

Lao-first restaurant POS, with a Thai language switch. Built with React and Vite. No backend or database.

## Run

```sh
npm install
npm start
```

Open the Local URL printed by Vite. `npm start` builds and serves the lightweight preview at port 5173; use `npm run dev` when editing source with hot reload. `npm run build` creates `dist/`; `npm test` verifies payment gating, preparation transitions and cart totals.

## Try the workflow

1. Select a table to inspect its order. Confirm receipt of the demo payment, then switch to the kitchen.
2. In the kitchen, start cooking and mark the order ready. Return to the cashier to serve it and close the table.
3. Open the customer menu, select food, customize size and notes, and submit. Its new order appears at the cashier in this browser, including other open tabs. A cashier-entered order returns to its table, ready for payment.
4. Menu management can mark dishes unavailable; the customer menu reflects that immediately, and a basket holding that dish cannot be sent until the dish is removed.
5. Sales totals use only paid demo orders. QR links include the selected table number.

The customer view opens at `/?table=3#customer`. It has its own orange/white mobile interface, six-language menu, search, grid/list views, full-page basket and per-table order history. The three bottom tabs lead to Menu, Orders and QR. A preview opened from the staff screens can return to them from the menu header or the QR page; customer QR links show no staff access. A link whose table is not a whole number from 1 to 12 shows a “table not found” page instead of a menu. Browser back navigation works between customer subpages. Paid orders are excluded from the outstanding amount. Closing a table's last open order clears its customer history for the next guests.

Basket items can be edited before submission, retaining their size, quantity and kitchen note. Matching edits combine quantities without adding a duplicate line. Checkout and order-summary space adapt to their measured height. Customer status guidance states the next action; staff order selectors show individual statuses, and kitchen tickets adapt their column count for readable tablet use.

UI verification covers browser widths 320, 390, 440, 768, 1024 and 1440px across the relevant customer/staff surfaces, plus short and landscape food-sheet viewports. Actual phone keyboard, Safari safe areas and touch behavior still need physical-device verification.

All values are illustrative. There is no actual payment, authentication, cross-device synchronization or QR-session security. Draft baskets and demo orders are saved together in localStorage in this browser, per origin; refreshing or reopening the page preserves them. Checkout clears a basket only after the same storage write has accepted its order. Storage failure leaves the basket unchanged and offers a retry. Open tabs of this browser follow the newest saved copy, and every save starts from that copy, so one tab cannot erase another tab's order. Sold-out dishes are saved with the demo. Clearing browser site data removes this local preview data. Both in-app QR screens replace localhost with the computer’s detected private IPv4 address and preserve the selected table and port. The phone must use the same Wi-Fi and the computer must keep the preview running. If the computer changes networks, restart `npm start` to refresh the QR address. QR links on a hosted domain keep that domain. The hosted prototype provides a reachable QR URL, with browser-local demo state still separate per device.

## Assets

Food photography is illustrative, not a claim about a real restaurant's menu. Khao piak sen photograph by Spencer, CC BY-SA 4.0; source and license are linked in the customer menu and `/credits.txt`. Other stock food and beverage photos are from Unsplash. Fonts are self-hosted Noto Sans Lao and Noto Sans Thai from Google Fonts (SIL Open Font License). Icons: Lucide (ISC).
