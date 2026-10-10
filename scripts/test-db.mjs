// Applies every migration to an in-memory Postgres (PGlite) and runs the SQL tests.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

const db = new PGlite();
await db.exec(read('tests', '_stubs.sql'));
for (const f of fs.readdirSync(path.join(root, 'migrations')).sort()) {
  await db.exec(read('migrations', f));
}

let failed = 0;
const tests = fs.readdirSync(path.join(root, 'tests')).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
for (const t of tests) {
  try {
    const res = await db.exec(read('tests', t));
    console.log(`PASS ${t}: ${res.at(-1).rows[0].result}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${t}: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
