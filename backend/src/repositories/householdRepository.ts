import pool from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

export interface HouseholdRow {
  id: string;
  name: string;
  created_at: Date;
}

export interface HouseholdMemberRow {
  id: string;
  email: string;
  name: string;
  household_role: string;
}

export const householdRepository = {
  async create(name: string): Promise<HouseholdRow> {
    const id = uuidv4();
    const { rows } = await pool.query(
      'INSERT INTO households (id, name) VALUES ($1, $2) RETURNING *',
      [id, name]
    );
    return rows[0];
  },

  async findById(id: string): Promise<HouseholdRow | null> {
    const { rows } = await pool.query('SELECT * FROM households WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async getMembers(householdId: string): Promise<HouseholdMemberRow[]> {
    const { rows } = await pool.query(
      'SELECT id, email, name, household_role FROM users WHERE household_id = $1',
      [householdId]
    );
    return rows;
  },

  async removeMember(householdId: string, userId: string): Promise<void> {
    await pool.query(
      'UPDATE users SET household_id = NULL, household_role = NULL WHERE id = $1 AND household_id = $2',
      [userId, householdId]
    );
  },
};
