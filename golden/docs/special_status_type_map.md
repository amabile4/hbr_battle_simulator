# SpecialStatusCountByType ID 対応表

> 作成日: 2026-06-27
> 対象モジュール: `golden/src/special-status-types.js`
> 正本データ: `golden/master_json/MasterSpecialStatus.json` (202 型)

## 1. 概要

条件式内の `SpecialStatusCountByType(ID)` / `SpecialStatusIconCountByType(ID)` で使われる
数値ID と、canonical な status 名（文字列）の対応表。

`MasterSpecialStatus.json` の `specialStatusType`（数値ID）↔ `label`（`SpecialStatus.XXX` 形式）
を正本とし、それに覆盖しきれない食事バフ等の補助 ID を `SUPPLEMENTARY_SPECIAL_STATUS_TYPES` で補完している。

## 2. 完全対応表（条件式出現 ID + 補助 ID）

| ID | 名前 | カテゴリ | 主体 | 条件式出現 |
|---|---|---|---|---|
| 1 | `AttackUp` | buff | player | ✅ |
| 3 | `DefenseDown` | debuffEnemy | enemy | ✅ |
| 12 | `Provoke` | debuffPlayer | player | ✅ |
| 20 | `AdditionalTurn` | system | both | ✅ |
| 22 | `Fragile` | debuffEnemy | enemy | ✅ |
| 25 | `BuffCharge` | buff | player | ✅ |
| 30 | `Virus` | debuffEnemy | enemy | ✅ |
| 57 | `Cover` | protective | player | ✅ |
| 78 | `MindEye` | protective | player | ✅ |
| 79 | `Restraint` | debuffPlayer | player | ✅ |
| 111 | `DebuffGuard` | other | player | ✅ |
| 122 | `Dodge` | buff | player | ✅ |
| 124 | `EternalOath` | protective | player | ✅ |
| 125 | `ShadowClone` | buff | player | ✅ |
| 132 | `CorrosionDp` | debuffEnemy | enemy | ✅ |
| 144 | `Diva` | buff | player | ✅ |
| 146 | `NegativeMind` | debuffPlayer | player | ✅ |
| 155 | `BIYamawakiServant` | buff | player | ✅ |
| 157 | `SuperStun` | debuffPlayer | player | ✅ |
| 164 | `Makeup` | buff | player | ✅ |
| 172 | `SuperBreakDown` | debuffEnemy | enemy | ✅ |
| 176 | `Motivation` | other | player | ✅ |
| 258 | `Babied` | other | player | |
| 303 | `Curry` | other | player | |
| 304 | `Shchi` | other | player | |
| 313 | `Mocktail` | other | player | |
| 330 | `Steak` | other | player | |
| 331 | `Gelato` | other | player | |

凡例:
- **カテゴリ**: `buff`(強化) / `debuffEnemy`(敵デバフ) / `debuffPlayer`(プレイヤーデバフ) / `system`(システム) / `protective`(保護) / `other`(その他)
- **主体**: `player`(プレイヤー/味方) / `enemy`(敵) / `both`(両方)
- **条件式出現**: ✅ = golden 抽出した318式のいずれかで実際に使われている

## 3. 既存マップ（`src/domain/character-style.js`）との差分

正本ベースで確認した修正点:

| ID | 旧名（既存） | 新名（正本） | 備考 |
|---|---|---|---|
| 79 | `ImprisonRandom` | `Restraint` | MasterSpecialStatus では Restraint |
| 146 | `NegativeState` | `NegativeMind` | MasterSpecialStatus では NegativeMind |

また、既存マップに**未定義**だったが条件式で実際に使われていた ID を補完:

| ID | 名前 | 主な出現例 |
|---|---|---|
| 3 | `DefenseDown` | `CountBC(IsPlayer()==0&&SpecialStatusCountByType(3)>0)>0` |
| 12 | `Provoke` | （敵ターゲット固定） |
| 20 | `AdditionalTurn` | `SpecialStatusCountByType(20)==0`（追撃抑制） |
| 22 | `Fragile` | `CountBC(IsPlayer()==0&&SpecialStatusCountByType(22)>0)>0` |
| 30 | `Virus` | `SpecialStatusCountByType(30)==0` |
| 57 | `Cover` | （かばう状態） |
| 132 | `CorrosionDp` | （DP 腐食） |
| 157 | `SuperStun` | （超スタン） |
| 172 | `SuperBreakDown` | `CountBC(IsDead()==0 && IsPlayer()==0&&SpecialStatusCountByType(172)>0)>0` |

## 4. API

```js
import {
  getSpecialStatusName,        // ID -> 名前
  getSpecialStatusIdByName,    // 名前 -> ID
  buildSpecialStatusTypeMap,   // MasterSpecialStatus.json から Map 構築
  resolveSpecialStatusCategory,// buff/debuffEnemy/... カテゴリ解決
  resolveSpecialStatusSide,    // player/enemy/both 主体解決
  buildSpecialStatusCatalog,   // 全 ID のメタ情報一覧
  describeSpecialStatusCount,  // "SpecialStatusCountByType(172) [SuperBreakDown]" 生成
} from '../golden/src/special-status-types.js';

// 優先順位: masterMap（最優先）-> DEFAULT_SPECIAL_STATUS_TYPES -> fallback 名
getSpecialStatusName(172);                              // -> 'SuperBreakDown'
getSpecialStatusName(9999);                             // -> 'UnknownSpecialStatus_9999'
getSpecialStatusIdByName('SuperBreakDown');             // -> 172
resolveSpecialStatusSide(172);                          // -> 'enemy'
```

## 5. 関連

- `golden/src/special-status-types.js` — 実装モジュール
- `golden/tests/special-status-types.test.js` — 単体テスト（20件）
- `golden/tests/fixtures/special_status_map.json` — MasterSpecialStatus 正本マップ（202型）
- `golden/tests/generate_special_status_doc.mjs` — 本表の再生成スクリプト
