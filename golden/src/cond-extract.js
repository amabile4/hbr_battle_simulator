/**
 * 条件式抽出ユーティリティ。
 *
 * ## 2つのデータソースと依存関係
 *
 * 本モジュールは2つの抽出 API を提供する。評価コア（cond-parser / cond-evaluator）は
 * どちらのソースにも依存しない純粋関数だが、抽出フェーズはソース別に分かれる。
 *
 * ### 1. view/json 用（本体移植時に使用・推奨）
 *   - フィールド名: `cond`, `overwrite_cond`, `iuc_cond`, `target_condition`, `hit_condition`
 *     （これらは本体 `src/` が実際に読む `json/` と同じ正規名）
 *   - ファイル: skills.json, styles.json, passives.json, characters.json, ...
 *   - API: `extractConditionsFromViewJson(dir)` / `extractConditionsFromViewFile(filePath)`
 *   - **本体移植時はこの API だけで完結する（master_json 不要）**
 *
 * ### 2. master 用（正本検証・完全カバレッジ確認用・オプション）
 *   - フィールド名: `condition`, `overwriteSpCondition`, `targetCondition`, `hitCondition`
 *     （マスター生データの名前。view 変換前）
 *   - ファイル: MasterSkill.json, MasterSkillPart.json, ...
 *   - API: `extractAllConditions(masterDir)` / `extractConditionsFromFile(filePath)`
 *   - 全スキル/パッシブ/能力の完全カバレッジを確認するための参照用
 *
 * master_json は view_json の「抜粋」ではなく「正本」なので件数が多いが、
 * 本体実行時には view/json のみが必要。master は分析・回帰テスト用。
 */

import fs from 'node:fs';
import path from 'node:path';

// ===========================================================================
// view/json 用設定（本体移植時に使用）
// ===========================================================================

/**
 * view_json / json で使う正規フィールド名（リネーム不要）。
 * 本体 `src/` が実際に読む `json/` と同じ名前。
 */
export const VIEW_CONDITION_FIELDS = Object.freeze([
  'cond',
  'overwrite_cond',
  'iuc_cond',
  'target_condition',
  'hit_condition',
]);

const VIEW_FIELD_SET = new Set(VIEW_CONDITION_FIELDS);

/**
 * view_json で条件式を含むファイル（json/ と同名）。
 */
export const DEFAULT_VIEW_SOURCE_FILES = Object.freeze([
  'skills.json',
  'styles.json',
  'passives.json',
  'characters.json',
  'accessories.json',
  'support_skills.json',
]);

// ===========================================================================
// master 用設定（正本検証用・オプション）
// ===========================================================================

/**
 * master フィールド名 -> 正規化(view)名 の対応表。
 */
export const MASTER_CONDITION_FIELD_MAP = Object.freeze({
  condition: 'cond',
  overwriteSpCondition: 'overwrite_cond',
  targetCondition: 'target_condition',
  hitCondition: 'hit_condition',
});

/**
 * 条件式を含む可能性のある master ファイル名（巨大な battle/arena/arcade 系は除外）。
 */
export const DEFAULT_CONDITION_SOURCE_FILES = Object.freeze([
  'MasterSkill.json',
  'MasterSkillPart.json',
  'MasterPassiveSkill.json',
  'MasterAbilityEffect.json',
  'MasterAbilityTreePart.json',
  'MasterAbility.json',
  'MasterAccessory.json',
  'MasterAccessorySetAbilityEffect.json',
  'MasterArenaBonus.json',
  'MasterBattleGimmickStatus.json',
  'MasterLiveSkillCondition.json',
]);

const MASTER_TARGET_KEYS = new Set(Object.keys(MASTER_CONDITION_FIELD_MAP));

/**
 * 汎用: オブジェクトツリーを再帰走査し、条件フィールドを収集する。
 * @param {*} obj
 * @param {Set<string>} fieldNames - 収集対象フィールド名
 * @param {Object<string,string>|null} renameMap - 出力フィールド名へのリネーム（null でそのまま）
 * @param {(record:{field:string, expression:string, sourceId:(string|number|null)})=>void} emit
 * @param {(string|number|null)} sourceId
 */
function collectConditionsFromObject(obj, fieldNames, renameMap, emit, sourceId = null) {
  if (obj == null) return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectConditionsFromObject(item, fieldNames, renameMap, emit, sourceId);
    return;
  }
  if (typeof obj === 'object') {
    const id = obj.id ?? sourceId;
    for (const [k, v] of Object.entries(obj)) {
      if (fieldNames.has(k) && (typeof v === 'string' || typeof v === 'number')) {
        const vs = String(v).trim();
        if (vs) {
          const outField = renameMap ? (renameMap[k] || k) : k;
          emit({ field: outField, expression: vs, sourceId: id ?? null });
        }
      }
      collectConditionsFromObject(v, fieldNames, renameMap, emit, id);
    }
  }
}

/**
 * master 用走査（MASTER_TARGET_KEYS + リネーム）。テスト互換のために残す。
 */
function walkConditions(obj, emit, sourceId = null) {
  collectConditionsFromObject(obj, MASTER_TARGET_KEYS, MASTER_CONDITION_FIELD_MAP, emit, sourceId);
}

/**
 * view/json 用走査（VIEW_FIELD_SET、リネーム不要）。
 */
function walkViewConditions(obj, emit, sourceId = null) {
  collectConditionsFromObject(obj, VIEW_FIELD_SET, null, emit, sourceId);
}

/**
 * 単一の master ファイルから条件式を抽出する。
 * @param {string} filePath
 * @returns {{field:string, expression:string, sourceId:(string|number|null)}[]}
 */
export function extractConditionsFromFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return [];
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return [];
  }
  const arr = Array.isArray(data) ? data : (data.items ?? data.list ?? Object.values(data));
  const results = [];
  walkConditions(arr, (r) => results.push(r));
  return results;
}

/**
 * master_json ディレクトリから全条件式を抽出する。
 * @param {string} masterDir - golden/master_json へのパス
 * @param {string[]} [files] - 対象ファイル名（省略時は DEFAULT_CONDITION_SOURCE_FILES）
 * @returns {{file:string, field:string, expression:string, sourceId:(string|number|null)}[]}
 */
export function extractAllConditions(masterDir, files = DEFAULT_CONDITION_SOURCE_FILES) {
  const all = [];
  for (const f of files) {
    const full = path.join(masterDir, f);
    if (!fs.existsSync(full)) continue;
    const fromFile = extractConditionsFromFile(full);
    for (const r of fromFile) {
      all.push({ file: f, ...r });
    }
  }
  return all;
}

/**
 * 抽出結果から、フィールド別の distinct 条件式セットを構築する。
 * @param {{field:string, expression:string}[]} records
 * @returns {Record<string, Record<string, number>>} {cond: {expr: count, ...}, ...}
 */
export function buildDistinctConditionSet(records) {
  const byField = {};
  for (const r of records) {
    byField[r.field] = byField[r.field] || {};
    byField[r.field][r.expression] = (byField[r.field][r.expression] || 0) + 1;
  }
  return byField;
}

// ===========================================================================
// view/json 用 API（本体移植時に使用・推奨）
// ===========================================================================

/**
 * 単一の view/json ファイルから条件式を抽出する。
 * フィールド名はそのまま（cond, overwrite_cond, iuc_cond, target_condition, hit_condition）。
 *
 * @param {string} filePath - view_json または json/ 配下のファイル
 * @returns {{field:string, expression:string, sourceId:(string|number|null)}[]}
 */
export function extractConditionsFromViewFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return [];
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return [];
  }
  const arr = Array.isArray(data) ? data : (data.items ?? data.list ?? Object.values(data));
  const results = [];
  walkViewConditions(arr, (r) => results.push(r));
  return results;
}

/**
 * view_json / json ディレクトリから全条件式を抽出する。
 *
 * **本体移植時はこの API を使う。master_json は不要。**
 *
 * @param {string} viewDir - golden/view_json または json/ へのパス
 * @param {string[]} [files] - 対象ファイル名（省略時は DEFAULT_VIEW_SOURCE_FILES）
 * @returns {{file:string, field:string, expression:string, sourceId:(string|number|null)}[]}
 */
export function extractConditionsFromViewJson(viewDir, files = DEFAULT_VIEW_SOURCE_FILES) {
  const all = [];
  for (const f of files) {
    const full = path.join(viewDir, f);
    if (!fs.existsSync(full)) continue;
    const fromFile = extractConditionsFromViewFile(full);
    for (const r of fromFile) {
      all.push({ file: f, ...r });
    }
  }
  return all;
}

