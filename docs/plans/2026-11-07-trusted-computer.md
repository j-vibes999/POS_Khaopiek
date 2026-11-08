# Direct entry on the restaurant computer

The owner wants to open the existing real Supabase POS without entering an account or password. Keep first-use shop-name entry, all real database writes, customer QR ordering, and the existing cashier payment/printing flow. Limit direct administrative entry to the current computer.

Implementation:

1. Register a revocable device credential by hash in Supabase; keep the random original only in ignored `.env.local` on this computer. No fake Auth users or shared account passwords.
2. Add private device-bound SQL wrappers for current transactional staff operations. Direct anonymous staff RPCs and public table writes remain denied.
3. Add a local gateway to Vite development/preview. Check loopback remote address, loopback Host, exact Origin, JSON and a custom request header. Never expose the credential to browser code, localStorage, links, QR or logs.
4. Detect this gateway on localhost and enter the real shop directly. For an unconfigured shop ask only its name. Hide account/signout controls for this mode. Hosted and other devices retain normal account access.
5. Test invalid/revoked credentials, cross-origin/LAN denial, real empty onboarding, full existing SQL workflows, customer ordering and one payment/print, reopen persistence. Update database installation artifacts and operational docs.

Provisioning needs a one-time database-admin SQL operation because the current publishable key cannot grant new ownership. A generated local installation file contains only the device hash, not its raw key. Once installed, subsequent opens require no account form on this computer. Existing real shops must be preserved and reused where already bound to the authorized owner.
