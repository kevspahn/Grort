import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://grort:grort@localhost:5433/grort',
});

// Either the shared pool or a checked-out client inside a transaction.
export type Executor = Pool | PoolClient;

export default pool;
