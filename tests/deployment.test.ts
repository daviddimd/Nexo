import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configurationIssues} from '../src/server/deployment';
import {spawnSync} from 'node:child_process';
const safe={NODE_ENV:'production',DATABASE_URL:'configured',APP_ORIGIN:'https://nexo.example.test',NEXO_SIMULATOR_ENABLED:'false',NEXO_LOCAL_MAIL_ENABLED:'false'} as const;
test('production configuration accepts explicit disabled local features',()=>assert.deepEqual(configurationIssues(safe),[]));
test('production rejects insecure origin and local features',()=>{
  const issues=configurationIssues({...safe,APP_ORIGIN:'http://nexo.example.test',NEXO_SIMULATOR_ENABLED:'true',NEXO_LOCAL_MAIL_ENABLED:undefined});
  assert.ok(issues.includes('HTTPS_ORIGIN_REQUIRED'));assert.ok(issues.includes('SIMULATOR_MUST_BE_DISABLED'));assert.ok(issues.includes('LOCAL_MAIL_MUST_BE_DISABLED'));
});
test('runtime rejects administrative credentials without printing values',()=>{
  const env={...safe,NEXO_OPERATOR_DATABASE_URL:'sentinel-private-value-8394',NEXO_LICENSE_PRIVATE_KEY_FILE:'sentinel-private-value-8394'};
  assert.ok(configurationIssues(env).includes('ADMINISTRATIVE_SECRETS_IN_RUNTIME'));assert.ok(!JSON.stringify(configurationIssues(env)).includes('sentinel-private-value-8394'));
  assert.ok(!configurationIssues(env,true).includes('ADMINISTRATIVE_SECRETS_IN_RUNTIME'));assert.ok(configurationIssues(env,true).includes('PRIVATE_SIGNING_KEY_FORBIDDEN'));
});
test('doctor CLI returns structured failure without configured connection',()=>{
  const result=spawnSync(process.execPath,['--import','tsx','scripts/doctor.ts'],{env:{...process.env,...safe,DATABASE_URL:''},encoding:'utf8'});
  assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).ok,false);assert.equal(result.stderr,'');
});
test('origin rejects embedded credentials, paths and non-http protocols',()=>{
  for(const APP_ORIGIN of ['https://user:pass@example.test','https://example.test/path','file:///tmp','invalid'])assert.ok(configurationIssues({...safe,APP_ORIGIN}).includes('INVALID_APP_ORIGIN'));
});
test('missing database and half configured license are reported',()=>{
  const issues=configurationIssues({...safe,DATABASE_URL:'',NEXO_INSTALLATION_FILE:'identity.json'});assert.ok(issues.includes('DATABASE_URL_REQUIRED'));assert.ok(issues.includes('INCOMPLETE_LICENSE_CONFIGURATION'));
});
