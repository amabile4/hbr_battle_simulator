import { resolveEffectiveSkillForAction } from '../../src/turn/turn-controller.js';

// src/domain/character-style.js:L447 / src/turn/turn-controller.js:L33 で同じ値を使用。
// エンジンの実際消費側（character-style.js:L446-455）は鬼神化中に rawCost=0 にするが、
// resolveEffectiveSkillForAction の返り値には反映されないため、UI 側でも判定が必要。
// 将来 kishinka が ReduceSp パッシブとして実装されたら下記チェックを削除する。
const TEZUKA_CHARACTER_ID = 'STezuka';

/**
 * スキルの消費コストを option ラベル用文字列にフォーマットする。
 *
 * エンジンの resolveEffectiveSkillForAction を経由して、
 * SkillSwitch / OverwriteSp / ReduceSp パッシブ適用後の spCost を使用する。
 * state / member が null の場合は rawスキルの spCost をそのまま使う（フォールバック）。
 *
 * 鬼神化中 STezuka の SP 消費スキルは SP 0 として表示する
 * （character-style.js:L446-455 と同じ判定を表示側でも保持）。
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

  // 鬼神化中: EP / Token / Morale / ALL 消費以外は SP 0 に表示を上書き
  if (
    member?.characterId === TEZUKA_CHARACTER_ID &&
    Boolean(member?.isReinforcedMode) &&
    consumeTypeLower !== 'ep' &&
    consumeTypeLower !== 'token' &&
    consumeTypeLower !== 'morale' &&
    costRaw !== -1
  ) {
    return 'SP 0';
  }

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
