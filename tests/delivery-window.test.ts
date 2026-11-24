import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addBusinessDays, deliveryWindow, describeWindow, santiagoDay} from '../src/catalog/delivery-window';

test('business days skip weekends', () => {
 assert.equal(addBusinessDays('2026-11-27', 0), '2026-11-27'); // viernes
 assert.equal(addBusinessDays('2026-11-27', 1), '2026-11-30'); // lunes
 assert.equal(addBusinessDays('2026-11-23', 5), '2026-11-30'); // lunes + 5 hábiles
 assert.equal(addBusinessDays('2026-11-28', 1), '2026-11-30'); // sábado + 1 = lunes
});

test('the window needs both ends and counts from the Chilean calendar day', () => {
 assert.equal(deliveryWindow('2026-11-23T12:00:00Z', null, 3), null);
 assert.equal(deliveryWindow('2026-11-23T12:00:00Z', 3, null), null);
 assert.deepEqual(deliveryWindow('2026-11-23T12:00:00Z', 2, 4), {from: '2026-11-25', to: '2026-11-27'});
 assert.equal(santiagoDay('2026-11-24T02:30:00Z'), '2026-11-23'); // 23:30 en Santiago todavía es 23
});

test('windows read naturally in Spanish', () => {
 assert.match(describeWindow({from: '2026-11-25', to: '2026-11-27'}), /^entre el mi. 25 nov y el vie 27 nov$/);
 assert.match(describeWindow({from: '2026-11-25', to: '2026-11-25'}), /^el mi. 25 nov$/);
 assert.equal(describeWindow(null), '');
});
