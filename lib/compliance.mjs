const DEFAULT_POLICY = {
  generation: { block: ['Critical'], warn: ['Major', 'New'] },
  validation: { block: ['Critical'], warn: ['Major', 'New'] },
  deploy: { block: ['Critical', 'Major'], warn: ['New'] }
};

function normalizePolicy(policy = {}) {
  return {
    generation: { ...DEFAULT_POLICY.generation, ...(policy.generation || {}) },
    validation: { ...DEFAULT_POLICY.validation, ...(policy.validation || {}) },
    deploy: { ...DEFAULT_POLICY.deploy, ...(policy.deploy || {}) }
  };
}

export function evaluateCompliance({ validation = [], stage = 'validation', policy = {}, allowNew = true }) {
  const normalizedPolicy = normalizePolicy(policy);
  const stagePolicy = normalizedPolicy[stage] || normalizedPolicy.validation;
  const blockSet = new Set(stagePolicy.block || []);
  const warnSet = new Set(stagePolicy.warn || []);

  if (allowNew) {
    blockSet.delete('New');
    warnSet.add('New');
  }

  const blockedItems = validation.filter((item) => blockSet.has(item.severity));
  const warningItems = validation.filter((item) => warnSet.has(item.severity) && !blockSet.has(item.severity));

  const counts = validation.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {});

  return {
    stage,
    blocked: blockedItems.length > 0,
    allowNew,
    blockedItems,
    warningItems,
    counts,
    policy: stagePolicy
  };
}
