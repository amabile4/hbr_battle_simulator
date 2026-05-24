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

/**
 * `label` 末尾の数値を抽出する。
 * 例: "RKayamoriSkill51" → 51、"YShirakawaSkill09" → 9
 * 数値が抽出できない場合は null を返す。
 */
export function extractSkillLabelTrailingNumber(label) {
  const match = String(label ?? '').match(/(\d+)\D*$/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

export function extractSkillLabelSkillNumber(label) {
  const match = String(label ?? '').match(/Skill(\d+)/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

export const SKILL_TYPE_SKILL = 'スキル';
export const SKILL_TYPE_SKILL_RESTRICTED = 'スキル（専用）';
export const SKILL_TYPE_EX_SKILL = 'EXスキル';
export const SKILL_TYPE_EX_SKILL_RESTRICTED = 'EXスキル（専用）';

const EX_SKILL_LABEL_NUMBER_THRESHOLD = 51;

/**
 * スキルを「スキル」「スキル（専用）」「EXスキル」「EXスキル（専用）」の4区分に分類する。
 * @param {object} skill
 * @returns {'スキル'|'スキル（専用）'|'EXスキル'|'EXスキル（専用）'|null}
 */
export function classifySkillType(skill) {
  if (!skill || typeof skill !== 'object') {
    return null;
  }
  const label = String(skill.label ?? '');
  const skillNumber = extractSkillLabelSkillNumber(label);
  if (skillNumber === null) {
    return null;
  }
  const isEx = skillNumber >= EX_SKILL_LABEL_NUMBER_THRESHOLD;
  const isRestricted = Number(skill.is_restricted ?? skill.isRestricted ?? 0) === 1;

  if (isEx && isRestricted) {
    return SKILL_TYPE_EX_SKILL_RESTRICTED;
  }
  if (isEx) {
    return SKILL_TYPE_EX_SKILL;
  }
  if (isRestricted) {
    return SKILL_TYPE_SKILL_RESTRICTED;
  }
  return SKILL_TYPE_SKILL;
}

/**
 * スキルが EX スキルかどうかを返す（label 内の SkillNN が 51 以上）。
 */
export function isExSkillByLabel(skill) {
  const skillNumber = extractSkillLabelSkillNumber(String(skill?.label ?? ''));
  return skillNumber !== null && skillNumber >= EX_SKILL_LABEL_NUMBER_THRESHOLD;
}
