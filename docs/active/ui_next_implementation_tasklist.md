# UI Next 実装タスクリスト

> **ステータス**: 🟢 進行中 | 📅 開始: 2026-03-15 | 🔄 最終更新: 2026-03-15
>
> **進捗サマリー**: T01 ✅ / T02 🔶（最小化 未） / T03 ✅（T08で完了確認） / T04 ✅ / T05 ✅ / T06 ✅ / T07 ✅ / T08 ✅ / T08-UX ✅ / T09-Engine ✅ / T09-UI ✅ / T10 ✅ / T11 ✅ / T12 🔶（基盤・UX改善済み）
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
- [x] 既存 `ui/index.html` に影響を与えないことを確認する

完了条件:

- [x] 新 UI の空ページが独立して開ける

> ✅ T01 完了（2026-03-15）: `ui-next/index.html`, `ui-next/app.js` 作成。`importmap` で `node:fs` / `node:path` を既存 shim に差し替え済み。

### T02: Party Setup shell

- [x] `Initial Setup` container の中に `Party Setup` block を置く
- [x] `front 3 + back 3` の 6 slot panel を横並びに表示する
- [x] slot panel の基本構成を `main icon -> listbox 群 -> support icon` で組む（T04 と合わせて実装）
- [x] 未選択 slot の empty state と略称 placeholder を定義する
- [x] `Initial Setup` 右ペインをスライドアウト（⚙ 設定 ◀/▶ ボタン）で開閉できる骨格を入れる
- [ ] シミュレーター開始後（Apply 後）に `Initial Setup` を最小化する連携は T09 で実装

完了条件:

- [x] `Initial Setup > Party Setup` の構造が 1 画面で見え、退避導線（スライドアウト）がある

> 🔶 T02 部分完了（2026-03-15）: 6 slot パネル（front 3 + back 3）・3タブシェル（Party/Enemy/Stage）・empty state・listbox 縦積み・右ペインスライドアウト（ヘッダーボタン）実装済み。Apply 後の連携は T09 で実装予定。

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

> ✅ T08-UX 完了（2026-03-15）: Strip 6×2・スロットクリック切替・連続選択境界越え・strip+filter 横並び（3カラム grid）・狭い画面縦積み・チームラベル固定列・SSRグラデーション表現（party-setup / strip 統一条件）・サポート mousedown/touchstart 確定 UX・メインセット済みグレーアウト。

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
- [ ] `Apply` 操作で既存の turn script / replay script を turn 1 から再計算できるようにする
- [ ] 編集中は現在のシミュレート結果を即破棄しないようにする

完了条件:

- [x] 前衛 3 スロット入力後、Apply ボタンがアクティブになる
- [x] Apply で BattleState が生成され、左ペインにキャラ名・SP が表示される
- [x] 後衛スロットを一部空のまま Apply → 左詰めで 3〜5名 BattleState が生成される
- [ ] 新 UI から「初期設定変更後の全再計算」まで到達できる

> ✅ T09-UI 部分完了（2026-03-15）: Apply ボタン連携・`BattleStateManager`（後衛左詰め）・左ペイン BattleState 表示まで実装済み。turn 1 からの全再計算は未実装。

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
- [x] プリセット保存/読込（localStorage: 3スロット、折りたたみ式）
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

完了条件:

- [x] Apply → ターン1入力行が表示される
- [x] スキル select にキャラのスキル一覧が表示される
- [x] Commit → SP が変化したターン2行が追加される
- [x] 過去ターンのスキル変更 → 自動再計算
- [x] D&D でターン内のスロット順を入れ替えできる
- [ ] 「`Initial Setup > Party Setup` を中心に、style 選択と D&D ができ、後続の enemy / stage setup を差し込める新ページ」が成立している（T12-E 完了後）

> 🔶 T12 部分完了（2026-03-15〜03-16）: T12-A〜D + T12-UX + T12-E-1〜E-4 実装済み。kishinka は将来タスク。

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

---

## メモ

- engine bugfix が必要になった場合は、原則 `main` を経由して取り込む
- UI Next 側だけで必要な試験実装は、新 UI 専用ロジックへ閉じ込める
- 共有 asset / resolver / contract は `main` に戻しやすい粒度を維持する
