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
    `<div class="char-popup-damage-calc-tabs" data-role="damage-calc-enemy-tabs">${buildDamageCalculatorTargetTabsHtml(targetBreakdowns)}</div>` +
    `<div class="char-popup-damage-calc-summary" data-role="damage-calc-result">` +
    `<div class="char-popup-damage-calc-summary-row"><span>DP</span><strong data-role="damage-calc-dp-status">-</strong></div>` +
    `<div class="char-popup-damage-calc-summary-row"><span>HP</span><strong data-role="damage-calc-hp-status">N/A</strong></div>` +
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
    `<div class="char-popup-damage-calc-stat-grid" data-role="damage-calc-attacker-stats">` +
    buildDamageCalculatorStatRowsHtml(statViewModel, 'attacker') +
    `</div>` +
    `</section>` +
    `<section class="char-popup-damage-calc-section">` +
    `<div class="char-popup-damage-calc-section-header">` +
    `<span class="char-popup-damage-calc-section-title">敵</span>` +
    `<div class="char-popup-damage-calc-enemy-meta">` +
    `<span data-role="damage-calc-enemy-name">-</span>` +
    `<span>境界 <strong data-role="damage-calc-enemy-border">${DAMAGE_CALC_DEFAULT_ENEMY_BORDER}</strong></span>` +
    `</div>` +
    `</div>` +
    `<div class="char-popup-damage-calc-stat-grid" data-role="damage-calc-enemy-stats">` +
    buildDamageCalculatorStatRowsHtml(statViewModel, 'enemy') +
    `</div>` +
    `<textarea class="char-popup-damage-calc-note" data-role="damage-calc-note" rows="3" placeholder="補足"></textarea>` +
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

function buildDestructionInput(model, targetEnemyIndex, currentRatePercent) {
  const damageContext = model.damageContext;
  const enemyKey = String(Number(targetEnemyIndex));
  const destructionLimit = resolveDamageCalculatorDestructionRateCapPercent(model, enemyKey) / 100;
  const contextMultiplier = Number(damageContext?.destructionMultiplierByEnemy?.[enemyKey]);
  const storedMultiplier = Number(model?.enemyDestructionState?.destructionMultiplierByEnemy?.[enemyKey]);
  const destructionMultiplierPercent = [contextMultiplier, storedMultiplier]
    .find((value) => Number.isFinite(value) && value > 0);
  const hitCount = Math.max(
    1,
    Number(damageContext?.effectiveHitCountPerEnemy ?? damageContext?.baseHitCount ?? 1)
  );
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
    },
    defender: {
      enemyId: null,
      destructionRate: currentRatePercent / 100,
      destructionLimit,
      destructionMultiplier: destructionMultiplierPercent != null
        ? destructionMultiplierPercent / 100
        : null,
      dp: 0,
    },
    skill: {
      skillId: damageContext?.skillId ?? null,
      name: damageContext?.skillName ?? '',
      isNormalAttack: Boolean(damageContext?.isNormalAttack),
    },
    hits: Array.from({ length: hitCount }, () => ({ damage: 1, isBreakHit: false })),
    autoBreak: false,
  };
}

function resolveDamageCalculatorDestructionRateCapPercent(model, enemyKey) {
  const contextCap = Number(model?.damageContext?.destructionRateCapByEnemy?.[enemyKey]);
  const storedCap = Number(model?.enemyDestructionState?.destructionRateCapByEnemy?.[enemyKey]);
  const candidates = [contextCap, storedCap].filter((value) => Number.isFinite(value) && value > 0);
  return candidates.length > 0 ? Math.max(...candidates) : 300;
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
    capNoteEl.textContent = `${capPercent}%`;
  }

  try {
    const destructionInput = buildDestructionInput(model, targetEnemyIndex, currentRatePercent);
    const data = await loadDamageCalculationDataForPopup();
    const result = calculateDestruction(destructionInput, data);
    const afterPercent = (result.destructionRate * 100).toFixed(2);
    afterEl.textContent = `${afterPercent}%`;
    if (msgEl) msgEl.textContent = '';
  } catch (error) {
    afterEl.textContent = '-';
    if (msgEl) msgEl.textContent = `計算エラー: ${error?.message ?? error}`;
  }
}

function loadDamageCalculationDataForPopup() {
  return loadDamageCalculationData();
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
  return {
    targetEnemyIndex,
    enemyName: getDamageTargetLabel(targetBreakdown),
    paramBorder: Number.isFinite(paramBorder) && paramBorder > 0
      ? paramBorder
      : DAMAGE_CALC_DEFAULT_ENEMY_BORDER,
    destructionRate,
    destructionRatePercent: destructionRate * 100,
    affinityRate: Number.isFinite(affinityRate) ? affinityRate / 100 : undefined,
    dpMax: Number.isFinite(Number(model.enemyDestructionState?.enemyDpByEnemy?.[enemyKey]))
      ? Number(model.enemyDestructionState.enemyDpByEnemy[enemyKey])
      : null,
    dpCurrent: Number.isFinite(Number(model.enemyDestructionState?.remainingDpByEnemy?.[enemyKey]))
      ? Number(model.enemyDestructionState.remainingDpByEnemy[enemyKey])
      : null,
    hpMax: Number.isFinite(Number(model.enemyDestructionState?.enemyHpByEnemy?.[enemyKey]))
      ? Number(model.enemyDestructionState.enemyHpByEnemy[enemyKey])
      : null,
    hpCurrent: Number.isFinite(Number(model.enemyDestructionState?.remainingHpByEnemy?.[enemyKey]))
      ? Number(model.enemyDestructionState.remainingHpByEnemy[enemyKey])
      : null,
    extraHpGaugeState: model.enemyDestructionState?.extraHpGaugeStateByEnemy?.[enemyKey] ?? null,
    destructionRateCapPercent: resolveDamageCalculatorDestructionRateCapPercent(model, enemyKey),
  };
}

export function resolveDamageCalculatorStoredDestructionRatePercent(model, enemyKey) {
  const contextRate = Number(model?.damageContext?.destructionRateByEnemy?.[enemyKey]);
  if (Number.isFinite(contextRate) && contextRate > 0) {
    return contextRate;
  }
  const storedRate = Number(model?.enemyDestructionState?.destructionRateByEnemy?.[enemyKey]);
  return Number.isFinite(storedRate) && storedRate > 0
    ? storedRate
    : DEFAULT_DESTRUCTION_RATE_PERCENT;
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
  const statViewModel = buildDamageStatDeltaViewModel(model.damageContext, attackerInput, enemyAdapter);
  updateDamageCalculatorStatGrid(pane, statViewModel);
  pane.querySelector('[data-role="damage-calc-enemy-name"]').textContent = enemyAdapter.enemyName;
  pane.querySelector('[data-role="damage-calc-enemy-border"]').textContent = String(enemyAdapter.paramBorder);
  pane.querySelector('[data-role="damage-calc-destruction-rate"]').textContent = `${enemyAdapter.destructionRatePercent.toFixed(2)}% / ${enemyAdapter.destructionRateCapPercent.toFixed(2)}%`;

  const dpStatusEl = pane.querySelector('[data-role="damage-calc-dp-status"]');
  if (dpStatusEl) {
    const { dpCurrent, dpMax } = enemyAdapter;
    if (Number.isFinite(dpCurrent) && Number.isFinite(dpMax)) {
      dpStatusEl.textContent = `${dpCurrent} / ${dpMax}`;
    } else if (Number.isFinite(dpMax)) {
      dpStatusEl.textContent = `- / ${dpMax}`;
    } else {
      dpStatusEl.textContent = '-';
    }
  }
  const hpStatusEl = pane.querySelector('[data-role="damage-calc-hp-status"]');
  if (hpStatusEl) {
    const { extraHpGaugeState, hpCurrent, hpMax } = enemyAdapter;
    if (extraHpGaugeState) {
      hpStatusEl.textContent = `${Number(extraHpGaugeState.remaining ?? 0)} / ${Number(extraHpGaugeState.total ?? 0)}`;
    } else if (Number.isFinite(hpCurrent) && Number.isFinite(hpMax)) {
      hpStatusEl.textContent = `${hpCurrent} / ${hpMax}`;
    } else if (Number.isFinite(hpMax) && hpMax > 0) {
      hpStatusEl.textContent = `- / ${hpMax}`;
    } else {
      hpStatusEl.textContent = 'N/A';
    }
  }
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

  const enemyKey = String(Number(enemyAdapter.targetEnemyIndex));
  const previewScopeKey = `${pane.dataset?.actionKey ?? ''}:${enemyKey}`;

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
  damageCalculationActionModels.set(actionKey, { action, damageContext, targetBreakdowns, attackerInput, enemyDestructionState });
  return (
    `<section class="char-popup-damage-action" data-role="char-popup-damage-action" data-action-key="${esc(actionKey)}">` +
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
