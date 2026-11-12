/** Photorealistic render provider boundary. Prepared for a future founder
 * approved provider integration and DISABLED by default: rendering requires the
 * feature flag AND explicit founder approval AND an injected provider. Even
 * when enabled, output remains a concept visualization governed by the existing
 * disclosure and claim policies — a photorealistic image is never geometry
 * evidence. No paid generation is activated by this module. */
export function createRenderProvider({enabled = false, founderApproved = false, provider = null} = {}) {
 const active = enabled === true && founderApproved === true && typeof provider === "function";
 return {
   status() { return {enabled: active, flagEnabled: enabled === true, founderApproved: founderApproved === true, providerConfigured: typeof provider === "function", provider: active ? (provider.name || "injected") : null}; },
   async render(input) {
     if (!active) return {ok: false, errors: ["photorealistic rendering disabled (feature flag, founder approval and provider configuration are all required)"], verified: false};
     try {
       const result = await provider(input);
       if (!result || typeof result.imageRef !== "string" || !result.imageRef.trim()) return {ok: false, errors: ["render provider returned no image reference"], verified: false};
       return {ok: true, imageRef: result.imageRef, status: "concept", verified: false, accuracyClaimAuthorized: false, disclosure: "Photorealistic concept rendering — appearance only; not geometry evidence, a measured survey, or a construction drawing."};
     } catch { return {ok: false, errors: ["render provider failed"], verified: false}; }
   }
 };
}
