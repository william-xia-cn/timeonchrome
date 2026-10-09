// 隔离SQLite结构验证；不连接D1、生产目录或真实数据库。
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new DatabaseSync(':memory:');
try {
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(readFileSync(new URL('../migrations/0003_runtime_machine_control_plane.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0017_runtime_program_instances.sql', import.meta.url), 'utf8'));
  db.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms)
    VALUES(?,?,'windows',?,0,0,0)`).run('machine-a','family-a','synthetic-token-hash');
  const assignment=db.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES('machine-a','user-a',?,?,1,'override',0,0)`);
  assignment.run(1,'child-a'); assignment.run(2,'child-b');
  const instance=db.prepare(`INSERT INTO runtime_program_instances_v1 VALUES('machine-a',?,'{}',1,'{}','synthetic-hash',0)`);
  instance.run('instance-a'); instance.run('instance-b');
  const scope=db.prepare(`INSERT INTO runtime_program_instance_scopes_v1 VALUES(?,'machine-a',?,'user-a',?)`);
  scope.run('child-a','instance-a',1); scope.run('child-b','instance-a',2);
  assert.throws(()=>scope.run('child-a','missing',1),/FOREIGN KEY/);
  assert.throws(()=>scope.run('child-a','instance-a',99),/PROGRAM_INSTANCE_CHILD_SCOPE_MISMATCH/);
  assert.throws(()=>scope.run('child-b','instance-b',1),/PROGRAM_INSTANCE_CHILD_SCOPE_MISMATCH/);
  assert.throws(()=>db.exec("UPDATE runtime_program_instance_scopes_v1 SET child_id='child-b' WHERE child_id='child-a'"),/PROGRAM_INSTANCE_SCOPE_IMMUTABLE/);
  scope.run('child-a','instance-b',1);
  const mapping=db.prepare(`INSERT INTO runtime_program_instance_mappings_v1 VALUES(?,'machine-a',?,1,1,?,?,?)`);
  mapping.run('child-a','instance-a','confirmed','product-a','["rule-a"]');
  mapping.run('child-b','instance-a','unresolved',null,'[]');
  assert.throws(()=>mapping.run('child-b','instance-b','unresolved',null,'[]'),/PROGRAM_INSTANCE_SCOPE_MISSING/);
  assert.throws(()=>db.exec("UPDATE runtime_program_instance_mappings_v1 SET child_id='child-c'"),/PROGRAM_INSTANCE_MAPPING_KEY_IMMUTABLE/);
  assert.throws(()=>mapping.run('child-a','instance-a','confirmed','product-b','[]'),/UNIQUE/);
  assert.throws(()=>mapping.run('child-a','instance-b','unresolved','product-a','[]'),/CHECK/);
  assert.throws(()=>mapping.run('child-a','instance-b','confirmed',null,'[]'),/CHECK/);
  assert.throws(()=>mapping.run('child-a','instance-b','conflict',null,'{}'),/CHECK/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM runtime_program_instance_scopes_v1').get().n,3);
  assert.equal(db.prepare("SELECT product_id FROM runtime_program_instance_mappings_v1 WHERE child_id='child-a'").get().product_id,'product-a');
  assert.equal(db.prepare("SELECT product_id FROM runtime_program_instance_mappings_v1 WHERE child_id='child-b'").get().product_id,null);
  console.log('program instance isolated storage PASS; HTTP授权、版本替换及D1运行验证仍待接线');
} finally { db.close(); }
