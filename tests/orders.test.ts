import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { migrate } from '../scripts/migrate';
import { createCompany, login, type Actor } from '../src/server/auth';
import { database, transaction } from '../src/server/db';
import { createLocation, createProduct, createUser, patchLocation, patchProduct } from '../src/server/manage';
import { applyOperation } from '../src/server/inventory';
import { publicCatalog } from '../src/server/catalog';
import {
  cancelOrder, confirmManualPayment, createLocalSale, createOnlineOrder, fulfillOrder,
  getOrder, listOrders, updateOrderSettings,
} from '../src/server/orders';
import { expireReservations } from '../src/server/reservations';
import { requestShippingQuote, approveShippingQuote } from '../src/server/shipping';
import { GET, POST } from '../src/app/api/[...path]/route';

const testUrl = process.env.TEST_DATABASE_URL;
describe('PostgreSQL orders and reservations', { skip: !testUrl, concurrency: false }, () => {
  const schema = `nexo_orders_test_${randomUUID().replaceAll('-', '')}`;
  const password = 'Nexo-orders-test-password-123!';
  let pool: Pool, adminPool: Pool, owner: Actor, other: Actor, agent: Actor;
  let branch: string, north: string, web: string, foreignBranch: string, slug: string;

  before(async () => {
    const url = new URL(testUrl!);
    assert.match(url.pathname, /test/i, 'Use a separate test database');
    adminPool = new Pool({ connectionString: testUrl });
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('options', `-c search_path=${schema}`);
    pool = new Pool({ connectionString: url.toString(), max: 20 });
    process.env.DATABASE_URL = url.toString();
    process.env.APP_ORIGIN = 'http://localhost:3000';
    await migrate(pool); await migrate(pool);
    slug = `orders-${randomUUID().slice(0, 8)}`;
    const first = await createCompany(pool, { slug, name: 'Pedidos A', email: 'owner@example.test', password });
    owner = { id: first.userId, company_id: first.companyId, name: 'Owner', role: 'OWNER' };
    const second = await createCompany(pool, { slug: `other-${randomUUID().slice(0, 8)}`, name: 'Pedidos B', email: 'owner@example.test', password });
    other = { id: second.userId, company_id: second.companyId, name: 'Other', role: 'OWNER' };
    branch = (await createLocation(pool, owner, { name: 'Centro', kind: 'STORE', shippingEnabled: true })).id;
    north = (await createLocation(pool, owner, { name: 'Norte', kind: 'STORE', shippingEnabled: false })).id;
    web = (await createLocation(pool, owner, { name: 'Web', kind: 'WEB' })).id;
    foreignBranch = (await createLocation(pool, other, { name: 'Otra', kind: 'STORE' })).id;
    const user = await createUser(pool, owner, { name: 'Agente Centro', email: 'agent@example.test', password, role: 'AGENT', locationIds: [branch] });
    agent = { id: user.id, company_id: owner.company_id, name: user.name, role: 'AGENT' };
  });

  after(async () => {
    if (pool) await pool.end();
    if (process.env.DATABASE_URL) await database().end();
    if (adminPool) { await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await adminPool.end(); }
  });

  async function buyer() {
    const user = await createUser(pool, owner, { name: 'Cliente', email: `${randomUUID()}@example.test`, password, role: 'CUSTOMER' });
    return { actor: { id: user.id, company_id: owner.company_id, name: user.name, role: 'CUSTOMER' as const }, email: user.email };
  }
  async function product(quantity = 0, locationId = branch, priceMinor = 19990) {
    const result = await createProduct(pool, owner, { name: 'SSD original', sku: randomUUID(), priceMinor });
    if (quantity) await receive(result.id, quantity, locationId);
    return result.id as string;
  }
  async function receive(productId: string, quantity: number, locationId: string) {
    await applyOperation(pool, owner, randomUUID(), { kind: 'RECEIPT', productId, quantity, locationId, reason: 'Recepción prueba' });
  }
  async function stock(productId: string, locationId = branch) {
    const { rows } = await pool.query<{ on_hand: number; reserved: number }>(
      'SELECT on_hand,reserved FROM stock WHERE company_id=$1 AND product_id=$2 AND location_id=$3', [owner.company_id, productId, locationId]);
    return rows[0] ?? { on_hand: 0, reserved: 0 };
  }
  function pickup(productId: string, quantity = 1, locationId = branch) {
    return { fulfillment: 'PICKUP', locationId, items: [{ productId, quantity }] };
  }
  function payment(amountMinor = '19990') {
    return { amountMinor, method: 'CASH', reference: randomUUID() };
  }
  async function ship(actor:Actor,items:{productId:string;quantity:number}[]) {
    const quote=await requestShippingQuote(pool,actor,randomUUID(),{items,address:{recipient:'Cliente de prueba',phone:'+56912345678',line1:'Calle de prueba 123',commune:'Santiago',region:'Metropolitana',country:'CL'}});
    await approveShippingQuote(pool,owner,quote.id,{shippingMinor:'0',note:'Envío de prueba sin costo'});
    return createOnlineOrder(pool,actor,randomUUID(),{fulfillment:'SHIP',items,shippingQuoteId:quote.id});
  }
  const rejects = (fn: () => Promise<unknown>, code: string) => assert.rejects(fn, (error: { code?: string }) => error.code === code);

  // Test-only clock fixture. Production API cannot change expires_at. Privileged
  // test connection bypasses ONLY this trigger inside an atomic transaction.
  async function deadline(id: string, milliseconds = -1000) {
    await transaction(pool, async db => {
      await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [owner.company_id]);
      await db.query('ALTER TABLE orders DISABLE TRIGGER order_transitions');
      await db.query("UPDATE orders SET expires_at=clock_timestamp()+$2*interval '1 millisecond' WHERE id=$1", [id, milliseconds]);
      await db.query('ALTER TABLE orders ENABLE TRIGGER order_transitions');
    });
  }

  test('pickup reserves chosen branch, snapshots prices and does not decrease physical stock', async () => {
    const { actor } = await buyer(); const id = await product(5); await receive(id, 7, web);
    const order = await createOnlineOrder(pool, actor, randomUUID(), pickup(id, 2));
    assert.equal(order.status, 'RESERVED'); assert.equal(order.location_id, branch);
    assert.equal(order.total_minor, '39980'); assert.equal(order.items[0].name, 'SSD original');
    assert.deepEqual(await stock(id), { on_hand: 5, reserved: 2 });
    assert.deepEqual(await stock(id, web), { on_hand: 7, reserved: 0 });
    await patchProduct(pool, owner, id, { priceMinor: 25000, name: 'SSD actualizado' });
    const saved = await getOrder(pool, actor, order.id);
    assert.equal(saved.items[0].name, 'SSD original'); assert.equal(saved.total_minor, '39980');
  });

  test('shipping prioritizes WEB, then enabled store, never disabled store', async () => {
    const { actor } = await buyer(); const id = await product(2); await receive(id, 1, web);
    const first = await ship(actor,[{ productId: id, quantity: 1 }]);
    assert.equal(first.location_id, web);
    const second = await ship(actor,[{ productId: id, quantity: 2 }]);
    assert.equal(second.location_id, branch);
    const disabled = await product(4, north);
    await rejects(() => ship(actor,[{ productId: disabled, quantity: 1 }]), 'FULFILLMENT_UNAVAILABLE');
    await patchLocation(pool, owner, north, { shippingEnabled: true });
    const enabled = await ship(actor,[{ productId: disabled, quantity: 1 }]);
    assert.equal(enabled.location_id, north);
    await patchLocation(pool, owner, north, { shippingEnabled: false });
  });

  test('multi-line cart is rejected atomically if stock is split across locations', async () => {
    const { actor } = await buyer(); const a = await product(2, web); const b = await product(2);
    await rejects(() => ship(actor,[{ productId: a, quantity: 1 }, { productId: b, quantity: 1 }]), 'FULFILLMENT_UNAVAILABLE');
    assert.equal((await stock(a, web)).reserved, 0); assert.equal((await stock(b)).reserved, 0);
    assert.equal((await listOrders(pool, actor)).items.length, 0);
  });

  test('failure on later pickup line rolls back all reservations and draft', async () => {
    const { actor } = await buyer();
    const [a, b] = [await product(0), await product(0)].sort();
    await receive(a, 5, branch); // canonical cart order guarantees the failing line is second
    await rejects(() => createOnlineOrder(pool, actor, randomUUID(), { fulfillment: 'PICKUP', locationId: branch, items: [{ productId: a, quantity: 2 }, { productId: b, quantity: 1 }] }), 'INSUFFICIENT_STOCK');
    assert.equal((await stock(a)).reserved, 0); assert.equal((await listOrders(pool, actor)).items.length, 0);
  });

  test('concurrent reservations never oversell the last units', async () => {
    const buyers = await Promise.all(Array.from({ length: 8 }, () => buyer())); const id = await product(3);
    const results = await Promise.allSettled(buyers.map(({ actor }) => createOnlineOrder(pool, actor, randomUUID(), pickup(id))));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 3);
    for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.code, 'INSUFFICIENT_STOCK');
    assert.deepEqual(await stock(id), { on_hand: 3, reserved: 3 });
  });

  test('concurrent same-key creation reserves once and replay preserves original price', async () => {
    const { actor } = await buyer(); const id = await product(5); const key = randomUUID();
    const results = await Promise.all([createOnlineOrder(pool, actor, key, pickup(id)), createOnlineOrder(pool, actor, key, pickup(id))]);
    assert.equal(results[0].id, results[1].id); assert.equal(results.filter(result => result.replayed).length, 1);
    assert.equal((await stock(id)).reserved, 1);
    await patchProduct(pool, owner, id, { priceMinor: 90000 });
    assert.equal((await createOnlineOrder(pool, actor, key, pickup(id))).total_minor, '19990');
    await rejects(() => createOnlineOrder(pool, actor, key, pickup(id, 2)), 'IDEMPOTENCY_CONFLICT');
  });

  test('cancellation releases once and cannot restore physical units', async () => {
    const { actor } = await buyer(); const id = await product(3);
    const order = await createOnlineOrder(pool, actor, randomUUID(), pickup(id, 2));
    const cancel = { reason: 'Cambio de opinión' };
    assert.equal((await cancelOrder(pool, actor, order.id, cancel)).status, 'CANCELLED');
    assert.equal((await cancelOrder(pool, actor, order.id, cancel)).replayed, true);
    assert.deepEqual(await stock(id), { on_hand: 3, reserved: 0 });
    await rejects(() => confirmManualPayment(pool, owner, order.id, payment('39980')), 'INVALID_ORDER_STATE');
  });

  test('worker expires reservations; catalog lazily releases them without a worker', async () => {
    const { actor } = await buyer(); const id = await product(3);
    const first = await createOnlineOrder(pool, actor, randomUUID(), pickup(id)); await deadline(first.id);
    assert.equal((await expireReservations(pool)).expired, 1);
    assert.equal((await expireReservations(pool)).expired, 0);
    assert.equal((await getOrder(pool, actor, first.id)).status, 'EXPIRED');
    const second = await createOnlineOrder(pool, actor, randomUUID(), pickup(id, 2)); await deadline(second.id);
    const catalog = await publicCatalog(pool, slug, 100);
    const available = catalog.products.find(item => item.id === id)!.availability.find((item: { locationId: string }) => item.locationId === branch);
    assert.equal(available.available, 3); assert.equal((await stock(id)).reserved, 0);
  });

  test('late payment is rejected, commits expiration and never deducts stock', async () => {
    const { actor } = await buyer(); const id = await product(2);
    const order = await createOnlineOrder(pool, actor, randomUUID(), pickup(id)); await deadline(order.id);
    await rejects(() => confirmManualPayment(pool, owner, order.id, payment()), 'RESERVATION_EXPIRED');
    assert.deepEqual(await stock(id), { on_hand: 2, reserved: 0 });
    const state = await pool.query('SELECT status FROM orders WHERE id=$1', [order.id]);
    assert.equal(state.rows[0].status, 'EXPIRED');
  });

  test('deadline uses wall clock after waiting for company lock', async () => {
    const { actor } = await buyer(); const id = await product(2);
    const order = await createOnlineOrder(pool, actor, randomUUID(), pickup(id));
    await deadline(order.id, 250);
    const blocker = await pool.connect();
    try {
      await blocker.query('BEGIN'); await blocker.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [owner.company_id]);
      const attempt = confirmManualPayment(pool, owner, order.id, payment());
      const rejection = rejects(() => attempt, 'RESERVATION_EXPIRED');
      await delay(350); await blocker.query('COMMIT'); await rejection;
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    assert.deepEqual(await stock(id), { on_hand: 2, reserved: 0 });
  });

  test('manual payment consumes reservation once and fulfillment has no second deduction', async () => {
    const { actor } = await buyer(); const id = await product(5);
    const order = await createOnlineOrder(pool, actor, randomUUID(), pickup(id, 2)); const pay = payment('39980');
    const results = await Promise.all([confirmManualPayment(pool, agent, order.id, pay), confirmManualPayment(pool, agent, order.id, pay)]);
    assert.equal(results.filter(result => result.replayed).length, 1);
    assert.deepEqual(await stock(id), { on_hand: 3, reserved: 0 });
    assert.equal((await fulfillOrder(pool, agent, order.id)).status, 'FULFILLED');
    assert.equal((await fulfillOrder(pool, agent, order.id)).replayed, true);
    assert.equal((await confirmManualPayment(pool, agent, order.id, pay)).replayed, true);
    const counts = await pool.query('SELECT count(*)::integer AS count FROM stock_movements WHERE operation_id=$1', [results[0].sale_operation_id]);
    assert.equal(counts.rows[0].count, 1);
    await rejects(() => cancelOrder(pool, actor, order.id, { reason: 'Cancelar pagado' }), 'INVALID_ORDER_STATE');
  });

  test('wrong amount and reused payment reference do not mutate stock', async () => {
    const { actor } = await buyer(); const id = await product(5); const first = await createOnlineOrder(pool, actor, randomUUID(), pickup(id));
    await rejects(() => confirmManualPayment(pool, owner, first.id, payment('1')), 'PAYMENT_AMOUNT_MISMATCH');
    assert.deepEqual(await stock(id), { on_hand: 5, reserved: 1 });
    const pay = payment(); await confirmManualPayment(pool, owner, first.id, pay);
    const second = await createOnlineOrder(pool, actor, randomUUID(), pickup(id));
    await rejects(() => confirmManualPayment(pool, owner, second.id, pay), 'PAYMENT_REFERENCE_USED');
    assert.deepEqual(await stock(id), { on_hand: 4, reserved: 1 });
    await rejects(() => confirmManualPayment(pool, owner, first.id, payment()), 'PAYMENT_CONFLICT');
  });

  test('payment/cancellation race allows exactly one transition without losing stock', async () => {
    const { actor } = await buyer(); const id = await product(2); const order = await createOnlineOrder(pool, actor, randomUUID(), pickup(id));
    const results = await Promise.allSettled([
      confirmManualPayment(pool, owner, order.id, payment()), cancelOrder(pool, actor, order.id, { reason: 'Cancelación simultánea' }),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const state = await getOrder(pool, actor, order.id);
    assert.deepEqual(await stock(id), { on_hand: state.status === 'PAID' ? 1 : 2, reserved: 0 });
    assert(['PAID', 'CANCELLED'].includes(state.status));
  });

  test('physical sales and transfers cannot consume online reservations', async () => {
    const { actor } = await buyer(); const id = await product(2); await createOnlineOrder(pool, actor, randomUUID(), pickup(id, 2));
    for (const kind of ['SALE', 'TRANSFER'] as const) {
      await rejects(() => applyOperation(pool, owner, randomUUID(), { kind, productId: id, locationId: branch, quantity: 1, reason: 'Intento sobre reserva', ...(kind === 'TRANSFER' ? { destinationId: north } : {}) }), 'INSUFFICIENT_STOCK');
    }
    await rejects(() => patchProduct(pool, owner, id, { active: false }), 'RESERVATIONS_EXIST');
    await rejects(() => patchLocation(pool, owner, branch, { active: false }), 'RESERVATIONS_EXIST');
    assert.deepEqual(await stock(id), { on_hand: 2, reserved: 2 });
  });

  test('local sale captures multiple lines and discounts exactly once', async () => {
    const a = await product(5, branch, 10000); const b = await product(3, branch, 5000); const key = randomUUID();
    const input = { locationId: branch, items: [{ productId: a, quantity: 2 }, { productId: b, quantity: 1 }], payment: payment('25000') };
    const sale = await createLocalSale(pool, agent, key, input);
    assert.equal(sale.channel, 'LOCAL'); assert.equal(sale.status, 'FULFILLED'); assert.equal(sale.total_minor, '25000');
    assert.equal(sale.items.length, 2); assert.equal((await createLocalSale(pool, agent, key, input)).replayed, true);
    assert.deepEqual(await stock(a), { on_hand: 3, reserved: 0 }); assert.deepEqual(await stock(b), { on_hand: 2, reserved: 0 });
  });

  test('failed local sale leaves neither order nor partial discounts', async () => {
    const [a, b] = [await product(0), await product(0)].sort(); const key = randomUUID();
    await receive(a, 5, branch); // test rollback after the first line was actually reserved
    await rejects(() => createLocalSale(pool, agent, key, { locationId: branch, items: [{ productId: a, quantity: 1 }, { productId: b, quantity: 1 }], payment: payment('39980') }), 'INSUFFICIENT_STOCK');
    assert.deepEqual(await stock(a), { on_hand: 5, reserved: 0 });
    assert.equal((await pool.query('SELECT 1 FROM orders WHERE idempotency_key=$1', [key])).rowCount, 0);
    await rejects(() => createLocalSale(pool, agent, randomUUID(), { locationId: branch, items: [{ productId: a, quantity: 1 }], payment: payment('1') }), 'PAYMENT_AMOUNT_MISMATCH');
    assert.deepEqual(await stock(a), { on_hand: 5, reserved: 0 });
  });

  test('customers cannot access another order, manual payments, fulfillment or local sales', async () => {
    const a = await buyer(); const b = await buyer(); const id = await product(3);
    const order = await createOnlineOrder(pool, a.actor, randomUUID(), pickup(id));
    await rejects(() => getOrder(pool, b.actor, order.id), 'ORDER_NOT_FOUND');
    await rejects(() => cancelOrder(pool, b.actor, order.id, { reason: 'Ajeno' }), 'ORDER_NOT_FOUND');
    await rejects(() => confirmManualPayment(pool, a.actor, order.id, payment()), 'FORBIDDEN');
    await rejects(() => fulfillOrder(pool, a.actor, order.id), 'FORBIDDEN');
    await rejects(() => createLocalSale(pool, a.actor, randomUUID(), {}), 'FORBIDDEN');
    assert.equal((await listOrders(pool, b.actor)).items.length, 0);
  });

  test('company and branch restrictions apply to order reads and mutations', async () => {
    const { actor } = await buyer(); const id = await product(2, north);
    const order = await createOnlineOrder(pool, actor, randomUUID(), pickup(id, 1, north));
    await rejects(() => getOrder(pool, other, order.id), 'ORDER_NOT_FOUND');
    await rejects(() => confirmManualPayment(pool, agent, order.id, payment()), 'ORDER_NOT_FOUND');
    await rejects(() => fulfillOrder(pool, agent, order.id), 'ORDER_NOT_FOUND');
    assert(!(await listOrders(pool, agent)).items.some(item => item.id === order.id));
    await rejects(() => createOnlineOrder(pool, actor, randomUUID(), pickup(id, 1, foreignBranch)), 'PICKUP_LOCATION_INVALID');
  });

  test('server rejects client prices, duplicates and illegal states; totals use integer arithmetic', async () => {
    const { actor } = await buyer(); const id = await product(5);
    await assert.rejects(() => createOnlineOrder(pool, actor, randomUUID(), { ...pickup(id), totalMinor: 1 }));
    await assert.rejects(() => createOnlineOrder(pool, actor, randomUUID(), { ...pickup(id), items: [{ productId: id, quantity: 1, priceMinor: 1 }] }));
    await assert.rejects(() => createOnlineOrder(pool, actor, randomUUID(), { ...pickup(id), items: [{ productId: id, quantity: 1 }, { productId: id, quantity: 1 }] }));
    const order = await createOnlineOrder(pool, actor, randomUUID(), pickup(id));
    await rejects(() => fulfillOrder(pool, owner, order.id), 'PAYMENT_REQUIRED');
    await assert.rejects(() => pool.query("UPDATE orders SET status='FULFILLED' WHERE id=$1", [order.id]));
    await assert.rejects(() => pool.query('UPDATE orders SET total_minor=1 WHERE id=$1', [order.id]));
    await assert.rejects(() => pool.query('UPDATE order_items SET quantity=100 WHERE order_id=$1', [order.id]));
    const large = await product(0, branch, 1000000000000);
    await rejects(() => createOnlineOrder(pool, actor, randomUUID(), pickup(large, 1000000)), 'ORDER_TOTAL_LIMIT');
  });

  test('reservation duration is company-configured and existing deadlines do not change', async () => {
    const { actor } = await buyer(); const id = await product(3);
    const first = await createOnlineOrder(pool, actor, randomUUID(), pickup(id));
    await updateOrderSettings(pool, owner, { reservationMinutes: 30 });
    const second = await createOnlineOrder(pool, actor, randomUUID(), pickup(id));
    const firstDuration = (first.expires_at.getTime() - first.created_at.getTime()) / 60000;
    const secondDuration = (second.expires_at.getTime() - second.created_at.getTime()) / 60000;
    assert(Math.abs(firstDuration - 15) < 0.01); assert(Math.abs(secondDuration - 30) < 0.01);
    assert.equal((await getOrder(pool, actor, first.id)).expires_at.getTime(), first.expires_at.getTime());
    await rejects(() => updateOrderSettings(pool, agent, { reservationMinutes: 30 }), 'FORBIDDEN');
    await updateOrderSettings(pool, owner, { reservationMinutes: 15 });
  });

  test('expired replay stays expired and failed purchase still releases old reservation', async () => {
    const { actor } = await buyer(); const id = await product(2); const key = randomUUID();
    const order = await createOnlineOrder(pool, actor, key, pickup(id)); await deadline(order.id);
    await rejects(() => createOnlineOrder(pool, actor, randomUUID(), pickup(id, 10)), 'INSUFFICIENT_STOCK');
    assert.equal((await stock(id)).reserved, 0);
    const replayed = await createOnlineOrder(pool, actor, key, pickup(id));
    assert.equal(replayed.status, 'EXPIRED'); assert.equal(replayed.replayed, true); assert.equal((await stock(id)).reserved, 0);
  });

  test('limits pending orders and validates active accounts inside stock transaction', async () => {
    const { actor } = await buyer(); const id = await product(10);
    for (let i = 0; i < 5; i++) await createOnlineOrder(pool, actor, randomUUID(), pickup(id));
    await rejects(() => createOnlineOrder(pool, actor, randomUUID(), pickup(id)), 'PENDING_ORDER_LIMIT');
    const { actor: disabled } = await buyer();
    await pool.query('UPDATE users SET active=false WHERE id=$1', [disabled.id]);
    await rejects(() => createOnlineOrder(pool, disabled, randomUUID(), pickup(id)), 'FORBIDDEN');
  });

  test('HTTP order lifecycle authenticates, returns 201/200 on replay and blocks customer payment', async () => {
    const { actor, email } = await buyer(); const id = await product(2);
    const loggedIn = await login(pool, { company: slug, email, password });
    const cookie = `nexo_session=${loggedIn.token}`; const key = randomUUID();
    const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
    const request = (path: string, data: unknown, headers: Record<string, string> = {}) => new Request(`http://localhost:3000/api/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie, 'idempotency-key': key, ...headers }, body: JSON.stringify(data),
    });
    const created = await POST(request('orders', pickup(id)), context(['orders'])); assert.equal(created.status, 201);
    const order = await created.json() as { id: string };
    assert.equal((await POST(request('orders', pickup(id)), context(['orders']))).status, 200);
    const read = await GET(new Request(`http://localhost:3000/api/orders/${order.id}`, { headers: { cookie } }), context(['orders', order.id])); assert.equal(read.status, 200);
    const blocked = await POST(request(`orders/${order.id}/manual-payment`, payment()), context(['orders', order.id, 'manual-payment'])); assert.equal(blocked.status, 403);
    const cancelled = await POST(request(`orders/${order.id}/cancel`, { reason: 'Cancelar desde web' }), context(['orders', order.id, 'cancel'])); assert.equal(cancelled.status, 200);
    const guest = await POST(new Request('http://localhost:3000/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pickup(id)) }), context(['orders'])); assert.equal(guest.status, 401);
    assert.equal((await getOrder(pool, actor, order.id)).status, 'CANCELLED');
  });
});
