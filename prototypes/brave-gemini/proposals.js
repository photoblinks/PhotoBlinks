// Turns verification results into REVIEW proposals. Pure: no database, no approval.
//
//   - A proposal exists only for a field that is FULLY verified (exact quote on a fetched page,
//     value supported by the quote, fees from official pages) and whose value is real
//     (non-empty, not "unknown" / "unverified" / null) and different from the existing value.
//   - Every other field is KEPT as it is: nothing is proposed, so nothing can overwrite existing
//     location data with null, empty, guessed or incomplete information. The existing value is
//     echoed back untouched for the reviewer; the location object is never modified.
//   - Proposals are always pending and need manual review. Nothing here applies a change.
const { FIELD_NAMES, ENUMS, isUnknownValue } = require('./fields');

const sameValue = (a, b) => a != null && b != null && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

function isProposable(result) {
  if (!result || result.verified !== true) return false;
  const { value, quote, source_url: sourceUrl } = result;
  if (typeof value !== 'string' || value.trim() === '' || isUnknownValue(value)) return false;
  if (typeof quote !== 'string' || quote.trim() === '' || typeof sourceUrl !== 'string' || sourceUrl === '') return false;
  return true;
}

function buildProposals(location, fieldResults) {
  const existing = location.existing || {};
  const proposals = [];
  const preserved = [];

  for (const field of FIELD_NAMES) {
    const result = fieldResults?.[field];
    const hasExisting = Object.prototype.hasOwnProperty.call(existing, field);
    const keep = reason => preserved.push(Object.freeze({
      field,
      action: 'keep_existing',
      reason,
      has_existing_value: hasExisting,
      existing_value: hasExisting ? existing[field] : null,
    }));

    if (!isProposable(result)) { keep(result?.reason || 'not_verified'); continue; }
    if (ENUMS[field] && !ENUMS[field].includes(result.value)) { keep('invalid_enum'); continue; }
    if (hasExisting && sameValue(existing[field], result.value)) { keep('unchanged'); continue; }

    proposals.push(Object.freeze({
      field,
      proposed_value: result.value,
      has_existing_value: hasExisting,
      based_on_existing_value: hasExisting ? existing[field] : null,
      evidence: Object.freeze({ quote: result.quote, source_url: result.source_url, tier: result.tier ?? null }),
      review_status: 'pending',
      requires_manual_review: true,
    }));
  }

  return { proposals, preserved };
}

module.exports = { buildProposals, isProposable };
