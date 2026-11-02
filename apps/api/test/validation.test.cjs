const { test } = require('node:test');
const assert = require('node:assert/strict');
const { integer, instant, object, text } = require('../dist/validation.js');

test('USD cents reject fractional, negative, nonnumeric and overflowing values', () => {
  assert.equal(integer(0, 'Price', 0, 2147483647), 0);
  assert.equal(integer(1250, 'Price', 0, 2147483647), 1250);
  for (const value of [-1, 12.5, '1250', null, Infinity, 2147483648]) assert.throws(() => integer(value, 'Price', 0, 2147483647));
});
test('timestamps require timezone and valid calendar dates', () => {
  assert.equal(instant('2027-01-01T12:00:00-05:00', 'Time').toISOString(), '2027-01-01T17:00:00.000Z');
  for (const value of ['2027-01-01T12:00', '2027-02-30T12:00:00Z', 'invalid', null]) assert.throws(() => instant(value, 'Time'));
});
test('unrecognized profile fields cannot carry a role assignment', () => {
  assert.throws(() => object({ displayName: 'Player', role: 'ORGANIZER' }, ['displayName']));
  assert.throws(() => object([], ['displayName']));
  assert.equal(text(' Player ', 'Name', 80), 'Player');
  assert.throws(() => text(' ', 'Name', 80));
});
