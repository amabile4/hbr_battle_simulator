# フェーズ1実装プラン: applyIntrinsicMarkTurnStartRecovery 復元 + 調査結果資料化

> **上位 WBS**: [`docs/active/restoration_wbs.md`](restoration_wbs.md) — フェーズ1 実装プラン
> **ステータス**: ✅ 完了（2026-03-22）— `node --test` 712 PASS
>
> このファイルは新セッション用の完全な引き継ぎ資料です。実装済み。

---

## 背景・経緯

### 何が起きたか

`wip/passive-timing-audit-20260321` ブランチで passive timing のリファクタ中（コミット `471a928`）に `applyIntrinsicMarkTurnStartRecovery(state.party)` の呼び出しが `applyInitialPassiveState` から削除された。

これにより、バトル開始時の初期化でマーク6段階SP+1が発火しなくなり、T1 が表示された時点でマーク6保持者の SP が -1 された誤った状態で描画される。

コミット `b09946a` で `applyInitialTurnStartPassiveState` を復活させたが、その際にマーク回復の呼び出しは復元されなかった。コミット `b250136` でテストを「通るように修正」したが、これは合わせ込み（誤った期待値に合わせた）だった。

### 正しい仕様（ユーザー確認済み）

バトル開始初期化（`applyInitialPassiveState`）は以下をすべて実行する：
1. `initializeIntrinsicMarkStatesFromParty` - マーク初期化
2. battle-start passives（OnBattleStart, OnFirstBattleStart）
3. **`applyIntrinsicMarkTurnStartRecovery`** ← 今回復元対象
4. turn-start passives（OnEveryTurn, OnPlayerTurnStart）

T1が描画・入力可能になった時点で、上記すべてが反映されていなければならない。

---

## フェーズ0調査結果サマリー

### 正しい状態（修正済み）

| 項目 | 状況 |
|------|------|
| HealSP 1.5倍問題 | **修正済み**。`HIGH_BOOST_SCALED_DP_SKILL_TYPES = Set(['HealDpRate', 'RegenerationDp'])` のみ。HealSP処理（行3318、7774）はスケール経由しない |
| テスト | **712/714 PASS**（失敗2件は archive/ 旧テスト） |
| `character-style.js` shortName | 修正済み（resolveShortCharacterName 使用） |
| `manual-break-presentation.js` shortName | 修正済み |
| HighBoost 定数・関数群 | 正常追加済み |

### 今回修正する問題

`applyIntrinsicMarkTurnStartRecovery` が `applyInitialPassiveState` から欠落
→ マーク6保持の前衛メンバーの初期SP値が -1 された状態でT1表示

### feature/engine-ruby-perfume-highboost-rebuild ブランチ

checkpoint タグ（`b6295c2`）と同一コミット = クリーンなスタート地点。
ハイブースト/ルビーパヒューム実装は入っていない（Phase 3 の素材）。

---

## 修正対象ファイルと変更内容

### `src/turn/turn-controller.js`

**現在の `applyInitialPassiveState`（行 8965〜8988）:**

```javascript
function applyBattleStartPassiveState(state) {
  const battleStartResult = applyPassiveTimingInternal(state, BATTLE_START_PASSIVE_TIMINGS);
  state.turnState.passiveEventsLastApplied = [...battleStartResult.passiveEvents];
  return battleStartResult;
}

export function applyInitialPassiveState(state) {
  if (!state || !Array.isArray(state.party) || !state.turnState) {
    return state;
  }

  function applyInitialTurnStartPassiveState(state) {
  const turnStartResult = applyPassiveTimingInternal(state, INITIAL_TURN_PASSIVE_TIMINGS);
  state.turnState.passiveEventsLastApplied = [
    ...(state.turnState.passiveEventsLastApplied ?? []),
    ...turnStartResult.passiveEvents,
  ];
  return turnStartResult;
}
  initializeIntrinsicMarkStatesFromParty(state.party);
  applyBattleStartPassiveState(state);
  applyInitialTurnStartPassiveState(state);
  return state;
}
```

**修正後:**

```javascript
export function applyInitialPassiveState(state) {
  if (!state || !Array.isArray(state.party) || !state.turnState) {
    return state;
  }
  initializeIntrinsicMarkStatesFromParty(state.party);
  const battleStartResult = applyPassiveTimingInternal(state, BATTLE_START_PASSIVE_TIMINGS);
  state.turnState.passiveEventsLastApplied = [...battleStartResult.passiveEvents];
  applyIntrinsicMarkTurnStartRecovery(state.party);
  const turnStartResult = applyPassiveTimingInternal(state, TURN_START_PASSIVE_TIMINGS);
  state.turnState.passiveEventsLastApplied = [
    ...state.turnState.passiveEventsLastApplied,
    ...turnStartResult.passiveEvents,
  ];
  return state;
}
```

あわせて削除：
- 行 202: `INITIAL_TURN_PASSIVE_TIMINGS` 定数（`TURN_START_PASSIVE_TIMINGS` と同値のため不要）
- 行 8965〜8969: `applyBattleStartPassiveState` 関数（インライン化のため不要）

### `tests/turn-state-transitions.test.js`

**テスト1: fire mark intrinsic level 6（行 3257〜3289）**

- テスト名: `'...at true turn start'` → `'...at battle start and every turn start'`
- `applyInitialPassiveState` 後: `[0, 0, 0, 0, 0, 0]` → `[1, 1, 1, 0, 0, 0]`
- `commitTurn` 後: `[3, 3, 3, 2, 2, 2]` → `[4, 4, 4, 2, 2, 2]`

**テスト2: thunder mark intrinsic level 6（行 3370〜3402）**

- fire mark と同様のパターンで修正

**テスト3: six-fire real-data（行 3291〜3316）**

- テスト名: `'...turn-start recovery begins on the first committed turn'` → `'...includes fire mark level 6 recovery at battle start'`
- `applyInitialPassiveState` 後: `[12, 11, 14, 11, 11, 11]` → `[13, 12, 15, 11, 11, 11]`
- `commitTurn` 後: `[16, 14, 20, 13, 13, 13]` → **`node --test` 実行後に確認して修正**
  （前衛3人に mark recovery +1 が加わる想定 = `[17, 15, 21, 13, 13, 13]` 見込み）
- `猛火の進撃` コメントは変更不要（limit=1 でinitに発火済み、T1では不発火、は同じ）

### `docs/active/passive_timing_reference.md`

- **行 9**: 「`applyInitialPassiveState()` は `OnBattleStart` / `OnFirstBattleStart` 専用に整理し、T1 の turn-start は `applyRecoveryPipeline()` か明示的な `applyPassiveTiming()` でのみ流します」→ 削除
- **行 19〜20**（OnEveryTurn, OnPlayerTurnStart の評価入口）: `applyInitialPassiveState()` を追記
- **行 92**: 「`applyInitialPassiveState()` は battle-start 専用です。...初期化時には流さず true turn-start でだけ反映します」→ 「`applyInitialPassiveState()` は battle-start に加え、intrinsic mark Lv6 SP+1 と OnEveryTurn/OnPlayerTurnStart も初期化時に実行します」に修正
- **シーケンス図（行 40〜42）**: Init セクションに mark recovery と turn-start passives を追加

### `docs/active/phase0_investigation_report.md`（新規作成）

フェーズ0調査の記録：
- HealSP 1.5倍バグ修正済み確認
- checkpoint→wip 差分サマリー（HighBoost追加、`applyIntrinsicMarkTurnStartRecovery` 欠落の経緯）
- feature ブランチ現状（checkpoint と同一コミット）
- 既知の未修正バグ（Phase 2以降）

---

## 実装手順（新セッション向け）

0. このプランを `docs/active/phase1_plan.md` にコピー保存
1. `src/turn/turn-controller.js` を修正（`applyInitialPassiveState` 書き直し、`INITIAL_TURN_PASSIVE_TIMINGS` と `applyBattleStartPassiveState` 削除）
2. `node --test` を実行して失敗テストを確認
3. fire/thunder/six-fire の 3 テストの期待値を修正（合わせ込みではなく上記仕様に基づく修正）
4. `node --test` で全件 PASS 確認
5. `docs/active/passive_timing_reference.md` の誤記修正
6. `docs/active/phase0_investigation_report.md` 新規作成

---

## 制約（重要）

- テストを通すための合わせ込み修正は禁止
- six-fire の commitTurn 後期待値は `node --test` 実行結果で確認してから修正
- docs の更新は実装とセットで行う（CLAUDE.md 規約）
- `docs/README.md` に従いドキュメント管理ルールを守る
