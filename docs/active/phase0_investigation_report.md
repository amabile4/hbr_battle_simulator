# フェーズ0 調査報告: passive timing 監査（2026-03-22）

> **ステータス**: 📦 スナップショット | 📅 作成: 2026-03-22
>
> `wip/passive-timing-audit-20260321` ブランチでのフェーズ0調査結果。変更しない。
>
> **上位 WBS**: [`docs/active/restoration_wbs.md`](restoration_wbs.md) — フェーズ0 成果物

---

## 1. HealSP 1.5倍バグ: 修正済み確認

### 問題の経緯

`HIGH_BOOST_SCALED_DP_SKILL_TYPES` に `HealSP` が含まれているという疑念があった。

### 調査結果

`src/turn/turn-controller.js` の定数定義:

```javascript
const HIGH_BOOST_SCALED_DP_SKILL_TYPES = new Set(['HealDpRate', 'RegenerationDp']);
```

`HealSP` 処理（行 3318、7774）はこのセットを参照しておらず、スケール経由しない。**修正済み・問題なし**。

---

## 2. checkpoint → wip 差分サマリー

### ブランチ情報

- `checkpoint` タグ: コミット `b6295c2`（クリーンな起点）
- `feature/engine-ruby-perfume-highboost-rebuild`: `b6295c2` と同一コミット（Phase 3 素材用）

### wip ブランチで追加された主要変更

| 変更 | コミット | 内容 |
|------|---------|------|
| HighBoost定数・関数群追加 | `471a928` 以降 | `HIGH_BOOST_SCALED_DP_SKILL_TYPES` 等の追加 |
| `applyIntrinsicMarkTurnStartRecovery` 削除 | `471a928` | `applyInitialPassiveState` から誤って欠落 |
| `applyInitialTurnStartPassiveState` 復活 | `b09946a` | turn-start passives は戻したが mark recovery は戻さず |
| テスト合わせ込み | `b250136` | 誤った期待値に合わせたテスト修正（回帰バグ） |
| `character-style.js` shortName修正 | 別コミット | `resolveShortCharacterName` 使用に修正済み |
| `manual-break-presentation.js` shortName修正 | 別コミット | 修正済み |

### `applyIntrinsicMarkTurnStartRecovery` 欠落の経緯

コミット `471a928` での passive timing リファクタ中に、`applyBattleStartPassiveState` を切り出す際に mark recovery の呼び出し行が失われた。その後 `b09946a` で `applyInitialTurnStartPassiveState` を内部関数として復活させたが、mark recovery は再追加されなかった。

---

## 3. フェーズ1で修正した問題

### 症状

バトル開始時（T1描画時点）でマーク6段階保持の前衛メンバーの SP が -1 された状態で表示される。

### 根本原因

`applyInitialPassiveState` から `applyIntrinsicMarkTurnStartRecovery(state.party)` の呼び出しが欠落していた。

### 正しい仕様

`applyInitialPassiveState` は以下をすべて実行する（順序重要）:

1. `initializeIntrinsicMarkStatesFromParty(state.party)`
2. `applyPassiveTimingInternal(state, BATTLE_START_PASSIVE_TIMINGS)`（OnBattleStart / OnFirstBattleStart）
3. **`applyIntrinsicMarkTurnStartRecovery(state.party)`**
4. `applyPassiveTimingInternal(state, TURN_START_PASSIVE_TIMINGS)`（OnEveryTurn / OnPlayerTurnStart）

### フェーズ1での修正内容

- `src/turn/turn-controller.js`: `applyInitialPassiveState` 書き直し、`INITIAL_TURN_PASSIVE_TIMINGS` 定数削除、`applyBattleStartPassiveState` 関数削除（インライン化）
- `tests/turn-state-transitions.test.js`: fire mark / thunder mark / six-fire 3テストの期待値修正
- `docs/active/passive_timing_reference.md`: 誤記（battle-start 専用）修正、シーケンス図更新

---

## 4. 既知の未修正バグ（Phase 2 以降）

現時点で把握している未修正の問題:

| バグ | 影響 | フェーズ |
|------|------|---------|
| HighBoost passive の倍率適用範囲 | 一部スキルタイプで倍率が適用されない可能性 | Phase 3 |
| Ruby/Perfume 実装 | feature ブランチに未実装 | Phase 3 |

---

## 5. テスト状態（フェーズ1完了時点）

| 状態 | 件数 |
|------|------|
| PASS | 712 |
| FAIL（archive/ 旧テスト・既存） | 2 |
| 合計 | 714 |

archive/ の2件（`control-manager.test.js`、`skill-database.test.js`）は旧実装の残骸であり、修正対象外。
