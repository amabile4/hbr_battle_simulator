# UI Next: 旧実装機能ギャップ分析タスクリスト

> **ステータス**: ✅ 完了（2026-03-16）
> **ブランチ**: `feature/ui-next-initial`
> **作成**: 2026-03-16
>
> **目的**:
> 旧 UI (`src/ui/dom-adapter.js`, 8726行) の全機能を洗い出し、新 UI への取り込み方針を3分類で整理する。
>
> **分類定義**:
> - **A（新UI未実装）**: 旧UIで実現しており、新UIに取り入れるべき未実装機能
> - **B（エンジン移管）**: 旧UIで実現しているが、本来エンジンで取り入れるべきロジック
> - **C（領域未定）**: 旧UIで実現しているが、新UIにはまだ該当コンテナ・表示領域がなく、入れるべきか設計判断が必要な機能
>
> **前提情報**:
> - 旧実装ファイル構造と spec 要素対応表 → `docs/active/ui_next_old_impl_reference_tasklist.md` T01
> - 現在の新UI実装状況 → `docs/active/ui_next_implementation_tasklist.md` T12
> - 設計原則 → `docs/specs/dev_principles.md`

---

## 調査対象ファイル

| ファイル | 行数 | 役割 |
|---------|------|------|
| `src/ui/dom-adapter.js` | 8726 | 旧UIの全ロジック（最重要） |
| `src/ui/adapter-core.js` | 498 | StatusEffect 正規化・replay bridge |
| `src/ui/battle-adapter-facade.js` | 202 | BattleState 初期化ファサード |
| `src/ui/lightweight-replay-script.js` | 443 | ReplayScript 構造定義 |
| `ui/index.html` | 408 | 旧UIのHTML構造 |

---

## タスク一覧

### T01: dom-adapter.js の機能分類（メイン調査）

**調査方法**: `dom-adapter.js` の主要な関数・`data-action` / `data-role` / `data-event` を全列挙し、各機能を A/B/C に分類する。

**調査カテゴリ**:

#### 1. ターンコントロール系
- [ ] Apply / Reset / Revert 操作
- [ ] OD発動UI（先制OD）— 旧実装の `isPreemptiveOdStep1` 方式と新UI pending フラグ方式の差分
- [ ] 割り込みOD UI（`open-interrupt-od`）
- [ ] 鬼神化ボタン（`kishinka`）— 新UI未実装の全操作フロー確認
- [ ] ターン種別ラベル表示（OD1/OD2/OD3/EX/通常）

#### 2. スロット・スキル選択系
- [ ] スキル選択 select の活性/非活性ロジック（SP不足・条件式・EXターン中）
- [ ] SP 表示（現在値・消費後値・上限超過表示）
- [ ] スキル使用回数表示（use_count 残り）
- [ ] スキル説明テキスト表示（tooltip / inline）
- [ ] スイッチスキル UI（SkillSwitch の切り替えボタン）

#### 3. パーティー表示系
- [ ] DP表示（各メンバーのDP値）
- [ ] バフ/デバフ一覧表示（各メンバーの statusEffects 一覧）
- [ ] OD ゲージ詳細表示（キャラ別超越ゲージ等）
- [ ] 行動順序表示（position順）
- [ ] 鬼神化状態バッジ（鬼神化中/行動不能中）

#### 4. ターンレコード表示系
- [ ] snapBefore / snapAfter の詳細表示（SP詳細・バフ詳細）
- [ ] actions 表示（hitCount・OD獲得量・DP変化）
- [ ] turnId / seqId の表示
- [ ] note 表示・編集

#### 5. Enemy Setup 系
- [ ] enemy HP / DP / 種別の入力
- [ ] enemy 弱点属性・耐性の入力
- [ ] enemy バフ/デバフ初期設定
- [ ] enemy action（敵の行動入力）
- [ ] Eシールド設定

#### 6. CSV Export 系
- [ ] CSV 列の構成（turnId/turnLabel/actions/SP等）
- [ ] エクスポートボタンと出力フォーマット

#### 7. Scenario Runner 系
- [ ] JSON シナリオ入力・実行
- [ ] replay 再現ロジック

#### 8. その他 UI 要素
- [ ] ステータス表示（エラー/情報メッセージ）
- [ ] undo/redo（あれば）
- [ ] 全ターン削除/リセット

---

### T02: 分類結果のまとめ（成果物）

**成果物**: 以下の形式で `docs/active/ui_next_old_feature_gap_analysis.md`（このファイル）の下部に追記。

```
## 調査結果

### 分類A: 新UIに取り入れるべき未実装機能
| 機能 | 旧実装箇所 | 新UI対応方針 | 優先度 |
|------|-----------|------------|--------|
| ... | dom-adapter.js:L#### | ... | 高/中/低 |

### 分類B: エンジンに移管すべきロジック
| 機能 | 旧実装箇所 | 問題点 | 推奨対応 |
|------|-----------|--------|---------|
| ... | dom-adapter.js:L#### | UIに判定ロジックが混在 | src/turn/... に移管 |

### 分類C: 新UIに領域がなく設計判断が必要な機能
| 機能 | 旧実装箇所 | 現状 | 判断ポイント |
|------|-----------|------|------------|
| ... | dom-adapter.js:L#### | 新UIに該当パネルなし | 追加 or スコープ外 |
```

---

### T03: 優先度付きロードマップへの反映

- [ ] 分類A の機能を `ui_next_implementation_tasklist.md` の後続タスクとして追記する
- [ ] 分類B の機能を `docs/specs/dev_principles.md` の「やってはいけない例」に追記する
- [ ] 分類C の機能に対してユーザーと設計判断を行う

---

## 作業順序

```
T01（dom-adapter.js 機能分類）
  ↓
T02（分類結果まとめ → このファイルに追記）
  ↓
T03（ロードマップ反映 → 別ファイル更新）
```

---

## 参照先ファイル

| ファイル | 参照目的 |
|---------|---------|
| `src/ui/dom-adapter.js` | 調査対象（8726行） |
| `docs/active/ui_next_implementation_tasklist.md` | 現在の実装状況（T12まで） |
| `docs/active/ui_next_old_impl_reference_tasklist.md` | T01の spec 要素対応表 |
| `docs/specs/ui_next_game_rules_index.md` | ゲームルール索引 |
| `docs/specs/dev_principles.md` | 設計原則 |
| `ui-next/components/turn-row.js` | 新UIのターン行コンポーネント |
| `ui-next/components/turn-area.js` | 新UIのターンリスト |
| `ui-next/engine/turn-engine-manager.js` | 新UIのエンジンブリッジ |

---

## 調査結果

> **調査実施**: 2026-03-16
> **調査対象行数**: `src/ui/dom-adapter.js` 8726行 全体
> **新UI現状**: T12-E-3まで完了（OD発動/割込OD UI実装済み、鬼神化は将来タスク）

---

### 分類A: 新UIに取り入れるべき未実装機能

#### 1. ターンコントロール系

| 機能名 | 旧実装箇所 | 新UI対応方針 | 優先度 |
|--------|-----------|------------|--------|
| 鬼神化ボタン・発動フロー (`activateKishinka`) | `dom-adapter.js:L6566` | `TurnEngineManager.activateKishinka()` を追加。`activateReinforcedMode(3)` + OD+15% + プレビュー再計算。手塚咲専用キャラチェック付き | 高 |
| 鬼神化状態バッジ (`renderKishinkaControls`) | `dom-adapter.js:L6536` | `TurnRow` のターン情報列に鬼神化バッジを追加（`鬼神化中: 残りNターン` / `行動不能: 残りNターン` / `鬼神化待機`） | 高 |
| 割込OD 見込み計算 (`buildInterruptOdProjection`) | `dom-adapter.js:L6295` | `TurnEngineManager.getActivatableInterruptOdLevels()` を改善し、見込みODゲージ値を返すよう拡張 | 中 |

#### 2. スロット・スキル選択系

| 機能名 | 旧実装箇所 | 新UI対応方針 | 優先度 |
|--------|-----------|------------|--------|
| スキルコスト詳細表示（SP/Token/Morale/EP/ALL・鬼神化中SP0）| `dom-adapter.js:L545` `formatSkillCostLabel()` | `turn-row.js` の select option ラベルに `formatSkillCostLabel()` を組み込む。鬼神化中の SP0 表示を含む | 高 |
| スキル属性バッジ（斬・刺・打・属性）| `dom-adapter.js:L3241` `updateActionSkillAttributeBadges()` | `turn-row.js` の スキル select 横にバッジコンテナを追加。`resolveEffectiveSkillForAction()` で有効スキルの属性を取得 | 中 |
| スキル使用回数残り表示 (use_count) | `dom-adapter.js:L3167` `renderActionSelectors()` 内 | select option のラベルに `残りN回` を付記。エンジンの `member.getSkillUsageRemaining(skillId)` 相当を参照 | 中 |
| スキル説明テキスト（select の title tooltip）| `dom-adapter.js:L3167` `renderActionSelectors()` 内 | select の option に `title` 属性でスキル説明を付与（`skill.description`）| 低 |
| スイッチスキル有効バリアント表示 | `dom-adapter.js:L1001` (SkillSwitch コメント) / `resolveEffectiveSkillForAction()` | select の表示スキル名を `resolveEffectiveSkillForAction()` で解決した有効バリアントに同期。TurnEngineManager の preview 時に使用する関数と統一 | 中 |

#### 3. パーティー表示系

| 機能名 | 旧実装箇所 | 新UI対応方針 | 優先度 |
|--------|-----------|------------|--------|
| バフ/デバフ一覧表示（各メンバー statusEffects）| `dom-adapter.js:L745` `formatPartyStateStatusEffects()` | `TurnRow` のキャラアイコン下に折りたたみ式バッジ一覧を追加。`member.resolveEffectiveStatusEffects()` を参照 | 高 |
| DP 表示（各メンバーのDP値）| `dom-adapter.js:L6596` `renderPartyState()` 内 `formatDpStateSummary()` | `TurnRow` の SP バッジに加え DP バッジを追加（`baseMaxDp/currentDp/effectiveDpCap`）| 高 |
| マーク状態表示（火氷雷闇光マーク）| `dom-adapter.js:L728` `formatPartyStateMarkIcons()` | キャラアイコン下のバッジ領域に属性マークアイコン表示。低頻度使用のため折りたたみ可 | 低 |
| 鬼神化中・行動不能バッジ | `dom-adapter.js:L6536` `renderKishinkaControls()` | キャラアイコンオーバーレイにバッジ表示。`member.isReinforcedMode` / `member.actionDisabledTurns` 参照 | 高 |

#### 4. ターンレコード表示系

| 機能名 | 旧実装箇所 | 新UI対応方針 | 優先度 |
|--------|-----------|------------|--------|
| actions 詳細表示（hitCount・OD獲得量・DP変化）| `dom-adapter.js:L8603` `renderRecordTable()` | コミット済み `TurnRow` にアクション結果列（hit/OD%/DP差分）を展開表示 | 中 |
| フィールド効果表示（Zone/Territory）| `dom-adapter.js:L8531` `formatRecordFieldState()` | ターン情報列に `formatFieldStateSummary()` ロジックを移植 | 低 |

#### 5. Enemy Setup 系

| 機能名 | 旧実装箇所 | 新UI対応方針 | 優先度 |
|--------|-----------|------------|--------|
| 敵名入力 | `dom-adapter.js:L3612` `applyEnemyNameFromDom()` | `initial-setup.js` の Enemy Setup タブに入力フォームを追加 | 高 |
| 敵ダメージレート入力（火氷雷闇光 5属性）| `dom-adapter.js:L3636` `applyEnemyDamageRateFromDom()` | 5属性 × 敵数 の入力フォーム群。旧実装の input[type=number] 方式を踏襲 | 高 |
| 敵破壊率入力 | `dom-adapter.js:L3662` `applyEnemyDestructionRateFromDom()` | ダメージレートフォームと同じ行に追加 | 高 |
| 敵バフ/デバフ設定（Down/Break/StrongBreak/SuperDown/Dead）| `dom-adapter.js:L3686` `applyEnemyStatusFromDom()` | 敵状態追加フォーム（statusType select + ターン数 input + 対象敵 select）| 高 |
| 敵フィールド設定（属性/ターン数）| `dom-adapter.js:L3796` `applyEnemyZoneConfigFromDom()` | Enemy Setup タブにフィールド設定列を追加（checkbox + 属性 select + ターン数 input）| 中 |
| 敵数入力 | `dom-adapter.js:L3444` `renderEnemyConfigControls()` | 敵数 select（1〜DEFAULT_ENEMY_COUNT）を Enemy Setup タブに追加 | 高 |
| 敵状態一覧表示 | `dom-adapter.js:L3573` `renderEnemyStatusControls()` | 現在の敵状態をタグ形式でリスト表示し、削除ボタン付与 | 高 |

#### 6. CSV Export 系

| 機能名 | 旧実装箇所 | 新UI対応方針 | 優先度 |
|--------|-----------|------------|--------|
| CSV エクスポートボタン・ダウンロード | `dom-adapter.js:L4010` `exportCsv()` | エクスポートボタン追加。`exportCsvState()` はエンジン層に実装済みのため UI ダウンロードフローのみ実装 | 高 |
| JSON エクスポート | `dom-adapter.js:L4017` `exportRecordsJson()` | Blob/URL API によるダウンロード。`buildTextDownloadTarget()` (L4030) のパターンを再利用 | 中 |
| CSV 列構成（Simple/Full モード）| `dom-adapter.js:L8548` `getRecordColumns()` | Simple モード優先で実装。Full モード切り替えは後続タスク。`turnId/turnLabel/前衛3スロットのキャラ名・スキル名` が最小構成 | 高 |

#### 7. Scenario Runner 系

| 機能名 | 旧実装箇所 | 新UI対応方針 | 優先度 |
|--------|-----------|------------|--------|
| JSON/CSV シナリオ入力 UI | `dom-adapter.js:L4768` `loadScenarioFromDom()` | テキストエリア + 実行ボタン。`TurnEngineManager` に `loadAndRunScenario()` を追加 | 中 |
| CSV → JSON シナリオ変換 | `dom-adapter.js:L4603` `convertCsvToScenario()` | 旧実装をほぼそのまま移植可能（ODコンテキスト復元・swaps 逆算ロジックを含む）| 中 |
| シナリオ実行フロー（ターン別適用）| `dom-adapter.js:L5937` `applyScenarioTurn()` | `TurnEngineManager` 経由でターンを順次適用。旧実装の 8 ステップフローを参考 | 中 |
| シナリオ進捗表示 | `dom-adapter.js:L4167` `renderScenarioStatus()` | 実行済みターン数 / 総数 をステータスバーに表示 | 低 |

---

### 分類B: エンジンに移管すべきロジック

| 機能名 | 旧実装箇所 | 問題点 | 推奨対応 |
|--------|-----------|--------|---------|
| OD発動可否判定 (`canActivateOdLevel`) | `dom-adapter.js:L6320` | UIで `getOdGaugeRequirement()` を直接参照してボタン活性判定 | `TurnEngineManager.getActivatablePreemptiveOdLevels()` はすでに存在。新UIでは必ずこのAPIを使う |
| OD チェックポイント/リストア | `dom-adapter.js:L6186/L6200` | UIが state のスナップショットを保持してキャンセル復元 | 新UIでは `previewTurn()` 方式で代替。state の直接コピーは禁止（`dev_principles.md §5` 原則5） |
| 行動可能メンバー抽出 | `dom-adapter.js:L3359` `getActionableFrontlineMembers()` | UI層でターン種別・EX条件を独自判定 | エンジンの `isMemberActionableInCurrentTurn()` を使う。新UIの `TurnRow` は `stateBefore` から直接参照 |
| スキルコスト種別フォーマット | `dom-adapter.js:L545` `formatSkillCostLabel()` | フォーマットロジックが UI に混在（特に鬼神化中 SP0 判定） | 鬼神化中 SP0 判定は `resolveEffectiveSkillForAction()` の出力（effectiveSkill.spCost）を参照すれば UI 側に判定不要になる可能性を確認すること |
| SP厳密モード検証 | `dom-adapter.js:L3921` `commitCurrentTurn()` 内 | UI が commit 前に SP 合計を独自検証 | エンジンの `commitTurnRecord()` 呼び出し時のエラーで検証する。UI は try-catch で受け取るのみ |
| ターンプラン自動キャプチャ | `dom-adapter.js:L3921` `commitCurrentTurn()` 内 | UI が `ReplayScript` に直接書き込む | `TurnEngineManager.commitNextTurn()` 内でのみ行う（新UIでは既にそうなっている） |
| シナリオ状態上書き (`applyScenarioTurnStateOverrides`) | `dom-adapter.js:L5632` | UI が `state.turnState.memberStates` を直接変更 | `TurnEngineManager.loadAndRunScenario()` でエンジン関数経由での state 適用に限定する |
| 敵状態差分適用 (`applyScenarioEnemyStatusDelta`) | `dom-adapter.js:L5713` | UI が `state.turnState.enemyState` を直接変更 | 同上。エンジン層に `applyEnemyStatusOverride()` 相当を追加して委譲 |

---

### 分類C: 新UIに領域がなく設計判断が必要な機能

| 機能名 | 旧実装箇所 | 現状 | 判断ポイント |
|--------|-----------|------|------------|
| パーティプリセット保存/読込（10スロット）| `dom-adapter.js:L2280/L2297` | 新UIに該当 localStorage 設計なし | 新UIでも localStorage に残すか、Party Setup の保存として統合するか。T08-UX で3スロットプリセットは実装済みなので拡張で対応可能 |
| やる気（Motivation）セレクタ連動 | `dom-adapter.js:L2479` `syncMotivationSelectionControls()` | T04 で新UIの Party Setup に `やる気` listbox は実装済み | 旧UIの「パーティ全体/スロット別」モード切り替えは新UIでは不要（スロット別のみで統一）。現状の実装で十分か確認 |
| DP デバッグコントロール | `dom-adapter.js:L6644` `renderDpDebugControls()` | 新UIに該当パネルなし | 開発者向け機能。新UIでは廃止し、ブラウザ DevTools で対応 |
| snapBefore/snapAfter JSON 展開表示 | `dom-adapter.js:L8672` | 新UIに詳細展開パネルなし | デバッグ用。新UIでは折りたたみ `<details>` で実装するか廃止。設計判断が必要 |
| ゲーム画面ビュー (aspect-video 16:9) | `ui_next_gui_design_spec.md` に記載 | 新UIに該当コンテナなし | spec ではメイン画面が aspect-video だが現状の縦スクロールレイアウトと相反する。実装するか spec を更新するか判断が必要 |
| 確認ダイアログ（削除・リセット）| `dom-adapter.js:L1933` `getBrowserConfirmHandler()` | 新UIに modal なし | `window.confirm()` 継続か独自モーダル実装か。UX 観点では独自モーダル推奨だが工数あり |
| 敵ターン別行動記録（enemyAction列）| `dom-adapter.js:L8548` CSV `getRecordColumns()` Full Mode | CSV の enemyAction 列に対応するフォーム | Enemy Setup タブに「各ターンの敵行動」入力フォームを追加するか、CSV のみ対応とするか |
| フィールド効果 Zone/Territory 設定 | `dom-adapter.js:L3796` `renderEnemyZoneControls()` | Enemy Setup placeholder のみ | 敵フィールド設定（A-ES-5）と合わせて Enemy Setup タブに入れる方針で A に昇格可能。ユーザー確認推奨 |

---

### 分類サマリ

| 分類 | 件数 | 最重要項目 |
|------|------|-----------|
| **A（新UI未実装）** | 24件 | 鬼神化フロー・Enemy Setup 全体・CSV Export・スキルコスト詳細・バフ/DP表示 |
| **B（エンジン移管）** | 8件 | OD可否判定・OD checkpoint/restore・行動可能メンバー抽出・SP検証 |
| **C（設計判断要）** | 8件 | ゲーム画面ビュー・snap詳細展開・パーティプリセット拡張 |

> 🟡 **T03 対応**: 分類A の機能を `docs/active/ui_next_implementation_tasklist.md` の T13〜T17 として追記する（次セクション参照）。
> 分類B の注意点は `docs/specs/dev_principles.md §5` の「やってはいけない例」に既に収録済み。
> 分類C はユーザーと設計判断を行う（→ 本ファイルの判断ポイント列を参照）。
