/**
 * SpecialStatusCountByType / SpecialStatusIconCountByType の数値ID と
 * canonical な status 名（文字列）を双方向に結びつけるモジュール。
 *
 * データソース（優先順位）:
 *  1. golden/master_json/MasterSpecialStatus.json の `specialStatusType` <-> `label`
 *     （label "SpecialStatus.XXX" の XXX 部分を canonical 名とする）
 *  2. 食事バフ等、MasterSpecialStatus に無くても既存実装で運用されている追加 ID
 *
 * 既存 src/domain/character-style.js の SPECIAL_STATUS_TYPE_NAMES と比較して
 * 以下の修正を含む（正本ベース）:
 *   79: ImprisonRandom -> Restraint
 *   146: NegativeState -> NegativeMind
 * また、本プロジェクトで条件式に出現する未対応 ID を全て補完:
 *   3=DefenseDown, 12=Provoke, 20=AdditionalTurn, 22=Fragile, 30=Virus,
 *   57=Cover, 132=CorrosionDp, 157=SuperStun, 172=SuperBreakDown
 */

/**
 * canonical 名が得られなかった ID 用のフォールバック名。
 * 安全側: 評価は継続できるが、表示/デバッグで未特定であることが分かるようにする。
 */
export function fallbackSpecialStatusName(id) {
  return `UnknownSpecialStatus_${id}`;
}

/**
 * golden/master_json/MasterSpecialStatus.json から specialStatusType -> canonical 名 の
 * マップを構築する。MasterSpecialStatus を正本とするため、本関数が最も正確。
 *
 * @param {object} masterSpecialStatus - パース済み MasterSpecialStatus.json
 * @returns {ReadonlyMap<number, string>}
 */
export function buildSpecialStatusTypeMap(masterSpecialStatus) {
  const arr = Array.isArray(masterSpecialStatus)
    ? masterSpecialStatus
    : masterSpecialStatus?.items ?? masterSpecialStatus?.list ?? Object.values(masterSpecialStatus ?? {});
  const map = new Map();
  for (const entry of arr) {
    if (!entry || entry.specialStatusType === undefined || entry.specialStatusType === null) continue;
    const rawLabel = String(entry.label ?? '');
    const name = rawLabel.replace(/^SpecialStatus\./, '');
    if (name) {
      map.set(Number(entry.specialStatusType), name);
    }
  }
  return Object.freeze(map);
}

/**
 * MasterSpecialStatus に定義が無いが、既存実装/運用で扱う補助 status。
 * 主に食事バフ・特殊 player 状態。値は既存 src/domain/character-style.js 由来。
 */
export const SUPPLEMENTARY_SPECIAL_STATUS_TYPES = Object.freeze({
  258: 'Babied',
  303: 'Curry',
  304: 'Shchi',
  313: 'Mocktail',
  330: 'Steak',
  331: 'Gelato',
});

/**
 * 条件式で実際に出現する SpecialStatusCountByType 数値ID の完全セット（2026-06 master 抽出）。
 * デバッグ・テスト・ドキュメント生成で利用する参照用定数。
 * 出現頻度の降順ではなく ID 昇順で整列。
 */
export const CONDITION_USED_SPECIAL_STATUS_IDS = Object.freeze([
  3, 12, 20, 22, 25, 30, 57, 78, 79, 122, 124, 125, 132, 144, 146, 155, 157, 164, 172,
]);

/**
 * 条件式で実際に出現する SpecialStatusIconCountByType 数値ID のセット。
 */
export const CONDITION_USED_SPECIAL_STATUS_ICON_IDS = Object.freeze([
  1, 25, 111, 176,
]);

/**
 * 既定の（MasterSpecialStatus を読み込まずに使える）マップ。
 * master 抽出で確認済みの全条件出現 ID + 食事バフ等の補助 ID を覆盖。
 * MasterSpecialStatus.json を読み込める環境では buildSpecialStatusTypeMap() の結果を優先すること。
 */
export const DEFAULT_SPECIAL_STATUS_TYPES = Object.freeze(
  (() => {
    const base = {
      1: 'AttackUp',
      3: 'DefenseDown',
      12: 'Provoke',
      20: 'AdditionalTurn',
      22: 'Fragile',
      25: 'BuffCharge',
      30: 'Virus',
      57: 'Cover',
      78: 'MindEye',
      79: 'Restraint',
      111: 'DebuffGuard',
      122: 'Dodge',
      124: 'EternalOath',
      125: 'ShadowClone',
      132: 'CorrosionDp',
      144: 'Diva',
      146: 'NegativeMind',
      155: 'BIYamawakiServant',
      157: 'SuperStun',
      164: 'Makeup',
      172: 'SuperBreakDown',
      176: 'Motivation',
    };
    return { ...base, ...SUPPLEMENTARY_SPECIAL_STATUS_TYPES };
  })()
);

/**
 * status 名 -> 数値ID の逆引きマップ（既定）。
 */
export const DEFAULT_SPECIAL_STATUS_BY_NAME = Object.freeze(
  Object.fromEntries(
    Object.entries(DEFAULT_SPECIAL_STATUS_TYPES).map(([id, name]) => [name, Number(id)])
  )
);

/**
 * 条件式で意味を持つ主要 status を、大まかなカテゴリに分類する。
 * 評価ロジック（player 側 / enemy 側）や UI 表示の参考用。
 */
export const SPECIAL_STATUS_CATEGORY = Object.freeze({
  buff: Object.freeze(new Set([1, 25, 122, 125, 144, 155, 164])),
  debuffEnemy: Object.freeze(new Set([3, 22, 30, 132, 172])),
  debuffPlayer: Object.freeze(new Set([12, 79, 146, 157])),
  system: Object.freeze(new Set([20])),
  protective: Object.freeze(new Set([57, 78, 124])),
  other: Object.freeze(new Set([111, 176, 258, 303, 304, 313, 330, 331])),
});

/**
 * 特定 ID のカテゴリを解決する。複数候補がある場合は最初に一致したもの。
 * @param {number} id
 * @returns {'buff'|'debuffEnemy'|'debuffPlayer'|'system'|'protective'|'other'|'unknown'}
 */
export function resolveSpecialStatusCategory(id) {
  const numId = Number(id);
  for (const [category, ids] of Object.entries(SPECIAL_STATUS_CATEGORY)) {
    if (ids.has(numId)) return category;
  }
  return 'unknown';
}

/**
 * 統合エントリポイント: 名前解決を行う。
 * master マップ（最優先）-> 補助マップ -> フォールバック名。
 *
 * @param {number} id
 * @param {Map<number,string>|null} [masterMap] - buildSpecialStatusTypeMap() の結果
 * @returns {string}
 */
export function getSpecialStatusName(id, masterMap = null) {
  const numId = Number(id);
  if (masterMap && masterMap.has(numId)) return masterMap.get(numId);
  if (Object.hasOwn(DEFAULT_SPECIAL_STATUS_TYPES, numId)) {
    return DEFAULT_SPECIAL_STATUS_TYPES[numId];
  }
  return fallbackSpecialStatusName(numId);
}

/**
 * 統合エントリポイント: 名前 -> 数値ID の解決。
 *
 * @param {string} name
 * @param {Map<number,string>|null} [masterMap]
 * @returns {number|null}
 */
export function getSpecialStatusIdByName(name, masterMap = null) {
  const target = String(name ?? '');
  if (masterMap) {
    for (const [id, n] of masterMap) {
      if (n === target) return id;
    }
  }
  if (Object.hasOwn(DEFAULT_SPECIAL_STATUS_BY_NAME, target)) {
    return DEFAULT_SPECIAL_STATUS_BY_NAME[target];
  }
  return null;
}

/**
 * SpecialStatusCountByType(ID) 表記を生成するヘルパー。
 * @param {number} id
 * @param {Map<number,string>|null} [masterMap]
 * @returns {string} 例: "SpecialStatusCountByType(172) [SuperBreakDown]"
 */
export function describeSpecialStatusCount(id, masterMap = null) {
  const numId = Number(id);
  return `SpecialStatusCountByType(${numId}) [${getSpecialStatusName(numId, masterMap)}]`;
}

/**
 * SpecialStatus の「作用対象の主体」を判定する。
 * CountBC 条件式で `IsPlayer()==0` と併用される敵デバフと、
 * `IsPlayer()==1` と併用されるプレイヤー状態を見分ける評価ロジックで利用。
 *
 * 'player' : プレイヤー自身または味方に付与されるバフ/デバフ（自己チャージ等）
 * 'enemy'  : 敵に付与されるデバフ（DefenseDown, Fragile, SuperBreakDown 等）
 * 'both'   : 文脈によって両方に付与されうる中立 status（DebuffGuard 等）
 * 'unknown': 未分類
 *
 * @param {number} id
 * @returns {'player'|'enemy'|'both'|'unknown'}
 */
const PLAYER_SIDE_SPECIAL_STATUS_IDS = Object.freeze(new Set([
  1, 12, 25, 57, 78, 79, 111, 122, 124, 125, 144, 146, 155, 157, 164, 176,
  258, 303, 304, 313, 330, 331,
]));
const ENEMY_SIDE_SPECIAL_STATUS_IDS = Object.freeze(new Set([
  3, 22, 30, 132, 172,
]));
const BOTH_SIDE_SPECIAL_STATUS_IDS = Object.freeze(new Set([
  20, // AdditionalTurn は主に player だが system 扱いで両方可
]));

export function resolveSpecialStatusSide(id) {
  const numId = Number(id);
  if (PLAYER_SIDE_SPECIAL_STATUS_IDS.has(numId)) return 'player';
  if (ENEMY_SIDE_SPECIAL_STATUS_IDS.has(numId)) return 'enemy';
  if (BOTH_SIDE_SPECIAL_STATUS_IDS.has(numId)) return 'both';
  return 'unknown';
}

/**
 * 条件式の出現範囲で、各 SpecialStatus ID を完全なメタ情報に解決する。
 * ドキュメント生成・デバッグ用途。
 *
 * @param {Map<number,string>|null} [masterMap]
 * @returns {{id:number, name:string, category:string, side:string, usedInCondition:boolean}[]}
 */
export function buildSpecialStatusCatalog(masterMap = null) {
  const used = new Set([...CONDITION_USED_SPECIAL_STATUS_IDS, ...CONDITION_USED_SPECIAL_STATUS_ICON_IDS]);
  const ids = new Set([
    ...Object.keys(DEFAULT_SPECIAL_STATUS_TYPES).map(Number),
    ...used,
  ]);
  return [...ids]
    .sort((a, b) => a - b)
    .map((id) => ({
      id,
      name: getSpecialStatusName(id, masterMap),
      category: resolveSpecialStatusCategory(id),
      side: resolveSpecialStatusSide(id),
      usedInCondition: used.has(id),
    }));
}
