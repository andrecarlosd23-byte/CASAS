// Armazenamento persistente dos mundos.
// - Se DATABASE_URL estiver definida: PostgreSQL (ex.: Neon, Supabase — planos gratuitos).
// - Caso contrário: arquivos JSON na pasta DATA_DIR (padrão ./data).
import fs from 'node:fs/promises';
import path from 'node:path';

export async function createStorage() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const ssl = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) || process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false };
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 4 });
    await pool.query(`CREATE TABLE IF NOT EXISTS casas3d_worlds (
      id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    console.log('[storage] PostgreSQL');
    return {
      kind: 'postgres',
      async get(id) {
        const r = await pool.query('SELECT data FROM casas3d_worlds WHERE id=$1', [id]);
        return r.rows[0] ? JSON.parse(r.rows[0].data) : null;
      },
      async put(id, world) {
        await pool.query(`INSERT INTO casas3d_worlds (id, data, updated_at) VALUES ($1,$2,now())
          ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`, [id, JSON.stringify(world)]);
      },
      async exists(id) { const r = await pool.query('SELECT 1 FROM casas3d_worlds WHERE id=$1', [id]); return r.rowCount > 0; },
    };
  }
  const dir = path.resolve(process.env.DATA_DIR || './data');
  await fs.mkdir(dir, { recursive: true });
  const file = id => path.join(dir, id.replace(/[^A-Z0-9]/gi, '') + '.json');
  console.log('[storage] arquivos em', dir);
  return {
    kind: 'files',
    async get(id) {
      try { return JSON.parse(await fs.readFile(file(id), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async put(id, world) {
      const f = file(id), tmp = f + '.' + process.pid + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(world));
      await fs.rename(tmp, f); // gravação atômica
    },
    async exists(id) { try { await fs.access(file(id)); return true; } catch { return false; } },
  };
}
