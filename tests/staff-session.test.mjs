import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBackOffice, resolveStaffUser, saveStaffMember } from '../src/backoffice-model.mjs';

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
  const changed = staff.map(member => member.id === 'cashier' ? { ...member, role: 'manager' } : member);
  assert.equal(resolveStaffUser(changed, 'cashier').role, 'manager');
});

test('disabling the selected person locks the session instead of becoming the owner', () => {
  const disabled = staff.map(member => member.id === 'cashier' ? { ...member, active: false } : member);
  assert.equal(resolveStaffUser(disabled, 'cashier'), null);
});

test('a removed or unknown selected person cannot fall back to the owner', () => {
  assert.equal(resolveStaffUser(staff.filter(member => member.id !== 'cashier'), 'cashier'), null);
  assert.equal(resolveStaffUser(staff, 'unknown'), null);
});

test('a saved kitchen account keeps its identity but remains locked until reassigned', () => {
  const legacy = { id: 'cook', name: 'Legacy cook', role: 'kitchen', pin: '4444', active: true };
  const activity = [{ type: 'ready', role: 'kitchen', by: 'Legacy cook', at: 100 }];
  const saved = normalizeBackOffice({ staff: [...staff, legacy], activity });
  assert.deepEqual(saved.staff.find(member => member.id === 'cook'), legacy);
  assert.deepEqual(saved.activity, activity);
  assert.equal(resolveStaffUser(saved.staff, 'cook'), null);

  const reassigned = saveStaffMember(saved.staff, { ...legacy, role: 'cashier' }, 1000, 'owner');
  assert.deepEqual(resolveStaffUser(reassigned, 'cook'), { ...legacy, role: 'cashier' });
});
