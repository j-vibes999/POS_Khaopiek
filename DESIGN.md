# Khao Piek visual system

Operate mode. A welcoming neighborhood noodle shop translated into clear, quiet software: warm rice-white surfaces, bottle-green actions, terracotta attention states, and generous Lao typography. No decorative charts or marketing sections.

The cashier first viewport is a spatial table overview with a persistent order rail. A selected table makes payment and kitchen readiness explicit. Food photography belongs in menus, not the operational table overview. Kitchen uses larger queue tickets; customer ordering is mobile-first. Shared type, action shapes and state vocabulary connect all roles.

Primary controls are 48–56px tall; table targets exceed 160px. Table numbers and money are visually dominant. Use a single Lao/Thai-capable family, readable neutral secondary text, gentle 12–16px corners, and small consistent Lucide icons. Motion only follows selection or state changes and honors reduced motion.

Grounded material candidates: neighborhood storefront lettering, ceramic soup bowls, market produce labels, Lao printed menus, cotton apron seams, rice-paper packaging, and the quiet white/green enamel of a family restaurant. The seventh assigned material is carried through the porcelain-like surfaces and green edges, with standard web controls. Challenger takeaways: strict typography, scanable tile rhythm, aligned amounts, and restrained state marks. Experimental pan-and-tilt or tiny print would impair the stated large-touch task and are declined.

Build directly in code for this requested clickable prototype; this is a session choice, not a saved user workflow preference. Demo prices and restaurant content are illustrative. No payment confirmation claims originate outside this browser prototype.

## Customer surface: reference-led revision

The user's mobile references supersede the earlier green styling for customer ordering. `src/Customer.jsx` and `src/customer.css` own this surface. Staff screens retain their existing visual system.

Use clean white headers and checkout surfaces over a cool near-white canvas; orange marks prices, selection and action. Food photographs lead a borderless two-column mobile grid. Restaurant/table identity and a six-language dropdown sit above search. Categories scroll horizontally beside the grid/list controls. The only persistent customer navigation is Menu, Orders and QR. Staff previews, never customer QR links, can return to the staff screens from the menu header or QR page. An invalid table link shows a “table not found” page instead of a menu.

The basket is its own page with reversible removal, readable quantity controls and a fixed total/submit region. Order history uses white tickets, explicit status labels, food thumbnails and a separate total/paid/amount-due summary. Paid orders must never inflate the outstanding amount. Client-side routes are `#customer`, `#customer/cart`, `#customer/orders` and `#customer/qr`, retaining the table query parameter.

Primary action text meets 4.5:1 on the deeper orange action surface; large orange prices use bold type. Mobile inputs stay at 16px and zoom remains enabled. Motion is limited to short state feedback. No reference restaurant logo, browser chrome, or source screenshots are embedded in the product.

## UI/UX refinement

Keep the reference-led customer identity. Basket lines separate food details from large quantity, edit and remove controls. Editing reopens the original choices and updates the existing line; matching choices merge once. The food sheet scrolls independently above its persistent action area, including short landscape viewports.

Measure checkout and order-summary height rather than reserving a fixed pixel estimate. Content and notices must clear those surfaces when translations wrap or totals change. Order history makes the next payment/preparation step explicit. Staff payment dialogs identify the selected order; multi-order tables expose each order's status and never claim the whole table is closed when only one order closes.

Kitchen tickets use an adaptive column count with at least 300px per ticket where space permits, larger food names and notes, and 56px action buttons. Mobile staff order details offer a direct return to table selection. Dialogs lock background scrolling, have accessible names and restore focus to their trigger.

Checkout accepts an order and clears its table basket with one browser-storage write. If that write fails, keep the basket and show a retry message. Successful checkout opens order history with the accepted order number. Draft choices, order totals and preparation/payment states survive page reloads in this browser; this is local preview persistence, not cross-device synchronization. Tabs of this browser follow the newest saved copy. A basket line whose dish is sold out is dimmed and labelled, and checkout stays disabled until it is removed. A cashier-entered order returns to its table panel. Closing a table's last open order starts an empty customer history for the next guests.
