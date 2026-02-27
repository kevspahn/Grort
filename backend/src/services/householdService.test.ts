import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../db/pool';
import { authService } from './authService';
import { householdService } from './householdService';

describe('householdService', () => {
  let ownerId: string;
  let memberId: string;
  let householdId: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-hh-svc.com'");
    const ownerResult = await authService.register('owner@test-hh-svc.com', 'password123', 'Owner');
    ownerId = ownerResult.user.id;
    const memberResult = await authService.register('member@test-hh-svc.com', 'password123', 'Member');
    memberId = memberResult.user.id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-hh-svc.com'");
    if (householdId) {
      await pool.query('DELETE FROM households WHERE id = $1', [householdId]);
    }
    await pool.end();
  });

  it('creates a household and makes user owner', async () => {
    const hh = await householdService.createHousehold(ownerId, 'Smith Family');
    householdId = hh.id;
    expect(hh.name).toBe('Smith Family');
  });

  it('rejects creating household if user already in one', async () => {
    await expect(
      householdService.createHousehold(ownerId, 'Another')
    ).rejects.toThrow('User already belongs to a household');
  });

  it('invites a member', async () => {
    await householdService.inviteMember(householdId, ownerId, 'member@test-hh-svc.com');
    const members = await householdService.getMembers(householdId);
    expect(members).toHaveLength(2);
    const memberEntry = members.find((m) => m.email === 'member@test-hh-svc.com');
    expect(memberEntry!.household_role).toBe('member');
  });

  it('removes a member', async () => {
    await householdService.removeMember(householdId, ownerId, memberId);
    const members = await householdService.getMembers(householdId);
    expect(members).toHaveLength(1);
  });

  it('rejects non-owner removing members', async () => {
    // Re-add member first
    await householdService.inviteMember(householdId, ownerId, 'member@test-hh-svc.com');
    await expect(
      householdService.removeMember(householdId, memberId, ownerId)
    ).rejects.toThrow('Only household owners can remove members');
  });
});
