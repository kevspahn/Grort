import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index';
import pool from '../../db/pool';

describe('Scenario: Register, create household, invite member, member sees receipts', () => {
  let ownerToken: string;
  let ownerId: string;
  let memberToken: string;
  let householdId: string;

  afterAll(async () => {
    await pool.query("DELETE FROM receipt_items WHERE receipt_id IN (SELECT id FROM receipts WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@holdout-onboard.com'))");
    await pool.query("DELETE FROM receipts WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@holdout-onboard.com')");
    await pool.query("DELETE FROM stores WHERE household_id IN (SELECT household_id FROM users WHERE email = 'owner@holdout-onboard.com')");
    await pool.query("DELETE FROM products WHERE household_id IN (SELECT household_id FROM users WHERE email = 'owner@holdout-onboard.com')");
    await pool.query("DELETE FROM users WHERE email LIKE '%@holdout-onboard.com'");
    await pool.query("DELETE FROM households WHERE name = 'Onboarding Test Household'");
    await pool.end();
  });

  it('step 1: register owner', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'owner@holdout-onboard.com', password: 'password123', name: 'Owner' });
    expect(res.status).toBe(201);
    ownerToken = res.body.token;
    ownerId = res.body.user.id;
  });

  it('step 2: create household', async () => {
    const res = await request(app)
      .post('/households')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Onboarding Test Household' });
    expect(res.status).toBe(201);
    householdId = res.body.id;

    // Re-login to get updated household in token context
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'owner@holdout-onboard.com', password: 'password123' });
    ownerToken = loginRes.body.token;
  });

  it('step 3: register member', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'member@holdout-onboard.com', password: 'password123', name: 'Member' });
    expect(res.status).toBe(201);
    memberToken = res.body.token;
  });

  it('step 4: invite member to household', async () => {
    const res = await request(app)
      .post(`/households/${householdId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'member@holdout-onboard.com' });
    expect(res.status).toBe(200);

    // Re-login member to get updated context
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'member@holdout-onboard.com', password: 'password123' });
    memberToken = loginRes.body.token;
  });

  it('step 5: member can see household members', async () => {
    const res = await request(app)
      .get(`/households/${householdId}/members`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const emails = res.body.map((m: any) => m.email);
    expect(emails).toContain('owner@holdout-onboard.com');
    expect(emails).toContain('member@holdout-onboard.com');
  });
});
