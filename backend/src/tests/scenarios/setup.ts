import pool from '../../db/pool';
import { authService } from '../../services/authService';
import { householdService } from '../../services/householdService';

export interface TestContext {
  ownerToken: string;
  ownerId: string;
  memberToken: string;
  memberId: string;
  householdId: string;
  prefix: string;
}

export async function setupTestHousehold(prefix: string): Promise<TestContext> {
  const domain = `@holdout-${prefix}.com`;
  const householdName = `Holdout ${prefix} Household`;

  // Clean up any previous test data
  await pool.query(`DELETE FROM users WHERE email LIKE '%${domain}'`);
  await pool.query(`DELETE FROM households WHERE name = '${householdName}'`);

  // Create owner
  const ownerResult = await authService.register(`owner${domain}`, 'password123', 'Test Owner');
  const ownerId = ownerResult.user.id;

  // Create household
  const household = await householdService.createHousehold(ownerId, householdName);
  const householdId = household.id;

  // Re-login to get updated token
  const ownerLogin = await authService.login(`owner${domain}`, 'password123');

  // Create member
  const memberResult = await authService.register(`member${domain}`, 'password123', 'Test Member');
  const memberId = memberResult.user.id;

  // Invite member
  await householdService.inviteMember(householdId, ownerId, `member${domain}`);
  const memberLogin = await authService.login(`member${domain}`, 'password123');

  return {
    ownerToken: ownerLogin.token,
    ownerId,
    memberToken: memberLogin.token,
    memberId,
    householdId,
    prefix,
  };
}

export async function cleanupTestData(prefix: string) {
  const domain = `@holdout-${prefix}.com`;
  const householdName = `Holdout ${prefix} Household`;

  await pool.query(`DELETE FROM receipt_items WHERE receipt_id IN (SELECT id FROM receipts WHERE household_id IN (SELECT id FROM households WHERE name = '${householdName}'))`);
  await pool.query(`DELETE FROM receipts WHERE household_id IN (SELECT id FROM households WHERE name = '${householdName}')`);
  await pool.query(`DELETE FROM products WHERE household_id IN (SELECT id FROM households WHERE name = '${householdName}')`);
  await pool.query(`DELETE FROM stores WHERE household_id IN (SELECT id FROM households WHERE name = '${householdName}')`);
  await pool.query(`DELETE FROM users WHERE email LIKE '%${domain}'`);
  await pool.query(`DELETE FROM households WHERE name = '${householdName}'`);
}
