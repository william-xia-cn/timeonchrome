'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE usage_segments_v1(id TEXT,profile_id TEXT,device_id TEXT,date TEXT,
 channel TEXT,duration_seconds INTEGER,uploaded_at INTEGER,updated_at INTEGER,
 start_ms INTEGER,end_ms INTEGER,timezone TEXT,quota_bucket_at_time TEXT,mode TEXT);
 CREATE TABLE usage_segment_corrections_v1(id TEXT,segment_id TEXT,profile_id TEXT,device_id TEXT,date TEXT,
 created_at INTEGER,duration_seconds INTEGER,start_ms INTEGER,end_ms INTEGER,
 original_quota_bucket TEXT,original_mode TEXT,effective_quota_bucket TEXT);`);
const insert = db.prepare('INSERT INTO usage_segments_v1 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
for (let i = 0; i < 101; i++) insert.run(String(i), 'p', 'd', '2026-09-21', 'active', 1, 10, 10,
  1000 + i * 1000, 2000 + i * 1000, '+08:00', 'study', 'study');
for (const [id,p,d,channel,uploaded] of [['other','other','d','active',10],
 ['other-device','p','other','active',10],['audio','p','d','audio',10],['future','p','d','active',101]]) {
  insert.run(id,p,d,'2026-09-21',channel,1,uploaded,uploaded,200000,201000,'+08:00','study','study');
}
const correction = db.prepare('INSERT INTO usage_segment_corrections_v1 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
correction.run('c','0','p','d','2026-09-21',20,1,1000,2000,'study','study','rest');
const statements = [];
const env = { DB: {
  prepare(sql) { statements.push(sql); return { bind(...args) { return { sql, args }; } }; },
  async batch(batch) { return batch.map(({sql,args}) => ({ success: true, results: db.prepare(sql).all(...args) })); },
} };
const source = fs.readFileSync('workers/src/services/usageAccountingCorrections.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { exports: mod.exports, module: mod, require: () => ({}), console });
(async () => {
  const read = mod.exports.listDeviceIntervalEvidencePage;
  const first = await read(env,'p','d','2026-09-21',100,0);
  const last = await read(env,'p','d','2026-09-21',100,100);
  assert.equal(first.total,101); assert.equal(first.items.length,100); assert.equal(first.nextOffset,100);
  assert.equal(last.items.length,1); assert.equal(last.nextOffset,null); assert.equal(last.revision,first.revision);
  assert.equal(first.items[0].quotaBucket,'rest');
  assert.deepEqual(Object.keys(first.items[0]).sort(), ['durationSeconds','endMs','quotaBucket','startMs','timezone']);
  const before = await read(env,'p','d','2026-09-21',15,0);
  assert.equal(before.items[0].quotaBucket,'study');
  correction.run('late','1','p','d','2026-09-21',101,1,2000,3000,'study','study','rest');
  assert.equal((await read(env,'p','d','2026-09-21',100,0)).revision,first.revision);
  db.prepare("DELETE FROM usage_segments_v1 WHERE id='100'").run();
  assert.notEqual((await read(env,'p','d','2026-09-21',100,0)).revision,first.revision);
  db.prepare("UPDATE usage_segment_corrections_v1 SET duration_seconds=2 WHERE id='c'").run();
  await assert.rejects(read(env,'p','d','2026-09-21',100,0), /CONFLICT/);
  assert.ok(statements.every((sql) => sql.trim().startsWith('SELECT')));
  db.close(); console.log('[Device interval evidence] SQLite scope/pagination/privacy/conflict passed');
})().catch((error) => { console.error(error); process.exitCode=1; });
