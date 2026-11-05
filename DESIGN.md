# Khao Piek visual system

Operate mode. A welcoming neighborhood noodle shop translated into clear, quiet software: warm rice-white surfaces, bottle-green actions, terracotta attention states, and generous Lao typography. No decorative charts or marketing sections.

The cashier first viewport is a spatial table overview with a persistent order rail. A selected table makes payment and kitchen readiness explicit. Food photography belongs in menus, not the operational table overview. Kitchen uses larger queue tickets; customer ordering is mobile-first. Shared type, action shapes and state vocabulary connect all roles.

Primary controls are 48–56px tall; table targets exceed 160px. Table numbers and money are visually dominant. Use a single Lao/Thai-capable family, readable neutral secondary text, gentle 12–16px corners, and small consistent Lucide icons. Motion only follows selection or state changes and honors reduced motion.

Grounded material candidates: neighborhood storefront lettering, ceramic soup bowls, market produce labels, Lao printed menus, cotton apron seams, rice-paper packaging, and the quiet white/green enamel of a family restaurant. The seventh assigned material is carried through the porcelain-like surfaces and green edges, with standard web controls. Challenger takeaways: strict typography, scanable tile rhythm, aligned amounts, and restrained state marks. Experimental pan-and-tilt or tiny print would impair the stated large-touch task and are declined.

Build directly in code for this requested clickable prototype; this is a session choice, not a saved user workflow preference. Demo prices and restaurant content are illustrative. No payment confirmation claims originate outside this browser prototype.

## Customer surface: reference-led revision

The user's mobile references supersede the earlier green styling for customer ordering. `src/Customer.jsx` and `src/customer.css` own this surface. Staff screens retain their existing visual system.

Use clean white headers and checkout surfaces over a cool near-white canvas; orange marks prices, selection and action. Food photographs lead a borderless two-column mobile grid. Restaurant/table identity and a six-language dropdown sit above search. Categories scroll horizontally beside the grid/list controls. The only persistent customer navigation is Menu, Orders and Call staff (guests already scanned the QR, so the tab calls a person instead). Staff previews, never customer QR links, can return to the staff screens from the menu header or call page. An invalid table link shows a “table not found” page instead of a menu.

The basket is its own page with reversible removal, readable quantity controls and a fixed total/submit region. Place order opens a final review dialog with table, quoted dishes, quantities, options, notes, payment method and total. Back preserves the basket; only Confirm submits. Failed writes keep the review with an inline retryable error. Any changed basket or effective payment choice requires a fresh review, validated again against the latest saved draft before checkout. The review scrolls above persistent actions on normal screens and uses an outer-scroll fallback on short landscape screens. Order history uses white tickets, explicit status labels, food thumbnails and a separate total/paid/amount-due summary. Paid orders must never inflate the outstanding amount. Client-side routes are `#customer`, `#customer/cart`, `#customer/orders` and `#customer/call`, retaining the table query parameter.

Primary action text meets 4.5:1 on the deeper orange action surface; large orange prices use bold type. Mobile inputs stay at 16px and zoom remains enabled. Motion is limited to short state feedback. No reference restaurant logo, browser chrome, or source screenshots are embedded in the product.

## UI/UX refinement

Keep the reference-led customer identity. Basket lines separate food details from large quantity, edit and remove controls. Editing reopens the original choices and updates the existing line; matching choices merge once. The food sheet scrolls independently above its persistent action area, including short landscape viewports.

Measure checkout and order-summary height rather than reserving a fixed pixel estimate. Content and notices must clear those surfaces when translations wrap or totals change. Order history makes the next payment/preparation step explicit. Staff payment dialogs identify the selected order; multi-order tables expose each order's status and never claim the whole table is closed when only one order closes.

Kitchen puts ready food above the work queues, with table numbers and dish quantities visible. Waiting and cooking use separate desktop lanes and large mobile queue selectors. Tickets use amber waiting and blue cooking headers, red attention after 15 minutes, large food names and red notes, and 56px action buttons. Waiting time counts from payment. Batch totals remain behind one native disclosure. Mobile staff order details offer a direct return to table selection. Dialogs lock background scrolling, have accessible names and restore focus to their trigger.

Checkout accepts an order and clears its table basket with one browser-storage write. If that write fails, keep the basket and show a retry message. Successful checkout opens order history with the accepted order number. Draft choices, order totals and preparation/payment states survive page reloads in this browser; this is local preview persistence, not cross-device synchronization. Tabs of this browser follow the newest saved copy. A basket line whose dish is sold out is dimmed and labelled, and checkout stays disabled until it is removed. A cashier-entered order returns to its table panel. Closing a table's last open order starts an empty customer history for the next guests.

## Back office

Staff navigation is grouped by how often it is used: daily work (tables, orders, kitchen, shift & cash), shop management (menu, tables & QR, staff, reports) and system (settings, customer preview). Each group keeps the existing bottle-green active state; the sidebar scrolls on short screens and keeps short text labels in a 168px rail from 781–1020px. Phones keep four bottom tabs and list the rest under More.

A role sees only its own screens; a screen it may not open falls back to the role's first screen rather than showing an error. The signed-in person sits at the foot of the sidebar and opens a PIN sign-in, so a shared counter tablet can change hands quickly.

Back-office pages reuse the staff surfaces: white 14px-radius panels, 48px fields with 16px text, green primary actions and the existing badges. Money figures stay large and tabular. A cash difference is green when exact, amber when over and red when short, always with a word as well as a sign. Destructive actions, such as resetting the demo, use a red button and a confirmation dialog. Every change that matters for money or access is written to the activity log with the person's name and role.

## Simplicity pass

Remove what staff never need: the shop name is plain text, not a menu, and the table QR lives only in each table's panel. One screen per job: the cashier's quick order screen keeps dishes left and the basket right (on phones a green bar jumps to the basket), and payment is one dialog with one confirm; cash shows the change before confirming. Mistaken taps are fixed with Undo in the notice, not with confirmation dialogs. Notices sit under the top bar on phones so they never cover action buttons. Disabled staff buttons stay fully opaque grey so their labels remain readable. Guest calls use the one red accent on the tables screen, since a person is waiting.

The counter opens with four large job filters: all tables, awaiting payment, ready to serve, and guest calls. Other states use a secondary selector. Mixed-order tables appear in every applicable filter; the selected filter opens that task's oldest order. Table amounts show outstanding unpaid money, with a separate selected-order total in the receipt. The desktop receipt scrolls above its persistent action area; on phones the action stays above the bottom navigation within the selected table panel. Rapid repeated Serve or Close taps cannot advance the next ticket.


## Back-office refinement, November 2026

Staff and table setup begin with compact inline counts followed by the actual records. Staff use divided rows with visible Edit actions; role badges are neutral so workflow colours keep their meaning. The full permission matrix stays in a native collapsed disclosure. Shift money summaries retain their cards because staff use those figures to reconcile cash.

Quick-order baskets show dish, quoted amount, quantity and selected choices before an optional Edit disclosure. Kitchen instructions remain visible when the editor closes. The secondary checkout action saves an order awaiting payment; a short explanation says payment confirmation sends it to the kitchen. Failed draft edits must be saved before another mutation, and checkout stays disabled while recovery is pending.

Ready kitchen orders occupy a bounded horizontal strip. Each summary identifies table, order, item count and the presence of notes; expanding reveals dishes and instructions. Waiting tickets place Start below their table header so long orders do not bury it. Cooking tickets retain Ready after their dish list. Waiting is amber, cooking blue, ready green, and errors or calls terracotta across operational screens.

Settings use a simple section selector over one continuous surface, divided payment rows and an unframed merchant preview. Important supporting text is at least 14px in refined surfaces. Tablet navigation retains words alongside icons; phone navigation remains the existing four tabs and More.
