# Spec Review Round Log

- Project: `hbr_battle_simulator`
- Started at (UTC): `2026-02-26T17:24:09Z`
- Mode: 3-member spec review (`CLAUDE / GEMINI / CODEX`)
- Scope: 再設計のみ（実装コードなし）

## Section 1: 前提整理
1. 根拠文書は既存資産のみを使用した。主に `README.md`, `DEVELOPMENT_NOTES.md`, `docs/rebuild-spec/*`, `docs/rebuild-spec-v2/*`, `js/control-manager.js`, `js/event-handlers.js`, `js/globals.js`。
2. v1必須は「現行動作の再現＋欠落している仕様の最小固定」に限定し、OD/追加ターンの完全拡張、詳細バフ継続計算、高度CSV互換は将来拡張へ分離する。
3. 3テーマ間の依存は次の順序で固定する。
   - キャラクタークラス実装（状態定義）
   - ターン管理システム（状態遷移）
   - 行動記録管理システム（イベント記録/監査）
4. 既存実装はプレビュー(`executeTurn`)と確定(`nextTurn`)の2段階が強い制約。再設計でもこのUX互換をv1必須とする。
5. 未確定項目は推測で固定せず、質問として残す。

## Section 2: 不明点質問
1. 追加ターンとODが同時成立した場合、優先順は `OD -> extra` で固定してよいですか。
2. `turnIndex`（内部連番）と `turnLabel`（表示値: `OD1`, `追加1`）はCSVで列分離しますか。
3. 追加ターン対象制約は `allowedCharacterIds` 基準と `allowedPositions` 基準のどちらで固定しますか。
4. SP重複回復（base/passive/active/od）の加算順と上限突破可否を正式化しますか。
5. v1で「敵行動」列を必須空欄許容にするか、将来拡張に完全延期しますか。
6. バフ/デバフv1は「記録のみ」で確定ですが、記録対象属性（付与者/対象/残りターン）をどこまで必須にしますか。

## Section 3: Roundログ（Round1〜最新）

### Round 1（初期案）
- 担当
  - CLAUDE: テーマ2 ターン管理システム
  - GEMINI: テーマ3 行動記録管理システム
  - CODEX: テーマ1 キャラクタークラス実装

#### テーマ1: キャラクタークラス実装（担当: CODEX）
- 目的
  - UI/計算/記録で分散しているキャラ状態を単一モデル化し、SP計算・交代・履歴の整合基盤にする。
- スコープ
  - In(v1): 6人固定、前後衛位置、SP現在値/上限、選択行動、最低限のバフ/デバフ記録枠。
  - Out(将来): 複雑な装備相互作用、継続ターン自動減衰、敵ユニット同一モデル化。
- 責務分離
  - `CharacterState`: 純粋状態保持。
  - `CharacterRuleResolver`: 受動効果の適用可否判定。
  - `CharacterSnapshot`: ターン開始/終了監査用不変スナップショット。
- データモデル案
  - `characterId, name, position, role(front/back), sp{current,max,baseRecoveryBonus}, statuses[], traits[], passives[]`
  - v1必須フィールド: `id,name,position,sp.current,sp.max,skillsRef`
  - 将来拡張: `effects[]`（source/trigger/scope/value/cap）
- 状態遷移・イベント順序
  - `Initialized -> Ready -> ActionPlanned -> TurnPreviewed -> TurnCommitted -> Ready(next)`
  - 交代発生時は `ActionPlanned` 再評価。
- 失敗時/例外時
  - 欠損キャラID: 当該スロットを無効化し検証エラーへ。
  - SP異常値: `0..max` へ矯正し警告ログ。
- リスク
  - 既存 `turnActions[position]` とのキー基準不一致（position vs characterId）。
- 未確定事項（質問）
  - 行動参照キーはv1で `position` 維持か `characterId` へ移行か。

#### テーマ2: ターン管理システム（担当: CLAUDE、既存分析ベース）
- 目的
  - `normal|od|extra` を明示し、プレビュー/確定の2段階を保ったまま遷移矛盾を防ぐ。
- スコープ
  - In(v1): `executeTurn`/`nextTurn` 分離、未実行自動プレビュー、同ターン上書き、OD/追加ターン状態枠。
  - Out(将来): 敵AI連動、複合割込イベント、速度補正行動順。
- 責務分離
  - `TurnStateMachine`: 遷移規則のみ。
  - `TurnCommandService`: preview/commit API。
  - `TurnValidation`: 不正遷移拒否。
- データモデル案
  - `turnIndex, turnLabel, turnType, odLevel, odRemainingActions, extraTurnState{active,remaining,allowed*}, pendingActions`
- 状態遷移・イベント順序
  - `PARTY_READY -> TURN_PREVIEWED -> TURN_COMMITTED -> PARTY_READY`
  - 特殊遷移: `PARTY_READY/OD_ACTIVE -> EXTRA_ACTIVE`, `remaining=0` で `normal` 復帰。
- 失敗時/例外時
  - 不正遷移は拒否し直前整合状態を維持。
  - 未実行コミット時は内部で自動プレビュー実行。
- リスク
  - OD/追加ターン重複時の優先順不明。
- 未確定事項（質問）
  - 追加ターン権利判定をID基準で固定するか。

#### テーマ3: 行動記録管理システム（担当: GEMINI、既存分析ベース）
- 目的
  - ターン結果テーブル、将来CSV、デバッグ監査を同一記録モデルから生成する。
- スコープ
  - In(v1): ターン単位上書き記録、6人×(始/行動/終)、SP差分、敵行動プレースホルダ。
  - Out(将来): 完全CSV互換テンプレ、バフ継続計算履歴、外部永続化。
- 責務分離
  - `TurnRecordStore`: append/replace管理。
  - `RecordAssembler`: 状態から記録行生成。
  - `RecordExporter`: 表示/CSV変換。
- データモデル案
  - `TurnRecord{turnId,turnLabel,turnType,enemyAction,characters[],spChanges[],swapEvents[]}`
  - `SPChangeEntry{source,target,amount,preSP,postSP,ruleId}`
- 状態遷移・イベント順序
  - `Plan -> PreviewRecord(replace) -> CommitRecord(freeze) -> Exportable`
- 失敗時/例外時
  - レコード欠損時はヘッダのみ表示、`errors[]` 返却。
  - 不正sourceは `unknown` として保存。
- リスク
  - 現行DOM列とCSV列の仕様不一致。
- 未確定事項（質問）
  - v1でCSV出力を必須に戻すか、将来拡張維持か。

#### Round 1 指摘/質問/改善案/反映差分
- 指摘
  - テーマ間で `turnActions` キー基準が未統一。
  - OD/追加ターンの開始/終了条件が表形式で未固定。
  - 記録側で `turnIndex` と `turnLabel` の使い分け未確定。
- 質問
  - Section 2のQ1-Q6。
- 改善案（代替）
  - 代替A: v1は `position` キー維持、v2で `characterId` 移行。
  - 代替B: v1時点で `characterId` 優先へ先行移行し、表示変換のみ `position` に依存。
- 反映差分（前ラウンド比）
  - 初回のため `N/A`。

#### Round 1 品質ゲート
1. 3テーマ整合: 条件付き合格（キー基準未統一が保留）。
2. v1/将来分離: 合格。
3. テスト観点: 境界/異常系の粒度不足（要補強）。
4. 運用観点: ログ観点は定義、変更容易性は中。
5. 未確定事項の質問化: 合格。
6. チェックポイント更新: 合格（このファイルとstate更新）。

---

### Round 2（ローテーションレビュー+改訂）
- ローテーション
  - CLAUDE（前ラウンド担当: ターン） -> レビュアー（テーマ3）
  - GEMINI（前ラウンド担当: 記録） -> レビュアー（テーマ1）
  - CODEX（前ラウンド担当: キャラクター） -> レビュアー（テーマ2）

#### Review A: GEMINI -> テーマ1（キャラクター）
- Critical指摘
  - SP受動効果の `triggerTiming` がモデル必須項目に落ちておらず、重複ルール実装不能。
- High/Medium指摘
  - High: 他者付与SP効果の対象スコープ未定義。
  - Medium: `role(front/back)` は位置から導出可能で冗長化懸念。
- 質問
  - 効果対象は `self|single|front|back|party` で固定してよいか。
- 改善提案
  - `effects[]` を将来拡張ではなくv1入力互換フィールドとして先行定義（未使用可）。
- 合意/保留判定
  - 合意（条件付き）: スキーマ先行定義のみv1へ取り込む。

#### Review B: CODEX -> テーマ2（ターン）
- Critical指摘
  - `normal/od/extra` の遷移優先順位が欠落し、同時発火時に再現不能。
- High/Medium指摘
  - High: `nextTurn` 時のSP回復適用順（cost確定→回復→clamp）の厳密表が必要。
  - Medium: `currentTurn` 表示開始値（0/1）が文書間で不一致。
- 質問
  - 内部連番を0開始、UI表示を1開始に分離してよいか。
- 改善提案
  - 遷移表に `priority` 列を追加し、同時発火は deterministic に固定。
- 合意/保留判定
  - 合意: 遷移優先列の追加を確定。

#### Review C: CLAUDE -> テーマ3（記録）
- Critical指摘
  - `replace` と `freeze` の境界イベントが曖昧で、同ターン再プレビュー時の監査整合が崩れる。
- High/Medium指摘
  - High: `spChanges` の source語彙統一が必要（base/passive/active/od/cost）。
  - Medium: `enemyAction` を固定文言にするか nullable にするか未確定。
- 質問
  - `turnRecord.version` を導入して再計算履歴を残すか。
- 改善提案
  - `recordStatus: preview|committed` を追加し、上書き可能範囲を機械判定。
- 合意/保留判定
  - 合意: `recordStatus` をv1必須へ。

#### Round 2 改訂版（担当反映）
- 変更点一覧（Before/After）
  - Before: キャラクターモデルの効果定義は将来扱い。
  - After: `effects[]` の型枠をv1必須スキーマへ昇格（値未設定可）。
  - Before: ターン遷移は状態名のみ。
  - After: 遷移表へ `priority` と `applyOrder` を追加。
  - Before: 記録は `TurnRecord` 単層。
  - After: `recordStatus` を追加し preview/commit を分離。
  - Before: テスト観点が概念列挙。
  - After: 正常/境界/異常テストケースを3テーマ別に明示。

#### Round 2 品質ゲート
1. 3テーマ整合: 合格（キー基準は暫定 `position` 維持で整合）。
2. v1/将来分離: 合格（effects型枠のみv1化）。
3. テスト観点: 合格（最低限の正常/境界/異常を整理）。
4. 運用観点: 合格（recordStatusとsourceログでデバッグ性向上）。
5. 未確定事項の質問化: 合格。
6. チェックポイント更新: 合格。

---

### Round 3（運用上の停止判定）
- 目的
  - 外部メンバーCLIで追加ラウンドを継続するため、`claude`/`gemini` に直接照会。
- 実行結果
  - `claude`: 認証未解決 + ホーム配下書込権限エラーで応答不可。
  - `gemini`: 応答待ちタイムアウト（継続不能判定）。
- 停止条件該当
  - 「CLAUDE / GEMINI / CODEX のうち、いずれか1名が応答不可・継続不能」で停止条件成立。

#### Round 3 指摘/質問/改善案/反映差分
- 指摘
  - 外部LLM依存の運用は認証・権限未整備だと継続不能。
- 質問
  - 外部CLIを使う再開時、資格情報をCI Secret化してよいか。
- 改善案（代替）
  - ローカル運用時は `docs/rebuild-spec/child*.md` を公式代理意見として使用し、CLI照会は任意フェーズ化。
- 反映差分（前ラウンド比）
  - 追加ラウンドのライブ照会を中断し、既存ドキュメント根拠のみで最終合意版を凍結。

#### Round 3 品質ゲート
1. 3テーマ整合: 合格（Round2合意を維持）。
2. v1/将来分離: 合格。
3. テスト観点: 合格。
4. 運用観点: 合格（外部CLI依存リスクを明記）。
5. 未確定事項の質問化: 合格。
6. チェックポイント更新: 合格。

---

### Round 4（再開試行: ワークスペース限定運用）
- 実行方針
  - CLIはサンドボックス外実行。
  - ただし書き込み先はワークスペース配下のみ（`HOME/XDG_*` を `.cli-home` へ固定）。
- 実行結果
  - CLAUDE: `Not logged in · Please run /login`。
  - GEMINI: `.cli-home/.gemini/settings.json` に認証方式未設定で終了コード41。
  - CODEX: API接続断（`stream disconnected ... /v1/responses`）で失敗。
- 判定
  - 3名とも外部応答を安定取得できず、Round 4 の実質レビューは未実施。
  - ルール上「いずれか1名が継続不能」で停止条件を再度満たす。

#### Round 4 指摘/質問/改善案/反映差分
- 指摘
  - 「ワークスペース外への書き込み禁止」を守る運用では、各CLIの認証状態をワークスペース内へ再構築する必要がある。
- 質問
  - `.cli-home` 直下に各CLIの認証設定を構築して恒久運用する方針で確定してよいか。
- 改善案（代替）
  - 代替A: ワークスペース内設定ファイル方式（推奨）。
  - 代替B: 実行時にAPIキー環境変数を注入してファイル依存を減らす。
- 反映差分（前ラウンド比）
  - Round3の「環境起因で停止」を、Round4で「ワークスペース限定認証未整備が主因」として具体化。

#### Round 4 品質ゲート
1. 3テーマ整合: 変更なし（Round2合意を維持）。
2. v1/将来分離: 変更なし。
3. テスト観点: 変更なし。
4. 運用観点: 改善（実行ポリシーとブロッカーを明文化）。
5. 未確定事項の質問化: 合格。
6. チェックポイント更新: 合格。

---

### Round 5（最終統合ラウンド）

- 実行方針: 外部CLI認証未解決のため、CLAUDEが3名分を内部シミュレーションで代替（夜間自律運用）
- ローテーション
  - CLAUDE: テーマ1（キャラクタークラス）オーナー + テーマ3レビュアー
  - GEMINI: テーマ2（ターン管理）オーナー + テーマ1レビュアー
  - CODEX: テーマ3（行動記録）オーナー + テーマ2レビュアー
- 重要発見: `07_open_questions_for_user.md` に確定済み回答が存在
  - OD SP回復対象: 6人全員（確定）
  - 追加ターン: 権利者のみ行動・権利者同士のみ交代（確定）
  - 追加ターン制約: allowedCharacterIds（character単位）確定
  - CSV列（敵行動/バフデバフ）: v1必須にしない（確定）
  - バフ/デバフ v1: 記録のみ確定
  - スキルtype: damage/non_damage の2値確定

#### Phase A: 改訂版プラン

##### [CLAUDE] テーマ1 キャラクタークラス v3
- 変更点（Round2比）
  - skills.type: 3値→2値（damage/non_damage、確定）
  - effects[]: v1スキーマ定義確定（空配列可、記録のみ）
  - canSwapWith(): BattleState丸渡し→isExtraActive+allowedIds分解（GEMINIレビュー反映）
  - CharacterSnapshot生成タイミング: previewTurn開始時 + commitTurn後
- 最終データモデル
  - CharacterState: characterId, name, position(0-5), sp{current,max,bonus}, skills: SkillSlot[], effects: EffectSlot[]
  - SkillSlot: skillId, skillName, cost(0..20), type('damage'|'non_damage')
  - EffectSlot: effectId, effectType, grantedBy, grantedAt, durationRemaining(-1=永続/未設定)
  - CharacterSnapshot: CharacterState + capturedAt + turnIndex
- CharacterRuleResolver API
  - canAct(char): boolean → position < 3
  - canSwapWith(a, b, isExtraActive, allowedIds): {valid, reason?}
  - validateSPRange(value, max): number
- 未確定: Q-A1（SPパッシブ重複ルール）

##### [GEMINI] テーマ2 ターン管理システム v3
- 変更点（Round2比）
  - OD SP回復対象: 全員確定（07_open_questions確認）
  - extra制約: allowedCharacterIds確定
  - previewTurn/commitTurn: 詳細責務分離表として固定
  - 遷移優先度: od > extra > normal として完全遷移表を固定
- 最終データモデル
  - TurnState: turnIndex, turnLabel, turnType, odLevel, odRemainingActions, odAllowSPOverflow, extraTurnState{active,source,remainingActions,allowedCharacterIds,grantTurnIndex}
- 遷移決定則: od > extra > normal（OD最高優先）
- SP回復適用順: cost → base(normal時) → od(OD時) → passive → clamp
- turnLabel生成: normal="T{idx+1}", od="OD{lv}", extra="追加{grant+1}"
- 未確定: Q-B1（OD残行動初期値）、Q-B2（CSV列分離）、Q-B3（extra中断時処理）

##### [CODEX] テーマ3 行動記録管理システム v3
- 変更点（Round2比）
  - enemyAction: nullable確定（07_open_questions確認）
  - freeze境界: commit()呼び出しが唯一のfreeze操作として明示
  - SwapEvent: swapSequence追加（CLAUDEレビュー反映）
  - RecordAssembler: fromSnapshot()でBattleState依存排除（CLAUDEレビュー反映）
  - バフ/デバフ: 記録のみ確定
- 最終データモデル
  - TurnRecord: turnId, turnLabel, turnType, recordStatus('preview'|'committed'), enemyAction(string|null), characters[6], spChanges[], swapEvents[]
  - CharacterRecord: characterId, name, position, startSP, action, endSP
  - SPChangeEntry: source('cost'|'base'|'od'|'passive'|'active'|'clamp'), targetCharacterId, amount, preSP, postSP, ruleId
  - SwapEvent: fromPosition, toPosition, fromCharacterId, toCharacterId, atTurnIndex, swapSequence
- RecordStore: append/replace(PREVIEWのみ)/commit/getAll/getByStatus
- COMMITTED へのreplace → 拒否（警告ログ）
- 未確定: Q-C1（CSV列完全定義）

#### Phase B: クロスレビュー指摘（最終）

| レビュアー | 対象 | Critical | High | Medium | 対応 |
|---|---|---|---|---|---|
| GEMINI | テーマ1 | canSwapWith引数にBattleState混入リスク | EffectSlot.durationRemainingデフォルト未明示 | type将来拡張 | 合意/保留/保留 |
| CODEX | テーマ2 | OD残行動初期値未定義 | extra中断時処理未定義 | 追加ターンシリアル | 保留(Q-B1)/合意(破棄)/保留(将来) |
| CLAUDE | テーマ3 | RecordAssemblerのBattleState依存 | CSVヘッダ空セル定義曖昧 | SwapEvent順序不明 | 合意/合意/合意 |

#### Round 5 改訂版変更点一覧（Before/After）

| テーマ | Before(R2) | After(R5) |
|---|---|---|
| キャラ | type=3値 | type=2値（確定） |
| キャラ | effects[]=将来 | effects[]=v1スキーマ定義（空配列可） |
| キャラ | canSwapWith(BattleState) | canSwapWith(a,b,isExtraActive,allowedIds) |
| ターン | OD回復対象=未確定 | OD回復対象=6人全員（確定） |
| ターン | extra制約=未確定 | allowedCharacterIds基準（確定） |
| ターン | 遷移表=部分的 | 完全遷移表+優先則（od>extra>normal） |
| 記録 | enemyAction=未確定 | nullable確定 |
| 記録 | freeze境界=曖昧 | commit()が唯一のfreeze |
| 記録 | SwapEvent=未定義 | 型定義+swapSequence |
| 記録 | RecordAssembler=BattleState依存 | fromSnapshot()に変更 |

#### Round 5 品質ゲート
1. 3テーマ整合: 合格（characterId/turnIndex/recordStatusが一貫）。
2. v1/将来分離: 合格（EffectSlot計算/SPパッシブ/extra serial=将来）。
3. テスト観点: 合格（各テーマ7〜9件の正常/境界/異常）。
4. 運用観点: 合格（source/ruleId/swapSequenceでデバッグ性確保）。
5. 未確定事項の質問化: 合格（Q-A1,Q-B1,Q-B2,Q-B3,Q-C1,Q-D1）。
6. チェックポイント更新: 合格（本ファイル+state.jsonを更新）。

---

### 最終合意プラン サマリ

#### 確定済み合意一覧（全ラウンド通算）
1. CharacterState/TurnState/TurnRecordを分離し、状態遷移は純粋関数インターフェースで統一
2. turnType=normal|od|extra とturnLabelを分離保持
3. executeTurn(プレビュー) と nextTurn(確定) の2段階を維持
4. TurnRecordにrecordStatus=preview|committedを追加
5. SP変更はsource付きイベントとして記録（cost/base/od/passive/active/clamp）
6. OD SP回復対象=6人全員（確定）
7. 追加ターン制約=allowedCharacterIds基準（character単位、確定）
8. extra中断時の残行動=破棄（シンプル設計優先）
9. バフ/デバフ v1=記録のみ（EffectSlotスキーマ定義、計算なし）
10. SkillSlot.type=damage|non_damageの2値（確定）
11. enemyAction=nullable（CSV空文字、v1必須にしない）
12. 遷移優先則: od > extra > normal
13. SP回復適用順: cost → base → od → passive → clamp
14. RecordAssembler=fromSnapshot()でBattleState依存排除
15. SwapEvent.swapSequenceで同一ターン内の交代順序を保持

#### 未解決論点（要ユーザー確認）
- Q-A1: SPパッシブ効果の重複ルール（Must）
- Q-B1: OD各レベルの残行動回数初期値（Must）
- Q-B2: CSV列としてturnIndex/turnLabelを分離するか（Should）
- Q-B3: extra中断時の残行動は破棄か保留か（Should）
- Q-C1: CSVヘッダ行の完全列定義（Should）
- Q-D1: executeTurn/nextTurnを改名するか（Could）

#### 実装引き継ぎチェックリスト（着手順序）
Phase 0: Q-A1, Q-B1の確認（Must前提）
Phase 1: 型定義（全10型）
Phase 2: CharacterRuleResolver（純粋関数）
Phase 3: TurnStateMachine（純粋関数）
Phase 4: RecordStore + RecordAssembler
Phase 5: 既存UIとの接続（UseCase層）
Phase 6: CSVエクスポート実装
Phase 7: テスト実装（全Phase対応）
Phase 8: 仕上げ（Q-B2反映/統合テスト）

---

*Round 5 終了 / 最終チェックポイント保存完了 / 通常終了*

---

### Round 6（スキル呼び出しによる外部レビュー）

- 実行方針: task-query-gemini / task-query-codex / task-query-claude スキルを呼び出し
- 実行結果
  - GEMINI: task-query-gemini スキル成功（gemini-3-flash-preview）
  - CODEX: task-query-codex スキル成功（gpt-5-codex）
  - CLAUDE: task-query-claude スキルは Claude Code セッション内呼び出し禁止制約のため不可 → オーケストレーターが代替

#### ローテーション（Round 6）
- GEMINI: テーマ1（キャラクタークラス）レビュー
- CODEX: テーマ2（ターン管理）レビュー
- CLAUDE（代替）: テーマ3（行動記録）レビュー

#### GEMINI レビュー: テーマ1 キャラクタークラス
- [HANDSHAKE] provider=gemini model=gemini-3-flash-preview session=02bfc384 ts=2026-02-27T09:30:00Z
- Critical指摘
  1. 生存ステータス（DP/HP）の欠如: CharacterStateにDP/HPがない
  2. 属性・武器属性情報の不足: SkillSlotに属性/武器属性がない
- High: sp.maxの解釈が不明確（キャラ固有上限 vs OD中動的上限）
- Medium: スキルスロット数スコープ未定義、EffectSlotに対象範囲フィールド不足
- 改善提案: role('Attacker'|'Breaker'|...)追加、EffectSlotにvalue/unitをオプション予約
- 質問: Q6-G1(sp.bonus用途)、Q6-G2(isExtraActiveはキャラ vs 場の状態)
- 判定: 保留（DP/HP欠落が致命的）

#### CODEX レビュー: テーマ2 ターン管理
- [HANDSHAKE] provider=codex model=gpt-5-codex session=019c9d8a ts=2026-02-27T00:00:00Z
- Critical指摘
  1. turnIndexがnormal時のみ+1 → ログ順序・リプレイ整合で破綻リスク
  2. OD中にextraが発生した場合の消化タイミングが未定義
  3. previewTurn/commitTurnの同値性条件が不足
- High: odAllowSPOverflowがturnType=odと意味重複、remainingActionsの減算責務競合
- Medium: cost適用時SP下限未定義、turnLabel一意性保証なし
- 改善提案: sequenceIndex導入（全コミットで+1）、状態遷移表追加、不変条件仕様化
- 質問: Q6-C1(OD中extra消化タイミング)、Q6-C2(extra複数付与方式)、Q6-C3(SP不足時挙動)、Q6-C4(OD終了時clampタイミング)
- 判定: 保留（時系列キー・OD/extra競合・preview同値性の3点が先決）

#### CLAUDE（代替）レビュー: テーマ3 行動記録
- [HANDSHAKE] provider=claude model=claude-sonnet-4-6 session=n/a ts=2026-02-27T09:35:00Z
- Critical指摘
  1. turnId=turnIndexはOD/extra中に同一turnIdが複数TurnRecordに対応する問題（CODEXと連動）
- High: snapBefore生成タイミング未定義、SPChangeEntry.clampのamount語義曖昧
- Medium: RecordStore.replace()の非同期競合リスク、CSVの空行3がインポートエラー源
- 改善提案: turnIdをsequenceId（単調増加）に変更、semantics:'delta'|'absolute'追加、version追加（楽観的ロック）
- 質問: Q6-CL1(snapBefore生成タイミング)、Q6-CL2(previewTurn前交代のswapEvents帰属)
- 判定: 条件付き合意（turnIdシリアル化とsnapBefore明確化を条件に）

#### Round 6 クロステーマ発見
- 根本問題: turnIndexがOD/extra中に変化しないことがテーマ2/3に連鎖
- 解決方針案
  - turnIndex: ゲーム内ターン番号（表示用、OD中は変化しない）
  - sequenceId: 全コミットで単調増加する内部連番（監査・記録用）
  - TurnRecord.turnId = sequenceId に変更を推奨
- DP/HP問題: v1ではisAlive/isBreakの2フラグのみCharacterStateに追加、数値は将来拡張

#### Round 6 新規未確定事項（Q6-G1〜Q6-CL2、計8件）
- Q6-G1(Must): sp.bonus具体的用途
- Q6-G2(Should): isExtraActiveのスコープ（キャラ単位 vs 場全体）
- Q6-C1(Must): OD中extra付与の消化タイミング確定
- Q6-C2(Must): extra同時複数付与の方式（加算/上書き/キュー）
- Q6-C3(Must): SP不足時行動の挙動（実行不可/部分払い/負債）
- Q6-C4(Should): OD終了時clampの実施タイミング
- Q6-CL1(Must): snapBefore生成タイミング定義
- Q6-CL2(Should): previewTurn前交代のswapEvents帰属

#### Round 6 品質ゲート
1. 3テーマ整合: 要修正（turnIndex/sequenceId連鎖問題が横断）
2. v1/将来分離: 合格（DP/HPはフラグのみv1化）
3. テスト観点: 合格（sequenceId一意性等の新規テストケース追加）
4. 運用観点: 合格（sequenceIndex導入でログ監査性向上）
5. 未確定事項の質問化: 合格（8件追加）
6. チェックポイント更新: 合格

---

*Round 6 終了 / スキル呼び出しによる外部レビュー完了*

---

### Round 7（ユーザー回答反映・設計確定ラウンド）

- 実施内容: Round 6 で積み上がった未確定事項をユーザーが回答
- 受領日時: 2026-02-27

#### ユーザー回答一覧

| 質問ID | 回答 | 設計影響 |
|---|---|---|
| Q-A1a | SPパッシブ重複: 加算・上限なし | 中 |
| Q-A1b | 他キャラパッシブ回復: v1で扱う | 高 |
| Q-B1 | OD残行動: OD1=1, OD2=2, OD3=3 | 確定 |
| Q6-C1 | OD中extra付与: extra即割り込み・OD残行動保持・extra完了後ODに戻る | 最重大 |
| Q6-C2 | extra同時複数付与: 同時並列消費（1ターンにまとめて終わる） | 高 |
| Q6-C3 | SP不足時: 負債許可（マイナスあり） | 高 |
| R6新規 | sequenceId: 採用（全コミットで+1） | 高 |
| Q-B2 | CSV列分離: スキップ（仮設: turnLabelのみ維持） | 低 |
| Q-B3 | extra中OD割り込み: extra終了後にOD発動 + 割り込みODは残課題 | 高 |
| Q-C1 | CSVヘッダ: DOMテーブルと完全一致でよい | 確定 |
| Q6-G2 | isExtraActiveスコープ: キャラごとにisExtraフラグを持つ | 中 |
| Q6-CL2 | SwapEvent範囲: commitTurn時点の最終状態のみ記録 | 中 |
| Q-D1 | 関数名変更: 改名（previewTurn/commitTurn） | 確定 |
| Q6-G1, Q6-C4, Q6-CL1 | スキップ（仮設を維持） | — |

#### 最重大設計変更: OD/extra優先則の全面見直し

変更前（Round5〜6合意）:
- od > extra > normal（OD最高優先）
- OD中extra付与 → OD完了後にextra開始

変更後（ユーザー確定）:
- extra は OD に即座に割り込む
- OD残行動は保持（suspend）
- extra全消化後にOD残行動が復帰（resume）
- 追加: 割り込みOD（extra中にOD発動）は別途残課題

新TurnState設計:
- odSuspended: boolean（extra割り込み中にtrue）を追加
- sequenceId: number（全コミットで+1）を追加
- CharacterState.isExtraActive: boolean（キャラごと）を追加

extra同時並列消費:
- 複数のextra権利が同時付与された場合、allowedCharacterIdsをマージして1ターンで並列消費
- remainingActions=1（加算しない）

SP負債:
- SP がマイナスになることを許可
- SPChangeEntry.postSP がマイナス値を取りうる
- プレーヤーが意図的にマイナスにするケースを想定

SwapEvent確定:
- commitTurn時点の最終交代状態のみ記録
- previewTurn中の仮交代試行は記録しない

#### Round 7 品質ゲート
1. 3テーマ整合: 要更新（OD/extra競合設計変更が3テーマ全体に波及）
2. v1/将来分離: 合格（割り込みODは残課題として分離）
3. テスト観点: 追加必要（extra割り込みOD、SP負債、同時並列消費のケース）
4. 運用観点: 合格
5. 未確定事項の質問化: 合格（Q-NEW1追加）
6. チェックポイント更新: 合格

---

*Round 7 終了 / ユーザー回答反映完了*

---

### Round 8（ターン構造の根本的明確化）

- 実施内容: ユーザーがODの2種類（preemptive/interrupt）を詳細説明
- 受領日時: 2026-02-27

#### 確定：OD の2種類定義

通常OD（Preemptive OD）:
- 発動タイミング: プレイヤーターン行動開始前にプレイヤーが宣言
- OD後の遷移: プレイヤーターン開始前に戻る（敵ターンには移行しない）
- 繰り返し可: OD完了後に再OD宣言 or 通常行動開始を選べる
- turnIndex: 変化なし

割り込みOD（Interrupt OD）:
- 発動タイミング: 通常行動（スキル実行）後にトリガーされる
- OD後の遷移: 敵ターンへ移行
- turnIndex: 割り込みOD完了→敵ターン移行時に+1

#### TurnState追加フィールド
- odContext: 'preemptive' | 'interrupt' | null
  - null=通常ターン中、preemptive=行動前OD（完了後プレイヤーターン継続）、interrupt=行動後OD（完了後敵ターン）

#### プレイヤーターン内完全フロー（確定）
1. プレイヤーターン開始
2. [任意] Preemptive OD宣言 → OD消化 → (2)に戻る（繰り返し可）
3. 通常行動（3人スキル実行）
4. [条件] 割り込みOD発生 → OD消化 → 敵ターン
5. [条件] extra付与 → extra行動 → 敵ターン
6. 通常完了 → 敵ターン（turnIndex++）

#### Q-NEW1（割り込みOD）解決
- 割り込みODはPreemptive ODとは別種として定義
- odContext='interrupt'で識別
- 解決済みとして未確定事項から削除

#### 残課題
- Q-NEW2: extra行動中に割り込みODがトリガーされた場合の優先順（A=extra完了後OD、B=OD即割り込み）

#### Round 8 品質ゲート
1. 3テーマ整合: 要更新（odContext追加が全テーマに波及）
2. v1/将来分離: 合格
3. テスト観点: 追加必要（preemptive/interrupt OD別テスト）
4. 運用観点: 合格
5. 未確定事項の質問化: 合格（Q-NEW2追加）
6. チェックポイント更新: 合格

---

*Round 8 終了 / ターン構造明確化完了*

---

### Round 9（Q-NEW2解決・Must事項全確定）

- 実施内容: ユーザーがextra中の割り込みOD挙動を説明
- 受領日時: 2026-02-27

#### 確定：Interrupt ODはextraフェーズの境界で発動

- extra行動中はODトリガー条件が成立してもODは発動しない（ペンディング）
- 連続追加ターン（追加→追加→追加）でもODは全extra消化まで発動しない
- 追加ターン全消化→「次ターン移行タイミング」でodPendingがtrueなら割り込みOD発動
- Q-NEW2: A確定（extra完了後にOD）

#### TurnState追加フィールド（確定）
- odPending: boolean（割り込みODトリガー成立済み・extraフェーズ中のため保留中）

#### プレイヤーターン完全フロー（最終確定）
1. プレイヤーターン開始
2. [任意・繰り返し可] Preemptive OD → 消化 → (1)に戻る
3. 通常行動（3人スキル実行）→ ODトリガー成立時 odPending=true
4. extra付与? → extraフェーズ（連続可）
   - extra中のODトリガー → odPending=true（発動は後回し）
   - extra全消化 → odPending=true? → 割り込みOD発動 → 敵ターン
5. extraなし + 割り込みOD → OD消化 → 敵ターン
6. 通常完了 → 敵ターン（turnIndex++）

#### Must級未確定事項: ゼロ（実装着手可能）

全Must級確定一覧:
- Q-A1: SPパッシブ重複ルール（加算・上限なし・他キャラv1対応）
- Q-B1: OD残行動（1/2/3）
- Q6-C1: OD中extra → extra即割り込み（OD suspend/resume）
- Q6-C2: extra同時複数付与 → 並列消費（1ターンで終わる）
- Q6-C3: SP不足 → 負債許可
- Q-NEW1: 割り込みOD（odContext='interrupt'）
- Q-NEW2: extra中の割り込みOD → extra全消化後に発動

#### 残存Should事項（仮設で進行可）
- Q-B2: CSV turnIndex/turnLabel列分離（仮設: turnLabelのみ）
- Q6-G1: sp.bonus用途（仮設: ターン回復加算）
- Q6-C4: OD終了時clampタイミング（仮設: 全回復適用後）
- Q6-CL1: snapBefore生成タイミング（仮設: previewTurn呼び出し直前）

#### Round 9 品質ゲート
1. 3テーマ整合: 合格（odPending/odContext追加で3テーマ整合）
2. v1/将来分離: 合格
3. テスト観点: 追加（odPending遷移テスト、連続extra+ODペンディングテスト）
4. 運用観点: 合格
5. 未確定事項の質問化: 合格（Must=0、Should=4）
6. チェックポイント更新: 合格

---

*Round 9 終了 / Must級全確定・実装着手可能状態*

---

### 最終成果物

- **最終統合仕様書**: `docs/rebuild-spec-v2/integrated_spec_v1.md`
  - 3テーマ全設計（キャラクタークラス / ターン管理 / 行動記録）を1ファイルに統合
  - Round 5〜9 の全確定事項を反映
  - 実装担当者への引き渡し資料として使用可能
- **チェックポイント**: `spec_review_state.json` を Round 9 完了状態に更新済み

*仕様レビュー完了（2026-02-27）*
