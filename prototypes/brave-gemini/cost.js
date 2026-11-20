// Strict budget with RESERVATION: a paid call only starts if spent + reserved + this call's
// worst case still fits. After the call the reservation is replaced by the actual cost.
const { calculateCost } = require('../../gemini-pricing');
const cfg = require('./config');

class BudgetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetError';
  }
}

// ledger (optional): a DURABLE spending ledger, { reserve(kind, amountInr) -> id, confirm(id, actualInr, usage) }.
// With one, every paid call is reserved in the ledger BEFORE it starts and confirmed right after it ends;
// a reservation that is never confirmed (killed request, timeout) stays charged in full by the ledger.
/** @param {{ limitInr: number, pricing: object, ledger?: object | null }} options */
function createTracker({ limitInr, pricing, ledger = null }) {
  if (!(limitInr > 0)) throw new Error('createTracker: limitInr must be > 0');
  let spentInr = 0;
  let reservedInr = 0;
  let scope = null; // per-location ceiling: { limitInr, startSpent }
  const totals = { braveSearches: 0, llmCalls: 0, inputTokens: 0, outputTokens: 0, cacheHits: 0 };
  const braveCostInr = cfg.BRAVE_USD_PER_SEARCH * pricing.usdToInr;

  const llmCostInr = usage => calculateCost({ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, queries: 0 }, pricing).totalCostInr;

  return {
    limitInr,
    pricing,
    totals,
    braveCostInr,
    llmCostInr,
    get spentInr() { return spentInr; },
    get reservedInr() { return reservedInr; },
    get remainingInr() { return limitInr - spentInr - reservedInr; },
    // Worst case for one LLM call: estimated input (chars/3 + margin) + the full output cap.
    estimateLlmCostInr(promptChars) {
      const inputTokens = Math.ceil((promptChars / cfg.CHARS_PER_TOKEN_ESTIMATE) * cfg.INPUT_SAFETY_MARGIN);
      return llmCostInr({ inputTokens, outputTokens: cfg.MAX_OUTPUT_TOKENS });
    },
    // Per-location ceiling: reservations must also fit this location's own limit.
    beginLocation(limitInr) { scope = { limitInr, startSpent: spentInr }; },
    endLocation() { scope = null; },
    get locationSpentInr() { return scope ? spentInr - scope.startSpent : 0; },
    reserve(kind, estimateInr) {
      if (scope && spentInr - scope.startSpent + reservedInr + estimateInr > scope.limitInr) {
        throw new BudgetError(`Per-location ceiling ₹${scope.limitInr} would be exceeded by a ${kind} call (location spent ₹${(spentInr - scope.startSpent).toFixed(4)}, reserved ₹${reservedInr.toFixed(4)}, needs ₹${estimateInr.toFixed(4)}).`);
      }
      if (spentInr + reservedInr + estimateInr > limitInr) {
        throw new BudgetError(`Budget ₹${limitInr} would be exceeded by a ${kind} call (spent ₹${spentInr.toFixed(4)}, reserved ₹${reservedInr.toFixed(4)}, needs ₹${estimateInr.toFixed(4)}).`);
      }
      reservedInr += estimateInr;
      return { kind, estimateInr, settled: false };
    },
    settle(reservation, actualInr) {
      if (reservation.settled) return;
      reservation.settled = true;
      reservedInr -= reservation.estimateInr;
      spentInr += actualInr;
    },
    // Paid-call path: local check, then the durable reservation, then (after the call) confirmation.
    async reserveAsync(kind, estimateInr) {
      const reservation = this.reserve(kind, estimateInr); // BudgetError if it does not fit
      if (ledger) {
        try {
          reservation.ledgerId = await ledger.reserve(kind, estimateInr);
        } catch (e) {
          this.settle(reservation, 0); // nothing was reserved durably, so nothing can be spent
          throw new BudgetError(`Spending ledger refused the ${kind} call: ${e && e.message ? e.message : e}`);
        }
      }
      return reservation;
    },
    async settleAsync(reservation, actualInr, usage) {
      this.settle(reservation, actualInr);
      if (ledger && reservation.ledgerId) {
        // If this confirmation is lost the reservation simply stays charged in full (safe direction).
        try { await ledger.confirm(reservation.ledgerId, actualInr, usage); } catch { /* left reserved */ }
      }
    },
  };
}

module.exports = { createTracker, BudgetError };
