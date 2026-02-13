import { buildPlan, validatePlan } from './generator.mjs';
import { planToIR } from './ir.mjs';

export const DEFAULT_RANKING_POLICY = {
  severity_penalty: { Critical: 100, Major: 25, New: 5 },
  blocked_penalty: 80,
  complexity_penalty: { component_over_threshold: 2, section_over_threshold: 1, threshold: 7 },
  balance_penalty_per_component_diff: 2,
  target_component_count: 5,
  fidelity_bonus: { lowfi: 0, prototype: 4, hifi: 2 }
};

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge(base, extra) {
  const output = { ...(base || {}) };
  if (!isObject(extra)) return output;
  for (const [key, value] of Object.entries(extra)) {
    if (isObject(value) && isObject(output[key])) {
      output[key] = deepMerge(output[key], value);
      continue;
    }
    output[key] = value;
  }
  return output;
}

export function resolveRankingPolicy(customPolicy = {}) {
  return {
    severity_penalty: { ...DEFAULT_RANKING_POLICY.severity_penalty, ...(customPolicy.severity_penalty || {}) },
    blocked_penalty: Number(customPolicy.blocked_penalty ?? DEFAULT_RANKING_POLICY.blocked_penalty),
    complexity_penalty: {
      ...DEFAULT_RANKING_POLICY.complexity_penalty,
      ...(customPolicy.complexity_penalty || {})
    },
    balance_penalty_per_component_diff: Number(
      customPolicy.balance_penalty_per_component_diff ?? DEFAULT_RANKING_POLICY.balance_penalty_per_component_diff
    ),
    target_component_count: Number(customPolicy.target_component_count ?? DEFAULT_RANKING_POLICY.target_component_count),
    fidelity_bonus: { ...DEFAULT_RANKING_POLICY.fidelity_bonus, ...(customPolicy.fidelity_bonus || {}) }
  };
}

export function resolveRankingContext({ registry, body = {}, project = null }) {
  const presetName = body.rankingPreset || project?.rankingPreset || 'balanced';
  const presets = registry.ranking_presets || {};
  const presetPolicy = presets[presetName] || {};
  const projectOverride = project?.rankingPolicyOverride || {};
  const bodyOverride = body.rankingPolicyOverride || body.rankingPolicy || {};

  const mergedPolicy = deepMerge(
    deepMerge(
      deepMerge(registry.ranking_policy || {}, presetPolicy),
      projectOverride
    ),
    bodyOverride
  );

  return {
    preset: presetName,
    policy: resolveRankingPolicy(mergedPolicy),
    presets
  };
}

export function scoreMatrixItem(plan, compliance, rankingPolicy = {}) {
  const policy = resolveRankingPolicy(rankingPolicy);
  const counts = compliance?.counts || {};
  const critical = Number(counts.Critical || 0);
  const major = Number(counts.Major || 0);
  const fresh = Number(counts.New || 0);
  const componentCount = Array.isArray(plan?.components) ? plan.components.length : 0;
  const sectionCount = Object.values(plan?.sections || {}).reduce(
    (acc, value) => acc + (Array.isArray(value) ? value.length : 0),
    0
  );

  const severityPenalty = policy.severity_penalty || {};
  const violationPenalty =
    critical * Number(severityPenalty.Critical || 0) +
    major * Number(severityPenalty.Major || 0) +
    fresh * Number(severityPenalty.New || 0);
  const blockedPenalty = compliance?.blocked ? Number(policy.blocked_penalty || 0) : 0;
  const threshold = Number(policy.complexity_penalty?.threshold || 7);
  const componentOver = Number(policy.complexity_penalty?.component_over_threshold || 0);
  const sectionOver = Number(policy.complexity_penalty?.section_over_threshold || 0);
  const complexityPenalty = Math.max(0, componentCount - threshold) * componentOver + Math.max(0, sectionCount - threshold) * sectionOver;
  const balancePenalty = Math.abs(componentCount - Number(policy.target_component_count || 5)) * Number(policy.balance_penalty_per_component_diff || 0);
  const fidelityBonus = Number(policy.fidelity_bonus?.[plan?.fidelity] || 0);

  const rawScore = 100 - violationPenalty - blockedPenalty - complexityPenalty - balancePenalty + fidelityBonus;
  const score = Math.max(0, Math.min(100, rawScore));

  return {
    score,
    breakdown: {
      violationPenalty,
      blockedPenalty,
      complexityPenalty,
      balancePenalty,
      fidelityBonus,
      componentCount,
      sectionCount,
      policy
    }
  };
}

export function buildMatrixResult({ prompt, dataSchema, registry, evaluateComplianceFn, rankingContext, options = {} }) {
  const fidelities = ['lowfi', 'prototype', 'hifi', 'prototype'];
  const matrix = fidelities.map((fidelity, index) => {
    const plan = buildPlan(prompt, dataSchema, registry, {
      ...options,
      fidelity,
      editInstruction:
        index === 3
          ? `${options.editInstruction ? `${options.editInstruction}\n` : ''}대안안: 액션 우선 배치`
          : options.editInstruction || ''
    });
    if (index === 3) {
      plan.title = `${plan.title} (대안)`;
      plan.previewDensity = 'balanced';
    }
    const validation = validatePlan(plan, registry);
    const compliance = evaluateComplianceFn(validation, 'generation', true);
    const rank = scoreMatrixItem(plan, compliance, rankingContext.policy);
    return { fidelity, plan, ir: planToIR(plan), validation, compliance, rank, variantId: index === 3 ? 'prototype_alt' : fidelity };
  });

  const ranked = [...matrix].sort((a, b) => {
    const scoreDiff = Number(b.rank?.score || 0) - Number(a.rank?.score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return String(a.fidelity).localeCompare(String(b.fidelity));
  });

  ranked.forEach((item, index) => {
    item.rank = { ...(item.rank || {}), order: index + 1 };
  });

  const recommendation = ranked[0]
    ? {
        fidelity: ranked[0].fidelity,
        score: ranked[0].rank?.score || 0,
        reason: `레지스트리 랭킹 정책(${rankingContext.preset}) 기준으로 추천안을 선택했습니다.`
      }
    : null;

  return { ranked, recommendation };
}
