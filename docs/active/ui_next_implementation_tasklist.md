# UI Next 実装タスクリスト

> **ステータス**: 🟢 進行中 | 📅 開始: 2026-03-15 | 🔄 最終更新: 2026-04-04
>
> **進捗サマリー**: T01 ✅ / T02 ✅ / T03〜T12 ✅（T12-E-5 まで） / T13-A ✅ / T13-B ✅ / T13-C ✅ / T14 ✅ / T15 ✅ / **T16 🔶 Enemy Setup（A・C 完了、B=敵初期ステータス設定のみ未実装）** / **T17 ✅ JSON Export（CSV 破棄）** / **T18 ✅ Scenario Runner（JSON 読み込みで代替）** / **T19 ❌ use_count 表示・管理** / **T20 🔶 モバイル UI 再見直し（A/B/C/D-swap 完了、残=全般見直し＋タッチUX）** / **T21 ✅ Passive Debug Log** / **T22 ✅ Layout Rework** / **T23 ✅ PNG Capture Rework** / **T24〜T28 ✅ toolbar / D&D / legacy cut / log pane resize / manual-break E2E** / **T29 ✅ Enemy先制フィールド表示（文章のみ）** / **T30 ✅ Session JSON 旧フォーマット互換（styleIds=0）** / **T31 ✅ SP>=0条件＋速弾きの合算使用可否実装** / **T32 🔶 Stage Setup（Phase1 完了 + 全体初期化導線追加、残=Phase2/3）** / **T33〜T34 ❌ 未着手（効果監査 / 敵状態変化管理）**
>
> **2026-04-02 追加実装**: `#4` の SP 期待値差分調査として、行動順は「非ダメージ先・ダメージ後（同 phase 内は前衛 position 順）」を維持。差分原因だった `石塔の手筋+` の誤分類（non_damage 扱い）を修正し、damage 扱いで `コードダクネス` の遷移を unit/e2e 回帰テストで固定。
>
> **2026-04-04 追加修正**: `BIYamawakiServant` が `OnFirstBattleStart/OnBattleStart` の passive timing 経路でスキップされていた不具合を修正。`src/turn/turn-controller.js` で passive 適用時にも `BIYamawakiServant` を status 付与するよう更新し、`tests/turn-state-transitions.test.js` に回帰ケース（OnFirstBattleStart自己付与 + CountBC条件OD加算）を追加。
>
> **前提設計**:
> [ui_next_design.md](ui_next_design.md)
>
> **参考モック / レイアウト資料**:
> [ui_next_gui_design_spec.md](ui_next_gui_design_spec.md)

## 目的

- 新 UI の作業範囲を既存 UI / engine 改修から切り分ける
- style 画像付きの新しい party 操作体験を段階的に構築する
- D&D による position 編集を中核導線として実装する
- `Initial Setup` と `Style Picker` の 2 層構成を最初の合意スコープとする

## 実装原則

1. 新 UI は別ページとして実装する
2. 既存 UI の DOM 構造を前提にしない
3. 共有できるものだけを `main` に戻す
4. engine bugfix を新 UI branch の正本にしない
5. docs は設計と実装進捗を分けて管理する

## タスク

### T01: 新 UI の entry 作成

- [x] `ui-next/` の entry files を作成する
- [x] 新 UI 用の最小表示ページを表示できるようにする
- [x] 共有 engine / replay 層に影響を与えないことを確認する

完了条件:

- [x] 新 UI の空ページが独立して開ける

> ✅ T01 完了（2026-03-15）: `ui-next/index.html`, `ui-next/app.js` 作成。`importmap` で `node:fs` / `node:path` を既存 shim に差し替え済み。

### T02: Party Setup shell

- [x] `Initial Setup` container の中に `Party Setup` block を置く
- [x] `front 3 + back 3` の 6 slot panel を横並びに表示する
- [x] slot panel の基本構成を `main icon -> listbox 群 -> support icon` で組む（T04 と合わせて実装）
- [x] 未選択 slot の empty state と略称 placeholder を定義する
- [x] `Initial Setup` 右ペインをスライドアウト（⚙ 設定 ◀/▶ ボタン）で開閉できる骨格を入れる
- [x] シミュレーター開始後（Apply 後）に `Initial Setup` を最小化する連携は T09 で実装

完了条件:

- [x] `Initial Setup > Party Setup` の構造が 1 画面で見え、退避導線（スライドアウト）がある

> ✅ T02 完了（2026-03-15）: 6 slot パネル（front 3 + back 3）・3タブシェル（Party/Enemy/Stage）・empty state・listbox 縦積み・右ペインスライドアウト（ヘッダーボタン）実装済み。Apply 後の最小化連携は T12-E-1 で実装済み。

### T03: style 画像表示基盤

- [x] `resolveStyleImageUrl()` を使って main / support style 画像を描画する（main icon 実装済み）
- [x] 画像未設定時の fallback 表示を決める（`?` プレースホルダー）
- [x] slot panel に style 名 / character 名の最小情報を表示する

完了条件:

- [x] 6 slot の main / support icon が style 画像つきで描画できる

> ✅ T03 完了（2026-03-15）: main icon の `resolveStyleImageUrl()` 描画・fallback（＋プレースホルダー）・キャラ名オーバーレイ実装済み。Style Picker（全画面アイコン高密度 grid）から main style を選択してスロットに反映できる。team 別グループ化・キャラ昇順→レアリティ昇順→実装順ソート・名前表示トグル・ホバー title（`[style名] キャラ名`）実装済み。support icon の画像描画（`resolveStyleImageUrl()` + SSR共鳴グラデーション）は T08 で実装済み。

### T04: slot listbox 群

- [x] `LB`（限突 0〜N）`ドライブピアス`（DP なし/+10/+12/+15）`SP装備`（なし/SP+1/SP+2/SP+3）`属性ベルト` の listbox を縦積みで配置する
- [x] `やる気` は やる気パッシブ（label に `Motivation` 含む）を持つスタイルがセットされた時だけ表示する（`Morale` は士気系で別物）
- [x] icon 幅と listbox 幅を揃える
- [x] 未選択時の placeholder 表示（empty state）を入れる

完了条件:

- [x] slot panel 内の基本設定が listbox で編集できる

> ✅ T04 完了（2026-03-15）: LB→「限突 N」表記・SP装備→固定4択・やる気→Motivationパッシブ（label に `Motivation` 含む）持ちスタイル時のみ表示（3スタイル対象）。`Morale` は「士気」系パッシブで別物。DRIVE_PIERCE_OPTIONS を battle-defaults.js から再利用。右ペインスライドアウトも同時実装。

### T05: D&D による position 入れ替え

- [x] slot の drag start / hover / drop を実装する
- [x] ドロップ時に slot 単位で style・listbox 設定をまとめてスワップする
- [x] accidental drag ガード: スロット番号ヘッダーに `cursor-grab` を表示し、img に `draggable="false"` を付与
- [x] ドラッグ中の元スロットを半透明（opacity-40）、ドロップ先を青枠（ring-blue-400）でハイライト
- [x] `dragleave` の誤発火（子要素移動時）を `el.contains(e.relatedTarget)` で抑制

完了条件:

- [x] slot panel をドラッグして順番を入れ替えられる

> ✅ T05 完了（2026-03-15）: HTML5 D&D。`#slots` 配列ごとスワップするため style 画像・listbox 選択状態が一緒に入れ替わる。

### T06: Style Picker shell

- [x] full-screen picker を追加する
- [x] picker 上部に filter bar を固定配置する（tier / 属性 / 武器 / 役割の4行）
- [x] team 別 style icon grid を横並び折り返しで表示する
- [x] `main` / `support` mode を `open(style, mode)` で受け取りヘッダーに表示する骨格を追加

完了条件:

- [x] main / support のどちらからでも full-screen picker を開ける

> ✅ T06 完了（2026-03-15）: filter bar シェル追加（shrink-0 固定）。open(style, mode) に mode 引数追加、ヘッダーに「メイン/サポートスタイルを選ぶ」表示。T07 と同時実装。

### T07: Style Picker filter / ordering

- [x] team ごとの style 順をキャラ昇順 → レアリティ昇順 → 実装順でソートする
- [x] tier / 属性 / 武器 / 役割 filter を実装する（同一カテゴリ内 OR、カテゴリ間 AND）
- [x] filter 対象外の style を非表示にし、空 team セクションは描画しない
- [x] `無` 属性を `elements.length === 0` として扱う
- [x] カウント表示を「絞り込み後件数 / 全件数」に変更
- [x] scroll 位置を `#renderBody()` をまたいで保持する

完了条件:

- [x] filter 付き team grid から style を選べる

> ✅ T07 完了（2026-03-15）: T06 と同時実装。#filters = { tiers/weapons/elements/roles: Set }。フィルタ解除ボタンあり。filter/scroll 状態は open をまたいで保持。

### T08: main / support 選択導線

- [x] `main style icon` クリックで picker を開く
- [x] `support style icon` クリックで picker を開く
- [x] `main` mode は 1 click で選択確定して元画面へ戻る
- [x] `support` mode は hover preview を表示する
- [x] `support` mode は 1 click 目で詳細表示を固定する
- [x] `support` mode は同じ card への 2 click 目で選択確定して元画面へ戻る
- [x] support 詳細表示に `共鳴アビリティ名 / 効果説明 / LB MAX 性能値` を出す
- [x] picker の filter 状態と scroll 位置を保持する
- [x] 選択確定時に重複を排除する（下記ルール）
  - メイン同士: 同一キャラクター不可 → 既存スロットをクリア
  - メイン↔サポート: 同一スタイル不可 → 既存スロットをクリア（同一キャラの別スタイルはOK）
  - サポート同士: 同一スタイル不可 → 既存スロットをクリア（同一キャラの別スタイルはOK）

完了条件:

- [x] slot ごとに main / support style を意図した操作モデルで差し替えられる
- [x] メイン同士で同一キャラクターが重複しない
- [x] メイン↔サポート / サポート同士で同一スタイルが重複しない

> ✅ T08 完了（2026-03-15）: main 1クリック確定・support 2クリック確定（1クリックで固定→amber ring、2クリック目で確定）。hover でプレビュー・fixed で固定・共鳴アビリティ名/desc/LB MAX 表示。support パネルに「すべて / ★共鳴あり / 共鳴なし」フィルタートグル追加。support モードでメインの属性によるフィルタ自動適用。SS/SSR 以外のメインスロットではサポート枠を disabled 表示。重複排除ルール3ケース実装済み。

### T08-UX: Slot Strip 改善・連続選択強化・UX全般改善

#### Strip レイアウト
- [x] Slot strip を 6×2（上段 M: main、下段 S: support）に変更する
- [x] Strip の上段クリック → main モードで選択、下段クリック → support モードで選択
- [x] 連続選択（続けて選ぶ）でメイン全6枠→サポート全6枠の順に自動進行する
- [x] `Style Picker` の `続けて選ぶ` を起動時既定 `ON` にする
- [x] `Style Picker` header と `Party Setup` 本体の両方に `PT解散` を追加し、全 slot を初期状態へ戻せるようにする
- [x] Strip ボタンサイズを w-8→w-10 に拡大
- [x] Strip と Filter bar を同一行に配置（3カラム grid: strip 左固定 / filter 全幅真中 / 空の対称列）
- [x] 幅 600px 以下では strip → filter → body の縦積みにフォールバック

#### Style グリッド
- [x] チームラベルを固定幅列（40px）に配置し、アイコンはその右から開始する
- [x] 折り返し時もアイコンがラベル列に食い込まない（flex-wrap レイアウトに変更）

#### SSR / 共鳴アビリティの視覚表現
- [x] Strip M行: メインが SSR → 紫リング（`ring-2 ring-purple-400`）
- [x] Strip S行: メインが SSR かつサポートが `resonance` 持ち → 紫リング
- [x] Party Setup メインアイコン: SSR → 薄いグラデーション背景（`ssr-resonance-bg-subtle`）＋ 画像あり時はオーバーレイ（`ssr-resonance-overlay`）
- [x] Party Setup サポートアイコン: メインが SSR かつサポートが `resonance` 持ち → 同じグラデーション
- [x] Style Picker 共鳴アビリティ詳細パネルの背景も同じグラデーション（`border-purple-100`）
- [x] 煌めき条件を `style.tier === 'SSR'`（メイン）＋ `supportStyle.resonance` truthy（サポート）で統一（tier 問わず、属性一致はPicker側で保証済み）

#### サポート選択 UX
- [x] 2クリック確定を廃止 → mousedown でプレビュー固定・mouseup で確定（マウス）
- [x] touchstart でプレビュー固定・touchend（同カード上）で確定（タブレット対応）
- [x] `elementFromPoint` でタッチ離し位置を検証し、カード外リリース時はキャンセル
- [x] メインにセット済みのスタイルをサポート選択時にグレーアウト・選択不可にする（メイン優先ルール）
- [x] グレーアウトカードのホバーテキストに「（メインにセット済み）」を表示

完了条件:

- [x] Strip で 12 マスの選択状態が一覧できる
- [x] Strip クリックで main / support を問わず自由に編集対象を切り替えられる
- [x] 連続選択でメイン→サポートの境界を自動的に跨ぐ
- [x] SSR / 共鳴アビリティ発動中のスロットが視覚的に識別できる
- [x] サポート選択が 1アクション（押して離す）で完結する
- [x] メイン使用中スタイルがサポートで誤選択されない

> ✅ T08-UX 完了（2026-03-15, 2026-03-28追補）: Strip 6×2・スロットクリック切替・連続選択境界越え・strip+filter 横並び（3カラム grid）・狭い画面縦積み・チームラベル固定列・SSRグラデーション表現（party-setup / strip 統一条件）・サポート mousedown/touchstart 確定 UX・メインセット済みグレーアウト・`続けて選ぶ` 既定 ON・`PT解散` の 2 入口を反映。

### T09-Engine: engine の部分パーティー対応（先行実施）

- [x] `src/domain/party.js`: `MIN_PARTY_SIZE = 3` / `MAX_PARTY_SIZE = 6` 定数を追加し、`Party` コンストラクタを 3〜6名対応に変更
- [x] `src/contracts/interfaces.js`: `buildPositionMap` / `createBattleState` を `MIN_PARTY_SIZE`〜`MAX_PARTY_SIZE` 対応に変更（定数は `party.js` からインポート）
- [x] `src/data/hbr-data-store.js`: `buildPartyFromStyleIds` を `MIN_PARTY_SIZE`〜`MAX_PARTY_SIZE` 対応に変更
- [x] 影響範囲の既存テストを確認・修正する（605件 pass 確認済み）

完了条件:

- [x] 3〜6名パーティーで `Party` / `createBattleState` / `buildPartyFromStyleIds` が正常動作する
- [x] 既存テスト（605件）がすべて pass する

> ✅ T09-Engine 完了（2026-03-15）: `MIN_PARTY_SIZE=3` / `MAX_PARTY_SIZE=6` を `party.js` で定義し `interfaces.js` / `hbr-data-store.js` からインポート。マジックナンバーなし。`feature/engine-partial-party` → `main` → `feature/ui-next-initial` のフローで取り込み済み。

### T09-UI: engine bridge の最小接続（T09-Engine 完了後に実施）

- [x] `HbrDataStore` 読み込みを新 UI entry から接続する
- [x] `party-setup.js`: `getSnapshot()` 追加（`isFrontFilled` + null 含む 6 要素の raw 状態）
- [x] `party-setup.js`: `#onChange` / `#notifyChange()` コールバック対応（slot 変更時に Apply ボタン更新）
- [x] `initial-setup.js`: Apply ボタン追加（前衛 3 スロット埋まりで enabled）
- [x] `ui-next/engine/battle-state-manager.js`: 新規作成（後衛空き左詰め + `createInitializedBattleSnapshot` 呼び出し）
- [x] `app.js`: `BattleStateManager` 接続・左ペイン最小表示（`renderBattleStatePreview`）
- [x] `Apply` 操作で既存の turn script / replay script を turn 1 から再計算できるようにする
- [x] 編集中は現在のシミュレート結果を即破棄しないようにする

完了条件:

- [x] 前衛 3 スロット入力後、Apply ボタンがアクティブになる
- [x] Apply で BattleState が生成され、左ペインにキャラ名・SP が表示される
- [x] 後衛スロットを一部空のまま Apply → 左詰めで 3〜5名 BattleState が生成される
- [x] 新 UI から「初期設定変更後の全再計算」まで到達できる

> ✅ T09-UI 完了（2026-03-15）: Apply ボタン連携・`BattleStateManager`（後衛左詰め）・左ペイン BattleState 表示まで実装済み。T12-E-2 で Initial Setup 変更後の全再計算、T12-E-5 で edit/cancel セッション管理（破棄防止）を実装済み。

### T10: Enemy / Stage Setup extension point

- [x] `Initial Setup` 配下に `Enemy Setup` block を差し込める構造にする
- [x] `Initial Setup` 配下に `Stage Setup` block を差し込める構造にする
- [x] 初回マイルストーンでは placeholder または reserved area に留め、full 実装を必須にしない

完了条件:

- [x] `Party Setup` 実装を壊さずに `Enemy Setup` / `Stage Setup` を後から追加できる構造になっている

> ✅ T10 完了（2026-03-15）: InitialSetup の3タブシェル（Party/Enemy/Stage）として placeholder 実装済み。`initial-setup.js` の `TABS` 配列に追加するだけで拡張可能な構造。

### T11: replay/edit 連携方針の固定

- [x] 新 UI が `LightweightReplayScript` を正本として直接保持・編集する
- [x] turn / slots / operations / note のうち、初回スコープを固定する
      → **slots（スキル選択）+ note** が初回スコープ
      → operations（kishinka/割り込みOD）/ overrideEntries（enemy情報上書き）は後続タスク
- [x] 旧 UI と新 UI の責務境界を整理する
      → engine 純粋関数（`previewTurn`/`commitTurn`）を新 UI から直接呼ぶ。旧 UI コードは参照のみ
      → `TurnEngineManager` が ReplayScript 管理 + engine bridge を担当

完了条件:

- [x] 新 UI がどこまで編集対象を持つか文書で固定されている

> ✅ T11 完了（2026-03-15）: 設計方針を確定。ReplayScript 正本方式・初回スコープ（slots+note）・engine 純粋関数直接呼び出し方式。

### T12: 新 UI 初回リリースの最低ライン

#### T12-A: TurnEngineManager（engine bridge）
- [x] `ui-next/engine/turn-engine-manager.js` 新規作成
  - ReplayScript 保持・`commitNextTurn`・`recalculateFrom`・`updateSlot`・`updateNote`
  - `previewTurnRecord`/`commitTurnRecord`（adapter-core.js）を直接呼ぶ

#### T12-B: TurnRow UI（1ターン横長コンテナ）
- [x] `ui-next/components/turn-row.js` 新規作成
  - ターン情報列（turnIndex, OD/extra, OD%）
  - 前衛スロット: スキル select + スタイルアイコン + SP オーバーレイ
  - 後衛スロット: アイコン + SP（スキル選択なし）
  - Commit ボタン（未コミット行のみ）・メモ欄
  - スロット D&D（未コミット行）

#### T12-C: TurnArea（ターンリスト管理）
- [x] `ui-next/components/turn-area.js` 新規作成
  - Apply → `initialize()` → ターン1入力行表示
  - Commit → `commitNextTurn` → 次のターン行を追加
  - 過去ターン編集 → `updateSlot` → `recalculateFrom` → 行を再描画

#### T12-D: app.js 統合
- [x] `TurnEngineManager` / `TurnAreaController` を `app.js` から初期化
- [x] `buildReplaySetupFromSnapshot()` ヘルパーを追加

#### T12-UX: TurnRow UX 改善（実装済み）
- [x] プリセット保存/読込の基礎実装（localStorage、初期版は 3 スロット折りたたみ式）
- [x] D&D スキル追従バグ修正（partyIndex キーで保存 + DOM data-party-index 属性で state 経由不使用）
- [x] 後衛→前衛 D&D 対応（`draggable` 属性付与）
- [x] SP 表示セマンティクス修正（コミット済み行も stateBefore.SP を表示）
- [x] EX / OD ラベル先読み（未コミット行も stateBefore.turnState.turnType から判定）
- [x] OD ゲージ `000.00%` フォーマット化 + Before→After 表示（コミット済み行）
- [x] コンテナクエリ対応レスポンシブ（`#turn-area` の実幅で 40/48/64px・2:1→1:1 を段階変化）
- [x] SP バッジを黒縁取り白文字にしてアイコン画像を極力隠さない表示に変更

#### T12-E（後続）: 一部実装済み
- [x] 開始後に `Initial Setup` を最小化できる（T12-E-1 完了）
- [x] `Initial Setup` の変更を turn 1 から全再計算できる（T12-E-2 完了）
- [x] **OD 発動・割込OD UI**（T12-E-3 完了）
  - `TurnEngineManager`: `#pendingPreemptiveOdLevel` / `#pendingInterruptOdLevel` pending フラグ管理
  - `setPendingPreemptiveOd(level)` / `setPendingInterruptOd(level)` / `getActivatablePreemptiveOdLevels()` 追加
  - `commitNextTurn`: pending 先制OD を commit 前に `activateOverdrive` 実行、割込OD を `interruptOdLevel` で commit
  - `previewCurrentTurn`: pending 先制OD 加味・`activatableInterrupt` 返却
  - `recalculateFrom`: `ACTIVATE_PREEMPTIVE_OD` / `RESERVE_INTERRUPT_OD` operations を再現
  - `TurnRow`: ボタン列に先制OD / 割込OD select 追加（発動不可レベルは disabled）
  - `TurnArea`: `#handleOdChange` / `#buildOdState` 追加。スキル変更時に `updateInterruptOdCandidates` で候補更新
  - **旧実装比較**: checkpoint/restore（70行）を排除。両 OD を対称的な pending フラグで管理
  - kishinka は別タスク（将来）
- [x] 最低限の error 表示（スキル使用失敗等のフィードバック）（T12-E-4 完了）
- [x] **SP 表示バグ修正**（コミット済み行が常に最新 SP を表示する問題）
  - 詳細: [ui_next_engine_fix_tasklist.md](ui_next_engine_fix_tasklist.md) Task A
  - `turn-row.js` の `#buildFrontSlotHtml` / `#buildBackSlotHtml` で
    コミット済み行は `record.snapBefore.find(s => s.partyIndex === member.partyIndex).sp.current` を使うよう修正
  - エンジン変更不要（`committedRecord.snapBefore` に mutation 前の不変コピーが既に存在）
- [x] **OD ゲージ: 未コミット行の After 値ライブプレビュー**
  - 詳細: [ui_next_engine_fix_tasklist.md](ui_next_engine_fix_tasklist.md) Task B
  - `TurnEngineManager.previewCurrentTurn(slotActions)` を追加
  - 未コミット行のスキル変更 → `previewCurrentTurn` → `→000.00%` をリアルタイム表示
- [x] **既コミットターン再編集 + Best-Effort replay**（T12-E-5 完了）
  - `TurnEngineManager`: `buildTurnEditDraft()` / `buildTurnEditSnapshot()` / `replaceCommittedTurn()` / `popLastCommittedTurnToDraft()` / `getReplayDiagnostics()` を追加
  - validation policy に `allowSkillConditionMismatch` を追加し、SP不足・OD不足・使用回数超過・条件不一致を warning として replay diagnostics に集約
  - replay は 1 ターン目から best-effort 再実行し、hard error は対象ターンで停止、soft warning は `Warn(n)` と上部サマリーで可視化
  - `TurnArea` / `TurnRow` を `編集` / `再コミット` / `キャンセル` の明示 edit mode に変更し、編集中は input row を隠して 1 edit session に固定
  - phase 3 は safe subset のみ実装し、OD / EX 継続が確実に消えたケースだけ stale special turn を圧縮

完了条件:

- [x] Apply → ターン1入力行が表示される
- [x] スキル select にキャラのスキル一覧が表示される
- [x] Commit → SP が変化したターン2行が追加される
- [x] 過去ターンのスキル変更 → 自動再計算
- [x] コミット済み行を編集モードに戻し、再コミットで replay 全体を再計算できる
- [x] D&D でターン内のスロット順を入れ替えできる
- [x] 「`Initial Setup > Party Setup` を中心に、style 選択と D&D ができ、後続の enemy / stage setup を差し込める新ページ」が成立している（T12-E 完了後）

> ✅ T12 完了（2026-03-15〜03-28）: T12-A〜D + T12-UX + T12-E-1〜E-5 実装済み。既コミットターン再編集・best-effort replay・warning 集約まで反映。scenario / CSV / switch skill は T17・T18・T13-C として独立タスク化済み。

### T12-E-5: 既コミットターン再編集 + Best-Effort replay

- [x] committed row を read-only 表示と edit mode 表示に分離する
- [x] `編集` / `再コミット` / `キャンセル` を `TurnRow` に追加する
- [x] 再コミット時は `ReplayScript` を置換して turn 1 から全 replay する
- [x] replay warning を engine に集約し、row badge と turn area summary に表示する
- [x] session snapshot では warning を永続化せず、validation policy だけを保存する
- [x] safe subset の stale special turn compaction を入れる

> ✅ T12-E-5 完了（2026-03-28）: `ui-next/engine/turn-engine-manager.js` に turn edit draft / diagnostics / best-effort replay を追加。`ui-next/components/turn-area.js` と `ui-next/components/turn-row.js` を edit session 前提へ再構成。`tests/ui-next-turn-engine-manager.test.js` / `tests/ui-next-turn-ui.test.js` に turn edit, diagnostics, warning UI の回帰テストを追加。

---

## 次セッション引き継ぎ（2026-03-16 時点）

### 現在地

**T12-E が次の作業対象**。以下の順で進めることを推奨する。

```
T12-E-1: Initial Setup 最小化（Apply 後）           ← 最優先・実装簡単
T12-E-4: エラー表示（スキル失敗フィードバック）        ← 次点・実装簡単
T12-E-2: Initial Setup 変更後の全再計算              ← TurnEngineManager 改修が必要
T12-E-3: operations（kishinka / 割り込みOD）UI       ← 最難・後続タスクとして分離可
```

### T12-E-1: Initial Setup 最小化（Apply 後）

**実装ポイント**:
- `app.js` の `onApply` コールバック内で、右ペイン（`#setup-area`）をスライドアウト
- `index.html` の toggle ボタン（`#toggle-setup`）と同じ `translateX(100%)` ロジックを再利用
- Apply 後は「⚙ 設定 ▶」状態にして、ユーザーが再展開できるようにする
- `InitialSetupController` に `collapse()` / `expand()` メソッドを追加するか、`app.js` 側で DOM 操作するか選ぶ

**参照ファイル**:
- `ui-next/index.html:67-81` — toggle ロジック（setupOpen フラグ・translateX・textContent）
- `ui-next/app.js:73-84` — `onApply` コールバック

### T12-E-4: エラー表示

**実装ポイント**:
- `index.html` に既存の `[data-role="status"]` エラーパネルがある（`app.js:36-41` の `showStatus()`）
- `TurnAreaController` に `onError` コールバックを追加して、`commitNextTurn` 失敗時に呼ぶ
- `turn-row.js` の `#handleCommit` → `TurnAreaController` → `showStatus()` の経路を繋ぐ
- エラー内容: SP 不足・スキル制約違反などはエンジンが例外で返す

### T12-E-2: 全再計算（Initial Setup 変更後）

**実装ポイント**:
- `TurnEngineManager.recalculateAll(newInitialState, newReplaySetup)` を追加する
- `TurnAreaController.reinitialize(newState, newReplaySetup)` を追加（initialize との違いは既存ターン列を保持しつつ再計算）
- `app.js` の `onApply` コールバックが 2 回目以降呼ばれた場合に reinitialize を呼ぶ

**注意**: 既コミット済みターンの ReplayScript（slots + note）は保持し、新 BattleState で再計算のみする。
`TurnEngineManager.recalculateFrom(0)` が既に存在するため、初期状態を差し替えて全ターン再計算する形で実装できる可能性がある。

**参照ファイル**:
- `ui-next/engine/turn-engine-manager.js` — `recalculateFrom(fromIndex)` の実装を確認してから設計する

### T12-E-3: operations（kishinka / 割り込みOD）

**実装ポイント（後続タスクとして独立させること）**:
- kishinka: `src/turn/turn-controller.js` の `activateReinforcedMode` + OD ゲージ処理
  → 旧UI実装: `dom-adapter.js:6570-6600` が参考（ただし直接 state 変更なので注意）
  → 新UI: `TurnEngineManager` にメソッドを追加し、エンジン経由で state を更新する
- 割り込みOD: `src/turn/turn-controller.js:8593` の `activateOverdrive(state, level, 'interrupt')`
  → 旧UI実装: `dom-adapter.js:7395-7470`（`isPreemptiveOdStep1` の重複判定に注意）
  → 新UI: `TurnEngineManager.activateInterruptOd(level)` として分離実装する

**ゲームルール参照**:
- OD発動: `docs/specs/ui_next_game_rules_index.md` §D（activateOverdrive の行番号・引数）
- 設計原則: `docs/specs/dev_principles.md` §5 の原則2・5（state 直接変更禁止）

### その他の参照情報

| 参照先 | 用途 |
|--------|------|
| `docs/specs/ui_next_game_rules_index.md` | ゲームルール辞書（エンジン関数・行番号） |
| `docs/specs/dev_principles.md` §5 | 新UI設計指針・やってはいけない例（旧実装引用） |
| `ui-next/engine/turn-engine-manager.js` | engine bridge の現状実装 |
| `src/ui/adapter-core.js:425` | `queueSwapState`・swap キューイングの参考 |
| `src/ui/dom-adapter.js` | 旧UI実装（grep で参照・編集は不可） |

### T13: スキル選択 UI 強化

> **依拠**: ギャップ分析 分類A — スロット・スキル選択系
> **参照**: `docs/active/ui_next_old_feature_gap_analysis.md` §A-2
> **優先方針**: SP/OD 計算に直結する項目を優先。use_count は複雑なため T19 として独立。

#### T13-A: スキルコスト詳細表示 【優先度: 高 / SP/OD 計算の核心】
- [x] `formatSkillCostLabel()` を `ui-next/` に移植（SP/Token/Morale/EP/ALL・鬼神化中SP0 対応）
  - `src/ui/dom-adapter.js:L545` の実装を参照
  - SP / Token / Morale / EP の consumeType 分岐
  - `costRaw === -1` → `SP ALL` / `Token ALL` / `Morale ALL` 表示
  - 鬼神化中（`member.isReinforcedMode`）かつ SP消費 → `SP 0` に上書き
- [x] `turn-row.js` の skill select option ラベルに組み込む
- [x] SP コスト変化（装備 / バフによる補正後値）を反映する

完了条件:
- [x] スキル select に `SP N` / `Token N` / `EP N` / `SP ALL` 等のコスト種別が表示される
- [x] 鬼神化中スロットで SP コストが `SP 0` になる

> ✅ T13-A 完了（2026-03-17）: `ui-next/utils/skill-label.js` 新規作成、`turn-row.js` 修正。ユニットテスト 14 件 + E2E テスト 2 件 PASS。コミット: d3cfbcf

> ✅ T13-B 更新完了（2026-03-21）: `装備スキル` checklist と `スキル絞込` を単一の `スキル設定` パネルへ統合。`skillSetsByPartyIndex` を正本にし、戦闘中の追加は 1 ターン目から自動再計算、committed record がある間の解除は UI 上で禁止。関連 Node/JSDOM テスト更新済み。

#### T13-B: スキル設定パネル（装備＝表示）【優先度: 高 / 操作性直結】

**目的**: skill set と action select の表示を 1 つの slot 設定に統一し、装備型 passive と action skill の入口を一本化する

**UX フロー**:
1. Party Setup の各スロットに「🔧 スキル設定」ボタンを配置
2. クリックでフローティングパネルを表示（既存 UI の上に重ねる、z-index 上位）
3. パネル内容: そのスタイルが装備できるスキル全件 × 単一チェックボックス付きラベル
4. checked は `装備＝表示` を意味し、turn select には battle state に存在する action skill だけを出す
5. 「全選択 / 全解除」ショートカットボタンを付ける
6. 戦闘開始後の skill 追加は自動で 1 ターン目から再計算する
7. committed record が 1 件以上ある間は checked 済みスキルの解除を禁止し、補足文を表示する

**実装箇所**:
- `party-setup.js`: 各スロットに「🔧」ボタンを追加し、slot ごとの `equippedSkillIds` を正本として更新
- `ui-next/components/skill-filter-panel.js` を新規作成（フローティングパネル）
- `initial-setup.js`: `onChange(snapshot, meta)` で live battle 中の skill set 変更を自動再計算へ橋渡し
- `turn-row.js`: `localStorage` ベースの表示フィルタ参照を廃止し、battle state にある action skill だけを表示
- `ui-next/utils/skill-filter.js` と `hbr:skill-filter-changed` 経路は削除

- [x] `party-setup.js`: 各スロット下に「🔧 スキル設定」ボタン追加
- [x] `ui-next/components/skill-filter-panel.js` 新規作成
  - [x] フローティングパネル（fixed 配置 / backdrop なし）
  - [x] スキル一覧 checkboxLabel × N（スキル名・コスト種別・source タグを表示）
  - [x] 「全選択 / 全解除」ボタン
  - [x] パネル外クリックで閉じる
  - [x] committed record 中の解除禁止と補足文表示
- [x] `initial-setup.js` の live reinitialize 配線
- [x] `turn-row.js` の `localStorage` フィルタ依存削除

完了条件:
- [x] スロットの「🔧 スキル設定」ボタンを押すとフローティングパネルが表示される
- [x] checked 集合が `skillSetsByPartyIndex` として snapshot/preset/session に保存される
- [x] 戦闘中の skill 追加が 1 ターン目から自動再計算される
- [x] committed record がある間は checked 済みスキルの解除ができない

#### T13-C: スキル属性バッジ + スイッチスキル対応 【優先度: 中 / 同時実装推奨】

**スキル属性バッジ**:
- [x] select 横に属性バッジコンテナを追加（斬・刺・打 + 火・氷・雷・闇・光）
- [x] スキル変更時に `resolveEffectiveSkillForAction()` で有効スキルの `attackType` / `elements` を取得

**スイッチスキル対応**:
> 2行縦並び（有効バリアント選択 + 非有効バリアント参照表示）。属性バッジはリストボックスのテキストに追記し選択可能。
- [x] `resolveEffectiveSkillForAction()` で現在の有効バリアントを取得
- [x] スイッチスキルの場合: select の代わりに（または直下に）もう一方のバリアントをラベル表示
  - シンプル案: 2行縦並び（有効バリアント選択 + 非有効バリアント参照表示）
  - 属性バッジはバリアントごとに別バッジで並置（リストボックスのテキストに追記）
- [x] スイッチ状態変化後に両バリアントのバッジを更新

完了条件:
- [x] スキル select の直下に属性バッジが表示される
- [x] スイッチスキルで 2 バリアントの属性が識別できる

> ✅ T13-C 完了（2026-03-17 / 2026-03-31追補）: `turn-row.js` に `ATTACK_TYPE_MAP`/`ELEMENT_MAP` 定数・`#buildSkillBadgesHtml`・`#updateSkillBadges` 追加。スイッチスキルは 2行縦並び（有効バリアント選択 + 非有効バリアント参照表示）にて実装済み。属性バッジはリストボックスのテキストに追記し選択可能。

---

### T14: パーティー状態表示強化

> **依拠**: ギャップ分析 分類A — パーティー表示系
> **参照**: `docs/active/ui_next_old_feature_gap_analysis.md` §A-3
> **優先方針**: SP/OD 計算への直接影響度で優先順を設定。

#### T14-A: SP/OD に直結する状態表示 【優先度: 高】

SP に影響するバフ/デバフ（SP回復UP/DOWN等）と OD ゲージへの影響（鬼神化残ターン含む）が対象。

- [x] キャラアイコン下に status effects バッジ一覧を追加
  - `member.resolveEffectiveStatusEffects()` を参照して `statusType(duration)` 形式で表示
  - SP 増減・OD ゲージ増減に関わるエフェクトを視覚的に強調（色分け等）
  - 0件の場合は非表示
- [x] 鬼神化中・行動不能バッジ
  - 通常の状態変化アイコン群へ統合表示済み（別描画レーンは使わない）
  - `member.isReinforcedMode` / `member.actionDisabledTurns` を参照

完了条件:
- [x] 各キャラアイコン下でバフ/鬼神化状態が確認できる

> ✅ T14 完了: T14-A（バフアイコン表示・鬼神化/行動不能を通常アイコン群へ統合）実装済み。

---

### T15: 鬼神化（kishinka）UI・フロー実装 【優先度: 高 / OD+15% に直結】

> **依拠**: ギャップ分析 分類A — ターンコントロール系
> **参照**: `docs/active/ui_next_old_feature_gap_analysis.md` §A-1
> **旧実装**: `dom-adapter.js:L6536-L6600`

#### T15-A: TurnEngineManager 拡張
- [x] `#pendingKishinka` フラグ追加（`setPendingKishinka()` / `isKishinkaAvailable()` / `getKishinkaStatus()`）
- [x] `#applyKishinkaToState(state)` — party クローン + `activateReinforcedMode(3)` + OD +15%
- [x] `commitNextTurn` に鬼神化 → 先制OD の順で適用、`ACTIVATE_KISHINKA` operation を記録
- [x] `previewCurrentTurn` に pending 鬼神化を反映（SP 0 リアルタイム表示）
- [x] `recalculateFrom()` で `ACTIVATE_KISHINKA` operation を再現

#### T15-B: TurnRow UI
- [x] 鬼神化ボタンを OD/割込OD ボタン列に追加（手塚咲パーティ時のみ表示）
- [x] 5状態表示: 通常/予約済（紫塗り）/鬼神化中バッジ/行動不能バッジ/非表示
- [x] `TurnArea.#handleKishinkaActivate` 接続・`#buildOdState` に `kishinkaStatus` 追加

完了条件:
- [x] 手塚咲がパーティにいる場合に鬼神化ボタンが表示される
- [x] 鬼神化発動 → OD +15% + 鬼神化中バッジが表示される
- [x] 再計算時に kishinka 操作が再現される

> ✅ T15 完了（2026-03-17）: `#pendingKishinka` フラグ方式（先制OD・割込ODと対称設計）。party クローンで `currentState` を破壊しない安全な実装。`ACTIVATE_KISHINKA` operation を記録し `recalculateFrom` で再現可能。既存テスト 630件 PASS。

---

### T16: Enemy Setup 完全実装

> **依拠**: ギャップ分析 分類A — Enemy Setup 系
> **参照**: `docs/active/ui_next_old_feature_gap_analysis.md` §A-5
> **旧実装**: `dom-adapter.js:L3444-L3800`

#### T16-A: 基本フォーム（敵スロット・名前・ダメージレート・破壊率）
- [x] Enemy Setup タブに敵スロット（[1][2][3]）を追加
- [x] 各敵ごとに入力セクションを動的生成（アクティブスロット切り替え方式）
  - 敵名: プリセット select で選択（自由テキスト input の代わり）
  - 9属性ダメージレート（斬/突/打/火/氷/雷/光/闇/無）× 各 input[type=number]
  - 破壊率 input[type=number]（`max_d_rate` として実装）
- [x] 実効倍率％ベースの属性耐性表示/入力と吸収 checkbox を追加する
- [x] `max_d_rate` / 属性耐性 / 吸収を `BattleStateManager` の初期設定に反映する

#### T16-B: 敵初期ステータス設定（Enemy Setup タブ）
> **注意**: Break / Down / Dead は別経路で部分実装済みだが、Enemy Setup タブの「戦闘開始前初期状態設定」とは別物。
> - Break: turn-row.js「討伐・ブレイクを編集」で手動ブレイク帰属あり（ターン内結果の記録）
> - Down: エンジン（turn-controller.js `BreakDownTurn`）で計算・追跡済みだが、ui-next に表示なし
> - Dead: turn-row.js 討伐ボタン（kill attribution）あり。`enemyStatuses` への Dead 設定は未実装
> T16-B のスコープは「T1 開始前から E1 がすでに Break 状態」等の初期状態を Enemy Setup タブで入力する機能。

- [ ] statusType select（Down/Break/StrongBreak/SuperDown/Dead）
- [ ] ターン数 input（isPersistentEnemyStatus で永続判定）
- [ ] 対象敵 select
- [ ] 追加/削除操作と一覧表示（タグ形式）
- [ ] `BattleStateManager` の初期 `enemyStatuses` に反映

#### T16-C: 敵フィールド（Zone）設定
> **スコープ確定（2026-04-01）**: 初期フィールド（中フィールド・永続のみ）は実装済み。ターン数 input は不要。戦闘途中の敵フィールド貼り直し機能はスコープ外・未実装予定なし。
- [x] フィールド属性 select（なし/火/氷/雷/光/闇）: `PREEMPTIVE_FIELD_OPTIONS` として実装済み（'none' = フィールドなし）
- [x] `BattleStateManager` へ接続済み（`PREEMPTIVE_FIELD_TO_ZONE_TYPE` 経由でゾーン種別に変換）
- ターン数 input: 不要（常に永続・中フィールド固定のため）

完了条件:
- [x] Enemy Setup タブで敵の基本情報・状態・フィールドを入力できる（T16-B のみ未実装）
- [x] Apply 後に敵設定が BattleState に反映される（T16-B を除き対応済み）

> 🔶 T16 部分完了（2026-04-02）: `Enemy Setup` の敵スロット UI（`[1][2][3]`）を有効化済み。デフォルトは `[1] 希望を喰むもの / [2] - / [3] -`。`[2][3]` は削除可能、`[1]` は必須。同一敵の複数スロット指定も明示選択で許可する。敵プリセットの属性耐性は `enemies.json` 生値ではなく実効倍率％（`0 -> 100%`, `-300 -> 400%`, `70 -> 30%`）で表示・手動入力する方式へ変更。吸収属性 checkbox を追加し、`BattleStateManager` から初期 `enemyState.damageRatesByEnemy` / `absorbElementsByEnemy` / `destructionRateCapByEnemy` / `odRateByEnemy` をスロット別に接続したため、UI Next の OD 判定では吸収属性が弱点扱いされない。Session JSON は enemy 選択内容と編集済みパラメータを保持し、読み込み後の再計算でも同じ敵設定を使用する。`od_rate` は UI / Session では `1 = 100%` の multiplier として扱い、legacy 値（例: `8500`）は互換で `0.85` に正規化する。OD 上昇量は最終計算結果へ multiplier を乗算し、小数第2位まで残して第3位以降を切り捨てる。保存JSONの `turn.info` には前衛行動順を目視確認する `actionOrder` を追加した。敵 HP/DP 数値 state は UI Next に未実装のため、吸収ダメージ分回復は未対応。

---

### T17: JSON Export 実装 ✅

> **方針変更（2026-04-01）**: CSV Export は破棄。JSON Export でニーズが満たされたため T17 完了扱い。
> CSV Export（T17-A/T17-B）・`TurnEngineManager.exportCsvState()` の実装は行わない。

- [x] JSON 保存ボタン（`ReplayScript` を JSON シリアライズしてダウンロード）実装済み

> ✅ T17 完了（JSON Export のみ、CSV は破棄）

---

### T18: Scenario Runner UI ✅

> **方針変更（2026-04-01）**: JSON 読み込み＋再計算（`loadSessionText()` → `loadReplayScript()`）が T18 の完了条件を完全に満たすため、T18 完了扱い。
> CSV シナリオ入力は T17 CSV 破棄と同様にスコープ外とする。

- [x] JSON セッションファイルを読み込んで全ターンを再計算（`loadSessionText` 実装済み）
- [x] `TurnEngineManager.loadReplayScript()` 経由で state を復元
- [x] 読み込み後にターン数をステータスバーに表示

> ✅ T18 完了（JSON 読み込み機能で代替、CSV シナリオ入力はスコープ外）
> 追補（2026-04-02）: OD割り込み由来の `EX` で `remainingOdActions=0` のとき `IsOverDrive()` が false 扱いになり、`国士無双` の追加ターンが欠落する不具合を修正（`odSuspended=true` なら OD文脈を維持）。

### T19: スキル使用回数（use_count）表示・管理 【優先度: 低 / 複雑なため独立】

> **依拠**: ギャップ分析 分類A — スロット・スキル選択系
> **T13 から分離**: use_count 増減ルートが多岐にわたるため独立タスクとする

**use_count の複雑性（事前調査が必要）**:
- 装備品（ドライブピアス等）による use_count 追加
- スキル効果・パッシブによる use_count 追加
- 「use_count を消費せずに使用できる」特性（条件付き無消費）
- OD 中・鬼神化中での無消費扱い（要仕様確認）

**実装前に確認すべきこと**:
- [ ] `src/` でのuse_count 管理箇所を特定（`member.getSkillUsageRemaining()` 等）
- [ ] use_count を増やす要因（装備/スキル/パッシブ）の列挙
- [ ] 無消費条件の列挙（`dom-adapter.js` の `iuc_cond` 処理を確認）

**実装内容（調査後に詳細化）**:
- [ ] `turn-row.js` の skill select option に `残りN回` を付記
- [ ] 残り 0 回のスキルを `disabled` 表示
- [ ] use_count 増加要因（装備設定）が変わった場合に select を再描画
- [ ] use_count 消費 / 回復 / 無消費条件を replay・再計算・session load で一貫して扱う

完了条件:
- [ ] use_count のあるスキルに残り回数が表示される
- [ ] 残り 0 回のスキルが選択不可になる

> ❌ T19 未着手（T13 より後に着手すること）

---

### T20: iOS / モバイル レスポンシブ対応

> **発端**: iOS Safari / Chrome で「▶ 戦闘開始」ボタンがブラウザ UI（タブバー）に隠れて押せない
> **優先度**: **最高**（使用不能バグのため）
> **発見日**: 2026-03-17

#### 根因の整理

iOS Safari / Chrome では viewport の計算が Desktop と異なる：

```
物理画面
┌──────────────────────┐
│  アドレスバー (~50px)  │  ← ブラウザ UI（100vh の外側）
├──────────────────────┤  ← 100vh 上端（最大 viewport）
│                      │
│  コンテンツ領域        │  ← 実際に見える領域は 100vh より小さい
│                      │
│  ▶ 戦闘開始           │  ← sticky bottom-0 はここのつもり
├──────────────────────┤  ← 100vh 下端（実際はここが見えない）
│  タブバー (~83px)     │  ← ブラウザ UI がコンテンツを隠す
└──────────────────────┘
```

| 問題番号 | 症状 | 原因 |
|----------|------|------|
| P-A | ページ全体がタブバー分だけはみ出す | `h-screen` = `100vh` が iOS 最大 viewport で計算される |
| P-B | `sticky bottom-0` ボタンがタブバー・ホームインジケーターと重なる | `env(safe-area-inset-bottom)` が未設定 |
| P-C | モバイル縦画面（375px 以下）で setup-area（`w-96` = 384px）が turn-area を隠す | 小画面レイアウト未対応 |

#### T20-A: `dvh` による高さ修正 【最優先・P-A 解消】

**修正方針**: `100vh` の代わりに `100dvh`（Dynamic Viewport Height）を使う。
`dvh` はブラウザ UI が出ている・隠れているに関わらず「今見えている高さ」を返す。

- サポート状況: iOS Safari 15.4+（2022〜）/ Chrome 108+（2022〜）
- 古いブラウザ向けフォールバックとして `100vh` を先に書く

**変更ファイル**: `ui-next/index.html`, `ui-next/styles.css`

```html
<!-- index.html body クラス変更 -->
<!-- before: class="bg-gray-50 text-gray-900 h-screen flex flex-col overflow-hidden" -->
<!-- after:  class="bg-gray-50 text-gray-900 flex flex-col overflow-hidden h-screen h-dvh" -->
```

```css
/* styles.css に追加: h-screen を上書きする dvh ユーティリティ */
.h-dvh {
  height: 100dvh; /* フォールバックは h-screen（100vh）が先に宣言済み */
}
```

- [x] `index.html`: `body` クラスに `h-dvh` 追加（`h-screen` との併記でフォールバック）
- [x] `styles.css`: `.h-dvh { height: 100dvh; }` を追加

完了条件:
- [x] iPhone Safari でページを開き、コンテンツがタブバーに隠れない

#### T20-B: セーフエリア対応 【最優先・P-B 解消】

**修正方針**: `viewport-fit=cover` + `env(safe-area-inset-bottom)` でボタンをホームインジケーター・タブバーより上に配置する。

**変更ファイル**: `ui-next/index.html`, `ui-next/styles.css`, `ui-next/components/initial-setup.js`

```html
<!-- index.html: viewport-fit=cover を追加 -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

```css
/* styles.css に追加 */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
/* sticky フッター全体に適用するクラス */
.footer-safe {
  padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
}
```

```javascript
// initial-setup.js: sticky footer div のクラスに pb-safe を追加
// before: class="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-2 space-y-1.5"
// after:  class="sticky bottom-0 bg-white border-t border-gray-200 px-3 pt-2 pb-safe space-y-1.5"
```

エラートースト（`fixed bottom-4 right-4`）も同様に対処:
```html
<!-- index.html: bottom-4 → bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] -->
```

- [x] `index.html`: `viewport-fit=cover` 追加
- [x] `styles.css`: `.pb-safe` / `.footer-safe` ユーティリティ追加
- [x] `initial-setup.js`: `sticky bottom-0` フッターに `pb-safe` 適用
- [x] `index.html`: エラートーストに safe-area 考慮の `bottom` 値を設定

完了条件:
- [x] iPhone Safari でスクロール後「▶ 戦闘開始」がホームインジケーターより上に表示される
- [x] ノッチなし iPhone（SE 等）でも余分な余白が出ない（フォールバック値 `0px`）

#### T20-C: モバイル縦画面レイアウト【次点・P-C 解消】

**現状の問題**: `main` は `flex-row`（横並び）で `setup-area` が `w-96`（384px）固定。
iPhone SE（375px）だと setup-area 単独で画面幅を超え、turn-area が見えない。

**修正方針**: `sm:` ブレークポイント（640px）境界でレイアウトを切り替える。

```
640px 未満（モバイル縦）:
┌──────────────────────────┐
│ header                   │
├──────────────────────────┤
│ setup-area（上段）        │  ← full-width、max-h 制限 + overflow-y-auto
│  ▶ 戦闘開始              │
├──────────────────────────┤
│ turn-area（下段）         │  ← flex-1、スクロール
└──────────────────────────┘

640px 以上（タブレット / デスクトップ）:
┌──────────────────────────────────────┐
│ header                               │
├──────────────────┬───────────────────┤
│ turn-area（左）  │ setup-area（右）  │
│  flex-1          │  w-96             │
└──────────────────┴───────────────────┘
```

**変更ファイル**: `ui-next/index.html`, `ui-next/styles.css`

```html
<!-- index.html: main の flex 方向をレスポンシブに -->
<main id="app" class="flex-1 flex flex-col-reverse sm:flex-row overflow-hidden">
  <!-- turn-area: モバイルでは下段、sm以上では左ペイン -->
  <section id="turn-area" class="flex-1 overflow-y-auto p-2 sm:p-6 min-h-0">
  <!-- setup-area: モバイルでは上段 full-width + max-h 制限、sm以上では右ペイン w-96 -->
  <aside id="setup-area"
         class="w-full sm:w-96 shrink-0 overflow-y-auto
                max-h-[50dvh] sm:max-h-none
                bg-white border-b sm:border-b-0 sm:border-l border-gray-200
                transition-transform duration-300">
```

- [x] `index.html`: `main` を `flex-col-reverse sm:flex-row` に変更
- [x] `index.html`: `setup-area` を `w-full sm:w-96` / `max-h-[50dvh] sm:max-h-none` / `border-b sm:border-l` に変更
- [x] `index.html`: `turn-area` の padding を `p-2 sm:p-6` に縮小（モバイルで余白節約）
- [x] モバイル close: `max-height: 0` / `overflow: hidden`、デスクトップ close: `translateX(100%)` でそれぞれ対応
- [x] リサイズ時に `applySetupOpen` 再適用で横断切替を安全にする

完了条件:
- [x] iPhone SE（375px）で setup-area と turn-area が両方見える
- [x] setup-area が画面の半分程度の高さに収まり、turn-area がスクロール可能
- [x] sm 以上（タブレット / PC）で従来の横並びレイアウトが維持される

#### T20-D: タッチ操作 UX 改善

> **2026-04-01整理**: 残項目は T20-E と一体で扱う。swap 実装は完了済み。

- [x] タッチでの交代（swap）: turn-row.js にタップ swap 実装済み（iOS 代替操作・クリック兼用）
- [ ] ボタンのタップターゲットを `min-h-[44px]` に統一（iOS HIG 基準）
- [ ] モバイルでの `select` (スキル選択 / LB等) タップ時のネイティブ picker との干渉確認

#### T20-E: デスクトップ調整後のモバイル UI 全般見直し ❌

> **発端（2026-04-01）**: T22/T23 等のデスクトップ向け Layout Rework 以降、モバイルレイアウトのバランスが大幅に崩れた。細部より先に全体的な可読性・操作性の回復を優先する。

- [ ] モバイル（375px〜430px）で各タブ（Party / Enemy Setup / Settings）の表示崩れを確認・修正
- [ ] ターン行（turn-row）の横幅・文字サイズ・ボタン配置がモバイルで使えるレベルか確認・修正
- [ ] utility bar（ヘッダー）がモバイルで潰れていないか確認・修正
- [ ] setup-area の max-h 制限（`max-h-[50dvh]`）と turn-area のスクロールが正常に機能しているか再確認
- [ ] 主要操作ボタンのタップターゲットを `min-h-[44px]` 基準で見直す
- [ ] モバイルでの `select`（スキル選択 / LB等）とネイティブ picker の干渉を確認・修正

完了条件:
- [ ] iPhone SE / iPhone 15 Pro 相当の実機またはエミュレータで主要操作が一通りできる
- [ ] タッチ操作だけで主要導線を完結できる

---

> 🔶 T20 部分完了（2026-03-17 / 2026-04-01更新）: A/B/C と D のタッチ交代（swap）は実装済み。
> ⚠️ 残タスクは T20-E に集約し、モバイルレイアウト再調整とタッチ UX を一体で見直す。

---

### T21: Passive Debug Log

- [x] `Initial Setup` に独立 top-level tab `Passive Log` を追加
- [x] `ui-next/utils/passive-debug-log.js` を追加し、`initialState.turnState.passiveEventsLastApplied` と `committedRecord.passiveEvents` から表示専用 row を再構築
- [x] `TurnAreaController` に `onPassiveLogRowsChange` callback を追加し、`initialize` / `loadSession` / `reinitialize` / successful `commit` 後に rows を置換通知
- [x] row 種別を `marker` / `passive` の 2 種に固定し、`=== 戦闘開始 ===` / `=== Tn実行 ===` / `=== EX開始 ===` / `--- OnBattleStart ---` など最小 marker だけを出す
- [x] `InitialSetupController#setPassiveLogRows(rows)` を追加し、`nowrap + 横スクロール` の単一コンテナへ 1 passive 1 行で描画
- [x] `tests/ui-next-initial-setup.test.js` / `tests/ui-next-turn-ui.test.js` を更新し、初期 battle-start、`passive_trigger`、`OnAdditionalTurnStart`、`reinitialize/loadSession` の置換再構築を固定

完了条件:
- [x] 現在 session の passive 発火状況を `Initial Setup > Passive Log` でリアルタイム確認できる
- [x] 空の timing marker を出さず、既存 engine の timing を解釈し直さず raw event を監査表示できる
- [x] 既存 session snapshot / replay / engine contract の shape を変更しない

> ✅ T21 完了（2026-03-21）: `Passive Log` タブ、display 専用 row builder、`TurnAreaController` callback 配線、nowrap log container、JSDOM テスト 2 ファイルを追加。旧 `dom-adapter` と同様に `passiveDesc || desc || passiveName` で空 desc を補完する。

---

### T22: UI Next rollback + selective layout rework

- [x] 現在の自動生成 UI 案を `feature/ui-next-autogen-snapshot-20260328` に `WIP: snapshot auto-generated ui-next rebalance` として退避
- [x] `checkpoint/pre-ui-ux-pro-max-work-20260328-01` 起点の `feature/ui-next-layout-rework` を作成
- [x] 上部ヘッダーを title/logo 型から最小 utility bar に縮小し、`設定` / `ログ` / `レイアウト` / `PNG保存` の必須操作だけ残す
- [x] current session の JSON 保存 / 読込を utility bar へ移し、smartphone では icon-only toolbar に切り替える
- [x] `レイアウト` toggle は desktop 専用にし、smartphone toolbar では非表示にする
- [x] Setup hidden 時は `#setup-area` 自体を layout から外し、TurnPlanner が全幅を使う構成へ戻す
- [x] `Initial Setup` を tab shell に戻し、`Passive Log` タブを削除
- [x] `Passive Log` を TurnPlanner 下段の collapsible pane へ移設
- [x] `Turn info` box の幅・padding・gap を広げ、`# / T / OD / EX` の詰まりを緩和
- [x] 絵文字ボタンを廃止し、status toast の success/error tone 分離は維持
- [x] `tests/ui-next-passive-log-pane.test.js` / `tests/ui-next-workspace-shell.test.js` を追加し、`tests/ui-next-initial-setup.test.js` を更新

完了条件:
- [x] Setup open 時は `TurnPlanner + Setup` を同時表示できる
- [x] Setup hidden 時は `TurnPlanner` が全幅を使う
- [x] `Simulator Settings` 表示時に `Party Setup` と重ならない
- [x] `Passive Log` が Setup ではなく独立 pane に出る
- [x] `node --test tests/ui-next-initial-setup.test.js tests/ui-next-party-setup.test.js tests/ui-next-passive-log-pane.test.js tests/ui-next-workspace-shell.test.js tests/ui-next-turn-ui.test.js` が PASS

> ✅ T22 完了（2026-03-28）: snapshot branch 退避、tag 基点 branch での layout やり直し、Setup hidden 時の全幅化、Passive Log 下段 pane 化、utility bar 化、Turn info box の余白見直し、JSON save/load の toolbar 移設、mobile icon-only toolbar 化、JSDOM 50 件 PASS を確認。

### T23: PNG capture rework

- [x] `Simulator Settings` の `captureUntilBattleEnd` toggle を有効化
- [x] `captureUntilBattleEnd` の起動時既定値を `ON` にする
- [x] PNG 保存対象を committed rows only に固定し、input / edit row を除外
- [x] committed row に `data-battle-ended` を付け、最初の battle-end row までで打ち切れるようにする
- [x] PNG 保存を offscreen clone ベースに組み替え、live DOM を変更しない
- [x] clone root に export contract（container context / slot layout / 幅メトリクス）を集約し、in-place capture は採用しない
- [x] PNG 時に右側の操作列を除外し、note 列を詰めた capture 専用レイアウトにする
- [x] session snapshot / Initial Setup / Turn UI / PNG helper の JSDOM テストを追加・更新

完了条件:

- [x] `captureUntilBattleEnd` が session save/load をまたいで保持される
- [x] battle-end row がある session では、その行を含むところまで PNG 保存される
- [x] PNG に `編集 / 実行 / 再コミット / キャンセル / OD操作` 列が出ない

> ✅ T23 完了（2026-03-28）: `png-capture` helper を追加し、TurnArea の offscreen clone を PNG 化する方式へ変更。`captureUntilBattleEnd` toggle を有効化し、起動時既定値を `ON` に設定、committed row のみ保存、`data-battle-ended` による battle-end 打ち切り、操作列除外、JSDOM テスト追加を反映。追補として offscreen sandbox の `visibility:hidden` 継承で PNG が白紙化する不具合と、`toPng(width/height)` 強制指定で横幅が過大になり右半分が空白化する不具合を修正済み。レビュー follow-up として、capture root へ container query context / `data-turn-slot-layout` を転写し、note 列を `live note width + hidden buttons width` で固定する補正を追加。方針として in-place capture は fallback 候補に留め、常用ルートにはしない。

---

### T24: toolbar party preset strip

- [x] Party preset UI を `Party Setup` 本体から外し、header 配下の 2 段目 toolbar strip へ移す
- [x] preset 数を `3 -> 20` に拡張し、`①` 〜 `⑳` の単一 button として表示する
- [x] strip を横スクロール化し、右端に続きがある間だけ `…` overflow indicator を出す
- [x] PartyPickup と共通の 12 マス slot strip renderer を切り出し、hover / action menu preview に流用する
- [x] desktop hover で preview-only、desktop 右クリック / touch 長押しで `保存 / 名前編集 / 消去` menu を出す
- [x] preset 名の任意保存・後編集を追加し、空欄保存時は name を保持しない
- [x] iPhone Safari 向けに slot 番号ヘッダの tap-to-swap 導線を追加し、touch 環境でも Party Setup 並び替えを継続可能にする
- [x] `tests/ui-next-party-preset-toolbar.test.js` を追加し、current-schema の 3-slot -> 20 正規化・preview/menu・load/save/rename/clear を回帰化する

完了条件:

- [x] `Party Setup` 本体に旧 preset UI が残らず、toolbar 2 段目からのみ操作できる
- [x] legacy 3-slot storage を読んでも 1〜3 を保持しつつ 4〜20 が空枠で補完される
- [x] click/tap load、hover preview、right-click / long-press menu が分離して機能する
- [x] preset 名の save / rename / blank clear が localStorage と preview title に反映される

> ✅ T24 完了（2026-03-28）: `party-preset-toolbar` controller と shared `party-slot-strip` renderer を追加し、preset UI を header 2 段目へ移設。`①` 〜 `⑳` の 20 枠、scroll overflow indicator、desktop hover preview、desktop 右クリック / touch 長押し menu、任意 preset 名保存・編集、current-schema の 3-slot -> 20 正規化を反映。追補として iPhone Safari で drag-and-drop に依存しない slot header tap-to-swap を追加し、desktop 側も slot header を drag handle として front/back をまたぐ D&D swap を維持するよう補正。なお `equippedSkillIds` を持たない旧 preset 形式は後方互換対象にせず、読込時に `null` へ潰して 20 枠配列へ書き戻す扱いにしている。

---

### T25: browser D&D hardening + Playwright replacement

- [x] 既存の stale `tests/e2e/enemy-selection.spec.js` / `tests/e2e/skill-cost-label.spec.js` を破棄する
- [x] Party Setup の drag handle に browser 向け補正（掴み幅拡大 / `-webkit-user-drag` / root dragover 緩和）を入れる
- [x] TurnPlanner input row の desktop D&D を slot 全体ではなく style icon handle 起点へ寄せ、`dragstart` で `setData('text/plain', '')` を入れる
- [x] `tests/ui-next-party-setup.test.js` / `tests/ui-next-turn-ui.test.js` に `setData` と `dragover.preventDefault()` の回帰を追加する
- [x] `tests/e2e/ui-next-helpers.js` を追加し、Playwright の D&D シナリオを UI Next 専用 helper 経由に寄せる
- [x] `tests/e2e/party-setup-drag-and-drop.spec.js` / `tests/e2e/turn-row-drag-and-drop.spec.js` を追加し、front/back swap を browser 操作で固定する

完了条件:

- [x] Party Setup で front/back slot を D&D でき、LB / drivePierce などの設定値も一緒に移動する
- [x] TurnPlanner input row で front/back slot を icon handle から D&D できる
- [x] 旧 UI 前提の stale E2E が残らず、Playwright の現行正本が D&D シナリオへ差し替わっている

> ✅ T25 完了（2026-03-28）: stale な E2E 2 本を削除し、UI Next 専用 helper と `Party Setup` / `TurnPlanner input row` の D&D Playwright spec へ置換。実装側も Party Setup header handle の browser 補正、TurnRow の icon drag handle 化、`dragstart.setData()`、root `dragover.preventDefault()` へ寄せた。JSDOM 回帰は `tests/ui-next-party-setup.test.js` と `tests/ui-next-turn-ui.test.js` で追加済み。browser 実挙動が論点のため、以後は実装者自身が該当 Playwright spec まで更新・実行する前提で扱う。

---

### T26: legacy UI hard cutover

- [x] entry / docs の公開導線を `ui-next` 正本へ統一する
- [x] `ui-next/index.html` が参照する browser shim を `ui-next/shims/` へ移設する
- [x] `BattleDomAdapter` / 旧 `ui/` entry / 旧 UI 専用 asset を削除する
- [x] 旧 UI 専用 DOM suite を削除し、`ui-next` 側へ必要な共鳴表示保証を移す
- [x] root `/` -> `ui-next/index.html` の Playwright smoke を追加する

完了条件:

- [x] live code から `ui/app.js` / `ui/index.html` / `BattleDomAdapter` / `swap-legacy-note` / `../ui/shims/` 参照が消えている
- [x] `test:dom` / `test:dom:full` が `ui-next` 正本の suite を指している
- [x] 旧 UI 専用ファイルを削除しても `npm test` / `npm run test:e2e` が通る

> ✅ T26 完了（2026-03-29）: ルート導線と Pages 説明を `ui-next` へ統一し、`ui-next/shims/` へ browser shim を移設。`BattleDomAdapter` / `battle-adapter-facade` / 旧 `ui/` entry / mark asset / 旧 DOM suite を削除した。共鳴表示の UI 保証は `tests/ui-next-support-resonance.test.js` へ移し、Playwright に `/` から `ui-next/index.html` へ到達する smoke を追加。`test:dom` / `test:dom:full` も `ui-next` 正本へ差し替え済み。

補足:

- top-level `ui/` はこの時点で作業ツリーから削除済みであり、追加の archive 移動タスクは存在しない
- `src/ui/adapter-core.js` / `src/ui/lightweight-replay-script.js` / `src/ui/style-asset-url.js` は `ui-next` が利用する shared module のため、本タスクの削除対象には含めない

---

### T27: Passive Log pane resize

- [x] `Passive Log` pane 上端に desktop 専用 resize handle を追加する
- [x] pane 高さを workspace shell の in-memory state として持ち、close/open をまたいで同一 session 内の高さを保持する
- [x] `pointerdown/move/up` と `ArrowUp/ArrowDown/Home/End` で高さを変更できるようにする
- [x] 高さを `min 8rem`、`workspace-main - 240px` 上限で clamp し、mobile 幅では resize を無効化する
- [x] `tests/ui-next-workspace-shell.test.js` / `tests/ui-next-passive-log-pane.test.js` と Playwright spec を追加・更新する

完了条件:

- [x] desktop 幅では `Passive Log` の表示領域を上下へリサイズできる
- [x] close -> reopen で最後の高さが維持される
- [x] mobile 幅では resize handle が出ず、固定高さ pane のまま動作する
- [x] `npm test` / `npm run test:e2e` が通る

> ✅ T27 完了（2026-03-29）: `Passive Log` pane に `role="separator"` の desktop-only resize handle を追加し、workspace shell で session-only の高さ state と `pointer` / keyboard resize を実装。高さは `16rem` 初期値、`8rem` 最小、`workspace-main - 240px` 最大で clamp し、mobile 幅では inline height を適用しない。JSDOM に clamp / open-close 維持 / mobile 無効化を追加し、Playwright に desktop drag と mobile 非表示の spec を追加。`npm test` と `npm run test:e2e` で回帰確認済み。

---

### T28: TurnEdit manual-break E2E coverage

- [x] TurnEdit 行で `manual-break-toggle` を押して editor が表示されることを検証する
- [x] `manual-break-single-toggle` または `manual-break-candidate` の操作で break 対象を選択できることを検証する
- [x] recommit 後に再度 TurnEdit を開いた際、選択済み break が保持されることを検証する

完了条件:

- [x] TurnEdit の break メニュー表示と選択操作が Playwright で再現される
- [x] `tests/e2e/turn-edit-manual-break.spec.js` が単体・関連 spec 実行で安定して通る

> ✅ T28 完了（2026-03-30 更新）: `tests/e2e/turn-edit-manual-break.spec.js` で TurnEdit の `manual-break-toggle` 表示、break 候補選択、recommit 後の保持を E2E で固定し、追加で #4/#5 進行相当（5ターンコミット後の編集）でもメニューがクリック可能な回帰を入れた。実装側は `turn-row-list` の縦方向クリップを解除したうえで、manual-break editor を横長・低背レイアウト（auto-fit カラム）に更新。最終配置は「親要素の外に描画する」要件に合わせ、`manual-break-toggle` の実座標へアンカーする fixed overlay 方式で確定し、広い画面幅でもメニューが中央に寄らないよう「トグル左端の真下」を基準に位置決めする調整を追加した。`npm run test:e2e -- tests/e2e/turn-edit-manual-break.spec.js` と `npm run test:e2e -- tests/e2e/turn-edit-swap.spec.js tests/e2e/turn-edit-manual-break.spec.js` で回帰確認済み。

### T29: Enemy Setup 先制フィールド（Turn0）

- [x] `Enemy Setup` タブに `Turn0(先制攻撃)` セクションを追加（敵プリセットより上）
- [x] `開幕フィールド` の単一選択（`なし / 火 / 氷 / 雷 / 光 / 闇`）を追加
- [x] `enemy.preemptiveField` を setup snapshot の保存・復元経路に追加
- [x] `BattleStateManager` で `preemptiveField` を初期 `zoneState` へ変換する実装を追加
- [x] `tests/ui-next-initial-setup.test.js` に表示・snapshot反映・復元の回帰テストを追加
- [x] `tests/ui-next-battle-state-manager.test.js` を追加し、Turn0フィールドの初期適用を固定

完了条件:

- [x] Enemy タブで Turn0 先制フィールドを入力できる
- [x] 入力値が setup snapshot に保存され、`applySetupSnapshot` で復元される
- [x] `none` 以外を選ぶと、バトル開始時パッシブより前に敵由来の `zoneState` が初期適用される

> ✅ T29 完了（2026-03-30）: `ui-next/components/enemy-setup.js` に `Turn0(先制攻撃)` の `開幕フィールド` 入力を追加し、配置を敵プリセットより上へ調整。`ui-next/engine/battle-state-manager.js` で `preemptiveField` を `zoneState`（`sourceSide='enemy'`）へ変換し、`createInitializedBattleSnapshot` の初期化順により `バトル開始時` パッシブより前に適用されるよう接続。`tests/ui-next-initial-setup.test.js` と `tests/ui-next-battle-state-manager.test.js` で回帰を固定。

### T30: Session JSON 旧フォーマット互換（styleIds=0）

- [x] session 読込正規化で `setup.styleIds` の `0` を `null` として扱う
- [x] session 読込正規化で `setup.supportStyleIds` の `0` を `null` として扱う
- [x] `tests/ui-next-session-snapshot.test.js` に回帰テストを追加する

完了条件:

- [x] 旧 session JSON（空スロットを `0` で保持）を読み込んでも `Style not found: 0` で落ちない
- [x] 正規化後の `styleIds` / `supportStyleIds` は空スロットが `null` になる

> ✅ T30 完了（2026-03-30）: `ui-next/utils/session-snapshot.js` で style ID 正規化を `toOptionalStyleId` に分離し、`<= 0` を空スロット (`null`) として扱う後方互換を追加。`tests/ui-next-session-snapshot.test.js` に旧形式（`styleIds: [..., 0, 0, 0]` / `supportStyleIds: [0,...]`）の回帰ケースを追加し、`node --test tests/ui-next-session-snapshot.test.js` で PASS を確認。

### T31: SP>=0条件＋速弾きの合算使用可否実装

- [x] `CharacterStyle.normalizeSkill` で `canonicalSkill.cond` のフォールバックを有効化
- [x] `previewSkillUseResolved` で SP消費スキルの使用可否を仕様ベースに判定
  - 通常: `currentSP >= spCost`
  - `Sp()>=0` 条件あり or `速弾き中`: `currentSP >= 0`
- [x] `tests/shredding.test.js` を仕様に合わせて更新（通常スキルのSP不足は使用不可）
- [x] `tests/ui-next-turn-engine-manager.test.js` の関連fixtureを新ルール準拠へ更新

完了条件:

- [x] 「SPが0以上であれば使用可能」仕様を満たすスキルが `SP>=0` で使用できる
- [x] 速弾き中は `SP>=0` で高コストスキル使用が可能（`sp_cost=-1` の特殊挙動は既存cond準拠）
- [x] 通常スキルはSP不足時に使用不可になる

> ✅ T31 完了（2026-03-30）: `src/domain/character-style.js` にて `cond` の canonical fallback と SP使用可否ルールを実装。`Sp()>=0` と `Shredding` を優先例外として扱い、それ以外はコスト不足でエラー化。`tests/shredding.test.js` と `tests/ui-next-turn-engine-manager.test.js` を更新し、`node --test tests/shredding.test.js tests/ui-next-turn-engine-manager.test.js` で全PASSを確認。

### T32: Stage Setup 実装（Phase1: A区分）

> **現状**: Phase1（A区分: 初期OD/SP/DefenseUp/DebuffGuard）は実装済み。B/C区分は未着手。

#### T32-A: Stage Setup スコープ整理
- [x] 旧UI / shared engine / 現行設計から Stage Setup で扱う初期 state を棚卸しする
- [x] Phase1 の対象を A区分（初期OD/SP/DefenseUp/DebuffGuard）として確定する
- [ ] zone / territory / talisman / その他 stage 側 state（B/C区分）を追加確定する

#### T32-B: Stage Setup UI
- [x] `Stage Setup` タブにフォームを実装する（上段自由入力 + 下段恒星戦プリセット）
- [x] setup snapshot の保存・復元経路へ追加する（`selectedDimensionBattleId` を含む）
- [x] 下段プリセットは明示ボタンで上段へ転記し、参照入口を上段に一本化する

#### T32-C: BattleState 接続
- [x] `BattleStateManager` の初期 state へ stage setup を反映する（A区分）
- [x] unit / integration test を追加する

完了条件:
- [x] `Stage Setup` タブで stage 側初期設定を入力できる（A区分）
- [x] Apply 後に stage 設定が BattleState に反映される（A区分）
- [ ] B/C区分（継続効果注入・新規ロジック）は後続フェーズで実装する

> 🔶 T32 Phase1 完了（2026-04-04）: `ui-next/components/stage-setup.js` を追加し、上段自由入力（初期OD/SP/DefenseUp/DebuffGuard）と下段恒星戦プリセット（`json/dimension_battle.json`）を実装。下段チェック内容は「チェック内容を上段へ反映」ボタンでのみ転記され、戦闘計算は上段 snapshot のみを参照する。`InitialSetupController` / `app.js` / `session-snapshot` を接続し、`tests/ui-next-stage-setup.test.js` と `tests/ui-next-initial-setup.test.js` ほか関連回帰を通過。

> ✅ T32 Phase1 追補（2026-04-04）: `Party Setup` に「全て初期化」ボタンを `PT解散` 左隣へ追加。`InitialSetupController` の統合導線で `party.disbandParty()` + `enemy.resetToDefaults()` + `stage.resetToDefaults()` を一括実行し、`tests/ui-next-party-setup.test.js` / `tests/ui-next-initial-setup.test.js` / `tests/ui-next-stage-setup.test.js` の回帰を通過。

### T33: 固有スキル / パッシブ未反映効果の洗い出し・テスト

> **目的**: 実データ上で「発動していない」「効果が反映されていない」固有スキル / パッシブを棚卸しし、再現テストを先に固定する。

- [ ] 実データ基準で未反映・未対応の固有スキル / パッシブを列挙する
- [ ] `effectType` / `condition` / `timing` ごとに未対応理由を分類する
- [ ] 再現ケースを unit / integration / 必要に応じて browser test に落とす
- [ ] 優先度順に修正対象を backlog 化する

完了条件:
- [ ] 未反映効果の一覧と再現テストが揃っている
- [ ] 以後の effect 実装をテスト駆動で進められる状態になっている

> ❌ T33 未着手

### T34: 敵状態変化（バフ/デバフ）管理・表示

> **T16-B との差分**: T16-B は Enemy Setup タブでの「戦闘開始前の初期敵状態」入力。T34 は戦闘中の敵状態変化の付与・残ターン管理・UI表示を扱う。

- [ ] 敵側 status effect のデータモデルを整理し、付与 / 残ターン減少 / 永続 / 消滅を一貫管理する
- [ ] 敵への状態変化付与を replay / 再計算で再現できるようにする
- [ ] 敵状態変化（バフ/デバフ）を turn row / popup / enemy UI 上へ表示する
- [ ] enemy-side status の unit / integration / 必要に応じて E2E を追加する

完了条件:
- [ ] 敵の状態変化が戦闘中に正しく付与・更新・消滅する
- [ ] 画面上で敵バフ/デバフと残ターンが確認できる

> ❌ T34 未着手

---

## 残タスク優先度サマリ（2026-04-01 更新）

本シミュレータは SP/OD 計算機であるため、現時点の未完了タスクを下記の優先順で実装する。

| 優先度 | タスク | 理由 |
|--------|--------|------|
| **最高** | T20-E モバイル UI 全般見直し（タッチUX含む） | デスクトップ調整後に大幅に崩れており、利用導線全体に影響 |
| **高** | T34 敵状態変化（バフ/デバフ）管理・表示 | enemy-side state が見えず、検証性と実用性の両方に影響 |
| **高** | T16-B Enemy Setup 初期ステータス | 正しい敵初期状態なしに OD 計算・再現性が安定しない |
| **中** | T32 Stage Setup 実装（Phase2/3） | A区分は実装済み。B/C区分（継続効果注入・新規ロジック）が未完了 |
| **中** | T33 固有スキル / パッシブ未反映効果の洗い出し・テスト | 不正確な挙動が埋もれやすく、今後の修正優先度決定に必要 |
| **低** | T19 use_count 表示・管理 | 複雑な仕様調査が先決だが、使用可否の正確性には必要 |

---

## メモ

- engine bugfix が必要になった場合は、原則 `main` を経由して取り込む
- UI Next 側だけで必要な試験実装は、新 UI 専用ロジックへ閉じ込める
- 共有 asset / resolver / contract は `main` に戻しやすい粒度を維持する
