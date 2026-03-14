# 実データからのテストケース網羅性分析

**調査日**: 2026-03-08
**テーマ**: 実データからテストケースを洗い出すと膨大になるか？追加すべきテストはどの範囲か？

---

## 結論（先に提示）

> **「全スキル・全パッシブを個別にテスト」しようとすると膨大になる。
> しかし「ゲームメカニクスのカテゴリ」単位でテストするなら追加は50〜80件で管理可能。**
> 現在のテストはメカニクスカバレッジが高いが、一部の条件パターンとエラー系が未テスト。

---

## 実ゲームデータの規模

| データ種別 | 件数 |
|---------|------|
| キャラクター | 59 |
| スタイル | 341 |
| スキル | 693 |
| パッシブ | 740 |
| アクセサリー | 500 |

### パッシブのタイミング分布（全740件）

| タイミング | 件数 | テスト済み |
|-----------|------|----------|
| OnEveryTurn | 290 | ✅ あり |
| OnPlayerTurnStart | 198 | ✅ あり |
| OnFirstBattleStart | 108 | ✅ あり |
| OnBattleStart | 84 | ✅ あり |
| OnEnemyTurnStart | 31 | ✅ あり |
| OnAdditionalTurnStart | 10 | ✅ あり |
| OnOverdriveStart | 9 | ⚠️ 少数 |
| OnEveryTurnIncludeSpecial | 5 | ✅ あり（一部） |
| OnBattleWin | 4 | ✅ あり |
| None | 1 | 🔴 未確認 |

### パッシブの発動条件パターン（全53種類）

実データ中の条件式をパターン化すると 53 種類存在する。
現在のテストがカバーしているパターンと、していないパターンを分類する。

---

## 現在のテスト vs 実データのカバレッジ

### ✅ カバー済みのメカニクスカテゴリ

| カテゴリ | 根拠 |
|---------|------|
| `IsFront()` 条件 | turn-state-transitions.test.js 多数 |
| `DpRate() <= N` 条件 | DP関連テスト複数 |
| `SpecialStatusCountByType(N) > N` | extra turn検証で使用 |
| `Token() >= N` | トークンシステムテスト |
| `MotivationLevel() >= N` | モチベーション関連テスト |
| `FireMarkLevel() >= N` | fire-mark テスト |
| `IsReinforcedMode()` | 手塚強化モードテスト |
| `DpRate() == N && IsFront()` | DP凍結ルールテスト |
| `OnBattleStart` / `OnFirstBattleStart` | 初期パッシブテスト |
| `OnPlayerTurnStart` / `OnPlayerTurnEnd` | ターン境界テスト |
| `OnAdditionalTurnStart` | EXターン開始テスト |
| `OnEnemyTurnStart` | 敵ターン進行テスト |
| `OnBattleWin` | 全敵撃破テスト |
| `CountBC(IsPlayer() && Token() > N) > N` | トークンカウントテスト |
| `CountBC(MotivationLevel() >= N) > N` | モチベーションカウントテスト |
| `Random() < N && IsFront()` | Randomパッシブ（A/S/SS/SSR全種）テスト |
| `ConquestBikeLevel() >= N` | 征服バイクレベルテスト |
| `IsZone(Fire) == N` | Zoneパッシブテスト |
| `IsTerritory(ReviveTerritory) == N` | Territoryパッシブテスト |
| OD開始パッシブ | ODゲージ・開始検証 |

### ⚠️ 未テスト・テスト不足の条件パターン

| 条件パターン | 実データ件数 | 状況 | 優先度 |
|------------|------------|------|--------|
| `Ep() >= N` | 少数 | EP消費スキルのパッシブ発動未テスト | 🟡 Medium |
| `Sp() <= N` / `Sp() >= N && IsFront()` | 複数 | SP低下時パッシブ未テスト | 🟡 Medium |
| `MoraleLevel() >= N` / `MoraleLevel() >= N && IsFront()` | 複数 | モラルパッシブ未テスト | 🟡 Medium |
| `IceMarkLevel() >= N` | 少数 | 氷属性マークパッシブ未テスト（FireMarkはあり） | 🟡 Medium |
| `CountBC(IsPlayer() && IsNatureElement(Fire) == N) >= N` | 少数 | 属性カウント条件未テスト | 🟡 Medium |
| `CountBC(IsPlayer() == N && IsDead() == N && IsBroken() == N) > N` | 少数 | 複合ブレイク状態カウント未テスト | 🟡 Medium |
| `IsFront() == N`（後衛条件） | 少数 | 後衛発動パッシブ未テスト | 🟡 Medium |
| `OnOverdriveStart` タイミング | 9件 | OD開始専用タイミングのテストが少ない | 🟡 Medium |
| `ConsumeSp() <= N && IsAttackNormal() == N` | 少数 | SP消費量条件未テスト | 🟢 Low |
| `OverDriveGauge() < N` | 少数 | ODゲージ量条件未テスト | 🟢 Low |
| `CountBC(IsDead() && IsBroken() && DamageRate() >= N) > N` | 少数 | 複合ブレイク+ダメージレート未テスト | 🟢 Low |
| `PlayedSkillCount(MAikawaSkill54) >= N` | 1件 | 特定スキル使用カウント（キャラ固有）未テスト | 🟢 Low |

### ⚠️ スキル consume_type のカバレッジ

| consume_type | 実データ件数 | テスト状況 |
|-------------|------------|----------|
| `Sp`（標準） | 1,242 | ✅ 充実 |
| `Token` | 5 | ✅ あり（TokenSet系） |
| `Ep` | 2 | 🔴 テストなし |

**EPシステムのスキルが2件存在するが、EP消費スキルの直接テストがない。**

---

## 「全件テスト」をした場合の規模推計

### 推計1: スキル別テスト（非推奨）

693スキル × パターン（3シナリオ想定: 通常/OD中/EX中）= **2,079件**

→ **非現実的。メカニクスカテゴリテストで代替すべき。**

### 推計2: パッシブ条件別テスト（部分的に推奨）

53ユニーク条件パターン × 対象タイミング = 最大 **530件**（組み合わせ）

ただし:
- 多くの条件はタイミングと組み合わせない（片方のみ）
- 実データ上の組み合わせは 740件だが、そのうち意味のある異なる組み合わせは少ない

実際に追加が必要なテスト: **20〜30件**（未テストパターンをカバーするのみ）

### 推計3: メカニクスカテゴリ別テスト（推奨）

| カテゴリ | 追加すべきテスト数 |
|---------|----------------|
| EP消費スキル (Ep consume_type) | 3〜5件 |
| Sp() 条件パッシブ（SP低下時発動） | 3〜5件 |
| MoraleLevel() 条件パッシブ | 3〜5件 |
| IceMarkLevel() 条件パッシブ | 2〜3件 |
| 後衛発動パッシブ（IsFront() == false） | 3〜5件 |
| OnOverdriveStart タイミング詳細 | 5〜8件 |
| 複合CountBC条件 | 5〜8件 |
| 異常系（不正入力・エラーパス） | 10〜15件 |
| **合計** | **34〜54件** |

→ **50〜80件の追加で「膨大」にはならない。管理可能な規模。**

---

## テスト追加の判断基準

「テストを追加すべきか」の判断基準を以下に整理する。

### 追加すべきテスト（高優先度）

**基準**: 実データに存在するが、テストにバグが潜んでも検出できない機能

1. **EPシステム** — 実データに2スキル存在、テスト完全欠如
2. **SP量パッシブ条件** (`Sp() <= N`) — 実データに複数存在、条件評価のバグを検出できない
3. **MoraleLevel() 条件** — 実データに複数存在、モラルシステムのバグ未検出
4. **後衛発動パッシブ** (`IsFront() == false`) — フロント/リア境界のバグを見逃す可能性

### 追加すると有益だが必須ではないテスト（中優先度）

**基準**: 実データに存在するが、既存のシステムテストで間接的に確認されている

5. **IceMarkLevel()** — FireMarkのテストがあるが、Ice固有の動作差異がある可能性
6. **OnOverdriveStart** 詳細 — ODテストはあるが、OD開始時点のパッシブ解決順序が未検証
7. **複合CountBC条件** — 条件の組み合わせ評価の境界値

### 追加不要（低優先度）

**基準**: 実データ上の件数が少なく、かつ類似メカニクスで間接的にカバーされている

8. `PlayedSkillCount(MAikawaSkill54)` — キャラ固有スキルカウント（1件のみ）
9. `ConsumeSp() <= N` — 標準攻撃の条件（他のSP条件と本質的に同一）
10. `OverDriveGauge() < N` — ODゲージ量条件（ODゲージテストで間接カバー）

---

## 現実的な追加計画

### フェーズ1: Critical 不足分（推定 2〜3日）

```javascript
// tests/game-mechanics-missing.test.js (新規ファイル)

test('EP consume skill deducts EP and triggers passive on EP condition', () => { ... });

test('Sp() <= N passive activates when SP falls below threshold', () => { ... });
test('Sp() >= N && IsFront() passive activates when SP is high and frontline', () => { ... });

test('MoraleLevel() >= N passive activates when morale reaches threshold', () => { ... });
test('MoraleLevel() >= N && IsFront() checks both morale and position', () => { ... });

test('IsFront() == false passive activates for backline members', () => { ... });
test('IsFront() == false does not activate for frontline members', () => { ... });
```

**追加テスト数**: 10〜15件 / 1ファイル

### フェーズ2: 条件パターン補完（推定 3〜4日）

```javascript
// tests/passive-conditions.test.js (新規ファイル)

test('IceMarkLevel() >= N passive triggers with ice mark accumulated', () => { ... });

test('OnOverdriveStart timing fires exactly when OD begins', () => { ... });
test('OnOverdriveStart passive applies before first OD action', () => { ... });

test('CountBC(IsDead == 0 && IsBroken == 1) counts surviving broken enemies', () => { ... });
test('CountBC(IsPlayer && IsNatureElement(Fire)) counts fire-element allies', () => { ... });
```

**追加テスト数**: 15〜25件 / 1ファイル

### フェーズ3: 異常系テスト（推定 2〜3日）

```javascript
// tests/error-cases.test.js (新規ファイル)

test('preview before initialize throws or shows error', () => { ... });
test('commit without preview throws or shows error', () => { ... });
test('invalid styleId in initializeBattle is handled gracefully', () => { ... });
test('CSV with malformed turn plan shows error without crashing', () => { ... });
```

**追加テスト数**: 10〜15件 / 1ファイル

---

## 「膨大にならないか」への回答

### テスト数の上限試算

| テスト戦略 | テスト数 | 現実性 |
|-----------|--------|--------|
| スキル全件テスト | 693 × 3 = 2,079件 | 🔴 非現実的 |
| パッシブ全条件 × 全タイミング | 53 × 10 = 530件 | 🟡 多すぎる |
| 未テストのメカニクスカテゴリのみ | **34〜54件** | ✅ 管理可能 |
| 現在のテスト数 | 274件 | 基準値 |

### 推奨スタンス

```
「同じカテゴリのスキルを1つテストすれば、同カテゴリは全件テストしなくて良い」
```

- `IsFront()` 条件を持つパッシブは 290件存在するが、テストは 3〜5件で十分
- `OnEveryTurn` タイミングを持つパッシブは 198件存在するが、テストは 10件程度で十分
- スキル個別テストではなく、**consume_type・target_type・timing の組み合わせカテゴリ**をテストすれば良い

### 最終推計

```
現在: 274テスト
フェーズ1追加: +15件 → 289件
フェーズ2追加: +25件 → 314件
フェーズ3追加: +15件 → 329件

最終: 約330テスト（現状比 +20%）
```

**「膨大」にはならない。**
実データ693スキル・740パッシブを持っていても、メカニクスカテゴリ単位のテストで
現状の274件から330件程度への増加に抑えられる。

---

## まとめ: 2つの疑問への回答

| 疑問 | 回答 |
|------|------|
| 実データのシュリンク版を作れば早くなるか？ | **△ 一定効果あり（33〜66%削減推計）。ただし主因はJSDOM処理コストなので、データ削減だけでは上限がある。`maxCandidates`オプション追加が最小工数で最速。** 詳細 → [07_test_data_shrink_study.md](07_test_data_shrink_study.md) |
| 実データからテストケースを網羅すると膨大になるか？ | **「スキル/パッシブ全件」は膨大（2000+件）。「未テストのメカニクスカテゴリ」のみなら34〜54件の追加で管理可能。現在のテストはメカニクスカバレッジが高く、追加は限定的で良い。** |
