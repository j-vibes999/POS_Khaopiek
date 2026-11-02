# Khao Piek POS
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Prototype implementation choice: React + Vite, browser-local state, no backend. The user requested an immediately usable visual prototype and deferred database work; framework selection is an implementation assumption, not a confirmed long-term constraint.

## Users
Restaurant customers, cashiers, cooks, and restaurant owners in Laos, especially noodle and khao piek shops.

## Product Purpose
Allow customers to order from table QR links, cashiers to verify payment, and cooks to prepare accepted orders. Reduce staff interruptions and mistakes about tables and food.

## Capabilities and Constraints
Current scope is a clickable UI/UX prototype only. No database, actual transfers, bank verification, authentication, or live multi-device synchronization. User explicitly requires Lao as the primary language with a Thai switch, large readable controls, simplicity, beauty, and no generic AI appearance. Demo data must be identified as such.

## Operating Context
Counter tablets and desktops; customers use phones; cooks need a clear queue. Payment confirmation precedes kitchen work in the proposed flow. A manual cashier entry path supports customers who do not scan.

## Product Principles
- Make the next action obvious.
- Large touch targets and readable Lao typography.
- Keep payment state separate from preparation state.
- Show table context throughout ordering.
- Preserve entered work and prevent accidental repeated actions.

## Evidence on Hand
An empty project and the conversation brief. Restaurant name and menu prices are illustrative prototype content.

## Customer UI Reference
The user supplied six mobile ordering screenshots as a design reference. The customer surface follows their orange/white palette, large two-column food photography, prominent prices, search and scrolling categories, grid/list switch, three-tab bottom navigation (Menu / Orders / QR), full-page basket, and table-specific order history. Customer language selection covers Lao, Thai, English, Chinese, Korean and Japanese; Lao remains the initial language. Restaurant branding, sample dishes, and payment-before-kitchen flow remain this project's own.
