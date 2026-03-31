# Claude Opus Prompt: UI Next Drag And Drop Review

以下のレビュー依頼メモを読んで、`ui-next` の D&D 不具合をコードレビューしてください。

参照:
- `docs/active/ui_next_drag_and_drop_review_request.md`
- `docs/active/ui_next_design.md`
- `docs/active/ui_next_implementation_tasklist.md`

前提:
- repo root は `hbr_battle_simulator`
- 現在の主実装対象は `ui-next/`
- 今回は **調査とレビューのみ**。コード変更・コミット・push は不要
- 旧 UI parity を前提にせず、現在の `ui-next` 実装として妥当かで見てほしい

特に見てほしい点:
1. `TurnEdit` で D&D が browser 実機で成立しない理由
2. `PartySetup` で D&D が開始しない理由
3. `draggable` の付与位置、drag source、drop target 解決、`preventDefault()` の位置が適切か
4. JSDOM テストが PASS しているのに browser で壊れる理由
5. 最小差分で直すならどう直すべきか
6. 現行 patch 群を戻して、より単純な drag 構造へ再整理した方がよいならその案

レビュー対象ファイル:
- `ui-next/components/party-setup.js`
- `ui-next/components/turn-row.js`
- `ui-next/components/turn-area.js`
- `tests/ui-next-party-setup.test.js`
- `tests/ui-next-turn-ui.test.js`

期待する回答形式:
- Findings first
- 重要度順
- `TurnEdit` と `PartySetup` を分けて整理
- ファイル / 関数 / 実装ブロックへの具体的な言及つき
- 「直接原因の仮説」と「最小修正案」を分ける
- browser 実装差や HTML5 D&D の典型的な罠があれば、それも併記
