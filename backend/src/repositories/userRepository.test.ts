import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../db/pool';
import { userRepository } from './userRepository';

describe('userRepository', () => {
  beforeAll(async () => {
    // Clean up test users
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-repo.com'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@test-repo.com'");
    await pool.end();
  });

  it('creates a user', async () => {
    const user = await userRepository.create({
      email: 'alice@test-repo.com',
      passwordHash: 'hashed',
      name: 'Alice',
    });
    expect(user.id).toBeDefined();
    expect(user.email).toBe('alice@test-repo.com');
    expect(user.name).toBe('Alice');
  });

  it('finds user by email', async () => {
    const user = await userRepository.findByEmail('alice@test-repo.com');
    expect(user).not.toBeNull();
    expect(user!.name).toBe('Alice');
  });

  it('finds user by id', async () => {
    const created = await userRepository.create({
      email: 'bob@test-repo.com',
      passwordHash: 'hashed',
      name: 'Bob',
    });
    const user = await userRepository.findById(created.id);
    expect(user).not.toBeNull();
    expect(user!.name).toBe('Bob');
  });

  it('returns null for nonexistent email', async () => {
    const user = await userRepository.findByEmail('nobody@test-repo.com');
    expect(user).toBeNull();
  });
});
