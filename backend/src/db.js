'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function createPool(url) {
  if (!url) throw new Error('DATABASE_URL is not set');
  const ssl = /sslmode=require/.test(url) || process.env.PGSSL === 'require' ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' } : undefined;
  return new Pool({ connectionString: url, ssl, max: +(process.env.PG_POOL_MAX || 10) });
}

async function migrate(pool) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // Serialise concurrent starts (several containers) with an advisory lock.
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(724001)');
    await c.query(sql);
  } finally {
    await c.query('SELECT pg_advisory_unlock(724001)').catch(() => {});
    c.release();
  }
}

async function waitForDb(pool, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try { await pool.query('SELECT 1'); return; } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

module.exports = { createPool, migrate, waitForDb };
