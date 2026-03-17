import { resolveEffectiveSkillForAction } from '../../src/turn/turn-controller.js';

/**
 * スキルの消費コストを option ラベル用文字列にフォーマットする。
 *
 * エンジンの resolveEffectiveSkillForAction を経由して、
 * SkillSwitch / OverwriteSp / ReduceSp パッシブ適用後の spCost を使用する。
 * state / member が null の場合は rawスキルの spCost をそのまま使う（フォールバック）。
 *
 * 鬼神化中 STezuka の SP 消費スキルの spCost はエンジン層で 0 に解決される
 * （resolveEffectiveSkillForAction 内の kishinka チェックによる）。
 *
 * @param {object} skill        CharacterStyle.getActionSkills() の要素
 * @param {object|null} member  BattleState.party の要素
 * @param {object|null} state   BattleState
 * @returns {string}  例: '(4)' / '(0)' / 'E(3)' / 'T(2)' / 'M(3)' / '(*)' / 'T(*)' / 'M(*)'
 */
export function formatSkillCostLabel(skill, member = null, state = null) {
  const effectiveSkill =
    state && member ? resolveEffectiveSkillForAction(state, member, skill) : skill;
  const consumeType = String(effectiveSkill?.consumeType ?? effectiveSkill?.consume_type ?? 'Sp');
  const consumeTypeLower = consumeType.toLowerCase();
  const costRaw = Number(effectiveSkill?.spCost ?? effectiveSkill?.sp_cost ?? 0);
  const n = costRaw === -1 ? '*' : String(costRaw);

  if (consumeTypeLower === 'token') return `T(${n})`;
  if (consumeTypeLower === 'morale') return `M(${n})`;
  if (consumeTypeLower === 'ep') return `E(${n})`;
  return `(${n})`;
}
