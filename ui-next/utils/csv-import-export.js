import { resolveOwnershipState } from './style-ownership-store.js';
import {
  DEFAULT_TITLE_RANK,
  DEFAULT_REINCARNATION,
  MAX_TITLE_RANK,
  MAX_REINCARNATION,
} from './character-settings-store.js';

// ---- CSV 基本ユーティリティ ----

function escapeField(value) {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseCSVLine(line) {
  const fields = [];
  let inQuotes = false;
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function parseCSV(text) {
  return text.split(/\r?\n/).filter((l) => l.trim() !== '').map(parseCSVLine);
}

export function downloadCSV(filename, csvText) {
  const blob = new Blob(['﻿' + csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- 所持スタイル CSV ----

const STYLE_OWNERSHIP_HEADERS = ['styleId', 'styleName', 'charaName', 'tier', 'limitBreak'];

export function exportStyleOwnershipCsv(store, entries) {
  const rows = [STYLE_OWNERSHIP_HEADERS.join(',')];
  for (const style of store.styles ?? []) {
    const state = resolveOwnershipState(entries, style, store);
    const lbStr = state === null ? '未所持' : String(state);
    const charaName = String(style.chara ?? '').split('—')[0].trim();
    rows.push([
      escapeField(style.id),
      escapeField(style.name),
      escapeField(charaName),
      escapeField(style.tier),
      escapeField(lbStr),
    ].join(','));
  }
  return rows.join('\r\n');
}

/**
 * @returns {{ ok: boolean, message: string, entries?: object }}
 */
export function importStyleOwnershipCsv(csvText, store) {
  const rows = parseCSV(csvText);
  if (rows.length < 1) return { ok: false, message: 'ファイルが空です' };

  const headerRow = rows[0];
  if (
    headerRow.length !== STYLE_OWNERSHIP_HEADERS.length ||
    !STYLE_OWNERSHIP_HEADERS.every((h, i) => headerRow[i].trim() === h)
  ) {
    return {
      ok: false,
      message: `ヘッダーが一致しません。期待: ${STYLE_OWNERSHIP_HEADERS.join(',')}`,
    };
  }

  const entries = {};
  let imported = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    if (row.length < 5) { skipped++; continue; }
    const styleId = Number(row[0].trim());
    if (!Number.isFinite(styleId) || !Number.isInteger(styleId)) { skipped++; continue; }

    const style = store.getStyleById(styleId);
    if (!style) { skipped++; continue; }

    const lbStr = row[4].trim();
    let state;
    if (lbStr === '未所持') {
      state = null;
    } else {
      const n = Number(lbStr);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) { skipped++; continue; }
      const lbMax = store.getLimitBreakMaxByTier(style.tier);
      if (n > lbMax) { skipped++; continue; }
      state = n;
    }

    entries[String(styleId)] = state;
    imported++;
  }

  return { ok: true, message: `${imported} 件を反映しました（${skipped} 件スキップ）`, entries };
}

// ---- キャラクター設定 CSV ----

const CHARACTER_SETTINGS_HEADERS = ['charaLabel', 'charaName', 'titleRank', 'reincarnation'];

export function exportCharacterSettingsCsv(store, settings) {
  const rows = [CHARACTER_SETTINGS_HEADERS.join(',')];
  for (const character of store.characters ?? []) {
    const label = String(character.label ?? '');
    const name = String(character.name ?? '').split('—')[0].trim();
    const titleRank = settings[label]?.titleRank ?? DEFAULT_TITLE_RANK;
    const reincarnation = settings[label]?.reincarnation ?? DEFAULT_REINCARNATION;
    rows.push([
      escapeField(label),
      escapeField(name),
      escapeField(titleRank),
      escapeField(reincarnation),
    ].join(','));
  }
  return rows.join('\r\n');
}

/**
 * @returns {{ ok: boolean, message: string, settings?: object }}
 */
export function importCharacterSettingsCsv(csvText, store) {
  const rows = parseCSV(csvText);
  if (rows.length < 1) return { ok: false, message: 'ファイルが空です' };

  const headerRow = rows[0];
  if (
    headerRow.length !== CHARACTER_SETTINGS_HEADERS.length ||
    !CHARACTER_SETTINGS_HEADERS.every((h, i) => headerRow[i].trim() === h)
  ) {
    return {
      ok: false,
      message: `ヘッダーが一致しません。期待: ${CHARACTER_SETTINGS_HEADERS.join(',')}`,
    };
  }

  const settings = {};
  let imported = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    if (row.length < 4) { skipped++; continue; }
    const label = row[0].trim();
    if (!label) { skipped++; continue; }

    const character = store.getCharacterByLabel(label);
    if (!character) { skipped++; continue; }

    const titleRank = Number(row[2].trim());
    const reincarnation = Number(row[3].trim());

    if (!Number.isFinite(titleRank) || !Number.isInteger(titleRank) || titleRank < 0 || titleRank > MAX_TITLE_RANK) {
      skipped++; continue;
    }
    if (!Number.isFinite(reincarnation) || !Number.isInteger(reincarnation) || reincarnation < 0 || reincarnation > MAX_REINCARNATION) {
      skipped++; continue;
    }

    settings[label] = { titleRank, reincarnation };
    imported++;
  }

  return { ok: true, message: `${imported} 件を反映しました（${skipped} 件スキップ）`, settings };
}
