# Khao Piek POS

Restaurant POS built with React, Vite and Supabase. Staff sign in through Supabase Auth. Shop settings, menus, tables, orders, payments, cash shifts and activity are saved in the shop's database. A new shop starts with an empty menu, tables and sales history.

## Run

```sh
npm install
cp .env.example .env.local
# Set the Supabase project URL and publishable key in .env.local.
npm run check:supabase
npm start
```

Install the database first using [the Supabase setup guide](docs/supabase-setup.md). Open [the staff app](http://127.0.0.1:5173/#orders), sign in with the authorized owner account, and enter the shop name on first use. Add the shop's dishes and tables before opening QR ordering. There are no shared PINs or preset sales.

`npm run dev` starts development with hot reload. `npm run build` creates `dist/` for a static host; `npm start` builds and previews the app on port 5173. The production app connects directly to Supabase. It does not require a cashier computer to hold a local order inbox. Missing Supabase configuration shows setup guidance instead of local business data.

A phone can use the computer's network URL during local development. For customer access outside that network, publish `dist/` to an HTTPS host and configure the same public Supabase values at build time. Generate and print table QR codes from that published address.

The current online site is https://khao-piek888.darkside404404.workers.dev/. Set `VITE_PUBLIC_APP_URL` to this HTTPS address in the cashier build and rebuild so table QR links open the current site. Reprint any table QR codes that point to the previous host or a LAN address, using the existing table keys. The public site uses the same Supabase shop, while account-free cashier access and USB printing stay on the trusted local computer.

## Direct entry on this computer

For account-free access on the restaurant computer, run `npm run setup:device`, then run the generated `.local/device-setup.sql` once in the project’s Supabase SQL Editor. Restart `npm start` and open `http://127.0.0.1:5173/`. First use asks only for the real shop name; subsequent opens go directly to the shop. An existing shop owned by the configured verified account is reused.

The local gateway keeps a random, revocable device key only in `.env.local`. It accepts staff requests from loopback connections with the matching local origin; the key is never included in browser code, table QR, or Git. Customer QR ordering still uses Supabase directly. Other computers and a published static site keep normal account access. Running only static `dist/` without this Node gateway does not provide trusted-device entry. Back up the local environment privately if moving the cashier computer; do not copy its device key into public hosting variables.

Revoke a lost computer in Supabase by setting its `private.pos_devices.enabled` to `false`; the next request loses access. Restoring normal account entry means removing `POS_DEVICE_KEY` from this computer’s environment and restarting the app. The verified configured owner can attach the existing device-created shop without losing its menus or transactions.

For a shared cashier computer, install `supabase/staff-permissions-upgrade.sql` in the Supabase SQL Editor after the staff reads upgrade. Update the web app and the local cashier app before changing the device's role. Verify that the owner's confirmed account signs in to the same shop on the updated website. Then run `select private.pos_set_device_cashier_access('<POS_DEVICE_ID>'::uuid, true);` as the database administrator, using the `POS_DEVICE_ID` value from this computer's `.env.local`. Reload the local cashier app. Staff can run the counter and the owner can use the signed-in web app for administration. Run the same SQL with `false` to restore the device's original role. The migration leaves the device role as configured until this choice is made.

## Daily workflow

1. Open a cash shift with the counted starting float.
2. A guest scans the table QR, chooses dishes and a payment method, reviews the server-checked total, pays at the counter, and confirms the order. The cashier sees it awaiting payment verification.
3. Check the actual transfer or cash, then confirm payment to record it and open kitchen printing. With a regular print dialog, select **ใบออกแล้ว** when the ticket comes out, or **พิมพ์ใบครัวอีกครั้ง** to retry. Use `scripts/launch-pos-silent-print.command` on a cashier Mac configured for unattended printing to submit the print request and record kitchen handoff in one click. Pass `--local` to open the trusted cashier app after starting it on port 5173. The browser can report that it requested printing. Check the actual ticket if the printer runs out of paper or a handoff update fails.
4. Mark delivered food as served, then close the order. Staff can also create a walk-in order from a table.
5. Close the cash shift with the counted drawer amount. The shift keeps its expected cash and difference. Reports use recorded payments, with dates in Vientiane time.

The app does not verify bank transfers automatically. Guest requests cannot mark themselves paid or print kitchen tickets. A failed request retains the basket or form for retry, and repeated submissions keep the same request identity to avoid duplicate orders.

## Shop management

- **Menu** adds and edits the shop's own dishes, prices, categories and descriptions. Choose a photo from the computer/phone or take one with the camera, preview it, then save. Photos are resized to WebP and uploaded to Supabase Storage; an optional image URL remains available. Availability changes also apply to customer ordering.
- **Tables & QR** adds tables, edits zones and seats, and prints table codes. A table with active orders cannot be removed.
- **Staff** links confirmed staff accounts by email and assigns manager or cashier access. Switch an account off to remove shop access while keeping history.
- **Settings** saves the shop name, branch, phone and enabled payment methods, and shows activity history. It has no business-data reset control.

| Role | Access |
|---|---|
| Owner | Daily work, menu, tables, staff, reports and settings |
| Manager | Daily work, menu, tables, staff and reports |
| Cashier | Tables, orders, cash shifts and menu availability |

The customer interface supports Lao, Thai, English, Chinese, Korean and Japanese. A table QR includes an opaque table key. Each guest browser has its own order-access token and saved basket; guests cannot read another browser's order history. Shop records are stored in Supabase, with permission checks in database functions.

## Menu photos

Install migration 5 for photo uploads (`supabase/menu-images-setup.sql` after migration 4), or rerun `npm run setup:device` and install the combined `.local/device-setup.sql` on the trusted computer. No existing menu or order data is replaced. The add-menu form needs only the Lao name, integer price and category; photos, other languages and descriptions are optional.

Photos are prepared in the browser (JPEG/PNG/WebP and decodable HEIC, up to 20 MiB input), oriented, resized to at most 1600px and stored as WebP up to 2 MiB in the public `pos-menu-images` bucket. Public reading lets customers see food photos. Uploads require a short-lived path issued to a current owner/manager or trusted computer; no overwrite or delete access is granted. A photo uploads only on Save, and an accepted upload is reused if saving the menu needs a retry. Old photos remain available for historical order snapshots.

Camera capture starts only when pressed. It requires a camera-enabled browser on HTTPS or localhost; denied/unavailable cameras leave file selection available. The app stops camera tracks when capture ends, is cancelled, or the dialog closes.

## Integrity upgrade

For a shop already using migrations 1–5, run `supabase/integrity-upgrade.sql` once. This keeps the existing shop while making new menu saves retry-safe, preserving current sold-out/deleted states, storing correct audit facts, and freezing the table number on future receipts. Until this update is installed, the app keeps menu edits open and asks for the shop update instead of submitting through the old unsafe workflow. Other normal operations remain available.

Existing old activity rows without recorded facts are retained. For existing orders, the table-number snapshot starts from the number known during this upgrade; future renumbering will preserve it. Historical details that were never stored cannot be reconstructed reliably.

With [the staff reads migration](supabase/staff-read-upgrade.sql) installed, cashier polling fetches active orders and current-shift payments. Order history, closed shifts, and activity load by page, and the reports page requests totals for the selected date range. Older database installations continue to use the legacy snapshot until the migration is installed.

The menu cards use prepared WebP thumbnails for matching photo URLs. Details use the original, and photos added or replaced later use their original until new thumbnails are prepared. Run `node scripts/prepare-menu-thumbnails.mjs` with `cwebp` installed and the local POS configuration in place, then rebuild and deploy to refresh the thumbnails.

## Verification

```sh
npm test
npm run build
npm run check:supabase
npm run test:supabase-db
```

The database test command needs local PostgreSQL binaries (`pg_config`, `initdb`, `pg_ctl` and `psql`); set `POS_TEST_PG_BIN` if they are outside PATH. It creates and deletes a disposable database on a private Unix socket. Automated checks cover order review, request recovery, payment integrity, role restrictions, empty-shop rendering and customer copy. Test physical phone keyboards, safe areas and the installed kitchen printer before daily operation.

## Assets

Bundled photographs are retained as assets for existing image references; new dishes use the shop's own image URLs or a neutral placeholder. Khao piak sen photograph by Spencer, CC BY-SA 4.0; attribution is in `/credits.txt`. Other bundled food and drink photos are from Unsplash. Fonts: Noto Sans Lao and Noto Sans Thai (SIL Open Font License). Icons: Lucide (ISC).
