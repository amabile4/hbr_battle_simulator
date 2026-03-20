# UI Next Manual Break / Session Snapshot 実装タスクリスト

> **ステータス**: ✅ 完了 | 📅 開始: 2026-03-20 | ✅ 完了: 2026-03-20

## 目的

- `ui-next` で「この行動で敵 N がブレイクした」を lightweight record 正本で保存できるようにする
- `DownTurn` を direct 入力させず、break 起点 passive を含めて engine 側で自然に派生させる
- 現在の setup / simulator settings / replay script を JSON で保存・復元できるようにする
- 将来の `PRI-018` に備えて `validationPolicy` の箱だけ先に固定し、save schema を安定化させる

## 完了した項目

- [x] `ReplayTurn.overrideEntries` に `ActionOutcomeOverrides` を追加した
- [x] manual outcome の初回対象を `Break` のみに固定した
- [x] `ui-next` 各行動行で敵 chip 複数選択による manual break attribution UI を追加した
- [x] committed row でも manual break attribution を編集でき、変更時はその turn から再計算されるようにした
- [x] manual break UI を常設 picker から `ブレイク` ボタン起点のフローティング editor に置き換えた
- [x] 行上には `actor→enemy ブレイク` の chip 群を表示し、actor 名は `名 / 愛称 / フルネーム` の候補から最短のものを使うようにした
- [x] shared runtime / replay 再生で `manualBreakEnemyIndexes` と `breakHitCount` を action context に注入した
- [x] `DownTurn` を保存せず、manual break から `Break + DownTurn + breakHitCount` を派生させるようにした
- [x] `SessionSnapshotV1` を導入し、`setup / simulatorSettings / validationPolicy / replayScript` を JSON round-trip できるようにした
- [x] `validationPolicy` を導入し、既定値をすべて permissive (`true`) に固定した

## 実装メモ

### Record / replay contract

- `ActionOutcomeOverrides.payload` は次の形で保存する

```json
[
  { "position": 0, "outcome": "Break", "enemyIndexes": [0, 2] }
]
```

- `DownTurn` は保存値ではなく、replay 時に action に注入された manual break から派生させる

### UI / engine 境界

- `TurnRowController` は manual break の draft を partyIndex 単位で保持する
- manual break UI は右側ボタン群の `ブレイク` ボタンでのみ開き、行上の常設表示は `actor→enemy ブレイク` chip 群に限定する
- `TurnAreaController` は row draft を `TurnEngineManager.buildInputRowSnapshot()` と `commitNextTurn()` へ渡すだけに留める
- `TurnEngineManager` は replay / recalc orchestration を担い、action dict に `manualBreakEnemyIndexes` と `breakHitCount` を materialize する
- 実際の `Break + DownTurn` 付与と break 起点 passive 発火は shared runtime (`turn-controller`) 側で処理する

### SessionSnapshotV1

- 保存対象:
  - `version`
  - `setup`
  - `simulatorSettings`
  - `validationPolicy`
  - `replayScript`
- 既定の `validationPolicy`
  - `allowInsufficientSp: true`
  - `allowInsufficientOd: true`
  - `allowUseCountOverflow: true`

## 検証

- `node --test tests/ui-next-session-snapshot.test.js`
- `node --test tests/ui-next-initial-setup.test.js`
- `node --test tests/ui-next-turn-engine-manager.test.js`
- `node --test tests/ui-next-turn-ui.test.js`
- 実装完了時点で `npm test` を実行し、非 E2E 全体 green を確認する
