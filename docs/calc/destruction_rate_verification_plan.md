# 破壊率計算 実機検証計画（Issue #19 / #20 延長 → 実機検証完了 2026-06-15）

## 背景

Issue #19/#20 で破壊率の計算式と連撃データ解決は修正された。旧式 `dr × d_rate × hitCount / 800` は **8ヒット時のみ偶然一致** していたに過ぎず、**実機検証で精査した結果、ヒット数非依存の新式 `dr × d_rate / 100` が正解** と判明した。

### 実機検証結果（2026-06-15）

5行の実測データ（異なるヒット数）で新式が全て一致:

| hit | dr | d_rate | 新式計算 | 実測 | 旧式計算 | 判定 |
|---|---|---|---|---|---|---|
| 6 | 3.625 | 10 | 36.25% | 36.25% | 27.19% | 新式✓ 旧式✗ |
| 8 | 20.25 | 10 | 202.5% | 202.5% | 202.5% | 両方一致(8hit) |
| 1 | 1.25 | 10 | 12.5% | 12.5% | 1.56% | 新式✓ 旧式✗ |
| 2 | 1.6 | 10 | 16.0% | 16.0% | 4.0% | 新式✓ 旧式✗ |
| 3 | 2.75 | 10 | 27.5% | 27.5% | 10.31% | 新式✓ 旧式✗ |

**結論**: ベース破壊率上昇量 = `dr × d_rate / 100`（ヒット数完全非依存）。旧式の `× hitCount / 8` は廃止。

Issue #19/#20 で破壊率の計算式と連撃データ解決は修正された。しかし以下の未確定要素がある：

1. **autoBreak 時の破壊率蓄積タイミング**: DP途中でブレイクした場合、どのhitから破壊率が乗るのか？
2. **ユキ/コードダクネスの不一致**: note では +32.6% だが、エンジンは異なる値を出す

## 検証の基本原則

- **実機で1発ずつ打って、その都度Excelに記録する**
- **1変数ずつ検証する**（一度に複数要素を変更しない）
- **シンプルな条件から始める**（単体スキル→バフ追加→連撃追加の順）
- **各ステップで「Excel予定値 ↔ 実機結果」が一致したら次に進む**
- **一致しない場合は、そのステップで立ち止まって原因を特定する**

---

## 検証前の準備（Step 0）

### 0a. 使用キャラ・スキル・敵を確定

第一候補（すでにnote値があるため、実機環境を再現しやすい）：

| 項目 | 値 |
|---|---|
| 検証キャラ | ユキ（白河ユキ） |
| 検証スキル | コードダクネス（EX） |
| 対象敵 | セッションnoteと同じ敵（後で特定） |

> 補足: もし別のスキルの方が「バフなし単体検証」に適していれば、そちらを Step 1〜3 の主軸にする。最終的にユキで総合確認（Step 5）できればよい。

### 0b. 生データを取得

下記を `jq` / `node` で JSON から取得し、Excel の「参照値シート」に記入する：

| パラメータ | 参照元 |
|---|---|
| d_rate（敵の破壊率上昇率） | `json/enemies.json` → `base_param.d_rate` |
| dr（スキル倍率） | `json/skills.json` → 該当スキル parts[].multipliers.dr |
| hit_count（基本ヒット数） | `json/skills.json` → `hit_count` |
| destResist（破壊率耐性） | `json/enemies.json` → 該当フィールド |
| 超越バースト | パッシブ/アビリティで解決 |
| 火の印等マーク | セッション内 mark 効果 |
| 共鳴 | 支援スタイル等 |
| 連撃 power[0] | `skills.json` → Funnel part `power[0]` |
| 連撃倍率 value[0] | `skills.json` → Funnel part `value[0]` |

> **注意**: `json/` フォルダのファイルは全て 1行 minified JSON。必ず `jq` または `node` で読むこと（grep/rg は使わない）。

### 0c. 計算式（実機検証 2026-06-15 後）

> **改訂**: ヒット数非依存の新式に全面移行。

```
baseDestRate = dr × destMult / 100

bonusSum = 超越 + 火の印 + 共鳴 + flat + accessory + resonance

baseDestruction = floor(baseDestRate × (1 + bonusSum) × 10000) / 10000
finalBaseDestruction = baseDestruction × (1 - destResist)

funnelMultiplier = 1 + funnelRate × funnelHitCount
effectiveBaseDestruction = finalBaseDestruction × funnelMultiplier

// autoBreak の場合: DPが0になったヒット以降の残りヒット分だけ蓄積
```

---

## Excel シート構成案

| 列 | 内容 |
|---|---|
| A | テストNo |
| B | 条件（バフ状態・スキル・敵 etc） |
| C | dpInit（開始時DP） |
| D | 敵の破壊率上昇率 d_rate |
| E | スキル倍率 dr |
| F | baseHitCount |
| G | 超越 |
| H | 火の印 |
| I | 共鳴 |
| J | 連撃 funnelRate × funnelHitCount |
| K | **Excel計算: 予想破壊率上昇量(%)** |
| L | **実機結果: 破壊率上昇量(%)** |
| M | 判定（✅ 一致 / ❌ 不一致） |
| N | 備考 |

---

## 各検証ステップ（1発ずつ実機で撃って記録）

### Step 1: ベース式の単体検証（バフなし・連撃なし）

**目的**: `dr × destMult / 100` が正しいかを確定する。**異なるヒット数（1, 3, 6, 8 hit 等）で破壊率上昇量が同じになることを確認**する（ヒット数非依存の検証）。

#### 実機テスト条件
- ✦ 超越バースト = OFF
- ✦ 火の印・マーク系 = OFF
- ✦ 共鳴 = OFF
- ✦ 連撃 = なし
- ✦ 敵がブレイク状態（DP = 0）にしてから撃つ、と理想的だが、実機でその操作が難しい場合は autoBreak になる。その場合は Step 1 の結果は autoBreak モードでの観察となり、Step 4 で改めて isolation する。
- ✦ DP初期値をメモ

#### Excel 予定値の計算
```
bonusSum = 0
baseDestRate = dr × destMult / 100
baseDestruction = floor(baseDestRate × 10000) / 10000
funnelMultiplier = 1.0
effectiveBaseDestruction = baseDestruction
予想 = effectiveBaseDestruction（全区間、全hit分）
```

#### 実機結果の記録
- 破壊率上昇量 (%) を Excel L列に記録
- K列（予定）と L列（実機）を比較 → M列に判定

---

### Step 2: 各ボーナス因子を1つずつ追加

**目的**: 各ボーナスが `(1 + bonusSum)` の加算グループに正しく入るか確認する。

> **基本ルール**: 1回撃つ → Excelに記録 → 予定と一致したら次のバフを追加してもう1回撃つ

#### Step 2a: 超越バーストのみ ON
```
bonusSum = 超越のみ
baseDestruction = floor(baseDestRate × (1 + 超越) × 10000) / 10000
```
→ 撃つ → 記録 → 一致確認

#### Step 2b: + 火の印
```
bonusSum = 超越 + 火の印
```
→ 撃つ → 記録 → 一致確認

#### Step 2c: + 共鳴
```
bonusSum = 超越 + 火の印 + 共鳴
```
→ 撃つ → 記録 → 一致確認

> 🔑 ここで「バフは加算グループ1つにまとまる」という構造が確認できれば、他のバフ（チェーン・ピアス等）は同じ枠に入ると言える。

---

### Step 3: 連撃（Funnel）ボーナス検証

**目的**: `(1 + funnelRate × funnelHitCount)` が独立乗算として正しいか。

#### 実機テスト条件
- Step 2 のバフ状態を維持
- 連撃スキル（神命を宿す瞳等）を装備して、連撃が発生する状態にする
- 1回撃つ → 破壊率上昇量を記録

#### Excel 予定値
```
funnelMultiplier = 1 + funnelRate × funnelHitCount
effectiveBaseDestruction = baseDestruction × funnelMultiplier
予想 = effectiveBaseDestruction × (そのステップの残りhit比率)
```

#### 確認ポイント
- 予定値と実機結果が一致するか
- ~~美也の実測 +584.7% と一致すれば~~、ベース式 + バフ + 連撃の構造が全て正しいと確定

---

### Step 4: autoBreak（DP途中ブレイク）の挙動検証 ⭐最重要

**これが最も重要かつ未確定の領域。**

#### 実機テストの意図
- 敵が**ブレイクしていない状態（DP > 0）**でスキルを撃つ
- 多段ヒットの途中でDPが0になりブレイクする
- **そのとき、ブレイクした瞬間のヒットから破壊率が乗るのか？ 次のヒットからか？ 全体にかかるのか？**

#### ユキ/コードダクネス ケースの状況（note参照）
- DP = 4,381,152（ブレイクしていない）
- コードダクネス 9 hit（autoBreak = true）
- 途中でDP が 0 になりブレイク発生
- note の破壊率上昇 = +32.6%

#### Excel予定値の作成（事前）
1. perHitDpDamage = dpInit / 9 で、何hit目でブレイクするか概算
2. 以下の3パターンをExcelに計算しておく:

| パターン | 説明 | 計算式 | 期待値 |
|---|---|---|---|
| A | ブレイクしたhitから残り全hit分蓄積 | `effectiveBaseDestruction × (残りhit数 / totalHit)` | ※計算 |
| B | ブレイクしたhitの次から蓄積 | `effectiveBaseDestruction × (残りhit数 - 1) / totalHit` | ※計算 |
| C | ブレイク判定後、全体に破壊率が乗る | `effectiveBaseDestruction`（全区間） | ※計算 |

#### 実機でテスト
- ユキでコードダクネス撃つ
- 破壊率上昇量を記録
- A, B, C どれと一致するかを確認

#### 現行エンジンのロジック（参考）
```javascript
for (const hit of hits) {
  dmgAccum += hit.damage;
  const hitIsBreak = autoBreak ? (dmgAccum >= dpInit) : hit.isBreakHit;
  if (hitIsBreak || isBroken) {
    isBroken = true;
    addI = isMultiHit ? effectiveBaseDestruction * hitRatio : effectiveBaseDestruction / h;
    destructionRate += addI;
  }
}
```
→ 現行実装は「ブレイクしたhit以降の残りhit分」だけ蓄積 → パターン A 相当

---

### Step 5: 実データで総合確認

Step 1〜4 の全要素が確定したら、実際のセッションデータ（複数ターン）で一致を確認：

- verify スクリプトを実行して、全アクションの破壊率上昇量を再計算
- 各アクションの計算値が、note の実測値と一致することを確認
- 1件でも不一致があれば、該当する Step に戻って調査

---

## 今晚のタイムライン（目安）

| 時間 | タスク |
|---|---|
| 15分 | Step 0: 生データ取得 → Excel参照値シート作成 |
| 20分 | Step 1: ベース式 — 実機1発 → 記録 → 確認 |
| 40分 | Step 2: バフ追加 — 3発（超越→印→共鳴）→ 各回記録 |
| 20分 | Step 3: 連撃 — 1発 → 記録 → 確認 |
| 40分 | Step 4: autoBreak — ユキ/コードダクネスで実機確認 |
| 20分 | Step 5: 全体で確認 |
| 15分 | まとめ・ドキュメント更新 |

---

## 他の AI モデルに投げるプロンプト

別途 `destruction_rate_prompt_for_review.md` に記載。実機検証と並行して投げてもよい。
