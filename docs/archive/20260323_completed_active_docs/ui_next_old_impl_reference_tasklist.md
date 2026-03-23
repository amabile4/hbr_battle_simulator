# UI Next: 旧実装参照インデックス作成タスクリスト

> **ステータス**: ✅ 完了
> **ブランチ**: `feature/ui-next-initial`
> **最終更新**: 2026-03-16
>
> **目的**:
> 1. 旧実装（`ui/` + `src/ui/`）のゲームルール・制約を索引化し、新 UI 実装時の参照先を作る
> 2. 旧実装の肥大化原因を把握し、新 UI で同じ轍を踏まない設計指針を確立する
>
> **調査対象の確定（2026-03-16）**:
> - `archive/legacy_implementation_20260228_224026/` は入力データ形式が異なるため **調査対象外**
> - 「旧実装」= `ui/index.html` + `src/ui/dom-adapter.js`（+ 関連 `src/ui/` ファイル）
>
> **旧実装の特性（引き継ぎメモ）**:
> - デメリット: `src/ui/dom-adapter.js` が **8726行** に肥大化、修正コストが高い
> - メリット: 網羅的にゲーム状態を実装（OD/EX/鬼神化/割込OD/Enemy Setup等）
> - 教訓: UI 層に判定ロジックを書きすぎた → 今回は「エンジンに委ねる」設計を徹底する

---

## タスク一覧

### T01: 旧実装ファイル構造の把握（調査）

**目的**: 旧 UI がどのファイルで何を担っているかを把握する。

**調査対象ファイル**:
```
src/ui/
├── dom-adapter.js        ← 旧UIの全ロジック（8726行・最も肥大化）
├── adapter-core.js       ← StatusEffect正規化・replay helpers（498行）
├── battle-adapter-facade.js ← BattleState初期化ファサード（202行）
├── lightweight-replay-script.js ← ReplayScript 構造定義（443行）
└── dom-view.js           ← DOM構造生成ユーティリティ（80行）

ui/
├── index.html            ← 旧UIのHTML（408行、フラットなパネル積み重ね）
└── app.js                ← エントリポイント（75行）
```

**成果物**: 各ファイルの責務・主要関数・行数をまとめた1ページのメモ

- [x] 各ファイルの行数・主要関数名を列挙する
- [x] 「どの旧ファイルが新 UI のどのコンポーネントに対応するか」のマッピング表を作る

#### 旧実装ファイル一覧（調査結果）

| ファイル | 行数 | 主な責務 |
|---------|------|---------|
| `src/ui/dom-adapter.js` | 8726 | キャラ選択・ターン制御・スキル選択・swap・OD・Enemy Setup・Records テーブル・CSV export を一括担当 |
| `src/ui/adapter-core.js` | 498 | StatusEffect 正規化、replay turn への override 適用、previewTurn/commitTurn bridge |
| `src/ui/battle-adapter-facade.js` | 202 | `createInitializedBattleSnapshot()` ファサード、BattleState 初期化 |
| `src/ui/lightweight-replay-script.js` | 443 | ReplayScript 構造定義・生成・操作 API |
| `src/ui/dom-view.js` | 80 | `BattleDomView` – DOM 構造の基礎生成 |
| `ui/index.html` | 408 | 旧 UI の HTML。フラットなパネル積み重ねレイアウト |
| `ui/app.js` | 75 | エントリポイント。`HbrDataStore.fromRawData()` → `BattleDomAdapter.mount()` |

#### spec 要素 vs 旧実装対応表

`ui_next_gui_design_spec.md` の各要素が旧 `ui/` でどう実装されているかを示す。

| spec 要素 | 旧実装 (`ui/index.html` + `dom-adapter.js`) | `ui-next/` 実装状況 |
|-----------|----------------------------------------------|---------------------|
| **Party Setup 6スロット** | `data-role="style-slots"` フォーム（select形式、画像なし） | ✅ `party-setup.js` |
| **Style Picker 全画面** | なし（style は select で直接選ぶ） | ✅ `style-picker.js` |
| **D&D スロット並替** | なし（`data-role="swap-from/to"` select 形式） | ✅ `turn-row.js` |
| **main style 画像表示** | なし（テキストのみ） | ✅ `party-setup.js`, `turn-row.js` |
| **support style + 共鳴表示** | `data-role="resonance-detail"` テキスト表示 | ✅ `party-setup.js` |
| **ゲーム画面ビュー (aspect-video)** | なし | ❌ 未実装 |
| **キャラアイコン群 SP バッジ (6人横一列)** | なし（`data-role="party-state"` リストテキスト） | ✅ `turn-row.js` |
| **OD ゲージ表示** | `data-role="turn-label"` テキスト固定幅 | ✅ `turn-row.js` |
| **ターンレコードテーブル（5列）** | 詳細多列テーブル（turnId/turnLabel/actions/snapBefore/snapAfter 等 20列+） | 🔶 TurnRow カスタム形式 |
| **スキル選択** | `data-role="action-slots"` select | ✅ `turn-row.js` |
| **Commit / Preview ボタン** | `data-action="commit"` / `data-action="preview"` | ✅ `turn-row.js`（Commit のみ） |
| **全ターン再計算** | `data-action="turn-plan-recalc"` ボタン | ❌ T12-E 未実装 |
| **OD発動・割込OD** | `data-action="open-od"` / `data-action="open-interrupt-od"` | ❌ T12-E 未実装 |
| **鬼神化** | `data-action="kishinka"` ボタン | ❌ T12-E 未実装 |
| **Enemy Setup（敵設定）** | Turn Controls パネルに enemy-action/count/status 等の詳細フォーム | 🔶 `initial-setup.js` placeholder のみ |
| **Scenario Runner** | `data-role="scenario-json"` JSON replay | 🔶 `TurnEngineManager` に ReplayScript あり |
| **CSV Export** | `data-action="export-csv"` | ❌ 未実装 |
| **タブ UI (スキル選択/部隊設定)** | なし（パネル積み重ね） | 🔶 右ペインに InitialSetup タブ |

> ✅ T01 完了（2026-03-16）

---

### T02: ゲームルール・制約の参照インデックス作成（メイン成果物）

**目的**: 新 UI 実装時に「このルールはエンジンのどこにある？」を即座に引けるインデックス。

**調査方針**: ルールの実体は `src/` に既に存在する。旧 UI でも `src/` を呼んでいるだけ。
索引は「ルール名 → src/ の関数 → 旧 UI での使われ方」の3列で作る。

**調査カテゴリ**:

#### A. ターン種別とキャラクター行動制約
- [x] 通常ターン: 前衛3名が行動可能
- [x] OD ターン (OD1/OD2/OD3): 行動可能キャラの変化
- [x] EX ターン: `allowedCharacterIds` による行動制約（`isMemberActionableInCurrentTurn`・`canSwapWith` は確認済み）
- [x] EX ターン後のターン継続ロジック

#### B. ポジション・スワップ制約
- [x] 前衛↔後衛スワップ: 通常ターンでの制約
- [x] OD ターン中スワップ: 可否と制約
- [x] EX ターン中スワップ: `canSwapWith` 確認済み（`allowedCharacterIds` 両者一致のみ）
- [x] スワップが SP・バフに与える影響

#### C. スキル使用制約
- [x] `skillUsableInExtraTurn`: EX ターン使用不可スキル
- [x] `cond` / `iuc_cond`: スキル使用条件式
- [x] SP コスト・上限・下限（`applySpChange`）
- [x] スキル使用回数制約（PRI-018 で別途実装中）

#### D. OD ゲージ
- [x] OD ゲージ計算式（`specs/od_gauge_calculation_spec.md` 参照）
- [x] OD 発動トリガーとターン移行

#### E. SP 管理
- [x] SP 回復タイミング（毎ターン）
- [x] SP 上限拡張（特性による 25/30）
- [x] OD 中 SP 回復

**成果物ファイル**: `docs/specs/ui_next_game_rules_index.md`

- [x] 上記 A〜E のルールごとに「src/ の関数名・ファイル」を記載する
- [x] 旧 UI (`ui/`) での対応コード箇所を備考として記載する

> ✅ T02 完了（2026-03-16）: `docs/specs/ui_next_game_rules_index.md` 作成。T01 結果（旧実装ファイル一覧・spec要素対応表）も同ファイルに Part 1 として収録。

---

### T03: 旧実装の肥大化原因分析と設計指針策定

**目的**: 旧実装が肥大化した原因を特定し、新 UI の設計指針にフィードバックする。

**調査観点**:

- [ ] `js/control-manager.js` の肥大化原因を分析する
  - UI 層で何の判定をしているか（エンジンでやるべきだったもの）
  - 状態管理がどこにあるか（グローバル vs. コンポーネント）
  - イベントハンドラの責務が分離できているか

- [ ] 新 UI 設計指針をまとめる（以下のドラフトを検証・補完する）

**設計指針ドラフト（検証して確定させること）**:

```
原則1: エンジンの出力を信頼する
  - ターン制約・スキル制約の判定は src/ に委ねる
  - UI は「行動可能か？」を独自計算せず、エンジンが返したデータを参照する
  - 例外: EX待機表示など「表示のための」最小判定は UI に置く（isActionable 程度）

原則2: 状態の持ち場を明確にする
  - BattleState・ReplayScript は TurnEngineManager が保持
  - UI コンポーネントは受け取ったデータを表示するだけ
  - UI コンポーネントは自前で BattleState のコピーを持たない

原則3: 条件分岐をエンジンの出力形式で吸収する
  - UI に「if OD turn then ... else if EX turn then ...」を書かない
  - エンジンが返す record/state のフィールドをそのまま表示に使う
  - 旧実装の失敗例: ターン種別の switch が UI 中に散在

原則4: コンポーネントの責務境界を守る
  - TurnRow: 1ターンの表示と入力収集のみ
  - TurnArea: ターンリストの管理と TurnEngineManager への委譲
  - TurnEngineManager: engine bridge（計算・状態管理）
  - 旧実装の失敗例: display-manager が control-manager を直接操作
```

**成果物**: 上記指針を検証・補完したものを `docs/specs/dev_principles.md` に追記する

- [x] `src/ui/dom-adapter.js` の主要関数をスキャンして肥大化原因を特定する（`js/control-manager.js` は archive のため対象外）
- [x] 設計指針ドラフトを検証し、具体的な「やってはいけない例」を旧実装から引用する
- [x] `docs/specs/dev_principles.md` に「新 UI 設計指針」セクションを追記する

> ✅ T03 完了（2026-03-16）: 肥大化の根本原因を 6 項目特定。設計指針ドラフト（原則1〜4）を実コード引用で検証・確定し、原則5（直接 state 変更禁止）を追加した。`docs/specs/dev_principles.md` に §5 として追記済み。

---

### T04: 成果物の登録・セッション引き継ぎ確認

- [x] `docs/specs/ui_next_game_rules_index.md` を `docs/README.md` に登録する（T02 完了時に実施済み）
- [x] `docs/specs/dev_principles.md` の更新を `docs/README.md` に反映する（既存エントリ更新）
- [x] このタスクリストのステータスを更新する

> ✅ T04 完了（2026-03-16）

---

## 作業順序

```
T01（ファイル構造把握）
  ↓
T02（ゲームルール索引）← メイン成果物
  ↓
T03（肥大化原因 + 設計指針）
  ↓
T04（登録・引き継ぎ）
  ↓
次タスク: ui_next_implementation_tasklist.md の T12-E（最小化・全再計算等）に戻る
```

---

## 次セッションへの引き継ぎ情報

### 現在の実装状態（2026-03-16 時点）

**実装済み（feature/ui-next-initial）**:
- T01〜T12-D + T12-UX 完了（タスクリスト詳細は `docs/active/ui_next_implementation_tasklist.md`）
- EX ターン対応・SP 表示バグ・OD ゲージプレビュー修正済み（コミット済み）

**未実装（T12-E）**:
- `Initial Setup` の最小化（Apply 後）
- `Initial Setup` 変更後の全再計算
- operations（kishinka/割り込みOD）UI
- 最低限のエラー表示

### このタスク完了後にやること

`docs/active/ui_next_implementation_tasklist.md` の T12-E に戻る。
ただし T02 の成果物（ゲームルール索引）を参照しながら実装すること。

### 重要なファイルポインタ

| ファイル | 用途 |
|---------|------|
| `docs/active/ui_next_implementation_tasklist.md` | UI Next 全体タスクリスト |
| `docs/active/ui_next_engine_fix_tasklist.md` | エンジン連携バグ修正（完了）|
| `docs/specs/dev_principles.md` | バグ切り分け・設計原則 |
| `ui-next/components/turn-row.js` | 1ターン表示コンポーネント |
| `ui-next/components/turn-area.js` | ターンリスト管理 |
| `ui-next/engine/turn-engine-manager.js` | エンジン bridge |
| `src/domain/character-style.js` | `canSwapWith` 等のドメインルール |
| `src/turn/turn-controller.js` | `isMemberActionableInCurrentTurn` 等 |
