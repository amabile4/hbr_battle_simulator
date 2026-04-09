# 軽量 Record / Replay / Edit 設計案

> **ステータス**: 🟢 進行中 | 📅 開始: 2026-03-14 | 🔄 最終更新: 2026-04-10
>
> **前提調査**: [`../20260314_record_replay_edit_investigation/README.md`](../20260314_record_replay_edit_investigation/README.md)

## 目的

- 編集の正本を「軽い replay script」に戻す
- `record` は観測ログとして残しつつ、編集対象から外す
- 「ターンを少し編集したら、そのターン以降を素直に再計算する」というユーザー認識と実装を一致させる
- swap 操作そのものではなく、「Commit 時点の Position」と「その Position で使った Skill」を一体で保存する

## 実装反映メモ（2026-04-10 時点）

- `ui-next` は `LightweightReplayScript` を正本とし、`TurnEngineManager` が `buildTurnEditDraft()` / `replaceCommittedTurn()` / `getReplayDiagnostics()` を持つ構成へ更新済み
- committed row の編集は inline mutate ではなく、draft をまとめて置換して turn 1 から best-effort replay する方式へ移行済み
- warning は replay diagnostics にのみ保持し、session snapshot には保存しない
- soft warning として実装済み: SP不足継続、OD不足継続、使用回数超過、skill condition 不一致、未知 operation 無視、単体ブレイク target 正規化、召喚空きスロットなし warning
- hard error は replay を停止し、対象 row に error 表示を出す
- `overrideEntries` は manual state だけでなく turn-bound の replay snapshot 正本としても使う
  - `ActionOutcomeOverrides` で manual break / kill attribution を保持する
  - `FollowUpOverrides` で follow-up 対象補正を保持する
  - `EnemyCount` / `EnemyNames` / `EnemyDamageRates` / `EnemyDestructionRates` / `EnemyDestructionRateCaps` / `EnemyOdRates` / `EnemyAbsorbElements` / `EnemyBreakStates` / `EnemyStatuses` で summon 後の enemy slot snapshot を保持する
- `operations` には `ActivateKishinka` / `ActivateMakaiKihei` / `ActivatePreemptiveOd` / `ReserveInterruptOd` に加えて `SummonEnemy` を実装済み
- stale special turn の圧縮は safe subset のみ実装済み
  - 直前 turn の再計算結果で OD / EX 継続が確実に消えた場合だけ後続 special turn を削除
  - break 継続や複合 override を跨ぐケースは warning に寄せて温存する

## Session JSON の実装上の扱い（2026-03-31 時点）

- 読み込みは `normalizeSessionSnapshot()` の既知フィールドのみを採用する
  - `setup`
  - `simulatorSettings`
  - `validationPolicy`
  - `replayScript`
- `record` / `computedRecords` 相当の実行結果は保存物に含まれていても読み込みには使わない
- セッション保存時は `decorateSessionSnapshotForHumans()` により目視確認向けの補助情報を付与する
  - `styleName` / `characterName` / `skillName`
  - `spAtTurnStart` / `spAtActionStart`
  - `info.spAtTurnStartByStyleId` / `info.spAtActionStartByStyleId`
- これら補助情報は UI で JSON を目視するときの参照用であり、読み込み処理では無視される

## まず結論

`positionsAtCommit` と `actionsByPosition` は、編集正本としては分けない方がよい。

理由:

1. 位置だけ編集して skill owner がずれる事故を防ぎたい
2. style と skill は実質不可分である
3. ユーザーが編集したい単位は「その slot にいた style が、その slot でこの skill を使った」である

したがって、各ターンは「6 slot の配列 1 本」で持つ。

## ユーザー認識として採用するモデル

ユーザーが見たい概念はこれでよい。

```text
TurnAction = {
  turn,
  actor,
  position,
  skill,
  target
}
```

ただし実際の保存形は、`turn` を親に持ち、その内側に 6 slot の配列を置く。
`turn` を 6 回繰り返して保存しない。

## 設計原則

1. 正本は lightweight replay script とする
2. `record` は再計算で常に再生成できる derived data とする
3. 各ターンは「6 slot の並び」と「その slot の skill / target」を同じ構造体に入れる
4. 手動状態注入は例外扱いにし、通常ターン保存とは別枠の `overrideEntries[]` に限定する
5. 再計算は重くてよい。保存と編集は軽くする

## 何を捨てるか

通常の保存・編集対象からは、以下を外す。

- `snapBefore`
- `snapAfter`
- `effectSnapshots`
- action ごとの resource change 集計
- `stateSnapshot`
- 各ターンの自動 `setupDelta`
- `swapEvents`
- `turnPlanComputedRecords`

これらは必要なら `record` 側で再生成する。

## 新しい正本モデル

### 1. 全体

```text
ReplayScript = {
  version,
  setup,
  turns
}
```

### 2. 初期条件

`setup` は battle 全体で 1 回だけ持つ。

```text
ReplaySetup = {
  styleIds[6],
  supportStyleIdsByPartyIndex?,
  skillSetsByPartyIndex?,
  limitBreakLevelsByPartyIndex?,
  initialOdGauge?,
  setupEntries?
}
```

ここには「戦闘開始前にユーザーが明示的に決めた条件」だけを置く。
各ターンごとに自動で複製しない。

実装上の重要方針:

- `styleIds[6]` のような battle 基本構成は stable core として持つ
- 将来増減する setup 状態は、固定 key を増やし続けるのではなく `setupEntries[]` に積む
- `setupEntries[]` は typed envelope とする

```text
SetupEntry = {
  type,
  payload?
}
```

known setup entry の例:

- `InitialMotivationByPartyIndex`
- `InitialDpStateByPartyIndex`
- `InitialBreakByPartyIndex`
- `TokenStateByPartyIndex`
- `MoraleStateByPartyIndex`
- `MotivationStateByPartyIndex`
- `MarkStateByPartyIndex`
- `StatusEffectsByPartyIndex`

### 3. 各ターン

```text
ReplayTurn = {
  turn,
  slots[6],
  operations?,
  note?,
  overrideEntries?
}
```

### 4. 各 slot

```text
TurnSlot = {
  styleId,
  skillId?,
  target?
}
```

- 配列 index がそのまま `position`
- `styleId` と `skillId` は同じ slot に入れる
- これにより「左の slot にいる style が、その slot でこの skill を使う」が 1 つの塊になる
- backline や非行動 slot は `skillId: null` または slot 全体を `null` にしてもよい

### 5. ユーザーが編集したい情報との対応

| ユーザーの見たい項目 | 提案モデルでの保存先 |
|----------------------|----------------------|
| `turn` | `ReplayTurn.turn` |
| `actor` | `ReplayTurn.slots[position].styleId` |
| `position` | `ReplayTurn.slots` の配列 index |
| `skill` | `ReplayTurn.slots[position].skillId` |
| `target` | `ReplayTurn.slots[position].target` |

つまり、編集 UI で見せるべき核心はこれだけでよい。

1. そのターンの 6 slot
2. 各 slot の style
3. 各 slot の skill / target

### 6. ターン内 operation と自由メモ

各 turn には、行動スロットとは別に「そのターンで commit 前後に消費される操作」を持たせてよい。

```text
ReplayTurn = {
  turn,
  slots[6],
  operations?,
  note?,
  overrideEntries?
}
```

```text
TurnOperation = {
  type,
  payload?
}
```

例:

- `ActivateKishinka`
- `ActivatePreemptiveOd`
- `ReserveInterruptOd`

`note` は自由入力メモであり、シミュレーションには影響しない。

```text
note: "3T目にODで押し切る想定。未実装バフは手動確認"
```

実装上の重要方針:

- `operations[]` は typed envelope とし、種類追加のたびに turn schema 自体を壊さない
- 未知の `type` は round-trip で保持し、best-effort replay では no-op + warning 扱いでよい
- `note` は完全に自由入力とし、シミュレーション処理に関与させない

## 推奨シリアライズ例

```json
{
  "version": 1,
  "setup": {
    "styleIds": [101, 102, 103, 104, 105, 106],
    "initialOdGauge": 0
  },
  "turns": [
    {
      "turn": 1,
      "slots": [
        { "styleId": 101, "skillId": 1001, "target": { "type": "enemy", "enemyIndex": 0 } },
        { "styleId": 102, "skillId": 2001, "target": { "type": "ally", "styleId": 101 } },
        { "styleId": 103, "skillId": 3001, "target": { "type": "none" } },
        { "styleId": 104, "skillId": null },
        { "styleId": 105, "skillId": null },
        { "styleId": 106, "skillId": null }
      ],
      "operations": [
        { "type": "ActivateKishinka" },
        { "type": "ActivatePreemptiveOd", "level": 3 }
      ],
      "note": "このターンで鬼神化 + OD3。ゲージ不足なら後で目視修正"
    }
  ]
}
```

## なぜ 2 本に分けないのか

分ける案:

```text
positionsAtCommit[6]
actionsByPosition[6]
```

この分離は、一見すると重複を減らせるが、編集正本としては弱い。

問題:

1. position を変えたのに skill 側が追従しない edit が起こる
2. style がその skill を持っていないというエラーが起こる
3. ユーザーは実際には「その position にいた style の action」を編集しているので、構造が mental model に合わない

今回の要件では、`styleId + skillId + target + position` は同じ slot の塊として持つべきである。

## 再計算ルール

### 基本方針

1. `setup` から battle state を初期化する
2. `ReplayTurn` を先頭から順に実行する
3. 各ターン開始時に、その turn の `slots[6]` が要求する並びに state を合わせる
4. `operations` を現在の runtime 規約に従って適用する
5. その `slots[6]` の skill / target を使って commit する
6. その結果から次ターン state を導出する
7. 同時に `record` を再生成する

重要:

- replay は best-effort で最後まで走らせる
- gameplay 上あり得ない中間値が出ても停止しない
- ユーザーが後で見て直せることを優先し、内部数値の厳密性は二次とする

### Position の扱い

- 行動優先順の正本は `slots` の index
- 左から順に slot `0..5`
- 「swap をどう行ったか」は保存しない
- 「その turn を Commit した瞬間に、どの style がどの slot にいたか」だけを見る

### 並び替えの扱い

- 前ターン end state から今ターン `slots` の並びに一致するように配置を合わせる
- ここで必要な内部処理が swap 相当でも、保存正本には出さない
- 保存するのは「結果としての並び」だけ

### operation の扱い

- `operations` は「そのターンでユーザーが行った control 操作」を保存する
- ここで保存するのは derived state ではなく user operation
- たとえば「鬼神化状態になった」という結果そのものではなく、「鬼神化を押した」を保存する

推奨 operation:

```text
{ type: 'ActivateKishinka' }
{ type: 'ActivateMakaiKihei' }
{ type: 'ActivatePreemptiveOd', level: 1 | 2 | 3 }
{ type: 'ReserveInterruptOd', level: 1 | 2 | 3 }
{ type: 'SummonEnemy', payload? }
```

### 現行 runtime との整合

現行実装では timing が揃っていないため、以下の扱いにする。

1. `ActivateKishinka`
- 現行はボタン押下時点で即時に state を変更する
- replay でも commit 前に即時適用する

2. `ActivatePreemptiveOd`
- 現行は OD confirm 時点で即時に `activateOverdrive()` を呼ぶ
- replay でも commit 前に即時適用する

3. `ReserveInterruptOd`
- 現行は予約だけを保存し、実際の OD 適用は commit 後の turn boundary で行う
- replay でも current turn の operation として保存し、effect は commit 処理側で発火させる

つまり、operation の保存先は同じ `ReplayTurn` だが、effect timing は type ごとに異なる。
この非対称は現行 runtime 由来であり、設計上は許容する。

### 許容する不正確さ

- OD ゲージや resource が一時的に不自然な値になることは許容する
- 例: `OD3 を発動した` が replay 上で `-200%` 相当に見える
- 例: SP が `-5`、その次の turn でさらに `-8` になる
- 例: ゲーム上あり得ない underflow / overflow が一時的に出る
- 重要なのは「ユーザーが何を押したか」と「後で目視修正できること」であり、厳密な数値整合は最優先ではない
- replay は gameplay 上の矛盾で止めない

### 再計算の開始点

- 編集した turn より前の turn は再計算済みキャッシュを持ってもよい
- ただし正本はあくまで script であり、cache は保存の本体にしない
- 最低限の仕様としては「編集 turn 以降を毎回再演」でよい

## `record` の役割再定義

`record` は以下の用途だけに限定する。

- 実行結果の表示
- CSV 出力
- デバッグ
- 差分観測
- バグ調査

`record` を編集正本にしない。
`record` から replay しない。
常に `ReplayScript` から再生成する。

補足:

- Session JSON に `record` 相当の情報や人間向け補助フィールドが含まれていても、load 経路は `ReplayScript` を唯一の入力として扱う

## manual state の扱い

通常 action 以外の control は `operations` に、manual state と turn-bound replay snapshot は `overrideEntries` に分ける。

```text
OverrideEntry = {
  type,
  payload?
}
```

例:

- `EnemyCount`
- `ActionOutcomeOverrides`
- `FollowUpOverrides`
- `EnemyNames`
- `EnemyDamageRates`
- `EnemyDestructionRates`
- `EnemyDestructionRateCaps`
- `EnemyOdRates`
- `EnemyAbsorbElements`
- `EnemyBreakStates`
- `EnemyStatuses`
- `ZoneState`
- `TerritoryState`
- `DpStateByPartyIndex`
- `StatusEffectsByPartyIndex`
- `EnemyConfig`

重要:

- これは常時保存しない
- ユーザーが明示的に manual state を入れた場合、または replay 正本として turn 固有 snapshot が必要な場合のみ保存する
- 現在の `setupDelta` のように、毎ターン自動 capture しない
- 未知の `type` は round-trip で保持し、best-effort replay では no-op + warning 扱いでよい

## 現行実装との差分

| 項目 | 現行 | 提案 |
|------|------|------|
| 編集正本 | `turnPlans` | `ReplayScript.turns` |
| 各ターン保存 | action + setupDelta + swap + manual state | `slots[6]` + `operations[]` + `note` + 必要時のみ `overrideEntries[]` |
| swap | event として保存 | 保存しない |
| Position | actor/position が混在 | `slots` の index を正本に固定 |
| actor と skill | 別構造でずれうる | 同じ slot にまとめる |
| 鬼神化/OD | rich state と予約情報に分散 | user operation として保存 |
| 自由メモ | なし | `note` に保存 |
| record | 保存本体でもあり出力でもある | 完全に derived output |
| setup / operation / override | 固定 key が増えやすい | typed envelope で増減可能にする |

## UI 方針

編集 UI は以下の 2 面に分ける。

### 1. 通常編集

- 1 ターン 6 slot の並び
- 各 slot に対して style / skill / target を編集
- 必要なら同じ turn に `operations` と `note` を追加編集する
- これが通常の編集導線

### 2. 高度な編集

- `operations`
- `overrideEntries`

通常利用では隠すか折りたたむ。
これにより、日常的な編集体験を `TurnAction` モデルに寄せる。

## 完了済み範囲

### 1. 正本モデル導入

- `ReplayScript` / `ReplayTurn` / `TurnSlot` schema は導入済み
- commit 時は lightweight script を保存し、`recordStore` は derived output のまま残している

### 2. 編集 UI 切替

- turn table の編集対象は `ReplayScript.turns` に移行済み
- committed row の再編集は `buildTurnEditDraft()` -> `replaceCommittedTurn()` で行う
- swap 手順そのものではなく、commit 時点の slot 配置を正本として扱う

### 3. 再計算切替

- replay は `ReplayScript` 正本から best-effort で先頭再演する方式へ移行済み
- warning/error は `getReplayDiagnostics()` で row 単位に返す
- `record` / CSV / JSON export は replay 結果から再生成する

### 4. Session save/load 切替

- `normalizeSessionSnapshot()` は既知フィールドと `replayScript` のみを採用する
- `record` / `computedRecords` 相当の実行結果は保存物に含まれていても load 正本には使わない
- 常用 load 契約は `replayScript` ベースであり、`turnPlans` bridge を前提にしない

## 現在の互換境界

- `scenario` JSON/CSV import は従来どおり scenario layer の責務とし、ReplayScript へ自動変換しない
- `record` / CSV / records JSON export は従来どおり derived output の責務とし、ReplayScript から再生成した結果を出力する
- legacy `turnPlans` を常用 load 経路へ戻す予定は現時点で持たない
  - もし旧 session を再救済する必要が出た場合は、runtime 常設 bridge ではなく別 migration tool として切り出す方が優先

## この設計で得たい挙動

### ユーザー期待

- T5 を編集した
- T1〜T4 はそのまま
- T5 以降だけ再計算した
- T8 以降で数値が怪しくなっても最後まで再計算される
- T6 に「OD3 発動」「鬼神化」「メモ」を一緒に置ける

現行のような「内部 state が rich すぎて編集と再演の関係が読みにくい」状態を避け、
最後まで再演した上で、人間が目視で直せることを目標にする。

## 非目標

- 現時点で全 scenario/manual editing 機能を簡易モデルへ完全統合すること
- rich な `record` 自体を削除すること
- 再計算コストを最小化すること

## 決めたこと

1. swap は保存正本にしない
2. Commit 時 Position は `slots[6]` の index と occupant で表す
3. 左優先の行動順は `slots` の並びを正本にする
4. style と skill は同じ slot に保持する
5. `鬼神化` / `OD` / 将来の turn-local control は `operations` として保存する
6. 自由入力メモは `note` として turn に保存する
7. `record` は再生成物に戻す
8. manual state は `overrideEntries` として分離する
9. setup / operation / override は typed envelope で増減可能にする

## 残タスクと優先順位（2026-04-10）

結論:

- core replay/edit 移行そのものは完了済み
- 残タスクは `ReplayScript` 導入の未完ではなく、Break / Follow-Up / Summon を含む周辺統合の追従である
- とくに `SummonEnemy` は手動入力・session/replay 正本・enemy slot snapshot・主要 selector 回帰固定までは実装済みで、残りは「敵行動データからどう流し込むか」と「override 群が同居する turn の正規化をどこまで追加で固定するか」に寄る

### P0

- なし

### P1

- 敵行動データの `Summon` を `ReplayTurn.operations[].type === 'SummonEnemy'` へ自動変換する経路を追加する
- `lightweight_record_replay_design.md` / `t16b_summon_enemy_slot_wbs.md` / `ui_next_unimplemented_tasklist.md` の 3 文書で、この auto summon 経路を同じ粒度で管理する

理由:

- 現在の replay contract 自体は `SummonEnemy` を受けられるが、入力源の 1 つである enemy action data が未接続
- manual summon だけ実装済みの状態だと、record/replay 契約の完成度より運用導線の完成度が遅れて見える

### P2

- summon 後の `break / follow-up / target` 選択と committed-row 再編集の主要回帰 coverage を維持し、追加ケースが必要になったときだけ補う
- `ActionOutcomeOverrides` / `FollowUpOverrides` / enemy slot snapshot override 群が同時に存在する turn の replay warning / normalization 挙動を固定する

理由:

- `tests/ui-next-turn-engine-manager.test.js` / `tests/ui-next-turn-ui.test.js` で summon 後の `break / follow-up / recommit` 主経路は固定済み
- ただし Break/Kill/Summon は同一 turn で重なると slot identity の回帰を起こしやすく、override 正規化まわりの追加固定余地は残る

### P3

- `BattleStateManager` に戦闘中 summon slot を常設反映するか、初期 state builder に責務を限定するかを整理する

理由:

- 現状の replay/commit correctness は `TurnEngineManager` 側で成立しているため blocker ではない
- ただし setup snapshot と runtime snapshot の責務境界が曖昧なままだと、今後の enemy setup/save-load 拡張で再び混乱源になる
