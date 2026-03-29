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

import { resolveUiAssetUrl } from '../../src/ui/style-asset-url.js';
import { buildFieldDisplayEntries } from './field-state-display.js';

const SKILL_TYPE_ICON_BASE = new URL('../../assets/skill_type/', import.meta.url).href;

export function resolveSkillTypeIconUrl(statusType) {
  const name = String(statusType ?? '').trim();
  if (!name) return '';
  return `${SKILL_TYPE_ICON_BASE}${encodeURIComponent(name)}.webp`;
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
  BreakGuard:                'ブレイクガード',
  SuperBreakDown:            '超ダウン',
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

function getStatusLabel(statusType) {
  return STATUS_LABELS[String(statusType ?? '')] ?? String(statusType ?? '');
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

function buildEffectDisplayInfo(effect) {
  const statusType = String(effect?.statusType ?? '');
  const power = Number(effect?.power ?? 0);
  const desc = String(effect?.sourceSkillDesc ?? '').trim();
  if (statusType === 'Funnel') {
    const hitCount = Number.isFinite(power) ? Math.max(0, Math.round(power)) : 0;
    const perHitBonus = Number(effect?.metadata?.damageBonus ?? 0);
    const totalBonusPercent = Number.isFinite(perHitBonus)
      ? Math.round(hitCount * perHitBonus * 100)
      : 0;
    const fallbackDesc =
      hitCount > 0
        ? `連撃（小）${hitCount}回 ${Math.max(0, totalBonusPercent)}%`
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
function buildStatusTabHtml(statusEffects) {
  if (!Array.isArray(statusEffects) || statusEffects.length === 0) {
    return '<p class="char-popup-empty">なし</p>';
  }
  const activeEffects = statusEffects.filter((e) => {
    if (String(e?.exitCond ?? '') === 'Eternal') return true;
    return Number(e?.remaining ?? 0) > 0;
  });
  if (activeEffects.length === 0) {
    return '<p class="char-popup-empty">なし</p>';
  }

  return activeEffects
    .map((effect) => {
      const label = getStatusLabel(effect.statusType);
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
      const titleParts = [label, powerStr, skillName ? `[${skillName}]` : '', sourceCharName ? `(${sourceCharName})` : ''].filter(Boolean);

      const iconUrl = resolveSkillTypeIconUrl(effect.statusType);
      return (
        `<div class="char-popup-buff-block">` +
        `<div class="char-popup-buff-icon${iconUrl ? ' has-icon' : ''}">${iconUrl ? `<img src="${iconUrl}" alt="${esc(String(effect.statusType ?? ''))}" />` : ''}</div>` +
        `<div class="char-popup-buff-center">` +
        `<div class="char-popup-buff-title">${esc(label)}${skillName ? `<span class="char-popup-buff-skill">[${esc(skillName)}]</span>` : ''}${powerStr ? `<span class="char-popup-buff-power">${esc(powerStr)}</span>` : ''}` +
        (sourceCharName ? `<span class="char-popup-buff-from">${esc(sourceCharName)}</span>` : '') +
        `</div>` +
        (desc ? `<div class="char-popup-buff-desc line-clamp-2">${esc(desc)}</div>` : '') +
        `</div>` +
        `<div class="char-popup-buff-duration">${esc(remaining)}</div>` +
        `</div>`
      );
    })
    .join('');
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
  if (_popup) return _popup;

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

  popup.querySelector('[data-tab-panel="status"]').innerHTML = buildStatusTabHtml(statusEffects);
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
