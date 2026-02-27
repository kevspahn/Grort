import pool from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  google_id: string | null;
  household_id: string | null;
  household_role: string | null;
  created_at: Date;
}

export const userRepository = {
  async findByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] || null;
  },

  async findById(id: string): Promise<UserRow | null> {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async findByGoogleId(googleId: string): Promise<UserRow | null> {
    const { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    return rows[0] || null;
  },

  async create(data: {
    email: string;
    passwordHash: string | null;
    name: string;
    googleId?: string | null;
  }): Promise<UserRow> {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO users (id, email, password_hash, name, google_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, data.email, data.passwordHash, data.name, data.googleId || null]
    );
    return rows[0];
  },

  async updateHousehold(
    userId: string,
    householdId: string | null,
    role: 'owner' | 'member' | null
  ): Promise<UserRow> {
    const { rows } = await pool.query(
      `UPDATE users SET household_id = $1, household_role = $2 WHERE id = $3 RETURNING *`,
      [householdId, role, userId]
    );
    return rows[0];
  },

  async updateGoogleId(userId: string, googleId: string): Promise<UserRow> {
    const { rows } = await pool.query(
      `UPDATE users SET google_id = $1 WHERE id = $2 RETURNING *`,
      [googleId, userId]
    );
    return rows[0];
  },
};
