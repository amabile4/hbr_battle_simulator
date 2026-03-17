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
 * @returns {string}  例: 'SP 4' / 'SP 0' / 'EP 3' / 'Token 2' / 'SP ALL' / 'Morale ALL'
 */
export function formatSkillCostLabel(skill, member = null, state = null) {
  const effectiveSkill =
    state && member ? resolveEffectiveSkillForAction(state, member, skill) : skill;
  const consumeType = String(effectiveSkill?.consumeType ?? effectiveSkill?.consume_type ?? 'Sp');
  const consumeTypeLower = consumeType.toLowerCase();
  const costRaw = Number(effectiveSkill?.spCost ?? effectiveSkill?.sp_cost ?? 0);

  if (consumeTypeLower === 'token') {
    return costRaw === -1 ? 'Token ALL' : `Token ${costRaw}`;
  }
  if (consumeTypeLower === 'morale') {
    return costRaw === -1 ? 'Morale ALL' : `Morale ${costRaw}`;
  }
  if (consumeTypeLower !== 'ep' && costRaw === -1) {
    return 'SP ALL';
  }
  return consumeTypeLower === 'ep' ? `EP ${costRaw}` : `SP ${costRaw}`;
}
