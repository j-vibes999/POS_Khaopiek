# Khao Piek POS — UI prototype

Lao-first restaurant POS, with a Thai language switch. Built with React and Vite. No backend or database.

## Run

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite. `npm run build` creates `dist/`; `npm test` verifies payment gating, preparation transitions and cart totals.

## Try the workflow

1. Select a table to inspect its order. Confirm receipt of the demo payment, then switch to the kitchen.
2. In the kitchen, start cooking and mark the order ready. Return to the cashier to serve it and close the table.
3. Open the customer menu, select food, customize size and notes, and submit. Its new order appears at the cashier in the same browser tab.
4. Menu management can mark dishes unavailable; the customer menu reflects that immediately.
5. Sales totals use only paid demo orders. QR links include the selected table number.

All values are illustrative. There is no actual payment, authentication, cross-device synchronization, permanent storage or QR-session security. Refreshing the page resets the demo. Phone access to the local dev server requires the printed Network URL and the same local network; localhost QR links work on the computer itself. The hosted prototype provides a reachable QR URL, with browser-local demo state still separate per device.

## Assets

Food photography is illustrative, not a claim about a real restaurant's menu. Khao piak sen photograph by Spencer, CC BY-SA 4.0; source and license are linked in the customer menu and `/credits.txt`. Other stock food and beverage photos are from Unsplash. Fonts are self-hosted Noto Sans Lao and Noto Sans Thai from Google Fonts (SIL Open Font License). Icons: Lucide (ISC).
