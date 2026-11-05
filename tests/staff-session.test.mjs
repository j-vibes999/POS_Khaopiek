import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStaffUser } from '../src/backoffice-model.mjs';

const staff = [
  { id: 'former-owner', name: 'Former owner', role: 'owner', pin: '0000', active: false },
  { id: 'owner', name: 'Owner', role: 'owner', pin: '1111', active: true },
  { id: 'cashier', name: 'Cashier', role: 'cashier', pin: '3333', active: true },
];

test('the initial demo may open as the active owner when no person was selected', () => {
  assert.equal(resolveStaffUser(staff, '').id, 'owner');
  assert.equal(resolveStaffUser([], ''), null);
});

test('a selected active person keeps their own current role', () => {
  assert.equal(resolveStaffUser(staff, 'cashier').role, 'cashier');
  const changed = staff.map(member => member.id === 'cashier' ? { ...member, role: 'kitchen' } : member);
  assert.equal(resolveStaffUser(changed, 'cashier').role, 'kitchen');
});

test('disabling the selected person locks the session instead of becoming the owner', () => {
  const disabled = staff.map(member => member.id === 'cashier' ? { ...member, active: false } : member);
  assert.equal(resolveStaffUser(disabled, 'cashier'), null);
});

test('a removed or unknown selected person cannot fall back to the owner', () => {
  assert.equal(resolveStaffUser(staff.filter(member => member.id !== 'cashier'), 'cashier'), null);
  assert.equal(resolveStaffUser(staff, 'unknown'), null);
});
