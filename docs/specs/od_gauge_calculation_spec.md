# ODゲージ計算仕様

> 📚 参照専用 | 確定済み実装仕様（2026-03-01 実機照合完了）
> 出典: DEVELOPMENT_NOTES.md 2026-03-01 セクション

---

## 確定事項

- **ドライブピアスはロール非依存**: アタック/ブレイク/ブラスト/ドライブは装備効果として扱い、スタイルの `role` では分岐しない。
- **OD小数処理**: ODゲージは **小数第2位まで保持**し、**第3位以下を切り捨て**る。
- **全体攻撃（敵複数）時の加算順序**:
  - **1hitごと** にOD増加量を計算
  - 各hitぶんを小数第2位で切り捨て
  - 総hit数（`hitCount * enemyCount`）へ乗算して合算
- **ターン間累積**: 累積ODも各ターンで小数第2位に正規化する（浮動小数誤差の抑制）。
- **AttackSkill + OverDrivePointUp**: `OverDrivePointUp` の加算は実装済み（`hit_condition` を評価）。

---

## 実機照合結果（ユーザー検証）

| ケース | 結果 |
|--------|------|
| `RKayamori / サンダーパルス / 敵3 / ドライブ15%` の整数表示 | `15, 31, 47, 63 ...` で一致 |
| `回る！ぽんぽこ花吹雪 / 敵3 / ドライブ10%` | 一致 |
| `フグリングクラッシュ / 敵3 / ドライブ12%` | 一致 |
| `12hit全体（敵3, drive15）を2回` | 実機 `206` を確認し、hit単位切り捨て（仮説B）を採用 |
| `OverDrivePointUp` 4スキル（渾身銃撃/海のギャング/哀のスノードロップ/サービス・エース） | `18` / `71` / `164` / `21` で一致 |

---

## ドライブピアスOD補正式

### 記号定義

| 記号 | 意味 |
|------|------|
| `h` | スキル本来のヒット数（通常攻撃は最低3hit保証後の値を使用） |
| `p` | ドライブピアス値（`10 / 12 / 15`） |
| `N` | 敵数（`1..3`） |
| `trunc2(x)` | 小数第2位まで保持（第3位以下切り捨て） |

### 計算式

```
h_ref = clamp(h, 1, 10)                          // ピアス補正率参照用
bonus(h, p) = 5 + ((p - 5) / 9) * (h_ref - 1)  // ピアス補正率(%)

// 単体攻撃
per_hit     = trunc2(2.5 * (1 + bonus/100))
gain_single = trunc2(per_hit * h)

// 全体攻撃（敵N体）
per_hit  = trunc2(2.5 * (1 + bonus/100))
gain_all = trunc2(per_hit * (h * N))
```

### 例（サンダーパルス, h=2, p=15, N=3）

```
bonus   = 6.11%
per_hit = trunc2(2.5 * 1.0611) = trunc2(2.65275) = 2.65
gain_all = trunc2(2.65 * 6) = 15.90
```

---

## AttackSkill + OverDrivePointUp の計算

- **適用条件**:
  - スキル `parts` 内にダメージ系パーツ（`AttackSkill` 等）が存在
  - かつ `OverDrivePointUp` パーツが存在
- **計算**:
  - `attack_gain`: 上記「ドライブピアスOD補正式」で算出した攻撃ぶんのOD増加
  - `od_point_up_gain`: `OverDrivePointUp.power` の最大値を採用し、`*100` した値にドライブ補正を乗算
  - `total_gain = trunc2(attack_gain + od_point_up_gain)`
- **条件式**: `OverDrivePointUp.hit_condition` を評価（例: `BreakHitCount()>0`）
- **自己パラメータ依存（知性など）**: SP/ODシミュレータ方針により常に最大値を採用

---

## 非攻撃スキルによるOD獲得

- **適用条件**: ダメージパーツが無くても `OverDrivePointUp` を持つスキルはOD増加対象
- **ドライブ補正**: 非攻撃スキルは hit 情報が実質0/未定義のため、`1hit` 相当（+5/+5.78/+6.11%）で適用
- **条件分岐**: `SkillCondition` + `PlayedSkillCount(...)` を評価して分岐先 `strval` スキルを選択
  - 例: `コンペンセーション` は初回75%・2回目以降25%（いずれもドライブ補正適用）
- **状態管理**: `CharacterStyle.skillUseCounts` にスキル使用回数を保持し、commitごとに加算

---

## 敵 od_rate によるOD上昇量補正 [WIP]

> ⚠️ 実機照合未完了。小数点丸め込み位置は調査中。

### 仕様

- 敵パラメーター `od_rate` は `enemies.json > base_param.od_rate` に格納される。
- `od_rate = 0` の場合は **補正なし**（乗数 1.0 として扱う）。
- `od_rate ≠ 0` の場合、最終OD上昇量に乗算する係数は `od_rate / 10000`:

```
effective_gain = trunc2(raw_gain × (od_rate / 10000))
```

- 例: `od_rate = 8500` → 乗数 `0.85` → 通常攻撃1回(2.5%) が `trunc2(2.5 × 0.85) = 2.12%`。

### 定数

| 定数名 | 値 | 説明 |
|--------|----|------|
| `ENEMY_OD_RATE_UNIT` | `10000` | od_rate 1単位あたりの基底値（0.01%/unit） |

### 実装場所

| 処理 | ファイル | 関数 |
|------|----------|------|
| 定数定義 | `src/config/battle-defaults.js` | `ENEMY_OD_RATE_UNIT` |
| ターン状態保持 | `src/contracts/interfaces.js` | `enemyState.odRateByEnemy` |
| 係数解決 | `src/turn/turn-controller.js` | `resolveEnemyOdRateMultiplier()` |
| 補正適用 | `src/turn/turn-controller.js` | `applyOdGaugeFromActions()` |
| UI→エンジン変換 | `ui-next/engine/battle-state-manager.js` | `buildEnemyStateOverrides()` |

### WIP メモ

- 丸め込みタイミングの調査が完了したら `trunc2` の適用位置を見直す。
- 複数敵がいる場合は全て同じ `od_rate` を持つとして enemy[0] の値を代表値として使用中。
