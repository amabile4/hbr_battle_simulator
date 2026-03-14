export const NORMAL_ATTACK_SKILL_NAME = '通常攻撃';
export const PURSUIT_SKILL_NAME = '追撃';
export const ADMIRAL_COMMAND_SKILL_NAME = '指揮行動';
export const ADMIRAL_SKILL_ROLE = 'Admiral';
export const PURSUIT_ONLY_DESC_MARKER = '追撃でのみ発動可能';
export const NORMAL_ATTACK_LABEL_SUFFIX = 'AttackNormal';
export const PURSUIT_LABEL_SUFFIX = 'Skill91';

export function isNormalAttackSkill(skill) {
  const name = String(skill?.name ?? '');
  const label = String(skill?.label ?? '');
  return name === NORMAL_ATTACK_SKILL_NAME || label.endsWith(NORMAL_ATTACK_LABEL_SUFFIX);
}

export function isAdmiralCommandSkill(skill) {
  const name = String(skill?.name ?? '');
  const role = String(skill?.role ?? '');
  return name === ADMIRAL_COMMAND_SKILL_NAME && role === ADMIRAL_SKILL_ROLE;
}

export function isPursuitOnlySkill(skill) {
  const name = String(skill?.name ?? '');
  const label = String(skill?.label ?? '');
  const desc = String(skill?.desc ?? '');
  return (
    name === PURSUIT_SKILL_NAME ||
    label.endsWith(PURSUIT_LABEL_SUFFIX) ||
    desc.includes(PURSUIT_ONLY_DESC_MARKER)
  );
}
