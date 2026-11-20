// Official Gemini API pricing + usage-based budget. No network, no API key.
// Source: https://ai.google.dev/gemini-api/docs/pricing (redirects to aistudio.google.com/docs/pricing),
// "Gemini 3.8 Flash", Paid tier, Standard. Re-check this table whenever the model changes.
//   - Output price INCLUDES thinking tokens.
//   - Grounding with Google Search: $14 per 1,000 search queries, charged per individual
//     query performed (one request may run several). Google lists 5,000 free requests/month;
//     the budget deliberately ignores that allowance and bills every query (conservative).

const PRICING = {
  'gemini-3.8-flash': {
    tokenPeriods: [
      { until: '2026-12-31', inputUsdPerM: 0.75, outputUsdPerM: 3.75 },
      { from: '2027-01-01', inputUsdPerM: 1.5, outputUsdPerM: 7.5 },
    ],
    groundingUsdPerQuery: 14 / 1000,
  },
  // "Gemini 3.1 Flash-Lite", Paid tier, Standard text input; no date-dependent price listed.
  'gemini-3.1-flash-lite': {
    tokenPeriods: [{ inputUsdPerM: 0.25, outputUsdPerM: 1.5 }],
    groundingUsdPerQuery: 14 / 1000,
  },
};

const USD_TO_INR = Number(process.env.GEMINI_USD_INR) || 83;

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Throws for an unknown model: never guess a price.
function getPricing(model, now = new Date()) {
  const entry = PRICING[model];
  if (!entry) throw new Error(`No official pricing configured for model "${model}". Add it to gemini-pricing.js.`);
  const today = isoDate(now);
  const period = entry.tokenPeriods.find(p => (!p.from || today >= p.from) && (!p.until || today <= p.until));
  if (!period) throw new Error(`No token pricing period covers ${today} for "${model}".`);
  return { model, inputUsdPerM: period.inputUsdPerM, outputUsdPerM: period.outputUsdPerM, groundingUsdPerQuery: entry.groundingUsdPerQuery, usdToInr: USD_TO_INR };
}

// usage = { inputTokens, outputTokens, queries } as returned by the API (usageMetadata +
// groundingMetadata.webSearchQueries).
function calculateCost(usage, pricing) {
  const inputCostUsd = (usage.inputTokens / 1_000_000) * pricing.inputUsdPerM;
  const outputCostUsd = (usage.outputTokens / 1_000_000) * pricing.outputUsdPerM;
  const groundingCostUsd = usage.queries * pricing.groundingUsdPerQuery;
  const totalCostUsd = inputCostUsd + outputCostUsd + groundingCostUsd;
  return { inputCostUsd, outputCostUsd, groundingCostUsd, totalCostUsd, totalCostInr: totalCostUsd * pricing.usdToInr };
}

class BudgetExceededError extends Error {
  constructor(limitInr, spentInr) {
    super(`Cost limit ₹${limitInr} reached (spent ₹${spentInr.toFixed(4)}).`);
    this.name = 'BudgetExceededError';
  }
}

// Running total of ACTUAL usage. A call's cost is only known after it returns, so the
// limit is checked before each call: overshoot is bounded by one call.
function createBudget({ limitInr, pricing }) {
  if (!(limitInr > 0)) throw new Error('createBudget: limitInr must be > 0');
  const totals = { inputTokens: 0, outputTokens: 0, queries: 0 };
  return {
    limitInr,
    pricing,
    totals,
    record(usage) {
      totals.inputTokens += usage.inputTokens;
      totals.outputTokens += usage.outputTokens;
      totals.queries += usage.queries;
    },
    get spentInr() {
      return calculateCost(totals, pricing).totalCostInr;
    },
    get exhausted() {
      return this.spentInr >= limitInr;
    },
    assertAvailable() {
      if (this.exhausted) throw new BudgetExceededError(limitInr, this.spentInr);
    },
  };
}

module.exports = { PRICING, getPricing, calculateCost, createBudget, BudgetExceededError };
