/**
 * Firestore Security Rules Specification & Verification Matrix
 * Documents expected ALLOW / PERMISSION_DENIED outcomes for the Dirty Dozen payloads.
 */
export interface SecurityTestCase {
  id: string;
  description: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'ALLOW' | 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: SecurityTestCase[] = [
  { id: 'DD-01', description: 'Unauthenticated order create', collection: 'orders', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 'DD-02', description: 'Unverified email spoofing bootstrapped owner', collection: 'outlet', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 'DD-03', description: 'Non-owner self-assigns role=owner in /users', collection: 'users', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 'DD-04', description: 'Shadow ghost field on /products create', collection: 'products', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 'DD-05', description: 'Invalid/oversized document ID on /categories', collection: 'categories', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 'DD-06', description: 'Cashier reading another user PII doc in /users', collection: 'users', operation: 'get', expected: 'PERMISSION_DENIED' },
  { id: 'DD-07', description: 'Orphaned order with non-existent shiftId', collection: 'orders', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 'DD-08', description: 'Cashier updating product price', collection: 'products', operation: 'update', expected: 'PERMISSION_DENIED' },
  { id: 'DD-09', description: 'Mutating an already voided order', collection: 'orders', operation: 'update', expected: 'PERMISSION_DENIED' },
  { id: 'DD-10', description: 'Mutating a closed shift', collection: 'shifts', operation: 'update', expected: 'PERMISSION_DENIED' },
  { id: 'DD-11', description: 'Forged createdAt timestamp != request.time', collection: 'orders', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 'DD-12', description: 'Cashier listing another cashier orders', collection: 'orders', operation: 'list', expected: 'PERMISSION_DENIED' },
];
