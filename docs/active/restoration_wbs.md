# 次セッション引き継ぎプロンプト：ハイブースト対応以降の段階的復元WBS

---

## ★ このファイルの使い方

このファイルを新しいセッションの最初に貼り付けてください。
現在のセッションで把握した全情報を含んでいます。

---

## 背景・経緯

HBRバトルシミュレータで**ハイブースト**と**ルビーパヒューム**の機能追加を行っていた。
`checkpoint/pre-ruby-perfume-highboost-20260321` までは正常動作。それ以降の変更で：

- **根本バグ**: ハイブースト対応で `scaleHighBoostHealAmount` を実装した際、
  HealDP系に1.5倍を適用するのは正しいが、**誤ってHealSPにも1.5倍が適用**された
  （例：閃光などの `OnEveryTurn` SP回復パッシブが SP+1 → SP+1.5 になってしまった）
- **HealSP修正の状況（重要）**: 現在の `wip` ブランチ最新を見ると、HealSPの1.5倍は
  **一見修正済みに見える**（SP回復は正しく1倍になっている）。しかし、この修正の過程で
  **その他の部分を破壊的に変更してしまったため、現状のままでは進められない**。
  「HealSPが直っているか」ではなく「修正過程の破壊的変更が残っていないか」を確認すること。
- **二次被害**: このバグの修正・対処の過程でプログラムが大幅に崩壊
- **現状**: `wip/passive-timing-audit-20260321` ブランチで作業継続中だが、
  多数のテストが強制合わせ込みされており信頼性が低い状態

---

## リポジトリ現状

### ブランチ構成
```
* wip/passive-timing-audit-20260321   ← 現在の作業ブランチ（破損状態）
  feature/engine-ruby-perfume-highboost-rebuild  ← 修復用ブランチ（ワークツリー）
  main
  checkpoint/pre-ruby-perfume-highboost-20260321  ← 正常な最後の状態
```

### ワークツリー
```
/Users/ram4/git/hbr_battle_simulator              [wip/passive-timing-audit-20260321]
/private/tmp/hbr_passive_split_20260321/baseline  (detached HEAD: b6295c2)
/private/tmp/hbr_passive_split_20260321/rebuild   [feature/engine-ruby-perfume-highboost-rebuild]
/private/tmp/hbr_passive_split_20260321/wip-reference  (detached HEAD: db0a68d)
```

### checkpoint以降のコミット（古い順）
```
36c156d  Add ui-next equipable passive UI and HighBoost support  ← ★バグ混入元
db0a68d  chore: checkpoint passive timing audit WIP before rebuild split
471a928  Complete passive timing WIP green checkpoint  ← ★テスト強制合わせ込み多数
0427372  feat(domain): standardize passive log name display (styleName削除)
8a9b224  docs: UI Next アーキテクチャ・仕様分析ドキュメント追加
121bf22  docs: Turn Row 仕様のブレイク編集ボタン表示を修正
b09946a  applyInitialTurnStartPassiveState復活（テスト未修正）
93798f0  現在把握しているバグのドキュメント作成
```

---

## 現セッションで実施済みの修正（711件全テストパス確認済み）

以下は **すでに wip ブランチに適用済み**：

1. **`src/turn/turn-controller.js`**
   - `INITIAL_TURN_PASSIVE_TIMINGS = ['OnEveryTurn', 'OnPlayerTurnStart']` 定数追加
   - `applyInitialTurnStartPassiveState` がこの定数を使うよう変更
   - ※ OnEveryTurn + OnPlayerTurnStart 両方を初期化時に発火させる仕様で確定

2. **`tests/turn-state-transitions.test.js`**
   - `471a928` で強制合わせ込みされた約10箇所の期待値を正しい値に戻した

3. **`tests/adapter-core.test.js`**
   - フロントラインSP期待値 `[8,10,8]` → `[9,11,9]` に修正

4. **`src/domain/character-style.js`**（`0427372` バグ修正）
   - `shortName` 初期化で `resolveShortCharacterName` を使うよう変更
   - （`input.shortName` 未指定時に `characterName` をそのまま使う問題を修正）

5. **`ui-next/utils/manual-break-presentation.js`**（`0427372` バグ修正）
   - `store` のフルネームを優先して `resolveShortCharacterName` を呼ぶよう変更

6. **`tests/ui-next-turn-ui.test.js`**
   - `0427372` でスタイル名がパッシブログから削除されたことに合わせて期待値更新
   - `'開始ログスタイル / 開始ログ役'` → `'開始ログ役'` 形式に変更

---

## 把握済みの未修正バグ（docs/active/ に記録あり）

| ファイル | 内容 |
|--------|------|
| `docs/active/passive_debug_log_wbs.md` | パッシブログが1ターン目以降表示されない |
| `docs/active/passive_log_display_bug_issue.md` | サポートパッシブがログに表示されない |
| `docs/active/responsive_popover_positioning_fix.md` | iPhoneでポップオーバーがはみ出す |
| `docs/active/support_tier_check_bug_issue.md` | SSR以外にサポート共鳴が誤適用される |

---

## 進めてほしいWBS（新セッション向け指示）

**重要な制約**:
- **auto compact を避けるため、1フェーズ = 1会話単位** で区切ること
- **各フェーズ完了時にユーザーに確認を取ること**（合わせ込みではなく正しい修正かの確認）
- テストを通すために期待値を合わせ込む修正は禁止。意図を確認してから変更する
- 完全に過去に戻るのではなく、**最終的な結果（仕様）を得ることが目標**

### フェーズ0: 現状把握（調査のみ、変更なし）
- `scaleHighBoostHealAmount` の現在の実装を確認
- HealSP処理箇所（閃光など OnEveryTurn）で 1.5倍が適用されているか確認
- `feature/engine-ruby-perfume-highboost-rebuild` ブランチの現状確認
- **成果物**: 「何が壊れていて何は正しいか」の一覧をユーザーと共有

### フェーズ1: HealSP誤1.5倍問題の修正（core bug fix）
- **注意**: `wip` ブランチ最新ではHealSPは1倍になっているが、修正の過程で
  破壊的変更が混入している可能性が高い。「直っているか」ではなく「正しく直っているか」の確認
- `scaleHighBoostHealAmount` の適用スコープがHealDPのみになっているか確認
- 修正に伴い変更されたコードに不正な副作用がないか確認
- 関連テストの期待値が正しい値かどうか確認（合わせ込み禁止）
- `node --test` で全件パス確認
- **ユーザー確認**: PassiveLogで閃光のSP回復が正しく表示されるか

### フェーズ2: PassiveLog表示の修正
- `docs/active/passive_debug_log_wbs.md` の問題対応
  - 2ターン目以降のパッシブログが表示されない問題
- サポートパッシブログ表示（`docs/active/passive_log_display_bug_issue.md`）
- **ユーザー確認**: PassiveLogのUIで実際に見えるか確認

### フェーズ3: ルビーパヒューム対応の取り込み
- `feature/engine-ruby-perfume-highboost-rebuild` ブランチの変更を精査
- 正しい実装のみを cherry-pick または手動で取り込む
- テストは「仕様として正しいか」を確認してから追加

### フェーズ4: その他バグ修正
- サポートSSRチェックバグ（`support_tier_check_bug_issue.md`）
- iPhoneポップオーバー（`responsive_popover_positioning_fix.md`）

### フェーズ5: 機能追加の再開
- ハイブースト・ルビーパヒュームの残り機能追加
- 全テスト green + PassiveLog動作確認

---

## 作業上の注意事項

- `json/` フォルダはminified JSONなので grep 不可。`jq` か `node` で検索
- git コマンドは**必ず直列実行**（並列禁止）
- 実装前に `docs/specs/dev_principles.md` を確認すること
- UI修正は `ui-next/` が主対象。`dom_adapter` 系は明示依頼のある場合のみ
