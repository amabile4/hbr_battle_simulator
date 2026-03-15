# UI Next: 旧実装参照インデックス作成タスクリスト

> **ステータス**: 🟢 進行中
> **ブランチ**: `feature/ui-next-initial`
> **最終更新**: 2026-03-16
>
> **目的**:
> 1. 旧実装（`js/` + `src/`）のゲームルール・制約を索引化し、新 UI 実装時の参照先を作る
> 2. 旧実装の肥大化原因を把握し、新 UI で同じ轍を踏まない設計指針を確立する
>
> **旧実装の特性（引き継ぎメモ）**:
> - デメリット: `js/control-manager.js` 等が肥大化しすぎ、修正コストが高い
> - メリット: 網羅的にゲーム状態を実装（ただし未完）
> - 教訓: UI 層に判定ロジックを書きすぎた → 今回は「エンジンに委ねる」設計を徹底する

---

## タスク一覧

### T01: 旧実装ファイル構造の把握（調査）

**目的**: 旧 UI がどのファイルで何を担っているかを把握する。

**調査対象ファイル**:
```
js/
├── control-manager.js   ← ターン制御の中核（最も肥大化）
├── event-handlers.js    ← UI イベントとスキル管理
├── party-manager.js     ← パーティー編成・配置
├── display-manager.js   ← UI 表示・更新
├── data-manager.js      ← データ読み込み
├── results-manager.js   ← 結果表示・テーブル
└── globals.js           ← グローバル変数と設定
```

**成果物**: 各ファイルの責務・主要関数・行数をまとめた1ページのメモ

- [ ] 各ファイルの行数・主要関数名を列挙する
- [ ] 「どの旧ファイルが新 UI のどのコンポーネントに対応するか」のマッピング表を作る

---

### T02: ゲームルール・制約の参照インデックス作成（メイン成果物）

**目的**: 新 UI 実装時に「このルールはエンジンのどこにある？」を即座に引けるインデックス。

**調査方針**: ルールの実体は `src/` に既に存在する。旧 UI でも `src/` を呼んでいるだけ。
索引は「ルール名 → src/ の関数 → 旧 UI での使われ方」の3列で作る。

**調査カテゴリ**:

#### A. ターン種別とキャラクター行動制約
- [ ] 通常ターン: 前衛3名が行動可能
- [ ] OD ターン (OD1/OD2/OD3): 行動可能キャラの変化
- [ ] EX ターン: `allowedCharacterIds` による行動制約（`isMemberActionableInCurrentTurn`・`canSwapWith` は確認済み）
- [ ] EX ターン後のターン継続ロジック

#### B. ポジション・スワップ制約
- [ ] 前衛↔後衛スワップ: 通常ターンでの制約
- [ ] OD ターン中スワップ: 可否と制約
- [ ] EX ターン中スワップ: `canSwapWith` 確認済み（`allowedCharacterIds` 両者一致のみ）
- [ ] スワップが SP・バフに与える影響

#### C. スキル使用制約
- [ ] `skillUsableInExtraTurn`: EX ターン使用不可スキル
- [ ] `cond` / `iuc_cond`: スキル使用条件式
- [ ] SP コスト・上限・下限（`applySpChange`）
- [ ] スキル使用回数制約（PRI-018 で別途実装中）

#### D. OD ゲージ
- [ ] OD ゲージ計算式（`specs/od_gauge_calculation_spec.md` 参照）
- [ ] OD 発動トリガーとターン移行

#### E. SP 管理
- [ ] SP 回復タイミング（毎ターン）
- [ ] SP 上限拡張（特性による 25/30）
- [ ] OD 中 SP 回復

**成果物ファイル**: `docs/specs/ui_next_game_rules_index.md`

- [ ] 上記 A〜E のルールごとに「src/ の関数名・ファイル」を記載する
- [ ] 旧 UI (`js/`) での対応コード箇所を備考として記載する

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

- [ ] `js/control-manager.js` の主要関数をスキャンして肥大化原因を特定する
- [ ] 設計指針ドラフトを検証し、具体的な「やってはいけない例」を旧実装から引用する
- [ ] `docs/specs/dev_principles.md` に「新 UI 設計指針」セクションを追記する

---

### T04: 成果物の登録・セッション引き継ぎ確認

- [ ] `docs/specs/ui_next_game_rules_index.md` を `docs/README.md` に登録する
- [ ] `docs/specs/dev_principles.md` の更新を `docs/README.md` に反映する
- [ ] このタスクリストのステータスを更新する

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
