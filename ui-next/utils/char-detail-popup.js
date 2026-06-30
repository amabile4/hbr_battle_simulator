/**
 * char-detail-popup.js
 *
 * キャラクター詳細フローティングポップアップ — シングルトン実装。
 * プレイヤーアイコンの contextmenu イベント（右クリック / 長押し）で開く。
 *
 * タブ構成:
 *   1. 状態変化詳細 — バフ/デバフを 1ブロック1件形式で表示
 *   2. アビリティ   — 限界突破パッシブアビリティ一覧
 *   3. パッシブスキル — 当該ターンで発動済みのパッシブ一覧
 *   4. フィールド効果 — Zone/Territory/Talisman などのパーティ共通フィールド状態
 */

import { resolveUiAssetUrl, resolveSkillTypeAssetUrl } from '../../src/ui/style-asset-url.js';
import { normalizeEnemyStatusType } from '../../src/domain/enemy-status.js';
import {
  getCurrentFormInfo,
  hasFormChange,
  isFormEntryActive,
} from '../../src/domain/form-change.js';
import { buildFieldDisplayEntries } from './field-state-display.js';
import { SPECIAL_STATUS_TYPE_NAMES } from '../../src/domain/character-style.js';
import { ELEMENT_KANJI, ELEMENT_PREFIXED_STATUS_TYPES } from './element-status-constants.js';
import {
  getUnifiedStatusTypeId,
  getElementSortValue,
  getElementVariantCategory,
  getStatusDurationSortValue,
  USE_UNIFIED_ID_ORDER,
  FALLBACK_ORDER_OFFSET,
  UNKNOWN_ORDER_VALUE,
} from './status-sort-order.js';
import { resolveSourceSkillDescription } from './source-skill-description.js';
import { resolveAdoptionStatus } from './buff-adoption.js';
import { calculateDamage } from '../../src/domain/damage-calculator.js';
import { calculateDestruction } from '../../src/domain/destruction-calculator.js';
import { loadDamageCalculationData } from './damage-calculation-data.js';
import { getPreviewInputValue, setPreviewInputValue } from './preview-input-store.js';
import {
  buildDamageCalculationInput,
  buildDamageStatDeltaViewModel,
  resolveDefaultStats,
} from '../../src/domain/damage-calculator-input-builder.js';
import { normalizeCharacterStats, resolveStatsWithSupport } from '../../src/domain/character-stats.js';

const DEAD_STATUS_ICON_FILE_NAME = 'dead.webp';
const SYSTEM_PASSIVE_NAMES = new Set(['[Overdrive]']);
const SYSTEM_PASSIVE_LABELS = new Set(['Passive.Overdrive_DamageUp']);
const DAMAGE_CALC_STAT_KEYS = Object.freeze(['str', 'dex', 'con', 'spr', 'wis', 'luk']);
const DAMAGE_CALC_STAT_LABELS = Object.freeze({
  str: '力',
  dex: '器用さ',
  wis: '知性',
  spr: '精神',
  luk: '運',
  con: '体力',
});
const DAMAGE_CALC_DEFAULT_ROLE = 'Attacker';
const DAMAGE_CALC_DEFAULT_ENEMY_BORDER = 770;
const DEFAULT_DESTRUCTION_RATE_PERCENT = 100;
const DEFAULT_DESTRUCTION_PREVIEW_DP = 1;
const damageCalculationActionModels = new Map();
const damageCalculationInteractionPanels = new WeakSet();

export function resolveSkillTypeIconUrl(statusType) {
  const name = String(statusType ?? '').trim();
  if (!name) return '';
  if (name.toLowerCase() === 'dead') {
    return resolveUiAssetUrl(DEAD_STATUS_ICON_FILE_NAME);
  }
  return resolveSkillTypeAssetUrl(`${name}.webp`);
}

// ============================================================
// 属性・武器種アイコンマップ
// ============================================================
const ELEMENT_ICON = {
  Fire:    { src: resolveUiAssetUrl('Fire.webp'),    alt: '火' },
  Ice:     { src: resolveUiAssetUrl('Ice.webp'),     alt: '氷' },
  Thunder: { src: resolveUiAssetUrl('Thunder.webp'), alt: '雷' },
  Light:   { src: resolveUiAssetUrl('Light.webp'),   alt: '光' },
  Dark:    { src: resolveUiAssetUrl('Dark.webp'),    alt: '闇' },
};

const WEAPON_ICON = {
  Slash:  { src: resolveUiAssetUrl('Slash.webp'),  alt: '斬' },
  Stab:   { src: resolveUiAssetUrl('Stab.webp'),   alt: '突' },
  Strike: { src: resolveUiAssetUrl('Strike.webp'), alt: '打' },
};

function buildHeaderIconsHtml(member) {
  const elements = Array.isArray(member?.elements) ? member.elements : [];
  const weaponType = String(member?.weaponType ?? '').trim();
  const parts = [];

  for (const el of elements) {
    const icon = ELEMENT_ICON[el];
    if (icon) {
      parts.push(`<img src="${icon.src}" alt="${icon.alt}" class="char-popup-hdr-icon" />`);
    }
  }
  if (weaponType && WEAPON_ICON[weaponType]) {
    const icon = WEAPON_ICON[weaponType];
    parts.push(`<img src="${icon.src}" alt="${icon.alt}" class="char-popup-hdr-icon" />`);
  }
  return parts.join('');
}

// ============================================================
// バフ種別ラベル（正式名称）
// ============================================================
const STATUS_LABELS = {
  Reinforce:                 '鬼神化中',
  ActionDisabled:            '行動不能',
  // 攻撃・防御
  AttackUp:                  '攻撃力アップ',
  AttackDown:                '攻撃力ダウン',
  AttackUpIncludeNormal:     '攻撃力アップ（通常攻撃含む）',
  DefenseUp:                 '防御力アップ',
  DefenseDown:               '防御力ダウン',
  DamageRateUp:              '破壊率上昇量アップ',
  ResistDown:                '耐性ダウン',
  ResistDownOverwrite:       '属性耐性打ち消し',
  ToughnessUpValue:          '体力アップ',
  Fragile:                   '脆弱',
  Undermine:                 '蝕',
  Shredding:                 '速弾き',
  HighBoost:                 'ハイブースト',
  Sprightly:                 '軽快',
  Mocktail:                  'モクテル',
  Babied:                    'オギャり',
  GiveAttackBuffUp:          'スキル攻撃力上昇の効果アップ',
  GiveDebuffUp:              'デバフスキル効果量アップ',
  GiveDefenseDebuffUp:       '防御力ダウン効果アップ',

  // CT
  CriticalRateUp:            'クリティカル確率アップ',
  CriticalRateDown:          'クリティカル確率ダウン',
  CriticalDamageUp:          'クリティカルダメージアップ',
  CriticalDamageDown:        'クリティカルダメージダウン',

  // 回復・HP
  HealDp:                    'HP回復',
  HealDpByDamage:            'ダメージHP回復',
  HealDown:                  '回復量ダウン',
  RegenerationDp:            'HP継続回復',
  ReviveDp:                  'DPゲージ復活',

  // SP・EP
  HealSp:                    'SP回復',
  HealSpRandom:              '確率でSPを回復',
  OverwriteSp:               'SP上書き',
  SpecifySp:                 'SP指定',
  SpLimitOverwrite:          'SP上限上書き',
  HealEp:                    'EP回復',
  HealSkillUsedCount:        'スキル使用回数回復',

  // OD
  OverDrivePointUp:          'ODゲージアップ',
  OverDrivePointDown:        'ODゲージダウン',
  OverDrivePointUpByToken:   'トークンによるODゲージアップ',

  // 状態異常
  ConfusionRandom:           '混乱',
  ImprisonRandom:            '束縛',
  StunRandom:                '気絶',
  RecoilRandom:              '反動ダメージ',
  Misfortune:                '不幸',
  SelfDamage:                '自傷ダメージ',

  // 防御・補助
  DebuffGuard:               'デバフ無効',
  BuffCharge:                'チャージ',
  Invincible:                '無敵',
  Cover:                     'かばう',
  Dodge:                     '回避',
  Provoke:                   '挑発',
  Break:                     'BREAK',
  SuperBreak:                '強ブレイク',
  BreakGuard:                'ブレイクガード',
  SuperBreakDown:            '超ダウン',
  DownTurn:                  'ダウンターン',
  BreakDownTurnUp:           'ブレイクダウンターン延長',

  // 特殊状態・効果
  MindEye:                   '心眼',
  FightingSpirit:            '闘志',
  Morale:                    '士気',
  Motivation:                'やる気',
  EternalOath:               '永遠の誓い',
  ShadowClone:               '影分身',
  Funnel:                    '連撃数アップ',
  Diva:                      '歌姫の加護',
  Hacking:                   'ハッキング',
  FireMark:                  '火の印',

  // スキル関連
  AdditionalTurn:            '追加ターン',
  DoubleActionExtraSkill:    'EXスキル連続発動',
  ByakkoDoubleActionAttackSkill: 'ラッシュ',
  SkillCondition:            'スキル条件',
  SkillRandom:               'スキルランダム',
  SkillSwitch:               'スキルスイッチ',
  FixedHpDamageRateAttack:   '固定HP割合攻撃',
  TokenSet:                  'トークン上昇',

  // バフ/デバフ解除
  RemoveBuff:                'バフ解除',
  RemoveDebuff:              'デバフ解除',
  RemoveSpecialStatus:       '特殊状態解除',

  // フィールド関連
  Talisman:                  '霊符状態',
  Disaster:                  '禍状態',
  ZoneUpEternal:             'フィールド状態永続',
  ReviveTerritory:           '再生の陣',

  // キャラ固有
  ArrowCherryBlossoms:       '桜花の矢',
  BIYamawakiServant:         '山脇様のしもべ',
  Curry:                     'カリー',
  Gelato:                    'ジェラート',
  Shchi:                     'シチー',
  Steak:                     'ステーキ',

  // 速度
  SpeedUp:                   '速度アップ',
  SpeedDown:                 '速度ダウン',
};


export const STATUS_TYPE_DISPLAY_ORDER = Object.freeze(Object.keys(STATUS_LABELS));

const STATUS_TYPE_DISPLAY_ORDER_INDEX = new Map(
  STATUS_TYPE_DISPLAY_ORDER.map((statusType, index) => [statusType, index])
);

function getStatusTabOrderValue(statusType) {
  const normalized = String(statusType ?? '').trim();
  const displayIndex = STATUS_TYPE_DISPLAY_ORDER_INDEX.get(normalized);

  if (USE_UNIFIED_ID_ORDER) {
    const id = getUnifiedStatusTypeId(normalized);
    if (id !== undefined) {
      return id;
    }
    // ID未定義タイプは既存順を維持しつつ、ID定義タイプの後ろへ。
    if (displayIndex !== undefined) {
      return FALLBACK_ORDER_OFFSET + displayIndex;
    }
    return UNKNOWN_ORDER_VALUE;
  }

  return displayIndex ?? Number.MAX_SAFE_INTEGER;
}

export function sortStatusEffectsForStatusTab(effects) {
  if (!Array.isArray(effects)) {
    return [];
  }
  return effects
    .slice()
    .sort((a, b) => {
      // §2.2 属性バリアント分類: (1)a → (1)b → (2)
      const catA = getElementVariantCategory(a?.statusType, a?.elements);
      const catB = getElementVariantCategory(b?.statusType, b?.elements);
      if (catA !== catB) {
        return catA - catB;
      }

      // §2.3 種別ID順
      const orderA = getStatusTabOrderValue(a?.statusType);
      const orderB = getStatusTabOrderValue(b?.statusType);
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // 同一種別内の属性順
      const elemA = getElementSortValue(a?.elements);
      const elemB = getElementSortValue(b?.elements);
      if (elemA !== elemB) {
        return elemA - elemB;
      }

      // 同一種別内では Eternal → Turn系 → Count
      const durationA = getStatusDurationSortValue(a);
      const durationB = getStatusDurationSortValue(b);
      if (durationA !== durationB) {
        return durationA - durationB;
      }

      // §2.4 power 降順
      const powerA = Number(a?.power ?? 0);
      const powerB = Number(b?.power ?? 0);
      if (powerA !== powerB) {
        return powerB - powerA;
      }

      // remaining 降順
      const remainingA = Number(a?.remaining ?? 0);
      const remainingB = Number(b?.remaining ?? 0);
      if (remainingA !== remainingB) {
        return remainingB - remainingA;
      }

      // effectId 昇順
      const idA = Number(a?.effectId ?? 0);
      const idB = Number(b?.effectId ?? 0);
      return idA - idB;
    });
}

export function getStatusLabel(statusType) {
  const normalizedType = normalizeEnemyStatusType(statusType);
  return STATUS_LABELS[normalizedType] ?? normalizedType;
}

function resolveElementalStatusType(statusType, elements) {
  const normalizedType = normalizeEnemyStatusType(statusType);
  const firstElement = String(Array.isArray(elements) ? elements[0] ?? '' : '').trim();
  if (!normalizedType || !firstElement) {
    return '';
  }
  const compositeType = `${firstElement}${normalizedType}`;
  return ELEMENT_PREFIXED_STATUS_TYPES.has(compositeType) ? compositeType : '';
}

function resolveElementalStatusLabel(statusType, elements) {
  const baseLabel = getStatusLabel(statusType);
  const firstElement = String(Array.isArray(elements) ? elements[0] ?? '' : '').trim();
  const compositeType = resolveElementalStatusType(statusType, elements);
  if (!compositeType || !ELEMENT_KANJI[firstElement]) {
    return baseLabel;
  }
  return `${ELEMENT_KANJI[firstElement]}${baseLabel}`;
}

// ============================================================
// HTML エスケープ
// ============================================================
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSystemPassive(passive) {
  const name = String(passive?.name ?? '').trim();
  const label = String(passive?.label ?? '').trim();
  return SYSTEM_PASSIVE_NAMES.has(name) || SYSTEM_PASSIVE_LABELS.has(label);
}

function getDisplayPassives(member) {
  return (Array.isArray(member?.passives) ? member.passives : [])
    .filter((passive) => !isSystemPassive(passive));
}

function isPassiveActiveForDisplay(member, passive) {
  if (!hasFormChange(member)) {
    return true;
  }
  return isFormEntryActive(member, passive);
}

function buildPassiveBlockHtml(
  passive,
  { showLimitBreakBadge = false, dimmed = false, entryRole = 'char-popup-passive-entry', isActive = true } = {}
) {
  const name = String(passive?.name ?? '').trim();
  const desc = String(passive?.desc ?? '').trim();
  const limitBreakLevel = Number(passive?.requiredLimitBreakLevel ?? 0);
  const dimmedClass = dimmed ? ' dimmed' : '';
  const lbBadgeHtml = showLimitBreakBadge
    ? `<span class="char-popup-passive-lb">LB${limitBreakLevel}</span>`
    : '';

  return (
    `<div class="char-popup-passive-block${dimmedClass}"` +
    ` data-role="${entryRole}"` +
    ` data-passive-name="${esc(name)}"` +
    ` data-passive-active="${isActive ? 'true' : 'false'}">` +
    `<div class="char-popup-passive-title">${esc(name)}${lbBadgeHtml}</div>` +
    (desc ? `<div class="char-popup-passive-desc">${esc(desc)}</div>` : '') +
    `</div>`
  );
}

const FUNNEL_SIZE_BY_PERCENT = Object.freeze({
  6: '小',
  12: '中',
  25: '大',
  50: '特大',
});

function normalizeFunnelPercentValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric <= 0) {
    return 0;
  }
  // 0.06 のような倍率形式と 6 のような百分率形式を両対応にする。
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return Math.round(percent);
}

function resolveFunnelSizeLabel(effect) {
  const metadataPercent = normalizeFunnelPercentValue(effect?.metadata?.damageBonus);
  if (FUNNEL_SIZE_BY_PERCENT[metadataPercent]) {
    return FUNNEL_SIZE_BY_PERCENT[metadataPercent];
  }

  const powerPercent = normalizeFunnelPercentValue(effect?.power);
  if (FUNNEL_SIZE_BY_PERCENT[powerPercent]) {
    return FUNNEL_SIZE_BY_PERCENT[powerPercent];
  }

  return '';
}

function buildEffectDisplayInfo(effect, resolveSkillDescription = null) {
  const statusType = String(effect?.statusType ?? '');
  const power = Number(effect?.power ?? 0);
  const desc = resolveSourceSkillDescription(effect, resolveSkillDescription);
  if (statusType === 'Funnel') {
    const hitCount = Number.isFinite(power) ? Math.max(0, Math.round(power)) : 0;
    const perHitBonus = Number(effect?.metadata?.damageBonus ?? 0);
    const perHitBonusPercent = normalizeFunnelPercentValue(perHitBonus);
    const totalBonusPercent = Number.isFinite(perHitBonusPercent)
      ? Math.round(hitCount * perHitBonusPercent)
      : 0;
    const funnelSizeLabel = resolveFunnelSizeLabel(effect);
    const fallbackDesc =
      hitCount > 0
        ? `連撃${funnelSizeLabel ? `（${funnelSizeLabel}）` : ''}${hitCount}回 ${Math.max(0, totalBonusPercent)}%`
        : '';
    return {
      powerLabel: '',
      desc: desc || fallbackDesc,
    };
  }
  const powerLabel = Number.isFinite(power) && power !== 0
    ? `${power > 0 ? '+' : ''}${Math.round(power * 100)}%`
    : '';
  return { powerLabel, desc };
}

// パネルサイズ・位置は CSS で制御（上下左右 10% マージン固定配置）

// ============================================================
// タブコンテンツビルダ
// ============================================================

/** 状態変化詳細タブ — バフ/デバフ 1件1ブロック */
function buildSpecialStatusEffects({ isReinforcedMode = false, reinforcedTurnsRemaining = 0, actionDisabledTurns = 0 } = {}) {
  const special = [];
  if (Boolean(isReinforcedMode)) {
    special.push({
      statusType: 'Reinforce',
      remaining: Math.max(1, Number(reinforcedTurnsRemaining ?? 0)),
      exitCond: 'Turn',
      sourceSkillDesc: '鬼神化中',
      iconUrl: resolveUiAssetUrl('Reinforce.webp'),
    });
  }
  if (Number(actionDisabledTurns ?? 0) > 0) {
    special.push({
      statusType: 'ActionDisabled',
      remaining: Number(actionDisabledTurns ?? 0),
      exitCond: 'Turn',
      sourceSkillDesc: '行動不能',
      iconUrl: resolveSkillTypeIconUrl('RecoilRandom'),
    });
  }
  return special;
}

function buildStatusBlockHtml(effect, options = {}) {
  const label = resolveElementalStatusLabel(effect.statusType, effect.elements);
  const skillName = String(effect.sourceSkillName ?? '').trim();
  const resolveSkillDescription =
    typeof options?.resolveSkillDescription === 'function'
      ? options.resolveSkillDescription
      : null;
  const displayInfo = buildEffectDisplayInfo(effect, resolveSkillDescription);
  const desc = displayInfo.desc;
  const powerStr = displayInfo.powerLabel;
  const exitCondStr = String(effect.exitCond ?? '');
  const remaining =
    exitCondStr === 'Eternal'
      ? '∞'
      : exitCondStr === 'Count'
      ? `${Number(effect.remaining ?? 0)}回`
      : `${Number(effect.remaining ?? 0)}T`;
  const sourceCharName = String(effect.sourceCharacterName ?? '').trim();
  const elementalStatusType = resolveElementalStatusType(effect.statusType, effect.elements);
  const iconUrl = String(effect?.iconUrl ?? '').trim() || resolveSkillTypeIconUrl(elementalStatusType || effect.statusType);
  const isAdopted = effect._adopted !== false;
  const adoptedAttr = ` data-adopted="${isAdopted}"`;
  const dimmedClass = isAdopted ? '' : ' dimmed';
  return (
    `<div class="char-popup-buff-block${dimmedClass}"${adoptedAttr}>` +
    `<div class="char-popup-buff-icon${iconUrl ? ' has-icon' : ''}">${iconUrl ? `<img src="${iconUrl}" alt="${esc(String(effect.statusType ?? ''))}" />` : ''}</div>` +
    `<div class="char-popup-buff-center">` +
    `<div class="char-popup-buff-title">${esc(label)}${powerStr ? `<span class="char-popup-buff-power">${esc(powerStr)}</span>` : ''}${skillName ? `<span class="char-popup-buff-skill">[${esc(skillName)}]</span>` : ''}` +
    (sourceCharName ? `<span class="char-popup-buff-from">${esc(sourceCharName)}</span>` : '') +
    `</div>` +
    (desc ? `<div class="char-popup-buff-desc line-clamp-2">${esc(desc)}</div>` : '') +
    `</div>` +
    `<div class="char-popup-buff-duration">${esc(remaining)}</div>` +
    `</div>`
  );
}

function buildPreviewStatusSectionHtml(previewActionFlow, options = {}) {
  const source = Array.isArray(previewActionFlow) ? previewActionFlow : [];
  const previewEffects = source
    .flatMap((action) => {
      const applied = Array.isArray(action?.statusEffectsApplied) ? action.statusEffectsApplied : [];
      const mappedApplied = applied.map((event) => ({
        statusType: (() => {
          const explicitStatusType = String(event?.statusType ?? '').trim();
          if (explicitStatusType) {
            return explicitStatusType;
          }
          const specialStatusTypeId = Number(event?.statusTypeId ?? 0);
          if (Number.isFinite(specialStatusTypeId) && specialStatusTypeId > 0) {
            return SPECIAL_STATUS_TYPE_NAMES[specialStatusTypeId] ?? `SpecialStatus_${specialStatusTypeId}`;
          }
          return '';
        })(),
        power: Number(event?.power ?? 0),
        remaining: Number(event?.remaining ?? 0),
        exitCond: String(event?.exitCond ?? 'Count'),
        elements: Array.isArray(event?.elements) ? [...event.elements] : [],
        sourceSkillName: String(event?.sourceSkillName ?? event?.skillName ?? action?.skillName ?? '').trim(),
        sourceSkillId: Number(event?.sourceSkillId ?? event?.skillId ?? action?.skillId ?? 0),
        sourceCharacterName: String(event?.sourceCharacterName ?? action?.actorCharacterName ?? '').trim(),
      }));
      const funnelApplied = Array.isArray(action?.funnelApplied) ? action.funnelApplied : [];
      const mappedFunnel = funnelApplied.map((event) => ({
        statusType: 'Funnel',
        power: Number(event?.hitBonus ?? event?.power ?? 0),
        remaining: Number(event?.remaining ?? 0),
        exitCond: String(event?.exitCond ?? 'Count'),
        elements: [],
        sourceSkillName: String(event?.sourceSkillName ?? event?.skillName ?? action?.skillName ?? '').trim(),
        sourceSkillId: Number(event?.sourceSkillId ?? event?.skillId ?? action?.skillId ?? 0),
        sourceCharacterName: String(event?.sourceCharacterName ?? action?.actorCharacterName ?? '').trim(),
        metadata: {
          damageBonus: Number(event?.damageBonus ?? event?.metadata?.damageBonus ?? 0),
        },
      }));
      return [...mappedApplied, ...mappedFunnel];
    })
    .filter((effect) => Boolean(String(effect.statusType ?? '').trim()));
  const previewBlocks = sortStatusEffectsForStatusTab(previewEffects)
    .map((effect) => buildStatusBlockHtml(effect, options))
    .join('');

  return (
    `<div class="char-popup-preview-section">` +
    `<div class="char-popup-preview-title">プレビュー（コミット見込み）</div>` +
    (previewBlocks
      ? `<div class="char-popup-preview-grid">${previewBlocks}</div>`
      : `<div class="char-popup-preview-empty">このターンで付与される状態変化なし</div>`) +
    `</div>`
  );
}

function buildStatusTabHtml(statusEffects, options = {}) {
  const mergedEffects = [
    ...buildSpecialStatusEffects(options),
    ...(Array.isArray(statusEffects) ? statusEffects : []),
  ];
  const previewSectionHtml = buildPreviewStatusSectionHtml(options?.previewActionFlow ?? [], options);
  if (mergedEffects.length === 0) {
    return `${previewSectionHtml}<p class="char-popup-empty">なし</p>`;
  }
  const activeEffects = mergedEffects.filter((e) => {
    if (String(e?.exitCond ?? '') === 'Eternal') return true;
    return Number(e?.remaining ?? 0) > 0;
  });
  if (activeEffects.length === 0) {
    return `${previewSectionHtml}<p class="char-popup-empty">なし</p>`;
  }

  const sorted = sortStatusEffectsForStatusTab(activeEffects);
  const withAdoption = resolveAdoptionStatus(sorted);
  const statusBlocksHtml = withAdoption
    .map((effect) => buildStatusBlockHtml(effect, options))
    .join('');

  return `${previewSectionHtml}${statusBlocksHtml}`;
}

/** アビリティタブ — 限界突破パッシブ (requiredLimitBreakLevel > 0) */
function buildAbilityTabHtml(member) {
  const passives = getDisplayPassives(member);
  if (passives.length === 0) {
    return '<p class="char-popup-empty">なし</p>';
  }
  return passives
    .map((passive) =>
      buildPassiveBlockHtml(passive, {
        showLimitBreakBadge: true,
        dimmed: !isPassiveActiveForDisplay(member, passive),
        entryRole: 'char-popup-ability-entry',
        isActive: isPassiveActiveForDisplay(member, passive),
      })
    )
    .join('');
}

/** パッシブスキルタブ — 当ターン発動済みパッシブ */
function buildPassiveEventHistoryTabHtml(member, passiveEvents) {
  const characterId = String(member?.characterId ?? '');
  const events = Array.isArray(passiveEvents)
    ? passiveEvents.filter((e) => String(e?.characterId ?? '') === characterId)
    : [];
  if (events.length === 0) {
    return '<p class="char-popup-empty">なし（このターン未発動）</p>';
  }
  return events
    .map((e) => {
      const name = String(e.passiveName ?? '').trim();
      const desc = String(e.passiveDesc ?? '').trim();
      return (
        `<div class="char-popup-passive-block">` +
        `<div class="char-popup-passive-title">${esc(name)}</div>` +
        (desc ? `<div class="char-popup-passive-desc">${esc(desc)}</div>` : '') +
        `</div>`
      );
    })
    .join('');
}

function buildCurrentActivePassiveTabHtml(member) {
  const activePassives = getDisplayPassives(member)
    .filter((passive) => isPassiveActiveForDisplay(member, passive));
  if (activePassives.length === 0) {
    return '<p class="char-popup-empty">なし（現在有効なパッシブなし）</p>';
  }
  return activePassives
    .map((passive) =>
      buildPassiveBlockHtml(passive, {
        entryRole: 'char-popup-passive-entry',
        isActive: true,
      })
    )
    .join('');
}

/** フィールド効果タブ — Zone / Territory / Talisman */
function buildFieldTabHtml(stateOrRecord) {
  const entries = buildFieldDisplayEntries(stateOrRecord);

  if (entries.length === 0) {
    return '<p class="char-popup-empty">なし</p>';
  }

  return entries
    .map((entry) =>
      `<div class="char-popup-field-block">` +
      `<div class="char-popup-field-header">` +
      `<span class="char-popup-field-label">${esc(entry.label)}</span>` +
      `<span class="char-popup-field-name">${esc(entry.name)}</span>` +
      (entry.duration ? `<span class="char-popup-field-duration">${esc(entry.duration)}</span>` : '') +
      `</div>` +
      (Array.isArray(entry.meta) && entry.meta.length > 0
        ? `<div class="char-popup-field-meta">${esc(entry.meta.join(' / '))}</div>`
        : '') +
      (entry.desc ? `<div class="char-popup-field-desc">${esc(entry.desc)}</div>` : '') +
      `</div>`
    )
    .join('');
}

function formatDamageMultiplier(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)}x` : '1.00x';
}

function formatDamageIncrease(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '+0%';
  }
  return `${numeric >= 0 ? '+' : ''}${Math.round(numeric)}%`;
}

function formatDamageContributionValue(contribution) {
  const value = Number(contribution?.value ?? 0);
  if (!Number.isFinite(value)) {
    return '';
  }
  const label = String(contribution?.label ?? '');
  if (label.includes('相性') || label.includes('基礎倍率')) {
    return formatDamageMultiplier(value);
  }
  const percent = Math.round(value * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
}

function resolveDamageContributionIconUrl(contribution) {
  const iconType = String(contribution?.iconStatusType ?? '').trim();
  const elements = Array.isArray(contribution?.elements) ? contribution.elements : [];
  if (ELEMENT_ICON[iconType]) {
    return ELEMENT_ICON[iconType].src;
  }
  if (WEAPON_ICON[iconType]) {
    return WEAPON_ICON[iconType].src;
  }
  const elementalStatusType = resolveElementalStatusType(iconType, elements);
  return iconType ? resolveSkillTypeIconUrl(elementalStatusType || iconType) : '';
}

function buildDamageContributionBlockHtml(contribution) {
  const label = String(contribution?.label ?? '').trim();
  const sourceSkillName = String(contribution?.sourceSkillName ?? '').trim();
  const sourceCharacterName = String(contribution?.sourceCharacterName ?? '').trim();
  const description = String(contribution?.description ?? '').trim();
  const powerStr = formatDamageContributionValue(contribution);
  const iconUrl = resolveDamageContributionIconUrl(contribution);
  return (
    `<div class="char-popup-buff-block char-popup-damage-effect" data-role="char-popup-damage-effect">` +
    `<div class="char-popup-buff-icon${iconUrl ? ' has-icon' : ''}">` +
    (iconUrl ? `<img src="${esc(iconUrl)}" alt="${esc(label)}" />` : '') +
    `</div>` +
    `<div class="char-popup-buff-center">` +
    `<div class="char-popup-buff-title">${esc(label)}` +
    (powerStr ? `<span class="char-popup-buff-power">${esc(powerStr)}</span>` : '') +
    (sourceSkillName ? `<span class="char-popup-buff-skill">[${esc(sourceSkillName)}]</span>` : '') +
    (sourceCharacterName ? `<span class="char-popup-buff-from">${esc(sourceCharacterName)}</span>` : '') +
    `</div>` +
    (description ? `<div class="char-popup-buff-desc line-clamp-2">${esc(description)}</div>` : '') +
    `</div>` +
    `</div>`
  );
}

function buildDamageGroupRowHtml(group) {
  const contributions = Array.isArray(group?.contributions) ? group.contributions : [];
  const effectsHtml = contributions.length > 0
    ? contributions.map((contribution) => buildDamageContributionBlockHtml(contribution)).join('')
    : '<div class="char-popup-damage-no-effect">採用効果なし</div>';
  return (
    `<div class="char-popup-damage-row" data-role="char-popup-damage-row" data-group="${esc(group?.dataGroup ?? '')}">` +
    `<div class="char-popup-damage-group-col">` +
    `<div class="char-popup-damage-group-title">${esc(group?.title ?? '')}</div>` +
    `<div class="char-popup-damage-group-formula">${esc(group?.formula ?? '')}</div>` +
    `<div class="char-popup-damage-group-total">${esc(formatDamageMultiplier(group?.multiplier))}</div>` +
    `</div>` +
    `<div class="char-popup-damage-effects-col">${effectsHtml}</div>` +
    `</div>`
  );
}

function buildCriticalRateNoteHtml(criticalRateBreakdown) {
  const percent = Number(criticalRateBreakdown?.criticalRatePercent ?? 0);
  const safePercent = Number.isFinite(percent) ? Math.round(percent) : 0;
  const guaranteed = Boolean(criticalRateBreakdown?.isCriticalGuaranteed);
  const contributions = Array.isArray(criticalRateBreakdown?.contributions)
    ? criticalRateBreakdown.contributions
    : [];
  const detail = contributions.length > 0
    ? contributions
        .map((entry) => `${String(entry?.label ?? '')} ${formatDamageContributionValue(entry)}`.trim())
        .filter(Boolean)
        .join(' / ')
    : '補正なし';
  return (
    `<div class="char-popup-damage-critical-note" data-role="char-popup-damage-critical-note" data-critical-guaranteed="${guaranteed ? 'true' : 'false'}">` +
    `<span>クリティカル発生率: ${esc(`${safePercent}%`)}</span>` +
    (guaranteed ? '<span class="char-popup-damage-critical-badge">クリティカル確定</span>' : '') +
    `<span class="char-popup-damage-critical-detail">${esc(detail)}</span>` +
    `</div>`
  );
}

function formatDamageCalculatorNumber(value, digits = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString('ja-JP', { maximumFractionDigits: digits }) : '-';
}

function sumPositiveHitBreakdownField(rows, fieldName) {
  if (!Array.isArray(rows)) {
    return null;
  }
  let hasFiniteValue = false;
  let total = 0;
  for (const row of rows) {
    const value = Number(row?.[fieldName]);
    if (!Number.isFinite(value)) {
      continue;
    }
    hasFiniteValue = true;
    total += Math.max(0, value);
  }
  return hasFiniteValue ? total : null;
}

function buildActualDamageSummaryHtml(action, enemyKey) {
  const hitBreakdown = action?.destructionBreakdownByEnemy?.[enemyKey]?.hitBreakdown;
  const breakdownDpDamage = sumPositiveHitBreakdownField(hitBreakdown, 'dpConsumed');
  const breakdownHpDamage = sumPositiveHitBreakdownField(hitBreakdown, 'hpApplied');
  const totalDpDamage = Number(action?.totalDpDamageByEnemy?.[enemyKey]);
  const totalHpDamage = Number(action?.totalHpDamageByEnemy?.[enemyKey]);
  const dpDamage = breakdownDpDamage !== null ? breakdownDpDamage : totalDpDamage;
  const hpDamage = breakdownHpDamage !== null && breakdownHpDamage > 0 ? breakdownHpDamage : totalHpDamage;
  const parts = [];
  if (Number.isFinite(dpDamage)) {
    parts.push(`<span>DP ${esc(formatDamageCalculatorNumber(dpDamage))}</span>`);
  }
  if (Number.isFinite(hpDamage)) {
    parts.push(`<span>HP ${esc(formatDamageCalculatorNumber(hpDamage))}</span>`);
  }
  if (Number.isFinite(dpDamage) || Number.isFinite(hpDamage)) {
    parts.push(`<span class="char-popup-damage-calc-actual-total">Total ${esc(formatDamageCalculatorNumber(
      (Number.isFinite(dpDamage) ? dpDamage : 0) + (Number.isFinite(hpDamage) ? hpDamage : 0)
    ))}</span>`);
  }
  return parts.length > 0 ? parts.join('<span class="char-popup-damage-calc-actual-separator"> / </span>') : '-';
}

function formatDamageCalculatorMultiplier(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)}x` : '-';
}

function formatDamageCalculatorSigned(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return '+0';
  }
  return `${numeric > 0 ? '+' : ''}${Math.round(numeric)}`;
}

function buildDamageActionKey(action, actionIndex) {
  return [
    action?.actionInstanceId,
    action?.actorCharacterId,
    action?.skillId,
    action?.skillName,
    actionIndex,
  ].map((value) => String(value ?? '')).join(':');
}

function getDamageTargetLabel(targetBreakdown) {
  const targetEnemyIndex = Number(targetBreakdown?.targetEnemyIndex ?? 0);
  const label = String(targetBreakdown?.enemyName ?? targetBreakdown?.targetLabel ?? '').trim();
  return label || `E${targetEnemyIndex + 1}`;
}

function buildDamageCalculatorTargetTabsHtml(targetBreakdowns) {
  return targetBreakdowns.map((targetBreakdown, index) => {
    const targetEnemyIndex = Number(targetBreakdown?.targetEnemyIndex ?? index);
    const active = index === 0 ? ' active' : '';
    return (
      `<button type="button" class="char-popup-damage-calc-target${active}" data-role="damage-calc-enemy-tab" ` +
      `data-target-enemy-index="${esc(targetEnemyIndex)}">${esc(getDamageTargetLabel(targetBreakdown))}</button>`
    );
  }).join('');
}

function buildDamageCalculatorStatRowsHtml(viewModel, side) {
  const rows = viewModel?.[side] ?? {};
  return DAMAGE_CALC_STAT_KEYS.map((statKey) => {
    const row = rows[statKey] ?? { base: 0, buffDelta: 0, debuffDelta: 0, resolved: 0 };
    return (
      `<div class="char-popup-damage-calc-stat-row" data-stat="${esc(statKey)}">` +
      `<span class="char-popup-damage-calc-stat-label">${esc(DAMAGE_CALC_STAT_LABELS[statKey])}</span>` +
      `<span data-role="damage-calc-stat-base" data-stat="${esc(statKey)}">${esc(row.base)}</span>` +
      `<span data-role="damage-calc-stat-delta" data-stat="${esc(statKey)}">${esc(formatDamageCalculatorSigned(row.buffDelta - row.debuffDelta))}</span>` +
      `<span data-role="damage-calc-stat-resolved" data-stat="${esc(statKey)}">${esc(row.resolved)}</span>` +
      `</div>`
    );
  }).join('');
}

function buildDamageCalculatorPaneHtml(actionKey, damageContext, targetBreakdowns, attackerInput) {
  const statViewModel = buildDamageStatDeltaViewModel(
    damageContext,
    attackerInput,
    { paramBorder: DAMAGE_CALC_DEFAULT_ENEMY_BORDER }
  );
  return (
    `<aside class="char-popup-damage-calc" data-role="damage-calc-pane" data-action-key="${esc(actionKey)}">` +
    `<div class="char-popup-damage-calc-tabs" data-role="damage-calc-enemy-tabs">` +
    `<div class="char-popup-damage-calc-targets">${buildDamageCalculatorTargetTabsHtml(targetBreakdowns)}</div>` +
    `<div class="char-popup-damage-calc-actual" data-role="damage-calc-actual-damage-wrap">` +
    `<span>実ダメージ</span>` +
    `<strong data-role="damage-calc-actual-damage">-</strong>` +
    `</div>` +
    `</div>` +
    `<div class="char-popup-damage-calc-summary" data-role="damage-calc-result">` +
    `<div class="char-popup-damage-calc-summary-row"><span>DP</span><strong data-role="damage-calc-dp-status">-</strong></div>` +
    `<div class="char-popup-enemy-gauge-wrap" data-role="damage-calc-dp-gauge"></div>` +
    `<div class="char-popup-damage-calc-summary-row"><span>HP</span><strong data-role="damage-calc-hp-status">N/A</strong></div>` +
    `<div class="char-popup-enemy-gauge-wrap" data-role="damage-calc-hp-gauge"></div>` +
    `<div class="char-popup-damage-calc-summary-row"><span>破壊率</span><strong data-role="damage-calc-destruction-rate">100.00% / 300.00%</strong></div>` +
    `</div>` +
    `<div class="char-popup-damage-calc-damage-list">` +
    `<div class="char-popup-damage-calc-damage-row">` +
    `<span class="char-popup-damage-calc-damage-label">DPダメージ</span>` +
    `<strong class="char-popup-damage-calc-damage-values"><span>通常 <span data-role="damage-calc-normal-expected">-</span></span><span>クリティカル <span data-role="damage-calc-critical-expected">-</span></span></strong>` +
    `</div>` +
    `<div class="char-popup-damage-calc-damage-row">` +
    `<span class="char-popup-damage-calc-damage-label">HPダメージ</span>` +
    `<strong class="char-popup-damage-calc-damage-values"><span>通常 <span data-role="damage-calc-normal-hp-expected">-</span></span><span>クリティカル <span data-role="damage-calc-critical-hp-expected">-</span></span></strong>` +
    `</div>` +
    `</div>` +
    `<div class="char-popup-damage-calc-body">` +
    `<section class="char-popup-damage-calc-section">` +
    `<div class="char-popup-damage-calc-section-title">攻撃側</div>` +
    `<div class="char-popup-stat-with-note">` +
    `<div class="char-popup-damage-calc-stat-grid" data-role="damage-calc-attacker-stats">` +
    buildDamageCalculatorStatRowsHtml(statViewModel, 'attacker') +
    `</div>` +
    `<textarea class="char-popup-damage-calc-note" data-role="damage-calc-attacker-note" rows="2" readonly></textarea>` +
    `</div>` +
    `</section>` +
    `<section class="char-popup-damage-calc-section">` +
    `<div class="char-popup-damage-calc-section-header">` +
    `<span class="char-popup-damage-calc-section-title">敵</span>` +
    `</div>` +
    `<div class="char-popup-stat-with-note">` +
    `<div class="char-popup-damage-calc-stat-grid" data-role="damage-calc-enemy-stats">` +
    buildDamageCalculatorStatRowsHtml(statViewModel, 'enemy') +
    `</div>` +
    `<textarea class="char-popup-damage-calc-note" data-role="damage-calc-note" rows="2" readonly></textarea>` +
    `</div>` +
    `</section>` +
    `</div>` +
    `<div class="char-popup-damage-calc-message" data-role="damage-calc-message"></div>` +
    `<div class="char-popup-destruction-rate" data-role="destruction-rate-section">` +
    `<div class="char-popup-damage-calc-result">` +
    `<div>` +
    `<span>破壊率（入力）</span>` +
    `<div class="char-popup-destruction-rate-input-wrap">` +
    `<input type="number" class="char-popup-destruction-rate-input" data-role="destruction-rate-input" min="100" max="9999" step="0.01" value="100.00">` +
    `<span class="char-popup-destruction-rate-unit">%</span>` +
    `</div>` +
    `</div>` +
    `<div>` +
    `<span>このスキル後</span>` +
    `<strong data-role="destruction-rate-after">-</strong>` +
    `</div>` +
    `</div>` +
    `<div class="char-popup-destruction-rate-message" data-role="destruction-rate-message"></div>` +
    `<div class="char-popup-destruction-rate-message" data-role="destruction-hit-summary"></div>` +
    `<div class="char-popup-damage-calc-result">` +
    `<div>` +
    `<span>現DP（入力）</span>` +
    `<div class="char-popup-destruction-rate-input-wrap">` +
    `<input type="number" class="char-popup-destruction-rate-input" data-role="current-dp-input" min="0" step="1" placeholder="-">` +
    `</div>` +
    `</div>` +
    `<div>` +
    `<span>このスキル後DP</span>` +
    `<strong data-role="current-dp-after">-</strong>` +
    `</div>` +
    `</div>` +
    `<div class="char-popup-damage-calc-result">` +
    `<div>` +
    `<span>現HP（入力）</span>` +
    `<div class="char-popup-destruction-rate-input-wrap">` +
    `<input type="number" class="char-popup-destruction-rate-input" data-role="current-hp-input" min="0" step="1" placeholder="-">` +
    `</div>` +
    `</div>` +
    `<div>` +
    `<span>このスキル後HP</span>` +
    `<strong data-role="current-hp-after">-</strong>` +
    `</div>` +
    `</div>` +
    `</div>` +
    `</aside>`
  );
}

/**
 * 現DP/現HP の一時入力から「このスキル後」の残量プレビューを更新する（T6）。
 * 入力はビュー専用で、commit / replay JSON には影響しない。
 */
function updateGaugePreviewDisplay(pane) {
  const rows = [
    { inputRole: 'current-dp-input', afterRole: 'current-dp-after', expectedKey: 'dpExpected', depleteLabel: 'ブレイク!' },
    { inputRole: 'current-hp-input', afterRole: 'current-hp-after', expectedKey: 'hpExpected', depleteLabel: '討伐!' },
  ];
  for (const row of rows) {
    const inputEl = pane.querySelector(`[data-role="${row.inputRole}"]`);
    const afterEl = pane.querySelector(`[data-role="${row.afterRole}"]`);
    if (!inputEl || !afterEl) continue;
    const current = Number(inputEl.value);
    const expected = Number(pane.dataset?.[row.expectedKey]);
    if (inputEl.value === '' || !Number.isFinite(current) || current < 0 || !Number.isFinite(expected)) {
      afterEl.textContent = '-';
      continue;
    }
    const after = Math.max(0, Math.floor(current - expected));
    afterEl.textContent = after <= 0 ? `0 (${row.depleteLabel})` : formatDamageCalculatorNumber(after);
  }
}

function resolveFiniteNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function resolvePositiveNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
}

function getActionDestructionBreakdown(model, enemyKey) {
  const breakdown = model?.action?.destructionBreakdownByEnemy?.[enemyKey];
  return breakdown && typeof breakdown === 'object' ? breakdown : null;
}

function buildAutoBreakPreviewHits(hitCount, perHitDpDamage, totalDpDamage) {
  const normalizedHitCount = Math.max(1, Math.floor(Number(hitCount ?? 1)));
  const perHit = Math.max(0, Number(perHitDpDamage ?? 0));
  const exactTotal = resolvePositiveNumber(totalDpDamage, perHit * normalizedHitCount) ?? 0;
  return Array.from({ length: normalizedHitCount }, (_, hitIndex) => ({
    damage:
      hitIndex === normalizedHitCount - 1
        ? Math.max(0, exactTotal - perHit * (normalizedHitCount - 1))
        : perHit,
  }));
}

function buildManualBreakPreviewHits(hitCount, breakHitIndex = 0) {
  const normalizedHitCount = Math.max(1, Math.floor(Number(hitCount ?? 1)));
  const requestedBreakHitIndex = Math.floor(Number(breakHitIndex ?? -1));
  const normalizedBreakHitIndex =
    Number.isFinite(requestedBreakHitIndex) && requestedBreakHitIndex >= 0
      ? Math.min(normalizedHitCount - 1, requestedBreakHitIndex)
      : -1;
  return Array.from({ length: normalizedHitCount }, (_, index) => ({
    damage: 0,
    isBreakHit: index === normalizedBreakHitIndex,
  }));
}

function resolveDestructionHitCount(model, damageContext, enemyKey) {
  const breakdown = getActionDestructionBreakdown(model, enemyKey);
  const count = resolvePositiveNumber(
    breakdown?.hitCount,
    model?.action?.skillHitCount,
    damageContext?.effectiveHitCountPerEnemy?.[enemyKey],
    damageContext?.effectiveHitCountPerEnemy,
    damageContext?.baseHitCount,
    model?.action?.skillBaseHitCount
  );
  return Math.max(1, Math.floor(count ?? 1));
}

function resolveFunnelHitCount(model, damageContext, enemyKey) {
  const breakdown = getActionDestructionBreakdown(model, enemyKey);
  return Math.max(
    0,
    Number(
      resolveFiniteNumber(
        breakdown?.breakdown?.funnelHitCount,
        damageContext?.funnelHitCount,
        model?.action?.skillFunnelHitBonus,
        0
      )
    )
  );
}

function resolveFunnelRate(model, damageContext, enemyKey) {
  const breakdown = getActionDestructionBreakdown(model, enemyKey);
  const breakdownRate = resolveFiniteNumber(breakdown?.breakdown?.funnelRate);
  if (breakdownRate !== null) {
    return Math.max(0, breakdownRate);
  }
  const contextRate = resolveFiniteNumber(damageContext?.funnelRate);
  if (contextRate !== null) {
    return Math.max(0, contextRate);
  }
  const effects = Array.isArray(damageContext?.funnelEffects) ? damageContext.funnelEffects : [];
  let weightedRateHits = 0;
  let hitTotal = 0;
  for (const effect of effects) {
    const hitCount = Math.max(
      0,
      Number(effect?.hitCount ?? effect?.hits ?? effect?.metadata?.hitCount ?? effect?.metadata?.funnelHitCount ?? 0)
    );
    const rate = Number(effect?.rate ?? effect?.damageBonus ?? effect?.metadata?.rate ?? effect?.metadata?.damageBonus ?? 0);
    if (!Number.isFinite(hitCount) || hitCount <= 0 || !Number.isFinite(rate) || rate <= 0) {
      continue;
    }
    weightedRateHits += hitCount * rate;
    hitTotal += hitCount;
  }
  return hitTotal > 0 ? weightedRateHits / hitTotal : 0;
}

function buildDestructionPreviewHitState(model, enemyKey, baseHitCount, contactHitCount = baseHitCount) {
  const action = model?.action ?? {};
  const breakdown = getActionDestructionBreakdown(model, enemyKey);
  const normalizedBaseHitCount = Math.max(1, Math.floor(Number(baseHitCount ?? 1)));
  const normalizedContactHitCount = Math.max(1, Math.floor(Number(contactHitCount ?? normalizedBaseHitCount)));
  const perHitDpDamage = resolveFiniteNumber(
    breakdown?.perHitDpDamage,
    action?.perHitDpDamageByEnemy?.[enemyKey]
  );
  const totalDpDamage = resolveFiniteNumber(
    breakdown?.totalDpDamage,
    action?.totalDpDamageByEnemy?.[enemyKey],
    perHitDpDamage !== null ? perHitDpDamage * normalizedContactHitCount : null
  );
  const previewPerBaseHitDpDamage =
    totalDpDamage !== null ? totalDpDamage / normalizedBaseHitCount : perHitDpDamage;
  const dpBefore = resolveFiniteNumber(
    breakdown?.dpBeforeThisAction,
    model?.enemyDestructionState?.before?.remainingDpByEnemy?.[enemyKey],
    model?.enemyDestructionState?.before?.enemyDpByEnemy?.[enemyKey],
    model?.enemyDestructionState?.remainingDpByEnemy?.[enemyKey],
    model?.enemyDestructionState?.enemyDpByEnemy?.[enemyKey]
  );
  const sameActionBreak =
    Boolean(breakdown?.useAutoBreak) ||
    (Array.isArray(action?.autoBreakEnemyIndexes) && action.autoBreakEnemyIndexes.includes(Number(enemyKey))) ||
    (Array.isArray(action?.manualBreakEnemyIndexes) && action.manualBreakEnemyIndexes.includes(Number(enemyKey)));

  if (breakdown?.useAutoBreak || (sameActionBreak && perHitDpDamage !== null && perHitDpDamage > 0)) {
    return {
      defenderDp: Math.max(0, Number(dpBefore ?? DEFAULT_DESTRUCTION_PREVIEW_DP)),
      hits: buildAutoBreakPreviewHits(normalizedBaseHitCount, previewPerBaseHitDpDamage, totalDpDamage),
      autoBreak: true,
    };
  }

  if (breakdown) {
    const wasBrokenBefore = Number(dpBefore ?? 0) <= 0;
    return {
      defenderDp: wasBrokenBefore ? 0 : DEFAULT_DESTRUCTION_PREVIEW_DP,
      hits: buildManualBreakPreviewHits(normalizedBaseHitCount, wasBrokenBefore ? -1 : 0),
      autoBreak: false,
    };
  }

  if (perHitDpDamage !== null && perHitDpDamage > 0) {
    return {
      defenderDp: Math.max(0, Number(dpBefore ?? DEFAULT_DESTRUCTION_PREVIEW_DP)),
      hits: buildAutoBreakPreviewHits(normalizedBaseHitCount, previewPerBaseHitDpDamage, totalDpDamage),
      autoBreak: true,
    };
  }

  if (sameActionBreak) {
    return {
      defenderDp: DEFAULT_DESTRUCTION_PREVIEW_DP,
      hits: buildManualBreakPreviewHits(normalizedBaseHitCount, 0),
      autoBreak: false,
    };
  }

  if (dpBefore === null) {
    return {
      defenderDp: 0,
      hits: buildManualBreakPreviewHits(normalizedBaseHitCount, -1),
      autoBreak: false,
    };
  }

  return {
    defenderDp: DEFAULT_DESTRUCTION_PREVIEW_DP,
    hits: buildManualBreakPreviewHits(normalizedBaseHitCount, -1),
    autoBreak: false,
  };
}

function buildDestructionInput(model, targetEnemyIndex, currentRatePercent) {
  const damageContext = model.damageContext;
  const enemyKey = String(Number(targetEnemyIndex));
  const action = model?.action ?? {};
  const breakdown = getActionDestructionBreakdown(model, enemyKey);
  const destructionLimit = resolveDamageCalculatorDestructionRateCapPercent(model, enemyKey) / 100;
  const contextMultiplier = Number(damageContext?.destructionMultiplierByEnemy?.[enemyKey]);
  const storedMultiplier = Number(model?.enemyDestructionState?.destructionMultiplierByEnemy?.[enemyKey]);
  const destructionMultiplierRaw = [contextMultiplier, storedMultiplier]
    .find((value) => Number.isFinite(value) && value > 0);
  const hitCount = resolveDestructionHitCount(model, damageContext, enemyKey);
  const baseHitCount = Math.max(
    1,
    Math.floor(
      resolvePositiveNumber(
        damageContext?.baseHitCount,
        action?.skillBaseHitCount,
        hitCount - resolveFunnelHitCount(model, damageContext, enemyKey),
        hitCount
      ) ?? 1
    )
  );
  const hitState = buildDestructionPreviewHitState(model, enemyKey, baseHitCount, hitCount);
  return {
    attacker: {
      styleId: damageContext?.actorStyleId ?? null,
      statusEffects: (damageContext?.activeStatusEffects ?? []).filter(
        (e) => e?.statusType === 'DestructionUp'
      ),
      // commit 側（turn-controller）と同じ構成: 超越バースト + ブラストピアス
      accessoryDestructionRateBonus:
        Number(damageContext?.transcendenceBurstDestructionRateGainBonusRate ?? 0) +
        Number(damageContext?.blastPierceDestructionRateBonus ?? 0),
      // エンシェントチェーンの破壊率上昇量+（フラット加算、commit 側と同構成）
      flatDestructionRateBonus: Number(damageContext?.chainDestructionRateBonus ?? 0),
      transcendenceBurstDestructionRateGainBonusRate: Number(
        damageContext?.transcendenceBurstDestructionRateGainBonusRate ?? 0
      ),
      markDestructionRateGainBonusRate: Number(
        damageContext?.markDestructionRateGainBonusRate ??
          action?.specialPassiveModifiers?.markDestructionRateGainBonusRate ??
          0
      ),
      resonanceDestructionRateBonus: Number(damageContext?.resonanceDestructionRateBonus ?? 0),
    },
    defender: {
      enemyId: null,
      destructionRate: currentRatePercent / 100,
      destructionLimit,
      destructionMultiplier: destructionMultiplierRaw != null
        ? destructionMultiplierRaw
        : null,
      dp: hitState.defenderDp,
    },
    skill: {
      skillId: damageContext?.skillId ?? null,
      name: damageContext?.skillName ?? '',
      isNormalAttack: Boolean(damageContext?.isNormalAttack),
      isPursuit: Boolean(damageContext?.isPursuit),
      spCostOverride: Number(action?.spCost ?? damageContext?.spCost ?? 0),
      baseHitCount,
      funnelHitCount: resolveFunnelHitCount(model, damageContext, enemyKey),
      funnelRate: resolveFunnelRate(model, damageContext, enemyKey),
      parts: Array.isArray(damageContext?.effectiveParts)
        ? damageContext.effectiveParts
        : Array.isArray(damageContext?.parts)
          ? damageContext.parts
          : null,
      attackPart: damageContext?.destructionAttackPart ?? null,
      conditionResults: damageContext?.destructionConditionResultsByEnemy?.[enemyKey] ?? {},
    },
    hits: hitState.hits,
    autoBreak: hitState.autoBreak,
  };
}

function resolveDamageCalculatorDestructionRateCapPercent(model, enemyKey) {
  const contextCap = Number(model?.damageContext?.destructionRateCapByEnemy?.[enemyKey]);
  const storedCap = Number(model?.enemyDestructionState?.destructionRateCapByEnemy?.[enemyKey]);
  const candidates = [contextCap, storedCap].filter((value) => Number.isFinite(value) && value > 0);
  return candidates.length > 0 ? Math.max(...candidates) : 300;
}

function hasExplicitDestructionRateCap(model, enemyKey) {
  // storedCap = turn終了後の明示キャップ（破壊ブレイク時にセットされる）
  const storedCap = Number(model?.enemyDestructionState?.destructionRateCapByEnemy?.[enemyKey]);
  if (Number.isFinite(storedCap) && storedCap > 0) return true;
  // contextCap はデフォルト式 Math.max(300, rate) を含むため、
  // 明示キャップと見なせるのは「現在レートより高くかつデフォルト300を超える」場合のみ
  const contextCap = Number(model?.damageContext?.destructionRateCapByEnemy?.[enemyKey]);
  const contextRate = Number(model?.damageContext?.destructionRateByEnemy?.[enemyKey]);
  return (
    Number.isFinite(contextCap) &&
    Number.isFinite(contextRate) &&
    contextCap > contextRate &&
    contextCap > 300
  );
}

async function updateDestructionRateDisplay(pane) {
  const actionKey = pane?.dataset?.actionKey;
  const model = damageCalculationActionModels.get(actionKey);
  if (!model) return;

  const inputEl = pane.querySelector('[data-role="destruction-rate-input"]');
  const afterEl = pane.querySelector('[data-role="destruction-rate-after"]');
  const capNoteEl = pane.querySelector('[data-role="destruction-rate-cap-note"]');
  const msgEl = pane.querySelector('[data-role="destruction-rate-message"]');
  if (!inputEl || !afterEl) return;

  const currentRatePercent = Number(inputEl.value);
  if (!Number.isFinite(currentRatePercent) || currentRatePercent < 0) {
    afterEl.textContent = '-';
    return;
  }

  const activeTab = pane.querySelector('[data-role="damage-calc-enemy-tab"].active')
    ?? pane.querySelector('[data-role="damage-calc-enemy-tab"]');
  const targetEnemyIndex = Number(activeTab?.dataset?.targetEnemyIndex ?? 0);
  const enemyKey = String(Number(targetEnemyIndex));
  const capPercent = resolveDamageCalculatorDestructionRateCapPercent(model, enemyKey);

  if (capNoteEl) {
    if (hasExplicitDestructionRateCap(model, enemyKey)) {
      capNoteEl.textContent = `${capPercent}%`;
    } else {
      capNoteEl.textContent = `${capPercent}% (デフォルト)`;
    }
  }

  const actionBreakdown = getActionDestructionBreakdown(model, enemyKey);
  const breakdownBefore = Number(actionBreakdown?.rateBefore);
  const breakdownAfter = Number(actionBreakdown?.rateAfter);
  if (
    Number.isFinite(breakdownBefore) &&
    Number.isFinite(breakdownAfter) &&
    breakdownBefore > 0 &&
    breakdownAfter >= breakdownBefore
  ) {
    const afterPercent = Math.min(capPercent, currentRatePercent + (breakdownAfter - breakdownBefore));
    afterEl.textContent = `${formatDamageCalculatorPercentValue(afterPercent)}%`;
    if (msgEl) msgEl.textContent = '';
    return;
  }

  try {
    const destructionInput = buildDestructionInput(model, targetEnemyIndex, currentRatePercent);
    const data = await loadDamageCalculationDataForPopup();
    const result = calculateDestruction(destructionInput, data);
    const afterPercent = result.destructionRate * 100;
    afterEl.textContent = `${formatDamageCalculatorPercentValue(afterPercent)}%`;
    if (msgEl) msgEl.textContent = '';
  } catch (error) {
    afterEl.textContent = '-';
    if (msgEl) msgEl.textContent = `計算エラー: ${error?.message ?? error}`;
  }
}

function loadDamageCalculationDataForPopup() {
  return loadDamageCalculationData();
}

function buildEnemyGaugeRowHtml(ratio, type, label, depleted = false) {
  const pct = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  const depletedClass = depleted ? ' is-depleted' : '';
  return (
    `<div class="char-popup-enemy-gauge__row${depletedClass}">` +
    `<div class="char-popup-enemy-gauge__bar-track">` +
    `<div class="char-popup-enemy-gauge__bar char-popup-enemy-gauge__bar--${type}" style="width:${pct}%"></div>` +
    `</div>` +
    `<span class="char-popup-enemy-gauge__row-label">${label}</span>` +
    `</div>`
  );
}

function updateEnemyDpGauge(pane, enemyAdapter) {
  const wrapper = pane.querySelector('[data-role="damage-calc-dp-gauge"]');
  if (!wrapper) return;
  const { dpCurrent, dpMax } = enemyAdapter;
  if (!Number.isFinite(dpMax) || dpMax <= 0) {
    wrapper.innerHTML = '';
    return;
  }
  const ratio = Number.isFinite(dpCurrent) ? dpCurrent / dpMax : 1;
  const label = Number.isFinite(dpCurrent)
    ? `${Math.round(dpCurrent).toLocaleString()} / ${Math.round(dpMax).toLocaleString()}`
    : `- / ${Math.round(dpMax).toLocaleString()}`;
  wrapper.innerHTML = buildEnemyGaugeRowHtml(ratio, 'dp', label);
}

function updateEnemyHpGauge(pane, enemyAdapter) {
  const wrapper = pane.querySelector('[data-role="damage-calc-hp-gauge"]');
  if (!wrapper) return;
  const { hpCurrent, hpMax, extraHpGaugeState } = enemyAdapter;

  if (extraHpGaugeState && Array.isArray(extraHpGaugeState.values) && extraHpGaugeState.total > 0) {
    const { total, remaining, values } = extraHpGaugeState;
    const totalInt = Math.round(total);
    const remainingInt = Math.round(remaining);
    const currentIdx = totalInt - remainingInt;
    const rows = values.map((segHp, i) => {
      if (i < currentIdx) {
        const label = `0 / ${Math.round(segHp).toLocaleString()}`;
        return buildEnemyGaugeRowHtml(0, 'hp', label, true);
      } else if (i === currentIdx && remainingInt > 0) {
        if (Number.isFinite(hpCurrent)) {
          const r = segHp > 0 ? hpCurrent / segHp : 1;
          const label = `${Math.round(hpCurrent).toLocaleString()} / ${Math.round(segHp).toLocaleString()}`;
          return buildEnemyGaugeRowHtml(r, 'hp', label, false);
        } else {
          return buildEnemyGaugeRowHtml(1, 'hp', `${Math.round(segHp).toLocaleString()}`, false);
        }
      } else {
        const label = `${Math.round(segHp).toLocaleString()} / ${Math.round(segHp).toLocaleString()}`;
        return buildEnemyGaugeRowHtml(1, 'hp', label, false);
      }
    });
    wrapper.innerHTML = rows.join('');
    return;
  }

  if (!Number.isFinite(hpMax) || hpMax <= 0) {
    wrapper.innerHTML = '';
    return;
  }
  const ratio = Number.isFinite(hpCurrent) ? hpCurrent / hpMax : 1;
  const label = Number.isFinite(hpCurrent)
    ? `${Math.round(hpCurrent).toLocaleString()} / ${Math.round(hpMax).toLocaleString()}`
    : `- / ${Math.round(hpMax).toLocaleString()}`;
  wrapper.innerHTML = buildEnemyGaugeRowHtml(ratio, 'hp', label);
}

function resolveDamageCalculatorEnemyAdapter(model, pane) {
  const activeTab = pane.querySelector('[data-role="damage-calc-enemy-tab"].active')
    ?? pane.querySelector('[data-role="damage-calc-enemy-tab"]');
  const targetEnemyIndex = Number(activeTab?.dataset?.targetEnemyIndex ?? 0);
  const targetBreakdown = (model.targetBreakdowns ?? []).find(
    (target) => Number(target?.targetEnemyIndex) === targetEnemyIndex
  ) ?? model.targetBreakdowns?.[0] ?? null;
  const affinityRate = Number(model.damageContext?.effectiveDamageRatesByEnemy?.[String(targetEnemyIndex)]);
  const paramBorder = Number(model.damageContext?.enemyParamBorderByEnemy?.[String(targetEnemyIndex)]);
  const destructionRatePercent = Number(model.damageContext?.destructionRateByEnemy?.[String(targetEnemyIndex)]);
  const destructionRate = Number.isFinite(destructionRatePercent) && destructionRatePercent > 0
    ? destructionRatePercent / 100
    : 1;
  const enemyKey = String(Number(targetEnemyIndex));
  const dpMax = resolveFiniteNumber(
    model.damageContext?.enemyDpByEnemy?.[enemyKey],
    model.enemyDestructionState?.enemyDpByEnemy?.[enemyKey]
  );
  const dpCurrent = resolveFiniteNumber(
    model.damageContext?.remainingDpByEnemy?.[enemyKey],
    model.enemyDestructionState?.remainingDpByEnemy?.[enemyKey]
  );
  const hpMax = resolveFiniteNumber(
    model.damageContext?.enemyHpByEnemy?.[enemyKey],
    model.enemyDestructionState?.enemyHpByEnemy?.[enemyKey]
  );
  const hpCurrent = resolveFiniteNumber(
    model.damageContext?.remainingHpByEnemy?.[enemyKey],
    model.enemyDestructionState?.remainingHpByEnemy?.[enemyKey]
  );
  const extraHpGaugeState = resolveDamageCalculatorExtraHpGaugeState(model, enemyKey);
  const resolvedHpCurrent = Number.isFinite(hpCurrent)
    ? hpCurrent
    : resolveActionExtraHpGaugeCurrent(model?.action, enemyKey, extraHpGaugeState);
  return {
    targetEnemyIndex,
    enemyName: getDamageTargetLabel(targetBreakdown),
    paramBorder: Number.isFinite(paramBorder) && paramBorder > 0
      ? paramBorder
      : DAMAGE_CALC_DEFAULT_ENEMY_BORDER,
    destructionRate,
    destructionRatePercent: destructionRate * 100,
    affinityRate: Number.isFinite(affinityRate) ? affinityRate / 100 : undefined,
    dpMax,
    dpCurrent,
    hpMax,
    hpCurrent: resolvedHpCurrent,
    extraHpGaugeState,
    destructionRateCapPercent: resolveDamageCalculatorDestructionRateCapPercent(model, enemyKey),
  };
}

function resolveDamageCalculatorExtraHpGaugeState(model, enemyKey) {
  const hpBreakEnemyIndexes = new Set(
    (Array.isArray(model?.action?.manualHpBreakEnemyIndexes) ? model.action.manualHpBreakEnemyIndexes : [])
      .map((value) => String(Number(value)))
  );
  if (hpBreakEnemyIndexes.has(String(Number(enemyKey)))) {
    return (
      model?.enemyDestructionState?.before?.extraHpGaugeStateByEnemy?.[enemyKey] ??
      model?.damageContext?.extraHpGaugeStateByEnemy?.[enemyKey] ??
      model?.enemyDestructionState?.extraHpGaugeStateByEnemy?.[enemyKey] ??
      null
    );
  }
  return (
    model?.damageContext?.extraHpGaugeStateByEnemy?.[enemyKey] ??
    model?.enemyDestructionState?.extraHpGaugeStateByEnemy?.[enemyKey] ??
    null
  );
}

function resolveActionExtraHpGaugeCurrent(action, enemyKey, extraHpGaugeState) {
  if (!extraHpGaugeState || typeof extraHpGaugeState !== 'object') {
    return null;
  }
  const values = Array.isArray(extraHpGaugeState.values) ? extraHpGaugeState.values : [];
  const totalInt = Math.round(Number(extraHpGaugeState.total ?? values.length ?? 0));
  const remainingInt = Math.round(Number(extraHpGaugeState.remaining ?? 0));
  const currentIdx = totalInt - remainingInt;
  const segMax = Number(values[currentIdx] ?? 0);
  if (!(segMax > 0) || !Number.isFinite(segMax)) {
    return null;
  }
  const hpBreakEnemyIndexes = new Set(
    (Array.isArray(action?.manualHpBreakEnemyIndexes) ? action.manualHpBreakEnemyIndexes : [])
      .map((value) => String(Number(value)))
  );
  if (hpBreakEnemyIndexes.has(String(Number(enemyKey)))) {
    return 0;
  }
  const hpDamage = Number(action?.totalHpDamageByEnemy?.[enemyKey]);
  if (!Number.isFinite(hpDamage) || hpDamage <= 0) {
    return null;
  }
  return Math.max(0, segMax - Math.min(segMax, hpDamage));
}

export function resolveDamageCalculatorStoredDestructionRatePercent(model, enemyKey) {
  const breakdownRate = Number(getActionDestructionBreakdown(model, enemyKey)?.rateBefore);
  if (Number.isFinite(breakdownRate) && breakdownRate > 0) {
    return breakdownRate;
  }
  const beforeRate = Number(model?.enemyDestructionState?.before?.destructionRateByEnemy?.[enemyKey]);
  if (Number.isFinite(beforeRate) && beforeRate > 0) {
    return beforeRate;
  }
  const contextRate = Number(model?.damageContext?.destructionRateByEnemy?.[enemyKey]);
  if (Number.isFinite(contextRate) && contextRate > 0) {
    return contextRate;
  }
  const storedRate = Number(model?.enemyDestructionState?.destructionRateByEnemy?.[enemyKey]);
  return Number.isFinite(storedRate) && storedRate > 0
    ? storedRate
    : DEFAULT_DESTRUCTION_RATE_PERCENT;
}

function formatDamageCalculatorOptionalNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatDamageCalculatorNumber(numeric) : '-';
}

function formatDamageCalculatorOptionalPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${formatDamageCalculatorPercentValue(numeric)}%` : '-';
}

function formatDamageCalculatorPercentValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return (Math.round((numeric + 1e-9) * 100) / 100).toFixed(2);
}

function formatDamageCalculatorOptionalRatio(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : '-';
}

function updateDestructionHitSummary(pane, model, enemyKey) {
  const summaryEl = pane.querySelector('[data-role="destruction-hit-summary"]');
  if (!summaryEl) return;
  const breakdown = getActionDestructionBreakdown(model, enemyKey);
  if (!breakdown) {
    summaryEl.replaceChildren();
    return;
  }
  const contactHitCount = Number(breakdown.contactHitCount ?? breakdown.hitCount ?? model?.action?.skillHitCount ?? 0);
  const calculationHitCount = Number(breakdown.calculationHitCount ?? breakdown.baseHitCount ?? model?.action?.skillBaseHitCount ?? 0);
  const baseHitCount = Number(breakdown.baseHitCount ?? model?.action?.skillBaseHitCount ?? 0);
  const funnelHitCount = Number(breakdown.funnelHitCount ?? model?.action?.skillFunnelHitBonus ?? 0);
  const destructionFunnelHitCount = Number(breakdown.destructionFunnelHitCount ?? funnelHitCount);
  const funnelMultiplier = Number(breakdown.funnelMultiplier);
  const breakHitNumber = Number(breakdown.breakHitNumber);
  const destructionHitCount = Number(breakdown.destructionHitCount);
  const totalDestructionWeight = Number(breakdown.totalDestructionWeight);
  const appliedDestructionWeight = Number(breakdown.appliedDestructionWeight);
  const hitRatios = Array.isArray(breakdown.hitRatios) ? breakdown.hitRatios : [];
  const parts = [
    `接触hit ${Number.isFinite(contactHitCount) ? contactHitCount : '-'}`,
    `計算hit ${Number.isFinite(calculationHitCount) ? calculationHitCount : '-'}`,
    `base ${Number.isFinite(baseHitCount) ? baseHitCount : '-'}`,
    `連撃 +${Number.isFinite(funnelHitCount) ? funnelHitCount : '-'}`,
    `破壊率連撃 +${Number.isFinite(destructionFunnelHitCount) ? destructionFunnelHitCount : '-'}`,
    `連撃倍率 ${Number.isFinite(funnelMultiplier) ? `x${funnelMultiplier.toFixed(2)}` : '-'}`,
    `hit ratio [${hitRatios.map((ratio) => formatDamageCalculatorOptionalRatio(ratio)).join(',')}]`,
    `Break hit ${Number.isFinite(breakHitNumber) ? breakHitNumber : '-'}`,
    `HP適用 ${Number.isFinite(destructionHitCount) ? destructionHitCount : '-'}hit`,
    `破壊率weight ${
      Number.isFinite(appliedDestructionWeight) && Number.isFinite(totalDestructionWeight)
        ? `${formatDamageCalculatorOptionalRatio(appliedDestructionWeight)}/${formatDamageCalculatorOptionalRatio(totalDestructionWeight)}`
        : '-'
    }`,
    `DP ${formatDamageCalculatorOptionalNumber(breakdown.totalDpDamage)}`,
    `HP ${formatDamageCalculatorOptionalNumber(breakdown.totalHpDamage)}`,
    `破壊率 +${formatDamageCalculatorOptionalPercent(breakdown.appliedGainPercent)}`,
  ];
  if (breakdown.funnelApplied && breakdown.funnelApplied.enabled) {
    parts.push('funnel');
    if (Number.isFinite(breakdown.funnelApplied.hpAppliedTotal)) {
      parts.push(formatDamageCalculatorOptionalNumber(breakdown.funnelApplied.hpAppliedTotal));
    }
    if (Number.isFinite(breakdown.funnelApplied.destructionRateAfterPercent)) {
      parts.push(`${formatDamageCalculatorOptionalPercent(breakdown.funnelApplied.destructionRateAfterPercent)}%`);
    }
  }

  const rows = Array.isArray(breakdown.hitBreakdown) ? breakdown.hitBreakdown : [];
  const tableHtml = rows.length > 0
    ? '<table class="char-popup-destruction-hit-table"><thead><tr>' +
      '<th>hit</th><th>種別</th><th>ratio</th><th>DP按分</th><th>DP消費</th><th>HP按分</th><th>HP適用</th><th>破壊率前</th><th>破壊率</th><th>破壊率後</th><th>Break</th>' +
      '</tr></thead><tbody>' +
      rows.map((row) => (
        '<tr>' +
        `<td>${esc(String(row.hitNumber ?? '-'))}</td>` +
        `<td>${esc(String(row.source ?? '-'))}</td>` +
        `<td>${esc(formatDamageCalculatorOptionalRatio(row.ratio))}</td>` +
        `<td>${esc(formatDamageCalculatorOptionalNumber(row.dpAllocated))}</td>` +
        `<td>${esc(formatDamageCalculatorOptionalNumber(row.dpConsumed))}</td>` +
        `<td>${esc(formatDamageCalculatorOptionalNumber(row.hpAllocated))}</td>` +
        `<td>${esc(formatDamageCalculatorOptionalNumber(row.hpApplied))}</td>` +
        `<td>${esc(formatDamageCalculatorOptionalPercent(row.destructionRateBeforePercent))}</td>` +
        `<td>${esc(formatDamageCalculatorOptionalPercent(row.destructionGainPercent))}</td>` +
        `<td>${esc(formatDamageCalculatorOptionalPercent(row.destructionRateAfterPercent))}</td>` +
        `<td>${row.isBreakHit === true ? 'BREAK' : (row.isDamageBreakHit === true ? 'DMG' : '')}</td>` +
        '</tr>'
      )).join('') +
      '</tbody></table>'
    : '';
  const detailsHtml = tableHtml
    ? `<details class="char-popup-destruction-hit-details" open>` +
      `<summary>▶ hit 内訳詳細</summary>` +
      `<div class="char-popup-destruction-hit-table-wrapper">${tableHtml}</div>` +
      `</details>`
    : '';
  summaryEl.innerHTML = `<div class="char-popup-destruction-hit-summary-text" style="display:none">${esc(parts.join(' / '))}</div>${detailsHtml}`;
}

function formatStatDeltaSourceText(source = {}) {
  const label = String(source?.label ?? '').trim();
  const delta = Number(source?.delta);
  if (!label || !Number.isFinite(delta) || delta === 0) {
    return '';
  }
  const statKeys = Array.isArray(source?.statKeys) ? source.statKeys : [];
  const scope = DAMAGE_CALC_STAT_KEYS.every((statKey) => statKeys.includes(statKey))
    ? '全ステータス'
    : statKeys
        .map((statKey) => DAMAGE_CALC_STAT_LABELS[statKey] ?? statKey)
        .filter(Boolean)
        .join('/');
  const deltaText = `${delta > 0 ? '+' : ''}${Math.round(delta)}`;
  const text = `${label} ${scope ? `${scope}${deltaText}` : deltaText}`;
  const sourceName = String(source?.sourceName ?? '').trim();
  return sourceName ? `${sourceName}[${text}]` : `${label}[${scope ? `${scope}${deltaText}` : deltaText}]`;
}

function buildSelfStatEffectText(statViewModel = {}) {
  const seen = new Set();
  const lines = [];
  const rows = statViewModel?.attacker ?? {};
  for (const row of Object.values(rows)) {
    const delta = Number(row?.buffDelta ?? 0) - Number(row?.debuffDelta ?? 0);
    if (!Number.isFinite(delta) || delta === 0) {
      continue;
    }
    for (const source of row?.sources ?? []) {
      const text = formatStatDeltaSourceText(source);
      if (!text) {
        continue;
      }
      const key = String(source?.id ?? text);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      lines.push(text);
    }
  }
  return lines.join(' / ');
}

function buildEnemyStatEffectText(model, enemyKey) {
  const damageCtx = model?.damageContext ?? {};
  const targetEnemyIndex = Number(enemyKey);
  const parts = [];
  const enemyStatuses = Array.isArray(damageCtx.enemyStatusEffects) ? damageCtx.enemyStatusEffects : [];
  const hasHacking = enemyStatuses.some(
    (e) => String(e?.statusType ?? '') === 'Hacking' &&
            (e?.targetIndex == null || Number(e.targetIndex) === targetEnemyIndex)
  );
  const enemyAllDown = Number(damageCtx.enemyAllAbilityDownByEnemy?.[String(targetEnemyIndex)] ?? 0);
  if (hasHacking) parts.push(`ハッキング[全ステータス-${enemyAllDown}]`);
  const disasterLevel = Number(damageCtx.enemyDisasterLevelByEnemy?.[String(targetEnemyIndex)] ?? 0);
  const talismanLevel = Number(damageCtx.enemyTalismanLevelByEnemy?.[String(targetEnemyIndex)] ?? 0);
  if (disasterLevel > 0) parts.push(`禍[Lv.${disasterLevel}]`);
  if (talismanLevel > 0) parts.push(`霊符[Lv.${talismanLevel}]`);
  return parts.join(' / ');
}

function updateDamageCalculatorStatGrid(pane, statViewModel) {
  for (const side of ['attacker', 'enemy']) {
    const root = pane.querySelector(`[data-role="damage-calc-${side}-stats"]`);
    if (!root) continue;
    for (const statKey of DAMAGE_CALC_STAT_KEYS) {
      const row = statViewModel?.[side]?.[statKey] ?? { base: 0, buffDelta: 0, debuffDelta: 0, resolved: 0 };
      const baseEl = root.querySelector(`[data-role="damage-calc-stat-base"][data-stat="${statKey}"]`);
      const deltaEl = root.querySelector(`[data-role="damage-calc-stat-delta"][data-stat="${statKey}"]`);
      const resolvedEl = root.querySelector(`[data-role="damage-calc-stat-resolved"][data-stat="${statKey}"]`);
      if (baseEl) baseEl.textContent = String(row.base);
      if (deltaEl) deltaEl.textContent = formatDamageCalculatorSigned(row.buffDelta - row.debuffDelta);
      if (resolvedEl) resolvedEl.textContent = String(row.resolved);
    }
  }
}

async function updateDamageCalculatorPane(pane) {
  const actionKey = pane?.dataset?.actionKey;
  const model = damageCalculationActionModels.get(actionKey);
  if (!model) return;

  const attackerInput = model.attackerInput;
  const enemyAdapter = resolveDamageCalculatorEnemyAdapter(model, pane);
  const enemyKey = String(Number(enemyAdapter.targetEnemyIndex));
  const statViewModel = buildDamageStatDeltaViewModel(model.damageContext, attackerInput, enemyAdapter);
  updateDamageCalculatorStatGrid(pane, statViewModel);
  const enemyNameEl = pane.querySelector('[data-role="damage-calc-enemy-name"]');
  if (enemyNameEl) enemyNameEl.textContent = enemyAdapter.enemyName;
  const actualDamageEl = pane.querySelector('[data-role="damage-calc-actual-damage"]');
  if (actualDamageEl) actualDamageEl.innerHTML = buildActualDamageSummaryHtml(model.action, enemyKey);
  const enemyBorderEl = pane.querySelector('[data-role="damage-calc-enemy-border"]');
  if (enemyBorderEl) enemyBorderEl.textContent = String(enemyAdapter.paramBorder);
  const capSuffix = hasExplicitDestructionRateCap(model, enemyKey)
    ? ` / ${enemyAdapter.destructionRateCapPercent.toFixed(2)}%`
    : '';
  pane.querySelector('[data-role="damage-calc-destruction-rate"]').textContent =
    `${enemyAdapter.destructionRatePercent.toFixed(2)}%${capSuffix}`;

  const dpStatusEl = pane.querySelector('[data-role="damage-calc-dp-status"]');
  if (dpStatusEl) {
    const { dpCurrent, dpMax } = enemyAdapter;
    if (Number.isFinite(dpCurrent) && Number.isFinite(dpMax)) {
      dpStatusEl.textContent = `${Math.round(dpCurrent).toLocaleString()} / ${Math.round(dpMax).toLocaleString()}`;
    } else if (Number.isFinite(dpMax)) {
      dpStatusEl.textContent = `- / ${Math.round(dpMax).toLocaleString()}`;
    } else {
      dpStatusEl.textContent = '-';
    }
  }
  const hpStatusEl = pane.querySelector('[data-role="damage-calc-hp-status"]');
  if (hpStatusEl) {
    const { extraHpGaugeState, hpCurrent, hpMax } = enemyAdapter;
    if (extraHpGaugeState) {
      const { total, remaining, values } = extraHpGaugeState;
      const totalInt = Math.round(total ?? 0);
      const remainingInt = Math.round(remaining ?? 0);
      const currentIdx = totalInt - remainingInt;
      const segMax = values?.[currentIdx] ?? 0;
      if (Number.isFinite(hpCurrent)) {
        hpStatusEl.textContent =
          `${Math.round(hpCurrent).toLocaleString()} / ${Math.round(segMax).toLocaleString()} (${remainingInt}/${totalInt})`;
      } else {
        hpStatusEl.textContent =
          `${Math.round(segMax).toLocaleString()} HP (${remainingInt}/${totalInt})`;
      }
    } else if (Number.isFinite(hpCurrent) && Number.isFinite(hpMax)) {
      hpStatusEl.textContent = `${Math.round(hpCurrent).toLocaleString()} / ${Math.round(hpMax).toLocaleString()}`;
    } else if (Number.isFinite(hpMax) && hpMax > 0) {
      hpStatusEl.textContent = `- / ${Math.round(hpMax).toLocaleString()}`;
    } else {
      hpStatusEl.textContent = 'N/A';
    }
  }
  updateEnemyDpGauge(pane, enemyAdapter);
  updateEnemyHpGauge(pane, enemyAdapter);
  try {
    const dpInput = buildDamageCalculationInput(model.damageContext, attackerInput, {
      ...enemyAdapter,
      isHpTarget: false,
    });
    const hpInput = buildDamageCalculationInput(model.damageContext, attackerInput, {
      ...enemyAdapter,
      isHpTarget: true,
    });
    const data = await loadDamageCalculationDataForPopup();
    const dpResult = calculateDamage(dpInput, data);
    const hpResult = calculateDamage(hpInput, data);
    pane.querySelector('[data-role="damage-calc-normal-expected"]').textContent = formatDamageCalculatorNumber(dpResult.normal.expected);
    pane.querySelector('[data-role="damage-calc-critical-expected"]').textContent = formatDamageCalculatorNumber(dpResult.critical.expected);
    pane.querySelector('[data-role="damage-calc-normal-hp-expected"]').textContent = formatDamageCalculatorNumber(hpResult.normal.expected);
    pane.querySelector('[data-role="damage-calc-critical-hp-expected"]').textContent = formatDamageCalculatorNumber(hpResult.critical.expected);
    pane.querySelector('[data-role="damage-calc-message"]').textContent = '';
    // 現DP/現HP プレビュー用の期待値（通常）を保持
    pane.dataset.dpExpected = String(Number(dpResult?.normal?.expected ?? NaN));
    pane.dataset.hpExpected = String(Number(hpResult?.normal?.expected ?? NaN));
  } catch (error) {
    pane.querySelector('[data-role="damage-calc-message"]').textContent = `計算データを読み込めません: ${error?.message ?? error}`;
  }

  const previewScopeKey = `${pane.dataset?.actionKey ?? ''}:${enemyKey}`;
  updateDestructionHitSummary(pane, model, enemyKey);

  const attackerNoteEl = pane.querySelector('[data-role="damage-calc-attacker-note"]');
  if (attackerNoteEl) attackerNoteEl.value = buildSelfStatEffectText(statViewModel);
  const enemyNoteEl = pane.querySelector('[data-role="damage-calc-note"]');
  if (enemyNoteEl) enemyNoteEl.value = buildEnemyStatEffectText(model, enemyKey);

  // 破壊率セクション: targetEnemyIndex が確定した後に初期値を設定してから計算。
  // ターン内の一時入力（preview-input-store）があればそれを優先復元する。
  const inputEl = pane.querySelector('[data-role="destruction-rate-input"]');
  if (inputEl) {
    const previewRate = getPreviewInputValue(previewScopeKey, 'destructionRatePercent');
    const storedRate = previewRate ?? resolveDamageCalculatorStoredDestructionRatePercent(model, enemyKey);
    inputEl.value = storedRate.toFixed(2);
  }
  // 現DP/現HP の一時入力を復元（未入力なら空欄のまま）
  for (const [role, field] of [
    ['current-dp-input', 'currentDp'],
    ['current-hp-input', 'currentHp'],
  ]) {
    const gaugeInputEl = pane.querySelector(`[data-role="${role}"]`);
    if (!gaugeInputEl) continue;
    const previewValue = getPreviewInputValue(previewScopeKey, field);
    gaugeInputEl.value = previewValue === null ? '' : String(previewValue);
  }
  updateDestructionRateDisplay(pane);
  updateGaugePreviewDisplay(pane);
}

function attachDamageCalculatorInteractions(root) {
  const damagePanel = root.querySelector('[data-tab-panel="damage"]');
  if (!damagePanel) return;
  if (!damageCalculationInteractionPanels.has(damagePanel)) {
    damageCalculationInteractionPanels.add(damagePanel);
    damagePanel.addEventListener('click', (event) => {
      const tab = event.target?.closest?.('[data-role="damage-calc-enemy-tab"]');
      if (!tab) return;
      const pane = tab.closest('[data-role="damage-calc-pane"]');
      pane.querySelectorAll('[data-role="damage-calc-enemy-tab"]').forEach((candidate) => {
        candidate.classList.toggle('active', candidate === tab);
      });
      updateDamageCalculatorPane(pane);
    });
    damagePanel.addEventListener('input', (event) => {
      const target = event.target;
      const pane = target?.closest?.('[data-role="damage-calc-pane"]');
      if (!pane) return;
      const activeTab = pane.querySelector('[data-role="damage-calc-enemy-tab"].active')
        ?? pane.querySelector('[data-role="damage-calc-enemy-tab"]');
      const enemyKey = String(Number(activeTab?.dataset?.targetEnemyIndex ?? 0));
      const previewScopeKey = `${pane.dataset?.actionKey ?? ''}:${enemyKey}`;
      const destructionInputEl = target?.closest?.('[data-role="destruction-rate-input"]');
      if (destructionInputEl) {
        // ターン内一時入力として保持（再計算・ターン移動・リロードで消える）
        setPreviewInputValue(
          previewScopeKey,
          'destructionRatePercent',
          destructionInputEl.value === '' ? null : Number(destructionInputEl.value)
        );
        updateDestructionRateDisplay(pane);
        return;
      }
      const dpInputEl = target?.closest?.('[data-role="current-dp-input"]');
      const hpInputEl = target?.closest?.('[data-role="current-hp-input"]');
      if (dpInputEl || hpInputEl) {
        const gaugeInputEl = dpInputEl ?? hpInputEl;
        setPreviewInputValue(
          previewScopeKey,
          dpInputEl ? 'currentDp' : 'currentHp',
          gaugeInputEl.value === '' ? null : Number(gaugeInputEl.value)
        );
        updateGaugePreviewDisplay(pane);
      }
    });
  }
  damagePanel.querySelectorAll('[data-role="damage-calc-pane"]').forEach((pane) => updateDamageCalculatorPane(pane));
}

function buildDamageTargetBreakdownHtml(targetBreakdown, criticalRateNoteHtml = '') {
  const groups = Array.isArray(targetBreakdown?.groups) ? targetBreakdown.groups : [];
  return (
    `<section class="char-popup-damage-target" data-role="char-popup-damage-target" data-target-enemy-index="${esc(targetBreakdown?.targetEnemyIndex ?? '')}">` +
    `<div class="char-popup-damage-target-header">` +
    `<span class="char-popup-damage-target-label">${esc(targetBreakdown?.targetLabel ?? '')}</span>` +
    `<span class="char-popup-damage-summary-value">${esc(formatDamageMultiplier(targetBreakdown?.finalMultiplier))}</span>` +
    `<span class="char-popup-damage-summary-plus">(${esc(formatDamageIncrease(targetBreakdown?.increasePercent))})</span>` +
    `</div>` +
    `<div class="char-popup-damage-formula">${esc(targetBreakdown?.formula ?? '')}</div>` +
    criticalRateNoteHtml +
    `<div class="char-popup-damage-table" data-role="char-popup-damage-table">` +
    groups.map((group) => buildDamageGroupRowHtml(group)).join('') +
    `</div>` +
    `</section>`
  );
}

function buildDamageActionBreakdownHtml(action, actionIndex, attackerInput, enemyDestructionState) {
  const damageContext = action?.damageContext && typeof action.damageContext === 'object'
    ? action.damageContext
    : null;
  const damageBreakdown = damageContext?.damageBreakdown;
  const targetBreakdowns = Array.isArray(damageBreakdown?.targetBreakdowns)
    ? damageBreakdown.targetBreakdowns
    : [];
  if (!damageContext || targetBreakdowns.length === 0) {
    return '';
  }
  const skillName = String(damageContext?.skillName ?? action?.skillName ?? '').trim();
  const actionKey = buildDamageActionKey(action, actionIndex);
  const firstEnemyKey = String(Number(targetBreakdowns[0]?.targetEnemyIndex ?? 0));
  const destructionBreakdown = action?.destructionBreakdownByEnemy?.[firstEnemyKey] ?? null;
  const destructionBreakdownAttrs = destructionBreakdown
    ? ` data-destruction-rate-before="${esc(formatDamageCalculatorPercentValue(destructionBreakdown.rateBefore))}"` +
      ` data-destruction-rate-after="${esc(formatDamageCalculatorPercentValue(destructionBreakdown.rateAfter))}"`
    : '';
  damageCalculationActionModels.set(actionKey, { action, damageContext, targetBreakdowns, attackerInput, enemyDestructionState });
  return (
    `<section class="char-popup-damage-action" data-role="char-popup-damage-action" data-action-key="${esc(actionKey)}"${destructionBreakdownAttrs}>` +
    `<div class="char-popup-damage-action-title">${skillName ? esc(skillName) : 'スキル'}</div>` +
    `<div class="char-popup-damage-layout">` +
    `<div class="char-popup-damage-breakdown-pane">` +
    targetBreakdowns.map((targetBreakdown, i) =>
      buildDamageTargetBreakdownHtml(
        targetBreakdown,
        i === 0 ? buildCriticalRateNoteHtml(damageContext?.criticalRateBreakdown) : ''
      )
    ).join('') +
    `</div>` +
    buildDamageCalculatorPaneHtml(actionKey, damageContext, targetBreakdowns, attackerInput) +
    `</div>` +
    `</section>`
  );
}

function buildDamageBreakdownTabHtml(previewActionFlow, member, enemyDestructionState) {
  const actions = Array.isArray(previewActionFlow) ? previewActionFlow : [];
  const role = String(member?.role ?? DAMAGE_CALC_DEFAULT_ROLE);
  const limitBreakCount = Number(member?.limitBreakLevel ?? 0);
  const stats = (
    normalizeCharacterStats(member?.stats)
    ?? resolveStatsWithSupport(resolveDefaultStats(role, limitBreakCount), member?.supportStats)
  );
  const attackerInput = {
    role,
    limitBreakCount,
    ...stats,
  };
  damageCalculationActionModels.clear();
  const html = actions
    .map((action, index) => buildDamageActionBreakdownHtml(action, index, attackerInput, enemyDestructionState))
    .filter(Boolean)
    .join('');
  return html || '<p class="char-popup-empty">威力詳細なし</p>';
}

// ============================================================
// シングルトン DOM 管理
// ============================================================
let _popup = null;

function getOrCreatePopup() {
  if (_popup) {
    const sameDocument = _popup.ownerDocument === document;
    const connected = Boolean(_popup.isConnected);
    if (sameDocument && connected) {
      return _popup;
    }
    _popup = null;
  }

  const el = document.createElement('div');
  el.id = 'char-detail-popup';
  el.innerHTML = `
    <div data-role="char-popup-backdrop"></div>
    <div data-role="char-popup-panel">
      <div data-role="char-popup-header">
        <div class="char-popup-header-name" data-role="char-popup-name"></div>
        <button type="button" data-role="char-popup-close" aria-label="閉じる">✕</button>
      </div>
      <div data-role="char-popup-tabs">
        <button type="button" class="char-popup-tab active" data-tab="status">状態変化</button>
        <button type="button" class="char-popup-tab" data-tab="ability">アビリティ</button>
        <button type="button" class="char-popup-tab" data-tab="passive">パッシブ</button>
        <button type="button" class="char-popup-tab" data-tab="field">フィールド</button>
        <button type="button" class="char-popup-tab" data-tab="damage">威力詳細</button>
      </div>
      <div data-role="char-popup-content">
        <div class="char-popup-tab-panel" data-tab-panel="status"></div>
        <div class="char-popup-tab-panel" data-tab-panel="ability" hidden></div>
        <div class="char-popup-tab-panel" data-tab-panel="passive" hidden></div>
        <div class="char-popup-tab-panel" data-tab-panel="field" hidden></div>
        <div class="char-popup-tab-panel" data-tab-panel="damage" hidden></div>
      </div>
    </div>
  `;

  document.body.appendChild(el);
  _popup = el;

  // ✕ ボタン
  el.querySelector('[data-role="char-popup-close"]').addEventListener('click', closeCharDetailPopup);

  // バックドロップクリックで閉じる
  el.querySelector('[data-role="char-popup-backdrop"]').addEventListener('click', closeCharDetailPopup);

  // タブ切り替え
  el.querySelectorAll('.char-popup-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      el.querySelectorAll('.char-popup-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
      el.querySelectorAll('.char-popup-tab-panel').forEach((panel) => {
        if (panel.dataset.tabPanel === tab) {
          panel.removeAttribute('hidden');
        } else {
          panel.setAttribute('hidden', '');
        }
      });
    });
  });

  return el;
}

// ============================================================
// Public API
// ============================================================

/**
 * キャラクター詳細ポップアップを開く。
 * @param {object} member CharacterStyle インスタンス
 * @param {object} stateOrRecord { statusEffects, passiveEvents, zoneState, territoryState, talismanState }
 * @param {{ x: number, y: number, isCommitted: boolean }} opts
 */
export function openCharDetailPopup(member, stateOrRecord, opts = {}) {
  const popup = getOrCreatePopup();

  // ヘッダー: [スタイル名] 名前 属性アイコン 武器種アイコン
  const nameEl = popup.querySelector('[data-role="char-popup-name"]');
  const charName = String(member?.characterName ?? member?.name ?? '');
  const styleName = String(member?.styleName ?? member?.style_name ?? '').trim();
  const iconsHtml = buildHeaderIconsHtml(member);
  const currentFormInfo = getCurrentFormInfo(member);
  const formChipHtml = currentFormInfo?.displayName
    ? `<span class="char-popup-hdr-form-chip" data-role="char-popup-form-chip">フォーム: ${esc(currentFormInfo.displayName)}</span>`
    : '';
  nameEl.innerHTML =
    (styleName ? `<span class="char-popup-hdr-style">[${esc(styleName)}]</span>` : '') +
    `<span class="char-popup-hdr-char">${esc(charName)}</span>` +
    formChipHtml +
    (iconsHtml ? `<span class="char-popup-hdr-icons">${iconsHtml}</span>` : '');

  // タブコンテンツ更新
  const statusEffects = stateOrRecord?.statusEffects ?? member?.statusEffects ?? [];
  const passiveEvents = stateOrRecord?.passiveEvents ?? [];

  const isReinforcedMode = Boolean(stateOrRecord?.isReinforcedMode ?? member?.isReinforcedMode);
  const reinforcedTurnsRemaining = Number(
    stateOrRecord?.reinforcedTurnsRemaining ?? member?.reinforcedTurnsRemaining ?? 0
  );
  const actionDisabledTurns = Number(
    stateOrRecord?.actionDisabledTurns ?? member?.actionDisabledTurns ?? 0
  );

  popup.querySelector('[data-tab-panel="status"]').innerHTML = buildStatusTabHtml(statusEffects, {
    isReinforcedMode,
    reinforcedTurnsRemaining,
    actionDisabledTurns,
    previewActionFlow: stateOrRecord?.previewActionFlow ?? [],
    resolveSkillDescription:
      typeof opts.resolveSkillDescription === 'function' ? opts.resolveSkillDescription : null,
  });
  popup.querySelector('[data-tab-panel="ability"]').innerHTML = buildAbilityTabHtml(member);
  popup.querySelector('[data-tab-panel="passive"]').innerHTML =
    !opts.isCommitted && hasFormChange(member)
      ? buildCurrentActivePassiveTabHtml(member)
      : buildPassiveEventHistoryTabHtml(member, passiveEvents);
  popup.querySelector('[data-tab-panel="field"]').innerHTML = buildFieldTabHtml(stateOrRecord);
  popup.querySelector('[data-tab-panel="damage"]').innerHTML = buildDamageBreakdownTabHtml(
    (stateOrRecord?.previewActionFlow ?? []).filter((action) => action?.actorCharacterId === member?.characterId),
    member,
    opts.enemyDestructionState ?? null
  );
  attachDamageCalculatorInteractions(popup);

  // 最初のタブをアクティブにリセット
  popup.querySelectorAll('.char-popup-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'status'));
  popup.querySelectorAll('.char-popup-tab-panel').forEach((p) => {
    if (p.dataset.tabPanel === 'status') {
      p.removeAttribute('hidden');
    } else {
      p.setAttribute('hidden', '');
    }
  });

  popup.classList.add('open');
}

/**
 * キャラクター詳細ポップアップを閉じる。
 */
export function closeCharDetailPopup() {
  if (_popup) {
    _popup.classList.remove('open');
  }
}
