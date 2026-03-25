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

const SKILL_TYPE_ICON_BASE = new URL('../../assets/skill_type/', import.meta.url).href;

function resolveSkillTypeIconUrl(statusType) {
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
// バフ種別ラベル
// ============================================================
const STATUS_LABELS = {
  AttackUp: '攻撃↑',
  AttackDown: '攻撃↓',
  DefenseUp: '防御↑',
  DefenseDown: '防御↓',
  CriticalRateUp: 'CT率↑',
  CriticalRateDown: 'CT率↓',
  CriticalDamageUp: 'CT倍率↑',
  CriticalDamageDown: 'CT倍率↓',
  HealDpRate: '回復↑',
  DebuffGuard: 'デバフガード',
  BuffCharge: 'バフ蓄積',
  SpeedUp: '速度↑',
  SpeedDown: '速度↓',
};

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
      const desc = String(effect.sourceSkillDesc ?? '').trim();
      const power = Number(effect.power ?? 0);
      const powerStr = power !== 0 ? `${power > 0 ? '+' : ''}${Math.round(power * 100)}%` : '';
      const remaining =
        String(effect.exitCond ?? '') === 'Eternal' ? '∞' : `${Number(effect.remaining ?? 0)}T`;
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
  const zoneState = stateOrRecord?.zoneState ?? null;
  const territoryState = stateOrRecord?.territoryState ?? null;
  const talismanState = stateOrRecord?.talismanState ?? null;

  const entries = [];

  if (zoneState) {
    const name = String(zoneState.zoneName ?? zoneState.name ?? 'Zone').trim();
    const desc = String(zoneState.zoneDesc ?? zoneState.desc ?? '').trim();
    const remaining = zoneState.remaining != null ? Number(zoneState.remaining) : null;
    const durationStr = remaining != null ? `${remaining}T` : '';
    entries.push({ label: 'Zone', name, desc, duration: durationStr });
  }
  if (territoryState) {
    const name = String(territoryState.territoryName ?? territoryState.name ?? 'Territory').trim();
    const desc = String(territoryState.desc ?? '').trim();
    const remaining = territoryState.remaining != null ? Number(territoryState.remaining) : null;
    const durationStr = remaining != null ? `${remaining}T` : '';
    entries.push({ label: 'Territory', name, desc, duration: durationStr });
  }
  if (talismanState) {
    const name = String(talismanState.talismanName ?? talismanState.name ?? 'Talisman').trim();
    const desc = String(talismanState.desc ?? '').trim();
    const remaining = talismanState.remaining != null ? Number(talismanState.remaining) : null;
    const durationStr = remaining != null ? `${remaining}T` : '';
    entries.push({ label: 'Talisman', name, desc, duration: durationStr });
  }

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
