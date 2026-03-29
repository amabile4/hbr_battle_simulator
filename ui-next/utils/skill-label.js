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

const ELEMENT_LABELS = Object.freeze({
  Fire: '火',
  Ice: '氷',
  Thunder: '雷',
  Light: '光',
  Dark: '闇',
});

/**
 * スキルが同名で属性が異なるセット（スイッチスキルなど）の一員の場合、
 * そのスキルの属性名（日本語）を返す。それ以外は null。
 *
 * 例: 「最高潮！アオハルオンステージ」の氷版→「氷」、雷版→「雷」
 * 通常の（同名重複なし）スキルは null を返すため、表示側で余計な加工をしない。
 *
 * @param {object} skill       対象スキルデータ（parts[0].elements を参照）
 * @param {Array}  allSkills   同一スロットに並ぶすべてのスキルリスト
 * @returns {string|null}
 */
export function getElementHintForDuplicateNamedSkill(skill, allSkills = []) {
  if (!skill || !Array.isArray(allSkills) || allSkills.length < 2) {
    return null;
  }

  const skillName = String(skill.name ?? '').trim();
  if (!skillName) {
    return null;
  }

  const sameNameSkills = allSkills.filter(
    (s) => String(s.name ?? '').trim() === skillName
  );
  if (sameNameSkills.length < 2) {
    return null;
  }

  // 同名スキル間で属性が 2 種類以上あるか検査
  const distinctElements = new Set();
  for (const s of sameNameSkills) {
    const parts = Array.isArray(s.parts) ? s.parts : [];
    (parts[0]?.elements ?? []).forEach((elem) => distinctElements.add(String(elem).trim()));
  }
  if (distinctElements.size < 2) {
    return null;
  }

  // このスキル自身の属性ラベルを返す
  const parts = Array.isArray(skill.parts) ? skill.parts : [];
  const firstElement = String((parts[0]?.elements ?? [])[0] ?? '').trim();
  return ELEMENT_LABELS[firstElement] ?? null;
}
