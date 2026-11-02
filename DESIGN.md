# Khao Piek visual system

Operate mode. A welcoming neighborhood noodle shop translated into clear, quiet software: warm rice-white surfaces, bottle-green actions, terracotta attention states, and generous Lao typography. No decorative charts or marketing sections.

The cashier first viewport is a spatial table overview with a persistent order rail. A selected table makes payment and kitchen readiness explicit. Food photography belongs in menus, not the operational table overview. Kitchen uses larger queue tickets; customer ordering is mobile-first. Shared type, action shapes and state vocabulary connect all roles.

Primary controls are 48–56px tall; table targets exceed 160px. Table numbers and money are visually dominant. Use a single Lao/Thai-capable family, readable neutral secondary text, gentle 12–16px corners, and small consistent Lucide icons. Motion only follows selection or state changes and honors reduced motion.

Grounded material candidates: neighborhood storefront lettering, ceramic soup bowls, market produce labels, Lao printed menus, cotton apron seams, rice-paper packaging, and the quiet white/green enamel of a family restaurant. The seventh assigned material is carried through the porcelain-like surfaces and green edges, with standard web controls. Challenger takeaways: strict typography, scanable tile rhythm, aligned amounts, and restrained state marks. Experimental pan-and-tilt or tiny print would impair the stated large-touch task and are declined.

Build directly in code for this requested clickable prototype; this is a session choice, not a saved user workflow preference. Demo prices and restaurant content are illustrative. No payment confirmation claims originate outside this browser prototype.

## Customer surface: reference-led revision

The user's mobile references supersede the earlier green styling for customer ordering. `src/Customer.jsx` and `src/customer.css` own this surface. Staff screens retain their existing visual system.

Use clean white headers and checkout surfaces over a cool near-white canvas; orange marks prices, selection and action. Food photographs lead a borderless two-column mobile grid. Restaurant/table identity and a six-language dropdown sit above search. Categories scroll horizontally beside the grid/list controls. The only persistent customer navigation is Menu, Orders and QR; staff preview access lives on the QR page.

The basket is its own page with reversible removal, readable quantity controls and a fixed total/submit region. Order history uses white tickets, explicit status labels, food thumbnails and a separate total/paid/amount-due summary. Paid orders must never inflate the outstanding amount. Client-side routes are `#customer`, `#customer/cart`, `#customer/orders` and `#customer/qr`, retaining the table query parameter.

Primary action text meets 4.5:1 on the deeper orange action surface; large orange prices use bold type. Mobile inputs stay at 16px and zoom remains enabled. Motion is limited to short state feedback. No reference restaurant logo, browser chrome, or source screenshots are embedded in the product.
