# ODゲージ計算仕様

> 📚 参照専用 | 確定済み実装仕様（2026-03-01 実機照合完了、2026-06-22 瑞原あいなマスターパッシブ特例を追記）
> 出典: DEVELOPMENT_NOTES.md 2026-03-01 セクション

---

## 確定事項

- **ドライブピアスはロール非依存**: アタック/ブレイク/ブラスト/ドライブは装備効果として扱い、スタイルの `role` では分岐しない。
- **OD小数処理**: ODゲージは **小数第2位まで保持**し、**第3位以下を切り捨て**る。
- **通常攻撃のOD**: 通常攻撃は raw hit 数に関わらず **3hit相当 = 7.5% 基準** で計算する。
- **属性ブレスレットとの関係**: 通常攻撃が属性ブレスレットで火/氷/雷/光/闇に変化していても、OD の hit 数は **常に 3hit 相当** のまま据え置く。差し替わるのは属性参照だけ。
- **通常攻撃とEシールドの分離**: OD計算では固定3hitを使うが、Eシールド減算などOD以外のhit判定では実データの raw hit 数を使う。
- **瑞原あいな「母の灯を継いで」**: JSON の `OverDriveRateUp` だけでは通常攻撃・追撃への適用範囲を表現できないが、実機では自身の通常攻撃・追撃にも ODゲージ上昇量 `+5%` が適用される。この固有マスターパッシブは通常の通常攻撃・追撃のバフ非適用規則に対する例外とする。
- **全体攻撃（敵複数）時の加算順序**:
  - **alive enemy ごと・1hitごと** にOD増加量を計算
  - 各hitぶんを小数第2位で切り捨て
  - 総hit数（`hitCount * aliveEnemyCount`）へ乗算して合算
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
| `h` | スキル本来のヒット数 |
| `h_od` | OD計算に使うヒット数（通常攻撃は `3`、それ以外は `h`） |
| `p` | ドライブピアス値（`10 / 12 / 15`） |
| `N` | 敵数（`1..3`） |
| `trunc2(x)` | 小数第2位まで保持（第3位以下切り捨て） |

### 計算式

```
h_od = isNormalAttack ? 3 : h
h_ref = clamp(h_od, 1, 10)                       // ピアス補正率参照用
bonus(h, p) = 5 + ((p - 5) / 9) * (h_ref - 1)  // ピアス補正率(%)

// 単体攻撃
per_hit     = trunc2(2.5 * (1 + bonus/100))
gain_single = trunc2(per_hit * h_od)

// 全体攻撃（敵N体）
per_hit  = trunc2(2.5 * (1 + bonus/100))
gain_all = trunc2(per_hit * (h_od * N))
```

## 瑞原あいなマスターパッシブ「母の灯を継いで」のOD補正

`母の灯を継いで`（`46515601`）は、自身の ODゲージ上昇量を固定で `+5%` する。
実機では通常攻撃・追撃にも有効であるため、データ上の `OverDriveRateUp` だけから導けない適用範囲を、この固有スキルの特例として扱う。

> 実装状況（2026-06-22）: 本節は実機挙動に基づく目標仕様として先行記載している。シミュレーターの通常攻撃・追撃経路への配線は未実装で、対応する回帰テストは `TODO`。

- **対象**: パッシブを所持する瑞原あいなのスキル攻撃、通常攻撃、および瑞原あいなが追撃元となる追撃。
- **補正枠**: ODピアス由来の補正率と加算する。同じ行動に既存のドライブピアス補正率がある場合、`ドライブピアス補正率 + 5%` を使う。
  - 例: 既存のドライブピアス補正率が `+15%` の場合は、合計 `+20%`。
- **固定値**: `+5%` はスキルまたは追撃の hit 数で変化しない。hit 数で変化するのは既存のドライブピアス補正率だけである。
- **通常攻撃**: raw hit 数に関係なく固定3hitの基礎値 `7.5%` に `+5%` を適用する。
- **追撃**: 追撃元が瑞原あいなの場合、追撃の各 hit のOD増加量へ `+5%` を適用する。前衛で行動したキャラクターではなく、追撃を行う後衛キャラクターを判定元とする。
- **小数処理**: 既存どおり各 hit / 各アクションで `trunc2` を行う。

```
masterly_od_bonus_percent = actor_or_pursuit_source_is_AMizuhara_with_masterly ? 5 : 0
combined_od_bonus_percent = existing_drive_pierce_bonus_percent + masterly_od_bonus_percent

// 通常攻撃（瑞原）
normal_attack_gain = trunc2(7.5 * (1 + 5 / 100)) = 7.87
```

通常攻撃3回では、アクション単位の切り捨てにより `trunc2(7.5 × 1.05) × 3 = 7.87 × 3 = 23.61%` となる。通常攻撃は固定3hitの基礎値 `7.5%` を先に得てから補正するため、追撃のようなhit単位の切り捨てとは区別する。

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

## Stage Setup エンチャントによるOD補正

- `ui-next` の Stage Setup で選択する `ODゲージ上昇量+20%` は、上段の `ODゲージ上昇量（%）` 入力欄へ転記する
- 保存・実行時は入力欄の任意値を正本とし、`stageSetup.enchantEffects[*].effectType === 'odGaugeGainBonusPercent'` として保持する
- 適用先は **Party Setup の `ODピアス` と同じ補正枠** に限定する
  - 攻撃スキル由来の hit-based OD
  - `OverDrivePointUp` / `OverDrivePointUpByToken`
  - `AdditionalHitOnBreaking + OverDrivePointUp`（共鳴含む）の drive bonus 経路
- 加算方法:

```
combined_drive_bonus_percent =
  drive_pierce_bonus_percent + stage_setup_od_gain_bonus_percent
```

- 非適用:
  - 通常攻撃の固定 `3hit = 7.5%` 経路
  - `pursuitOdGain`
  - `OverDrivePointDown`
  - `enemy od_rate` の解釈・適用順

### 例

- 2hit `AttackSkill`、`ODピアス=15%`、Stage Setup `ODゲージ上昇量+20%`
  - drive bonus は `6.11 + 20 = 26.11%`
  - `per_hit = trunc2(2.5 * 1.2611) = 3.15`
  - `gain = trunc2(3.15 * 2) = 6.30`

---

## 敵 od_rate によるOD上昇量補正

### 仕様

- UI / Session JSON 上の `od_rate` は **乗数そのもの** を保持する。基準値 `1` が 100%。
- 旧データ互換として、`enemies.json > base_param.od_rate` などの legacy 値（例: `8500`）は `0.85` として解釈する。
- `od_rate = 0` の legacy 値は **補正なし** とみなし、乗数 `1.0` に正規化する。
- 攻撃由来OD（通常攻撃・攻撃スキル・追撃）は **1hitごと** に `od_rate` を掛け、`trunc2` してから合算する。
- 通常攻撃の `h_od` は raw hit 数ではなく **常に 3** とするため、`od_rate` の補正対象も 3hit 分になる。
- 単体攻撃は **target enemy slot** の `od_rate` を使用する。
- 全体攻撃は **alive enemy slot ごと** に `od_rate` を解決し、enemy ごとの hit 合計を加算する。

```
per_hit = trunc2(2.5 × od_rate)
effective_hit_gain = trunc2(per_hit × total_hits)
```

- `OverDrivePointUp` 系は `od_rate` 非適用（そのまま加算）。
- 例: `od_rate = 0.85` → 通常攻撃は `trunc2(2.5 × 0.85) × 3 = 6.36`。
- 旧値例: `od_rate = 8500` → 正規化後 `0.85`。

### ブレイク時トリガーOD（AdditionalHitOnBreaking + OverDrivePointUp, 共鳴含む）

- モラル/トリガー経路で一度だけ反映し、通常の攻撃OD経路と二重加算しない。
- `od_rate` は**適用しない**。
- ただし、行動スキルの hit 数に応じた **ドライブピアスOD補正は適用する**。
  - 補正率は `resolveDrivePierceBonusPercent(resolveSkillHitCount(skill), drivePiercePercent)` を使用。
  - 適用式: `trigger_od_gain = trunc2(base_od_up × (1 + drive_bonus/100))`

### 定数

| 定数名 | 値 | 説明 |
|--------|----|------|
| `ENEMY_OD_RATE_UNIT` | `10000` | legacy od_rate を multiplier へ変換する互換係数 |

### 実装場所

| 処理 | ファイル | 関数 |
|------|----------|------|
| 定数定義 | `src/config/battle-defaults.js` | `ENEMY_OD_RATE_UNIT` |
| ターン状態保持 | `src/contracts/interfaces.js` | `enemyState.odRateByEnemy` |
| 係数解決 | `src/turn/turn-controller.js` | `resolveEnemyOdRateMultiplier()` |
| 補正適用 | `src/turn/turn-controller.js` | `applyOdGaugeFromActions()` |
| UI→エンジン変換 | `ui-next/engine/battle-state-manager.js` | `buildEnemyStateOverrides()` |

### 補足

- 複数敵がいる場合も `enemy[0]` 固定ではなく、target/alive enemy slot ごとに `od_rate` を解決する。
- `AdditionalHitOnBreaking + OverDrivePointUp`（共鳴含む）は、モラル/トリガー経路で一度だけ反映する。OD計算経路との二重加算は行わない。
