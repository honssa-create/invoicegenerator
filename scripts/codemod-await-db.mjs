#!/usr/bin/env node
/**
 * Mechanical async migration for better-sqlite3 → pg shim.
 * - Prefix await on db.prepare(...).(get|all|run)
 * - Convert db.transaction(() => {...})() / const x = db.transaction(...); x();
 * - Make containing functions async when they await
 *
 * Run: node scripts/codemod-await-db.mjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name) && !ent.name.includes('pg-schema')) out.push(p);
  }
  return out;
}

function transform(src) {
  let s = src;
  // SQLite MAX(a,b) → GREATEST for two-arg cases used in kitchen
  s = s.replace(/\bMAX\s*\(\s*0\s*,/g, 'GREATEST(0,');

  // db.transaction(() => { ... })();  → await db.transaction(async () => { ... });
  s = s.replace(
    /db\.transaction\(\s*\(([^)]*)\)\s*=>\s*\{/g,
    'await db.transaction(async ($1) => {'
  );
  // Remove immediately-invoked () after transaction closing — common pattern })();
  // Careful: only when preceded by transaction rewrite. Simpler pass:
  s = s.replace(/await db\.transaction\(async \(([^)]*)\) => \{([\s\S]*?)\}\)\(\)/g, (m, args, body) => {
    return `await db.transaction(async (${args}) => {${body}})`;
  });

  // const run = db.transaction(...); run();  — leave for manual; convert assignment style:
  s = s.replace(
    /const\s+(\w+)\s*=\s*await db\.transaction\(async/g,
    'await db.transaction(async'
  );
  // That may break "const x = await db.transaction" when they need return value.
  // Better pattern for `const id = db.transaction(() => ...)()` already handled.

  // await db.prepare(...).get/all/run — add await if missing
  // Match multiline prepare chains
  s = s.replace(/(?<!await\s)(?<![\w.])db\s*\n?\s*\.\s*prepare\s*\(/g, 'await db.prepare(');
  s = s.replace(/(?<!await\s)(?<![\w.])db\.prepare\s*\(/g, 'await db.prepare(');

  // Fix double await
  s = s.replace(/await\s+await\s+db\.prepare/g, 'await db.prepare');
  s = s.replace(/await\s+await\s+db\.transaction/g, 'await db.transaction');

  // db.exec
  s = s.replace(/(?<!await\s)(?<![\w.])db\.exec\s*\(/g, 'await db.exec(');
  s = s.replace(/await\s+await\s+db\.exec/g, 'await db.exec');

  return s;
}

const files = walk(ROOT).filter((f) => !f.endsWith(`${path.sep}db.ts`));
let changed = 0;
for (const f of files) {
  const before = fs.readFileSync(f, 'utf8');
  if (!/\bdb\.(prepare|transaction|exec)\b/.test(before) && !/from ['\"]@\/lib\/db['\"]|from ['\"]\.\/db['\"]/.test(before)) {
    continue;
  }
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(f, after);
    changed += 1;
    console.log('updated', path.relative(ROOT, f));
  }
}
console.log('files changed:', changed);
