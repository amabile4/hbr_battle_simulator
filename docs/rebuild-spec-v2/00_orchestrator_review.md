# 00 Orchestrator Review

## 1. 検収対象
- [a_codex_implementation_blueprint.md](/Users/ram4/git/hbr_battle_simulator/docs/rebuild-spec-v2/a_codex_implementation_blueprint.md)
- [b_gemini_gap_and_edge_cases.md](/Users/ram4/git/hbr_battle_simulator/docs/rebuild-spec-v2/b_gemini_gap_and_edge_cases.md)
- [c_claude_rebuild_spec_final.md](/Users/ram4/git/hbr_battle_simulator/docs/rebuild-spec-v2/c_claude_rebuild_spec_final.md)

## 2. 絶対制約の遵守確認
- 作業範囲: `/Users/ram4/git/hbr_battle_simulator` 配下のみで実施。
- 既存ファイル編集禁止: 本ラウンドで新規作成のみを実施。
- 親の役割: 配布・進捗管理・検収のみ。子A/B/C本文は各子が執筆。
- ユーザー確認: 実施なし（無人実行）。

## 3. 成果物要件チェック
- HANDSHAKE: 子A/B/Cの先頭行に全件記載済み。
- 根拠ファイルパス: 各子20件以上を満たす。
- 具体論点: 各子15件以上を満たす。
- 実装時判断ポイント: 各子10件以上を満たす。
- 機能記述5点セット: `入力/出力/前提条件/失敗時挙動/境界条件` を各子文書で実装。
- 未確定の扱い: 各子で `未確定 + 仮説 + 検証方法` を明記。
- 推測ラベル: 各子で `推測` を明示。

## 4. 各子成果の検収結果
### 子A（Codex）
- 評価: 実装分割・疑似コード・テスト設計が最も具体的。`normal|od|extra` 分岐、CSV境界条件、回帰テスト条件まで固定。
- 強み: アルゴリズムを実装順へ落とせる粒度。
- 残課題: README由来の未確定事項は外部確定が必要。

### 子B（Gemini）
- 評価: 欠落仕様と境界条件の検出力が高い。運用リスクと未確定事項の検証導線が明確。
- 強み: 失敗時挙動の矛盾検知と修正提案が実装手戻り抑止に有効。
- 残課題: 未確定項目の最終決裁が必要。

### 子C（Claude）
- 評価: v2最終仕様としての統合性が高い。Must/Should/Could、API、データモデル、状態遷移が一体化。
- 強み: 実装チーム向けの仕様書として読解コストが低い。
- 残課題: 未確定の運用判断は別途承認が必要。

## 5. 不足点（実装開始前に固定すべき事項）
1. OD回復対象（発動者のみか全体配布含むか）。
2. 追加ターン同時付与時の行動順・交代制限優先順位。
3. CSV 1行目メタ文法と敵行動列の固定文言。
4. バフ/デバフのv2範囲（記録のみ or 継続計算含む）。
5. 同名別スタイル導入時の識別子（`styleId` 等）。

## 6. 実装開始判定
- 判定: **Hold（条件付き）**
- 理由: コード実装に直結する仕様密度は到達済みだが、上記5件の未確定が状態遷移・CSV互換・回帰テスト期待値に直結するため。

## 7. Hold時の不足解消ToDo
1. 未確定5件を決裁し、`c_claude_rebuild_spec_final.md` の未確定節を確定値へ更新。
2. 確定値から「期待CSVサンプル3本（normal/od/extra）」を作成。
3. 子Aテスト設計に基づき、OD/追加ターン/CSV回帰テストの期待値を固定。
4. フォールバック運用を「開発限定」へ固定するか本番許容にするかを決定。
5. Go再判定時に本レビューを再チェックリストとして再実行。
