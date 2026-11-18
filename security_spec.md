# Security Specification — SajiPOS (PWA POS & Laporan Kuliner)

## 1. Data Invariants
1. **Master Gate & Global Deny**: Default catch-all denies all unauthenticated or unmatched paths (`match /{document=**} { allow read, write: if false; }`).
2. **Verified Identity**: Write operations require `isSignedIn()` and `request.auth.token.email_verified == true`.
3. **PII Isolation**: `/users/{userId}` stores email PII and may only be read by `request.auth.uid == userId` or the bootstrapped Owner (`malangjaya30@gmail.com`). No blanket `list` on `/users`.
4. **Prevent Self-Assigned Privilege Escalation**: A non-owner user creating their `/users/{uid}` document can only initialize with `role == 'cashier'` unless they are the bootstrapped Owner email (`malangjaya30@gmail.com` with verified email).
5. **Immutable Ownership & Timestamps**: `userId`, `outletId`, and `createdAt` cannot be modified on update. `createdAt == request.time` on create; `updatedAt == request.time` on create/update.
6. **Referential Integrity**: An `order` cannot be created unless its referenced `shiftId` exists in `/shifts/{shiftId}` and `outletId` exists in `/outlet/main`. An `expense` cannot be created unless its referenced `shiftId` exists.
7. **Terminal State Locking**: Once an `order` reaches `status == 'void'` or `status == 'cancelled'`, it cannot be mutated further. Once `status == 'completed'`, only an Owner/Manager can transition it to `'void'` (with mandatory `voidReason` and `voidBy`). Once a `shift` reaches `status == 'closed'`, it cannot be modified.
8. **Secure List Queries**: Every `allow list` rule evaluates `resource.data` directly (zero `get()`/`exists()` inside `allow list`). Kasir can only list their own orders/shifts (`resource.data.userId == request.auth.uid`), while Owner/Manager UIDs in `authorizedViewerIds` or the bootstrapped Owner can list all outlet orders/shifts.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Order Write**: Creating `/orders/ord_1` with `request.auth == null`.
2. **Unverified Email Spoofing**: Creating `/outlet/main` with `email: "malangjaya30@gmail.com"` and `email_verified: false`.
3. **Self-Assigned Owner Escalation**: Non-owner user creating `/users/attacker_uid` with `role: "owner"`.
4. **Shadow Ghost Field Injection**: Creating `/products/prod_1` with valid fields plus extra `ghostField: true`.
5. **Path ID Poisoning**: Creating `/categories/invalid..id/with/slashes` or a 500-char ID.
6. **PII Scraping**: Cashier attempting `get` or `list` on `/users/other_uid`.
7. **Orphaned Order Creation**: Creating `/orders/ord_orphan` referencing a non-existent `shiftId: "missing_shift"`.
8. **Cashier Modifying Product Price**: Cashier attempting `update` on `/products/prod_1` changing `price` from `25000` to `100`.
9. **Post-Void Order Tampering**: Updating an order whose existing `status` is `'void'` back to `'completed'`.
10. **Closed Shift Mutation**: Updating a `shift` whose existing `status` is `'closed'` to change `actualCash`.
11. **Timestamp Forgery**: Creating `/orders/ord_backdate` with a client-forged `createdAt` instead of `request.time`.
12. **Blanket Query Scraping**: Cashier querying `/orders` without `userId == request.auth.uid` filter.
