const ALLOWED = new Set(["sell","hold","refinance","rent_ready"]);

export function evaluateExit({ exitPackage, market = {}, financing = {} }) {
  if (!exitPackage || exitPackage.sourceSystem !== "mission-control") throw new Error("mission_control_exit_package_required");
  if (!ALLOWED.has(exitPackage.exitDecision)) throw new Error("valid_exit_decision_required");
  const acquisitionPrice = money(exitPackage.acquisitionPrice);
  const finalSpend = money(exitPackage.finalSpend);
  const totalBasis = acquisitionPrice + finalSpend;
  const arv = money(exitPackage.arvBaseline);
  const saleCostsPct = pct(market.saleCostsPct ?? 8);
  const expectedSalePrice = money(market.expectedSalePrice ?? arv);
  const rent = money(market.monthlyRent);
  const monthlyExpenses = money(market.monthlyOperatingExpenses);
  const monthlyDebtService = money(financing.monthlyDebtService);
  const refinanceAmount = money(financing.refinanceAmount);

  const netSaleProceeds = expectedSalePrice > 0 ? expectedSalePrice * (1 - saleCostsPct / 100) : null;
  const projectedSaleProfit = netSaleProceeds === null ? null : netSaleProceeds - totalBasis;
  const monthlyNoi = rent > 0 ? Math.max(0, rent - monthlyExpenses) : null;
  const dscr = monthlyNoi !== null && monthlyDebtService > 0 ? monthlyNoi / monthlyDebtService : null;
  const cashRecovered = refinanceAmount > 0 ? refinanceAmount : null;
  const equityRemaining = arv > 0 && refinanceAmount > 0 ? arv - refinanceAmount : null;

  const evidence = {
    completionEvidenceRef: exitPackage.completionEvidenceRef || null,
    hasFreshSalePrice: market.expectedSalePrice != null,
    hasFreshRent: market.monthlyRent != null,
    hasDebtService: financing.monthlyDebtService != null,
    hasRefinanceAmount: financing.refinanceAmount != null,
  };

  const candidates = [];
  if (projectedSaleProfit !== null) candidates.push({ strategy:"sell", score: projectedSaleProfit, metric:"projectedSaleProfit", value:round(projectedSaleProfit), supported:evidence.hasFreshSalePrice });
  if (dscr !== null) candidates.push({ strategy:"hold", score: dscr * 10000, metric:"dscr", value:round(dscr,3), supported:evidence.hasFreshRent && evidence.hasDebtService });
  if (cashRecovered !== null) candidates.push({ strategy:"refinance", score: cashRecovered, metric:"cashRecovered", value:round(cashRecovered), supported:evidence.hasRefinanceAmount });

  const supported = candidates.filter(x=>x.supported).sort((a,b)=>b.score-a.score);
  const recommended = supported[0]?.strategy || null;
  const confidence = supported.length >= 2 ? "medium" : supported.length === 1 ? "low" : "insufficient_data";

  return {
    contractVersion:"1.0",
    sourceSystem:"mission-control",
    sourceOpportunityId:exitPackage.sourceOpportunityId || null,
    propertyId:exitPackage.propertyId || null,
    address:exitPackage.address || null,
    originalDecision:exitPackage.exitDecision,
    recommendedDecision:recommended,
    confidence,
    requiresInvestmentCommittee: true,
    metrics:{ totalBasis:round(totalBasis), arv:round(arv), expectedSalePrice:expectedSalePrice||null, netSaleProceeds:netSaleProceeds===null?null:round(netSaleProceeds), projectedSaleProfit:projectedSaleProfit===null?null:round(projectedSaleProfit), monthlyRent:rent||null, monthlyOperatingExpenses:monthlyExpenses||null, monthlyNoi:monthlyNoi===null?null:round(monthlyNoi), monthlyDebtService:monthlyDebtService||null, dscr:dscr===null?null:round(dscr,3), refinanceAmount:refinanceAmount||null, equityRemaining:equityRemaining===null?null:round(equityRemaining) },
    evidence,
    limitations: limitations(evidence),
  };
}

export function buildExitHandoff({ exitPackage, evaluation }) {
  if (!evaluation?.requiresInvestmentCommittee) throw new Error("governed_exit_evaluation_required");
  return {
    contractVersion:"1.0",
    sourceSystem:"mission-control",
    targetSystem:"ocg-os",
    handoffType:"renovation_exit_ready",
    sourceOpportunityId:exitPackage.sourceOpportunityId || null,
    propertyId:exitPackage.propertyId || null,
    address:exitPackage.address || null,
    renovation: exitPackage,
    exitEvaluation: evaluation,
    decisionStatus:"investment_committee_required",
  };
}

function limitations(e){
  const out=[];
  if(!e.hasFreshSalePrice) out.push("Fresh market sale-price evidence is missing.");
  if(!e.hasFreshRent) out.push("Fresh market rent evidence is missing.");
  if(!e.hasDebtService) out.push("Current debt-service terms are missing.");
  if(!e.hasRefinanceAmount) out.push("Current refinance proceeds are missing.");
  return out;
}
function money(v){ const n=Number(v??0); if(!Number.isFinite(n)||n<0) throw new Error("invalid_exit_financial_input"); return n; }
function pct(v){ const n=Number(v); if(!Number.isFinite(n)||n<0||n>100) throw new Error("invalid_percentage"); return n; }
function round(v,d=2){ const p=10**d; return Math.round(v*p)/p; }
