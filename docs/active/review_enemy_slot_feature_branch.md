# feature/engine-summon-enemy-slot ブランチレビュー

> **ステータス**: ✅ 完了  
> **最終更新**: 2026-04-10  
> **対象**: `089131c` (origin/main) → `177ab71` (feature/engine-summon-enemy-slot)  
> **レビュー観点**: 敵スロット化の正しさ、インデックス管理、スロット有効性判定  
> **レビュー日**: 2026-04-10  
> **テスト結果**: 全 920 ユニットテスト PASS  
> **変更規模**: +6,277 / -1,109 行（47 ファイル）

---

## 1. 変更概要

### 1.1 新規ファイル
| ファイル | 役割 |
|---------|------|
| `src/domain/enemy-status.js` | 敵ステータス定数の正規化・永続判定のドメイン関数 |
| `src/turn/action-execution-order.js` | アクション実行順序のソート（非ダメージ→ダメージ、position順） |
| `src/data/enemy-sample-presets.js` | 召喚用サンプル敵プリセット定義 |

### 1.2 主要変更ファイル
| ファイル | 変更内容 |
|---------|---------|
| `src/turn/turn-controller.js` | スロット単位の生死判定・OD補正の敵別化・SuperBreak Before/After timing |
| `src/turn/turn-operations.js` | `SUMMON_ENEMY` オペレーション実装・スロット割り当てロジック |
| `ui-next/engine/turn-engine-manager.js` | シナリオターンの敵オーバーライドスナップショット管理 |
| `ui-next/components/turn-row.js` | 召喚UIエディタ・Kill UIエディタ追加 |
| `ui-next/utils/enemy-status-display.js` | SuperBreak/SuperBreakDown 正規名への統一 |

---

## 2. 敵スロット化の設計レビュー

### 2.1 スロットモデル

**結論: 正しく実装されている**

敵は `enemyCount` による「現在の最大スロット数」と、各スロットの `Dead` ステータスの有無で有効性を管理する。従来の「敵の数 = 生存数」という暗黙モデルから、「スロット数 = 枠の総数、生死は別管理」に正しく移行されている。

### 2.2 コア関数群（turn-controller.js）

以下の関数が `export` され、エンジン全体で共有される:

| 関数 | 役割 | スロット有効性の考慮 |
|------|------|-------------------|
| `isEnemyAlive(turnState, targetIndex, enemyCountOverride)` | スロット範囲内かつ Dead でないか判定 | **OK** - 範囲外は false |
| `isEnemyDead(turnState, targetIndex, enemyCountOverride)` | Dead ステータスの有無 | **OK** - 範囲外は false |
| `isEnemyBroken(turnState, targetIndex, enemyCountOverride)` | Break かつ alive | **OK** - dead なら false |
| `countAliveEnemies(turnState, enemyCountOverride)` | 生存敵数カウント | **OK** - Dead スロットを除外 |
| `getEnemyState(turnState)` | 敵状態の正規化取得 | **OK** - export 化済み |

**重要な設計ポイント**:
- `enemyCountOverride` パラメータにより、Summon 前後の敵数不整合を安全にハンドリング可能
- `resolveEffectiveEnemyCount()` で null/undefined フォールバックを一元管理

### 2.3 インデックスの正しさ

#### スロット割り当て（resolveSummonEnemySlotIndex）
```
1. currentEnemyCount < MAX_ENEMY_COUNT → 末尾に新スロット追加
2. 上限到達時 → 最小インデックスの Dead スロットを再利用
3. 空きなし → null を返してスキップ
```
**評価: 正しい**。3段階のフォールバックで安全にスロットを決定。

#### Summon 時のスナップショット更新（applySummonEnemyToState）
- 対象スロットの名前・耐性・破壊率上限・ODレート・吸収属性を上書き
- 対象スロットの Break 状態をクリア
- 対象スロットの Dead ステータスを除去（+ 全ステータス除去）
- `enemyCount` は `Math.max(current, targetIndex + 1)` で自動拡張

**評価: 正しい**。Dead スロット再利用時に前の敵の残骸ステータスが残る問題を正しく処理している。

#### OD ゲージ計算の敵別化
- `resolveEnemyOdRateMultiplier(turnState, targetEnemyIndex)` — 従来の `index 0` 固定から敵別に変更
- `analyzeEnemiesEligibleForOdGain` — Dead スロットをスキップ
- `computeOdGaugeGainPercentBySkill` — 各対象敵の odRate を個別に適用

**評価: 正しい**。敵別 OD レートの適用と Dead スキップが整合している。

### 2.4 生死判定の網羅性

以下の箇所で「単なる敵数」ではなく「スロットの有効性」を正しく判定しているか:

| 処理 | Dead 考慮 | 備考 |
|------|----------|------|
| OD ゲージ計算（全体攻撃） | **OK** | `isEnemyAlive` で Dead スキップ |
| OD ゲージ計算（単体攻撃） | **OK** | ターゲットの alive チェック追加 |
| 追撃 OD 計算 | **OK** | `pursuedTargetEnemyIndex` を追加し alive 確認 |
| 敵条件関数 `IsBroken/IsDead/BreakDownTurn` | **OK** | Dead 時は Broken=0, DownTurn=0 を返す |
| `IsHitWeak` 条件 | **OK** | Dead 時は 0 |
| `SpecialStatusCountByType` | **OK** | Dead 時は 0 |
| `CountBC` の `IsPlayer()==0` ループ | **OK** | Dead 非カウント（IsDead 検査時は例外許可） |
| `getAliveEnemyTargetIndexes` | **OK** | `isEnemyAlive` + enemyCountOverride 対応 |
| `getFirstAliveEnemyTargetIndex` | **OK** | preferred → alive 順 |
| Break 帰属の正規化 | **OK** | alive フィルタ済みの敵のみ対象 |
| Kill 帰属の正規化 | **OK** | alive チェック |
| FollowUp ターゲット | **OK** | alive チェック追加 |
| `allEnemiesDefeated` フラグ | **OK** | `countAliveEnemies === 0` で判定 |
| `#patchNextStateForKills` | **OK** | Kill 後の enemyCount 削減ではなく alive カウントで判定 |
| `applyEnemyBreakEffectsFromActions` | **OK** | alive 前提の Break 適用 |
| `applyManualEnemyBreak` | **OK** | alive チェック |
| `applyManualEnemyKill` | **OK** | alive チェック |

---

## 3. 副次的な改善

### 3.1 ステータス名の正規化
- `StrongBreak` → `SuperBreak`、`SuperDown` → `SuperBreakDown` に統一
- `normalizeEnemyStatusType()` でレガシー名を透過的に変換
- `isPersistentEnemyStatusType()` で永続判定を共通化

**評価: 良い改善**。散在していた文字列比較を集約し、レガシーデータとの互換性も維持。

### 3.2 SuperBreak Before/After timing
- `resolveSpecialBreakHitTiming(part)` で hits の type から Before/After を判定
- Before: アクション前の状態で Break 済みかを確認
- After: 同一アクションの手動 Break を先に適用してから SuperBreak を判定

**評価: 正しい**。同一アクション内での Break → SuperBreak 昇格フローが仕様通り。

### 3.3 アクション実行順序の共通化
- `action-execution-order.js` に抽出し、エンジン層と UI 層で共有
- 非ダメージ→ダメージ、同 phase 内は position 昇順

### 3.4 UI 側のスロット対応
- `TurnEngineManager` がシナリオターン敵オーバーライドをスナップショットとして永続化
- リプレイスクリプト reload 時もスナップショットから復元
- `#normalizeActionOutcomeOverridesForState` で alive フィルタ
- `#normalizeSingleTargetEnemyIndex` で Dead 対象を回避し alive な敵に振り替え

---

## 4. 指摘事項

### 4.1 フォローアップ対応結果（2026-04-10）

- M1 は対応済み。`SUMMON_ENEMY` が空きスロットなしで無視される場合、engine warning を input row と committed row / replay diagnostics の両方へ流すよう修正した
- M2 は対応済み。`applySummonEnemyToState()` の target 一致 status 除去を単一 filter に整理し、意図をコメントで補強した
- M3 は未対応のまま維持。防御的コーディングとして妥当で、挙動差もないため変更不要と判断した

### 4.2 軽微（マージブロッカーではない）

| # | 箇所 | 内容 | 重大度 | 状態 |
|---|------|------|--------|------|
| M1 | `turn-operations.js:resolveSummonEnemySlotIndex` | `MAX_ENEMY_COUNT` 到達かつ全スロット alive 時、`SUMMON_ENEMY` が warning を出して UI へ可視化されるよう修正 | 低 | ✅ 2026-04-10 対応済み |
| M2 | `turn-operations.js:applySummonEnemyToState` | targetEnemyIndex 一致 status を単一 filter で除去する形に整理し、冗長条件を解消 | 情報 | ✅ 2026-04-10 対応済み |
| M3 | `turn-controller.js:getDeadEnemyTargetIndexesWithOverride` | `enemyState.enemyCount` と `effectiveEnemyCount` の二重チェックはそのまま維持。防御的コーディングとして妥当 | 情報 | 維持 |

### 4.3 なし（ブロッカー・重大な問題）

スロットインデックスの範囲チェック、Dead/Alive 判定の一貫性、Summon 時のスナップショット管理など、核となるロジックに問題は見当たらない。

---

## 5. テストカバレッジ

### 5.1 ユニットテスト
| テストファイル | 追加テスト数 | カバー範囲 |
|---------------|------------|-----------|
| `turn-operations.test.js` | +3 | Summon スロット割り当て、Dead スロット再利用、stale enemyCount 保全 |
| `turn-state-transitions.test.js` | +6 | SuperBreak After/Before timing、同一アクション Break→SuperBreak、Kill 後の alive 判定 |
| `ui-next-turn-engine-manager.test.js` | +8 | Summon コミット/リロード、敵スナップショット永続化、重複 Break 除去、Kill オーバーライド |
| `ui-next-turn-ui.test.js` | 多数 | Summon UI、Kill UI、EnemyDetail popup のスロット表示 |

### 5.2 E2E テスト（Playwright）
| テストファイル | 内容 |
|---------------|------|
| `turn-row-summon-enemy.spec.js` (新規) | Summon UI の表示・操作 |
| `turn-row-kill-enemy.spec.js` (新規) | Kill UI の表示・操作 |
| `superbreak-hefty-guardian.spec.js` (新規) | ヘフティーガーディアン SuperBreak E2E |
| `turn-edit-manual-break.spec.js` (更新) | 手動 Break の編集フロー |

---

## 6. マージ判定

### 判定: **マージ可能**

**理由**:
1. **スロットインデックスの正しさ**: 全ての敵参照箇所で `isEnemyAlive` / `isEnemyDead` による有効性チェックが行われており、「敵数 = 生存数」の旧前提に依存するコードは残っていない
2. **Dead スロットの再利用**: Summon 時に Dead スロットを正しく検出・クリア・上書きしており、前の敵の状態が漏れ出す問題がない
3. **後方互換**: `StrongBreak` → `SuperBreak` 等のレガシー名は `normalizeEnemyStatusType` で透過変換されるため、既存リプレイデータが壊れない
4. **テストカバレッジ**: 920 テスト全 PASS。Summon/Kill/SuperBreak の核心パスに対してユニット + E2E テストが追加されている
5. **UI 側の整合**: `TurnEngineManager` が敵スナップショットを overrideEntries として永続化し、リロード時も同一状態を再現できる

### 推奨アクション
- M1 / M2 は 2026-04-10 に対応済み
- M3 は現状の防御的実装を維持し、将来の整理対象として扱う
