import { describe, expect, it } from 'vitest';
import { splitSqlStatements } from './db';

describe('splitSqlStatements', () => {
  it('splits plain statements', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('keeps semicolons inside dollar-quoted DO blocks', () => {
    const sql = `DO $$ BEGIN
  ALTER TABLE t ADD CONSTRAINT c FOREIGN KEY (id) REFERENCES o(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE x (id INT);`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain('DO $$');
    expect(stmts[0]).toContain('THEN NULL;');
    expect(stmts[0]).toContain('END $$');
    expect(stmts[1]).toBe('CREATE TABLE x (id INT)');
  });

  it('ignores semicolons in single-quoted strings', () => {
    expect(splitSqlStatements("INSERT INTO t VALUES ('a;b'); SELECT 1;")).toEqual([
      "INSERT INTO t VALUES ('a;b')",
      'SELECT 1',
    ]);
  });
});
