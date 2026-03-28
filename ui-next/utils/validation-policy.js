export const DEFAULT_VALIDATION_POLICY = Object.freeze({
  allowInsufficientSp: true,
  allowInsufficientOd: true,
  allowUseCountOverflow: true,
  allowSkillConditionMismatch: true,
});

export function normalizeValidationPolicy(policy = {}) {
  return {
    allowInsufficientSp:
      policy?.allowInsufficientSp !== undefined
        ? Boolean(policy.allowInsufficientSp)
        : DEFAULT_VALIDATION_POLICY.allowInsufficientSp,
    allowInsufficientOd:
      policy?.allowInsufficientOd !== undefined
        ? Boolean(policy.allowInsufficientOd)
        : DEFAULT_VALIDATION_POLICY.allowInsufficientOd,
    allowUseCountOverflow:
      policy?.allowUseCountOverflow !== undefined
        ? Boolean(policy.allowUseCountOverflow)
        : DEFAULT_VALIDATION_POLICY.allowUseCountOverflow,
    allowSkillConditionMismatch:
      policy?.allowSkillConditionMismatch !== undefined
        ? Boolean(policy.allowSkillConditionMismatch)
        : DEFAULT_VALIDATION_POLICY.allowSkillConditionMismatch,
  };
}
