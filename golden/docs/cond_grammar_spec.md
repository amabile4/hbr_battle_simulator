# 条件式（cond / overwrite_cond）文法仕様

> 作成日: 2026-06-27
> 対象: `golden/src/cond-parser.js`, `golden/src/cond-evaluator.js`
> データソース: `golden/master_json/` (MasterSkill, MasterSkillPart, MasterPassiveSkill, MasterAbilityEffect)

## 1. 背景

従来 `src/turn/turn-controller.js` では条件式を正規表現の羅列（`FUNCTION_COMPARISON_CONDITION_RE` 等）で場当たり的に処理していた。
本仕様はマスターデータから全条件式を抽出・分析した結果に基づく正式パーサー/評価器の定義である。

## 2. マスターデータのフィールド対応

`golden/master_json/` と `json/` / `golden/view_json/` は異なるフィールド名を使う:

| マスターフィールド | view/json 名 | 出現ファイル | distinct式数 |
|---|---|---|---|
| `condition` | `cond` | MasterSkill, MasterSkillPart, MasterPassiveSkill, MasterAbilityEffect | 193 |
| `overwriteSpCondition` | `overwrite_cond` | MasterSkill | 41 |
| `targetCondition` | `target_condition` | MasterSkillPart | 75 |
| `hitCondition` | `hit_condition` | MasterSkillPart | 9 |
| **合計** | | | **318** |

## 3. 文法分析結果

case 文（switch）・ `if(true/false)` 固定リテラル・三項演算子は**存在しない**。
全表現は以下の BNF で表現される:

```bnf
orExpr     := andExpr ('||' andExpr)*
andExpr    := comparison ('&&' comparison)*
comparison := operand (compareOp operand)?      ; 演算子無し = truthy 判定
operand    := call | number
call       := CountBC '(' orExpr ')' (compareOp number)?    ; 唯一のネスト
           | identifier '(' argList? ')'
number     := [-]?[0-9]+('.'[0-9]+)?
compareOp  := '==' | '!=' | '>=' | '<=' | '>' | '<'
argList    := arg (',' arg)*
arg        := identifier | number               ; Fire, 31A, RKayamori, 20 等
```

### ネストの唯一の形: CountBC

`CountBC(<boolean式>) <比較> <数値>` のみが1レベルのネストを持つ。
内側式は `&&` / `||` で結合された述語列で、各キャラクター（player/enemy）に対して評価され、
真となった数を返す。

例: `CountBC(IsPlayer() == 1 && IsCharacter(RKayamori) == 1 && MotivationLevel() == 5)>0`
→ 「MotivationLevel==5 の RKayamori である player が1人以上いる」か

## 4. 出現する述語関数（51種類）

```
数値を返す zero-arg (20種):
  Sp, Ep, DpRate, OverDriveGauge, Token, MoraleLevel, MotivationLevel,
  DamageRate, BreakHitCount, RemoveDebuffCount, Turn, ConsumeSp,
  ConquestBikeLevel, Random, BreakDownTurn, TargetBreakDownTurn, DebuffIconCount,
  FireMarkLevel, IceMarkLevel, (Thunder/Dark/Light MarkLevel)

boolean zero-arg (18種):
  IsPlayer, IsOverDrive, IsReinforcedMode, IsShredding, IsCharging, IsFront,
  IsDead, IsBroken, IsEnemyCharge, IsApplyLearning, IsHitWeak, IsAttackNormal,
  IsAttacker, IsBlaster, IsBreaker, IsDefender, IsBuffer, IsDebuffer, IsHealer

one-arg boolean (10種):
  IsCharacter, IsTeam, IsZone, IsTerritory, HasSkill, IsNatureElement,
  IsWeakElement, IsRole, IsWeaponElement, IsTargetWeakNatureElement

特殊カウント (3種):
  CountBC, SpecialStatusCountByType, SpecialStatusIconCountByType, PlayedSkillCount
```

## 5. AST ノード型

| type | 構造 | 説明 |
|---|---|---|
| `literal` | `{value: boolean}` | 空式 = 常に真 |
| `or` | `{children: [...]}` | `\|\|` 結合 |
| `and` | `{children: [...]}` | `&&` 結合 |
| `compare` | `{op, left, right}` | 比較演算 |
| `call` | `{name, args: [...]}` | 関数呼び出し（数値/boolean を返す） |
| `countBc` | `{inner, op, rhs}` | CountBC ネスト評価 + 比較 |
| `number` | `{value}` | 数値リテラル |
| `ident` | `{value}` | 識別子引数（Fire, 31A 等） |

## 6. 検証結果

- **パース**: 318/318 式をエラー無く構文解析（0 件失敗）
- **評価**: 318/318 式を例外無く評価（0 件クラッシュ）
- **完全解決**: 318/318 式が全述語解決済み（unknownCount=0、fallback 不要）

## 7. 関連モジュール

- `golden/src/cond-parser.js` — 字句解析 + 再帰下降パーサー
- `golden/src/cond-evaluator.js` — AST 評価器（51述語ディスパッチ）
- `golden/src/special-status-types.js` — SpecialStatus ID ↔ 名前マッピング
- `golden/src/cond-extract.js` — master_json 条件式抽出ユーティリティ
- `golden/tests/fixtures/` — 生成済み golden テストデータ
