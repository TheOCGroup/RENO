/** RENOVISION property profile: address plus property facts, each stored
 * with a provenance tier.
 *
 * No property-data or geocoding integration is connected (Google Cloud
 * billing is disabled and no API keys are provisioned), so both
 * integrations report UNAVAILABLE. Nothing is ever inferred from an
 * address: facts enter the profile only when a customer or operator
 * supplies them (user_supplied) or records an explicitly labeled estimate.
 *
 * Fail-closed honesty rule: a fact may NOT be stored with provenance
 * "verified_record" while the property-records integration is
 * UNAVAILABLE. Claiming a verified record that no integration produced
 * would fabricate provenance, so setPropertyFact throws instead.
 */

export const PROPERTY_PROVENANCE = Object.freeze([
  "verified_record",
  "user_supplied",
  "estimate",
  "unknown",
]);

export const PROPERTY_INTEGRATION_STATUS = Object.freeze({
  geocoding: "UNAVAILABLE",
  propertyRecords: "UNAVAILABLE",
  reason: "No property-data or geocoding API is connected: Google Cloud billing is disabled and no API keys are provisioned. Property facts are entered by the customer or operator with their provenance recorded; nothing is inferred from an address alone.",
});

export const PROPERTY_FACT_KEYS = Object.freeze([
  "areaSqFt",
  "bedrooms",
  "bathrooms",
  "yearBuilt",
  "floorPlanRef",
]);

const now = () => new Date().toISOString();

export function createPropertyProfile(address) {
  if (typeof address !== "string" || address.trim() === "") {
    throw new TypeError("createPropertyProfile: address must be a non-empty string");
  }
  const facts = {};
  const provenance = {};
  for (const key of PROPERTY_FACT_KEYS) {
    facts[key] = null;
    provenance[key] = "unknown";
  }
  return {address: address.trim(), facts, provenance, updatedAt: now()};
}

function validateFactValue(key, value) {
  switch (key) {
    case "areaSqFt":
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new TypeError("setPropertyFact: areaSqFt must be a positive number");
      }
      break;
    case "bedrooms":
    case "bathrooms":
      if (!Number.isInteger(value) || value < 0) {
        throw new TypeError(`setPropertyFact: ${key} must be a non-negative integer`);
      }
      break;
    case "yearBuilt": {
      const maxYear = new Date().getFullYear() + 1;
      if (!Number.isInteger(value) || value < 1600 || value > maxYear) {
        throw new TypeError(`setPropertyFact: yearBuilt must be an integer year between 1600 and ${maxYear}`);
      }
      break;
    }
    case "floorPlanRef":
      if (typeof value !== "string" || value.trim() === "") {
        throw new TypeError("setPropertyFact: floorPlanRef must be a non-empty string reference");
      }
      break;
    default:
      throw new TypeError("setPropertyFact: unknown property fact: " + key);
  }
}

/** Record one property fact with its provenance. Returns a NEW profile;
 * the input is not modified. Passing value null clears the fact and resets
 * its provenance to "unknown". Throws on unknown keys, unknown provenance
 * values, invalid values, and on any attempt to claim "verified_record"
 * provenance while the property-records integration is UNAVAILABLE. */
export function setPropertyFact(profile, key, value, provenance) {
  if (!profile || typeof profile !== "object" || !profile.facts || !profile.provenance) {
    throw new TypeError("setPropertyFact: a property profile is required");
  }
  if (!PROPERTY_FACT_KEYS.includes(key)) {
    throw new TypeError("setPropertyFact: unknown property fact: " + key);
  }
  if (!PROPERTY_PROVENANCE.includes(provenance)) {
    throw new TypeError("setPropertyFact: unknown provenance: " + provenance);
  }
  if (provenance === "verified_record" && PROPERTY_INTEGRATION_STATUS.propertyRecords === "UNAVAILABLE") {
    throw new Error("setPropertyFact: cannot record verified_record provenance: the property-records integration is UNAVAILABLE, so no verified record exists to cite");
  }
  if (value === null) {
    return {
      ...profile,
      facts: {...profile.facts, [key]: null},
      provenance: {...profile.provenance, [key]: "unknown"},
      updatedAt: now(),
    };
  }
  validateFactValue(key, value);
  return {
    ...profile,
    facts: {...profile.facts, [key]: value},
    provenance: {...profile.provenance, [key]: provenance},
    updatedAt: now(),
  };
}

/** Summarize the profile: every fact with its provenance, the keys still
 * unknown, and the integration status (so a reader can always see that no
 * property-data integration stands behind the facts). */
export function summarizePropertyProfile(profile) {
  if (!profile || typeof profile !== "object" || !profile.facts || !profile.provenance) {
    throw new TypeError("summarizePropertyProfile: a property profile is required");
  }
  const facts = PROPERTY_FACT_KEYS.map((key) => ({
    key,
    value: profile.facts[key] ?? null,
    provenance: profile.provenance[key] ?? "unknown",
  }));
  return {
    facts,
    unknowns: facts.filter((f) => f.value === null || f.provenance === "unknown").map((f) => f.key),
    integrationStatus: {...PROPERTY_INTEGRATION_STATUS},
  };
}
