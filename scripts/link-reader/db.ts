// Database access for the link reader. Two versions with the same interface:
// - the live D1 database over Cloudflare's HTTP API (CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from .env)
// - a local SQLite file, for testing without touching the live app (--db-file)
// Always `?` placeholders: the data includes text from the web.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/** Same as d1_databases[0].database_id in wrangler.jsonc. */
const D1_DATABASE_ID = '9ba72caf-9d50-41b8-a63c-b1f3393c3b2b';

export interface Statement {
  sql: string;
  params?: SQLInputValue[];
}

export interface Db {
  all<T>(sql: string, params?: SQLInputValue[]): Promise<T[]>;
  /** Runs the statements in order, all or nothing. */
  batch(statements: Statement[]): Promise<void>;
  describe: string;
}

interface D1Response {
  success: boolean;
  errors: { message: string }[];
  result?: { results: unknown[] }[];
}

export function remoteDb(): Db {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set (in .env)');
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE_ID}/query`;

  async function post(body: unknown): Promise<{ results: unknown[] }[]> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as D1Response;
    if (!res.ok || !data.success) throw new Error(`D1: ${data.errors?.map((e) => e.message).join('; ') || res.statusText}`);
    return data.result ?? [];
  }

  return {
    describe: 'live D1 database',
    async all<T>(sql: string, params: SQLInputValue[] = []) {
      const [first] = await post({ sql, params });
      return (first?.results ?? []) as T[];
    },
    async batch(statements: Statement[]) {
      if (statements.length) await post({ batch: statements.map(({ sql, params = [] }) => ({ sql, params })) });
    },
  };
}

export function fileDb(file: string): Db {
  const db = new DatabaseSync(file);
  return {
    describe: file,
    async all<T>(sql: string, params: SQLInputValue[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async batch(statements: Statement[]) {
      db.exec('BEGIN');
      try {
        for (const { sql, params = [] } of statements) db.prepare(sql).run(...params);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
