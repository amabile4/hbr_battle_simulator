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
import { buildFieldDisplayEntries } from './field-state-display.js';
import { SPECIAL_STATUS_TYPE_NAMES } from '../../src/domain/character-style.js';
import { ELEMENT_KANJI, ELEMENT_PREFIXED_STATUS_TYPES } from './element-status-constants.js';
import {
  getUnifiedStatusTypeId,
  getElementSortValue,
  getElementVariantCategory,
  USE_UNIFIED_ID_ORDER,
  FALLBACK_ORDER_OFFSET,
  UNKNOWN_ORDER_VALUE,
} from './status-sort-order.js';

const DEAD_STATUS_ICON_FILE_NAME = 'dead.webp';

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
  Shredding:                 '速弾き',
  HighBoost:                 'ハイブースト',
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
  Curry:                     'カレー',
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

function buildEffectDisplayInfo(effect) {
  const statusType = String(effect?.statusType ?? '');
  const power = Number(effect?.power ?? 0);
  const desc = String(effect?.sourceSkillDesc ?? '').trim();
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

function buildStatusBlockHtml(effect) {
  const label = resolveElementalStatusLabel(effect.statusType, effect.elements);
  const skillName = String(effect.sourceSkillName ?? '').trim();
  const displayInfo = buildEffectDisplayInfo(effect);
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
  return (
    `<div class="char-popup-buff-block">` +
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

function buildPreviewStatusSectionHtml(previewActionFlow) {
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
        sourceCharacterName: String(event?.sourceCharacterName ?? action?.actorCharacterName ?? '').trim(),
        metadata: {
          damageBonus: Number(event?.damageBonus ?? event?.metadata?.damageBonus ?? 0),
        },
      }));
      return [...mappedApplied, ...mappedFunnel];
    })
    .filter((effect) => Boolean(String(effect.statusType ?? '').trim()));
  const previewBlocks = sortStatusEffectsForStatusTab(previewEffects)
    .map((effect) => buildStatusBlockHtml(effect))
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
  const previewSectionHtml = buildPreviewStatusSectionHtml(options?.previewActionFlow ?? []);
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

  const statusBlocksHtml = sortStatusEffectsForStatusTab(activeEffects)
    .map((effect) => buildStatusBlockHtml(effect))
    .join('');

  return `${previewSectionHtml}${statusBlocksHtml}`;
}

/** アビリティタブ — 限界突破パッシブ (requiredLimitBreakLevel > 0) */
function buildAbilityTabHtml(member) {
  const passives = Array.isArray(member?.passives) ? member.passives : [];
  const lbPassives = passives.filter((p) => Number(p?.requiredLimitBreakLevel ?? 0) > 0);
  if (lbPassives.length === 0) {
    return '<p class="char-popup-empty">なし</p>';
  }
  return lbPassives
    .map((p) => {
      const name = String(p.name ?? '').trim();
      const desc = String(p.desc ?? '').trim();
      const lv = Number(p.requiredLimitBreakLevel ?? 0);
      return (
        `<div class="char-popup-passive-block">` +
        `<div class="char-popup-passive-title">${esc(name)}<span class="char-popup-passive-lb">LB${lv}</span></div>` +
        (desc ? `<div class="char-popup-passive-desc">${esc(desc)}</div>` : '') +
        `</div>`
      );
    })
    .join('');
}

/** パッシブスキルタブ — 当ターン発動済みパッシブ */
function buildPassiveTabHtml(member, passiveEvents) {
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
      </div>
      <div data-role="char-popup-content">
        <div class="char-popup-tab-panel" data-tab-panel="status"></div>
        <div class="char-popup-tab-panel" data-tab-panel="ability" hidden></div>
        <div class="char-popup-tab-panel" data-tab-panel="passive" hidden></div>
        <div class="char-popup-tab-panel" data-tab-panel="field" hidden></div>
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
  nameEl.innerHTML =
    (styleName ? `<span class="char-popup-hdr-style">[${esc(styleName)}]</span>` : '') +
    `<span class="char-popup-hdr-char">${esc(charName)}</span>` +
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
  });
  popup.querySelector('[data-tab-panel="ability"]').innerHTML = buildAbilityTabHtml(member);
  popup.querySelector('[data-tab-panel="passive"]').innerHTML = buildPassiveTabHtml(member, passiveEvents);
  popup.querySelector('[data-tab-panel="field"]').innerHTML = buildFieldTabHtml(stateOrRecord);

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
