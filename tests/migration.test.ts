import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createCompany } from '../src/server/auth';
import { migrate } from '../scripts/migrate';
import {recordCommercial} from '../src/server/commercial';

test('upgrade preserves stage-2 order, stage-3 captures, ledger and stock', {skip:!process.env.TEST_DATABASE_URL}, async()=>{
  const testUrl=process.env.TEST_DATABASE_URL!;const url=new URL(testUrl);assert.match(url.pathname,/test/i);
  const schema=`nexo_upgrade_test_${randomUUID().replaceAll('-','')}`;
  const admin=new Pool({connectionString:testUrl});let pool:Pool|undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options',`-c search_path=${schema}`);
    pool=new Pool({connectionString:url.toString()});
    await pool.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    for(const name of ['001-foundation.sql','002-orders.sql']) {
      const sql=await readFile(`db/${name}`,'utf8');await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,createHash('sha256').update(sql).digest('hex')]);
    }
    const company=await createCompany(pool,{slug:`upgrade-${randomUUID().slice(0,8)}`,name:'Existing business',email:'owner@example.test',password:'Upgrade-password-123!'});
    const location=randomUUID(),product=randomUUID(),operation=randomUUID(),order=randomUUID();
    await pool.query("INSERT INTO locations(id,company_id,name,kind) VALUES($1,$2,'Existing store','STORE')",[location,company.companyId]);
    await pool.query("INSERT INTO products(id,company_id,sku,name,price_minor) VALUES($1,$2,'OLD-001','Existing product',10000)",[product,company.companyId]);
    await pool.query('INSERT INTO stock(company_id,product_id,location_id,on_hand) VALUES($1,$2,$3,1)',[company.companyId,product,location]);
    await pool.query(`INSERT INTO inventory_operations(id,company_id,actor_id,idempotency_key,request_hash,kind,reason)
      VALUES($1,$2,$3,'old-sale-key','legacy-hash','SALE','Existing sale')`,[operation,company.companyId,company.userId]);
    await pool.query(`INSERT INTO stock_movements(id,company_id,operation_id,product_id,location_id,delta,on_hand_after)
      VALUES($1,$2,$3,$4,$5,-1,1)`,[randomUUID(),company.companyId,operation,product,location]);
    await pool.query(`INSERT INTO orders(id,company_id,customer_id,created_by,channel,fulfillment,location_id,status,total_minor,
      idempotency_key,request_hash,expires_at,payment_method,payment_reference,paid_by,paid_at,sale_operation_id)
      VALUES($1,$2,$3,$3,'ONLINE','SHIP',$4,'PAID',10000,'legacy-order-key','legacy-hash',now()+interval '15 minutes','CASH','old-payment',$3,now(),$5)`,
      [order,company.companyId,company.userId,location,operation]);
    await pool.query(`INSERT INTO order_items(company_id,order_id,product_id,sku,name,quantity,unit_price_minor,line_total_minor)
      VALUES($1,$2,$3,'OLD-001','Existing product',1,10000,10000)`,[company.companyId,order,product]);
    const checkoutSql=await readFile('db/003-checkout.sql','utf8');await pool.query(checkoutSql);
    await pool.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',['003-checkout.sql',createHash('sha256').update(checkoutSql).digest('hex')]);
    const intent=randomUUID(),capture=randomUUID();
    await pool.query(`INSERT INTO payment_intents(id,company_id,order_id,customer_id,amount_minor,currency,idempotency_key,request_hash)
      VALUES($1,$2,$3,$4,10000,'CLP','old-intent-key','old-hash')`,[intent,company.companyId,order,company.userId]);
    await pool.query(`INSERT INTO payment_captures(id,company_id,intent_id,transaction_id,amount_minor,currency,disposition,reason)
      VALUES($1,$2,$3,'old-transaction',10000,'CLP','REVIEW','ORDER_ALREADY_PAID')`,[capture,company.companyId,intent]);
    const captureBefore=(await pool.query('SELECT * FROM payment_captures WHERE id=$1',[capture])).rows[0];
    await pool.query(`INSERT INTO sessions(token_hash,company_id,user_id,expires_at) VALUES('existing-session',$1,$2,now()+interval '1 hour')`,[company.companyId,company.userId]);
    const accountBefore=(await pool.query('SELECT * FROM users WHERE id=$1',[company.userId])).rows[0];
    for(const name of ['004-aftersales.sql','005-accounts.sql','006-account-recovery.sql','007-invitations.sql','008-commercial.sql']){
      const sql=await readFile(`db/${name}`,'utf8');await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,createHash('sha256').update(sql).digest('hex')]);
    }
    const tokenId=randomUUID(),mailId=randomUUID();
    await pool.query(`INSERT INTO account_tokens(id,company_id,user_id,purpose,token_hash,email,credential_hash,expires_at)
      VALUES($1,$2,$3,'RESET_PASSWORD','existing-token-hash','owner@example.test','existing-credential-hash',clock_timestamp()+interval '20 minutes')`,[tokenId,company.companyId,company.userId]);
    await pool.query(`INSERT INTO local_mail(id,company_id,token_id,recipient,purpose,encrypted_payload,expires_at)
      VALUES($1,$2,$3,'owner@example.test','RESET_PASSWORD','existing-encrypted-payload',clock_timestamp()+interval '20 minutes')`,[mailId,company.companyId,tokenId]);
    const mailBefore=(await pool.query('SELECT * FROM local_mail WHERE id=$1',[mailId])).rows[0];
    const invitationId=randomUUID();
    await pool.query(`INSERT INTO staff_invitations(id,company_id,invited_by,email,role,location_ids,token_hash,expires_at,idempotency_key,request_hash)
      VALUES($1,$2,$3,'future-agent@example.test','AGENT',$4,'existing-invitation-hash',clock_timestamp()+interval '7 days','existing-invite-key','existing-invite-request')`,[invitationId,company.companyId,company.userId,[location]]);
    const invitationBefore=(await pool.query('SELECT * FROM staff_invitations WHERE id=$1',[invitationId])).rows[0];
    await recordCommercial(pool,company.companyId,randomUUID(),{mode:'PERPETUAL',status:'ENABLED',effectiveAt:'2026-01-01T00:00:00Z',startsAt:'2026-01-01T00:00:00Z',
      accessUntil:null,updatesUntil:'2027-01-01T00:00:00Z',supportUntil:'2027-01-01T00:00:00Z',operator:'Existing operator',reference:'Existing agreement',reason:'Existing terms',expectedRevision:0});
    const commercialBefore=(await pool.query('SELECT * FROM commercial_revisions')).rows;
    await migrate(pool);await migrate(pool);
    assert.deepEqual((await pool.query('SELECT * FROM staff_invitations WHERE id=$1',[invitationId])).rows[0],invitationBefore);
    assert.deepEqual((await pool.query('SELECT * FROM commercial_revisions')).rows,commercialBefore);
    assert.equal((await pool.query('SELECT 1 FROM license_imports')).rowCount,0);
    assert.equal((await pool.query('SELECT 1 FROM installation_identity')).rowCount,0);
    const mailAfter=(await pool.query('SELECT * FROM local_mail WHERE id=$1',[mailId])).rows[0];
    for(const key of Object.keys(mailBefore))assert.deepEqual(mailAfter[key],mailBefore[key]);
    assert.equal(mailAfter.invitation_id,null);
    assert.equal((await pool.query('SELECT 1 FROM available_local_mail WHERE id=$1',[mailId])).rowCount,1);
    const accountAfter=(await pool.query('SELECT * FROM users WHERE id=$1',[company.userId])).rows[0];
    for(const key of Object.keys(accountBefore))assert.deepEqual(accountAfter[key],accountBefore[key]);
    assert.equal(accountAfter.email_verification_required,false);assert.equal(accountAfter.email_verified_at,null);
    assert.equal((await pool.query("SELECT 1 FROM sessions WHERE token_hash='existing-session'")).rowCount,1);
    assert.equal((await pool.query('SELECT primary_color FROM companies WHERE id=$1',[company.companyId])).rows[0].primary_color,'#2563eb');
    assert.deepEqual((await pool.query('SELECT * FROM payment_captures WHERE id=$1',[capture])).rows[0],captureBefore);
    assert.equal((await pool.query('SELECT 1 FROM refunds')).rowCount,0);
    const saved=(await pool.query('SELECT status,total_minor::text,goods_minor::text,shipping_minor::text,payment_source,sale_operation_id FROM orders WHERE id=$1',[order])).rows[0];
    assert.deepEqual(saved,{status:'PAID',total_minor:'10000',goods_minor:'10000',shipping_minor:'0',payment_source:'MANUAL',sale_operation_id:operation});
    assert.deepEqual((await pool.query('SELECT on_hand,reserved FROM stock WHERE product_id=$1',[product])).rows[0],{on_hand:1,reserved:0});
    assert.equal((await pool.query('SELECT 1 FROM stock_movements WHERE operation_id=$1',[operation])).rowCount,1);
    assert.equal((await pool.query('SELECT 1 FROM order_items WHERE order_id=$1',[order])).rowCount,1);
  } finally {
    if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
  }
});
