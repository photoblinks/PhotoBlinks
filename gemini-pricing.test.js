const test = require('node:test');
const assert = require('node:assert/strict');
const { getPricing, calculateCost, createBudget, BudgetExceededError } = require('./gemini-pricing');

const M = 'gemini-3.8-flash';

test('getPricing: official introductory rates through 2026-12-31, new rates from 2027-01-01', () => {
  const intro = getPricing(M, new Date('2026-11-20T00:00:00Z'));
  assert.equal(intro.inputUsdPerM, 0.75);
  assert.equal(intro.outputUsdPerM, 3.75);
  assert.equal(intro.groundingUsdPerQuery, 0.014);
  const last = getPricing(M, new Date('2026-12-31T23:00:00Z'));
  assert.equal(last.inputUsdPerM, 0.75);
  const later = getPricing(M, new Date('2027-01-01T00:00:00Z'));
  assert.equal(later.inputUsdPerM, 1.5);
  assert.equal(later.outputUsdPerM, 7.5);
});

test('getPricing: unknown model throws instead of guessing', () => {
  assert.throws(() => getPricing('gemini-unknown'), /No official pricing/);
});

test('calculateCost: tokens + per-query grounding', () => {
  const p = { inputUsdPerM: 0.75, outputUsdPerM: 3.75, groundingUsdPerQuery: 0.014, usdToInr: 100 };
  const c = calculateCost({ inputTokens: 1_000_000, outputTokens: 1_000_000, queries: 10 }, p);
  assert.ok(Math.abs(c.totalCostUsd - (0.75 + 3.75 + 0.14)) < 1e-9);
  assert.ok(Math.abs(c.groundingCostUsd - 0.14) < 1e-9);
  assert.ok(Math.abs(c.totalCostInr - 464) < 1e-6);
});

test('budget: records actual usage, blocks once the limit is reached', () => {
  const pricing = { inputUsdPerM: 0, outputUsdPerM: 0, groundingUsdPerQuery: 0.1, usdToInr: 10 }; // 1 INR / query
  const b = createBudget({ limitInr: 2.5, pricing });
  b.assertAvailable();
  b.record({ inputTokens: 5, outputTokens: 5, queries: 2 });
  assert.equal(b.spentInr, 2);
  assert.equal(b.exhausted, false);
  b.record({ inputTokens: 0, outputTokens: 0, queries: 1 });
  assert.equal(b.exhausted, true);
  assert.throws(() => b.assertAvailable(), BudgetExceededError);
});

test('createBudget rejects a non-positive limit', () => {
  assert.throws(() => createBudget({ limitInr: 0, pricing: {} }), /limitInr/);
});

test('getPricing: gemini-3.1-flash-lite official standard rates, no date dependence', () => {
  for (const d of ['2026-11-20', '2027-06-01']) {
    const p = getPricing('gemini-3.1-flash-lite', new Date(d + 'T00:00:00Z'));
    assert.equal(p.inputUsdPerM, 0.25);
    assert.equal(p.outputUsdPerM, 1.5);
  }
});
