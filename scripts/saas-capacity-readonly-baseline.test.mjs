import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
test('capacity baseline is only two bounded aggregate SELECTs without PII or mutation',()=>{
 const source=readFileSync('docs/saas/sql/readonly-capacity-baseline.sql','utf8');
 const sql=source.split('\n').filter(row=>!row.trim().startsWith('--')).join('\n');
 const statements=sql.split(';').map(x=>x.trim()).filter(Boolean);
 assert.equal(statements.length,2);
 for(const s of statements) {
  assert.match(s,/^SELECT\s/i);
  assert.doesNotMatch(s,/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|DO|COPY|EXPLAIN|EXECUTE|CALL|PERFORM|pg_sleep)\b/i);
  assert.doesNotMatch(s,/\b(query|usename|client_addr|patient|auth\.users|storage\.objects)\b/i);
 }
 assert.match(statements[0],/FROM pg_stat_activity/i);
 assert.match(statements[1],/FROM pg_stat_database/i);
});
