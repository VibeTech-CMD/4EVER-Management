/**
 * @file firestore.rules.test.ts
 * @description Test suite specification validating the "Dirty Dozen" attack vectors against Firestore security rules.
 * Requires @firebase/rules-unit-testing and local Firestore Emulator when executed in CI.
 */

export interface SecurityTestCase {
  id: string;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED' | 'ALLOWED';
  rationale: string;
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 'DD-01',
    name: 'Unauthenticated Read on Events',
    collection: '/events/evt_01',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    rationale: 'isActiveUser() requires authenticated verified Firebase user.',
  },
  {
    id: 'DD-02',
    name: 'Unverified Email Admin Spoofing',
    collection: '/systemConfig/main',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    rationale: 'isBootstrapAdmin() enforces request.auth.token.email_verified == true.',
  },
  {
    id: 'DD-03',
    name: 'Self-Privilege Escalation to MASTER_ADMIN on User Create',
    collection: '/users/attacker_uid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Non-bootstrap users cannot create role MASTER_ADMIN.',
  },
  {
    id: 'DD-04',
    name: 'Role Tampering on User Update',
    collection: '/users/member_uid',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'Non-master users cannot modify role, status, or permissions fields.',
  },
  {
    id: 'DD-05',
    name: 'Shadow Field Injection on Quote Create',
    collection: '/quotes/quote_01',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidQuote() enforces strict keys().hasOnly() whitelist.',
  },
  {
    id: 'DD-06',
    name: 'ID Poisoning (Oversized Document ID > 128 chars)',
    collection: '/events/' + 'a'.repeat(200),
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidId() restricts IDs to 1-128 alphanumeric/underscore/hyphen characters.',
  },
  {
    id: 'DD-07',
    name: 'Author Spoofing (createdBy != auth.uid)',
    collection: '/quotes/quote_02',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Rules require incoming().createdBy == request.auth.uid.',
  },
  {
    id: 'DD-08',
    name: 'Timestamp Forgery on Event Create',
    collection: '/events/evt_02',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Rules enforce incoming().createdAt == request.time and updatedAt == request.time.',
  },
  {
    id: 'DD-09',
    name: 'Orphaned Subcollection Task Write',
    collection: '/events/missing_evt/tasks/task_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Master Gate requires exists(/databases/$(database)/documents/events/$(eventId)).',
  },
  {
    id: 'DD-10',
    name: 'Audit Log Tampering (Update/Delete)',
    collection: '/auditLogs/log_01',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'Audit logs are strictly immutable append-only.',
  },
  {
    id: 'DD-11',
    name: 'Viewer Role Write Attempt on Expense',
    collection: '/expenses/exp_01',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'canWriteOperational() excludes VIEWER role.',
  },
  {
    id: 'DD-12',
    name: 'Blanket List Scraping by External Authenticated User',
    collection: '/quotes',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    rationale: 'allow list requires request.auth.uid in resource.data.authorizedUids.',
  },
];
