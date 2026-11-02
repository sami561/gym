/* Creates one PostgreSQL database per microservice (idempotent). Usage: npm run db:create */
require('dotenv').config();
const { Client } = require('pg');

const SERVICES = ['auth', 'membership', 'class', 'access', 'notification', 'staff', 'facility', 'commerce', 'training', 'workflow'];

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: 'postgres',
  });
  await client.connect();
  for (const service of SERVICES) {
    const name = process.env[`${service.toUpperCase()}_DB_NAME`] || `meliora_${service}`;
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount) {
      console.log(`= ${name} already exists`);
    } else {
      await client.query(`CREATE DATABASE "${name}"`);
      console.log(`+ created ${name}`);
    }
  }
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
