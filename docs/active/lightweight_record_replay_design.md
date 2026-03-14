# 軽量 Record / Replay / Edit 設計案

> **ステータス**: 🟢 進行中 | 📅 開始: 2026-03-14
>
> **前提調査**: [`../20260314_record_replay_edit_investigation/README.md`](../20260314_record_replay_edit_investigation/README.md)

## 目的

- 編集の正本を「軽い replay script」に戻す
- `record` は観測ログとして残しつつ、編集対象から外す
- 「ターンを少し編集したら、そのターン以降を素直に再計算する」というユーザー認識と実装を一致させる
- swap 操作そのものではなく、「Commit 時点の Position」と「その Position で使った Skill」を一体で保存する

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
  initialDpStateByPartyIndex?,
  initialBreakByPartyIndex?,
  initialMotivationByPartyIndex?,
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
{ type: 'ActivatePreemptiveOd', level: 1 | 2 | 3 }
{ type: 'ReserveInterruptOd', level: 1 | 2 | 3 }
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

## manual state の扱い

通常 action 以外の control は `operations` に、manual state は `overrideEntries` に分ける。

```text
OverrideEntry = {
  type,
  payload?
}
```

例:

- `EnemyStatuses`
- `ZoneState`
- `TerritoryState`
- `DpStateByPartyIndex`
- `StatusEffectsByPartyIndex`
- `EnemyConfig`

重要:

- これは常時保存しない
- ユーザーが明示的に manual state を入れた場合のみ保存する
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

## 実装段階案

### Phase 1: 正本モデル導入

- `ReplayScript` / `ReplayTurn` / `TurnSlot` schema を追加
- commit 時に `turnPlans` ではなく lightweight script を保存する層を追加
- 現行 `recordStore` はそのまま残す

### Phase 2: 編集 UI 切替

- turn table の編集対象を `turnPlans` から `ReplayScript.turns` に切り替える
- 6 slot 表示を基本 UI にする
- swap 行編集を廃止する

### Phase 3: 再計算切替

- `turnPlanBaseSetup + turnPlans` replay を `ReplayScript` replay に差し替える
- best-effort で最後まで再計算し、必要なら warning や補助表示だけを返す

### Phase 4: 旧 rich turnPlan の縮退

- 旧 `turnPlans` は legacy import/debug 用に限定する
- 常用編集経路から外す

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

## 次の具体化候補

- `ReplayScript` の JSON schema を確定する
- commit 時の 6 slot capture 仕様を決める
- 現行 `turnPlans` から `ReplayScript` へ変換する migration helper を作る
- minimal replay 用の best-effort executor を `dom-adapter` ではなく core 層へ切り出す
