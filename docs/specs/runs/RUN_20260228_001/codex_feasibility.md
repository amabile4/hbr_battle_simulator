[HANDSHAKE] provider=codex model=gpt-5-codex session=n/a ts=2026-02-28T06:09:16Z

最終判定: **条件付き可能**

1. キャラクタードメイン実現可能性
- `applySpChange + getEventCeiling` は実装難易度は中です。現行は `Math.min(MAX_SP)` の単純クランプで、R10の「source別 ceiling + 凍結式」に置換が必要です（[control-manager.js:110](/Users/ram4/git/hbr_battle_simulator/js/control-manager.js:110), [control-manager.js:172](/Users/ram4/git/hbr_battle_simulator/js/control-manager.js:172)）。
- `canSwapWith` は実装可能ですが、現行は交代可否判定を持たず無条件スワップです（[event-handlers.js:63](/Users/ram4/git/hbr_battle_simulator/js/event-handlers.js:63)）。`allowedCharacterIds` を TurnState で一元管理する必要があります。
- `CharacterState` のイミュータビリティ保証は難易度中〜高。現行は `currentParty`/`positionMap`/`turnActions` を直接破壊更新しています（[globals.js:3](/Users/ram4/git/hbr_battle_simulator/js/globals.js:3), [party-manager.js:141](/Users/ram4/git/hbr_battle_simulator/js/party-manager.js:141), [event-handlers.js:99](/Users/ram4/git/hbr_battle_simulator/js/event-handlers.js:99)）。

2. 現行コードからの移行可能性
- `globals.js → BattleState` は可能ですが影響範囲大。グローバル依存が UI 全体に広く散在しています（[globals.js:1](/Users/ram4/git/hbr_battle_simulator/js/globals.js:1), [event-handlers.js:5](/Users/ram4/git/hbr_battle_simulator/js/event-handlers.js:5), [results-manager.js:30](/Users/ram4/git/hbr_battle_simulator/js/results-manager.js:30), [export-manager.js:6](/Users/ram4/git/hbr_battle_simulator/js/export-manager.js:6)）。
- `party-manager.js → CharacterState` は可能。主な変換点は `name/currentSP/cost` から `characterId/sp.current/spCost` へのマッピングです（[party-manager.js:141](/Users/ram4/git/hbr_battle_simulator/js/party-manager.js:141), [data-manager.js:28](/Users/ram4/git/hbr_battle_simulator/js/data-manager.js:28)）。
- 後方互換は「Adapter層」を置けば維持可能。特に結果表示とTSV出力は `battleHistory` 前提が強いです（[results-manager.js:34](/Users/ram4/git/hbr_battle_simulator/js/results-manager.js:34), [export-manager.js:68](/Users/ram4/git/hbr_battle_simulator/js/export-manager.js:68)）。

3. パフォーマンス・スケーラビリティ
- 6キャラ固定なのでCPUは問題になりにくいです。
- メモリはスナップショットを `snapBefore/snapAfter` で毎ターン保持するため増えますが、推定オーダーは実用範囲です（推論）。目安は数百ターンでもブラウザで許容される可能性が高いです。
- 妥当性としては、編集・再計算・CSV固定列要件を満たすためスナップショット戦略は合理的です。

4. テスタビリティ
- 純粋関数化でユニットテスト容易性は大きく改善します。現状はグローバルモック中心で結合が強いです（[tests/control-manager.test.js:5](/Users/ram4/git/hbr_battle_simulator/tests/control-manager.test.js:5), [tests/setup.js:25](/Users/ram4/git/hbr_battle_simulator/tests/setup.js:25)）。
- OD/extra遷移は状態機械テスト（遷移表ベース）を導入すればカバレッジ確保可能。現行テストにはOD/extra系が未整備です。

5. リスク要因
- 高リスク: `preview` と `commit` の二重適用/不整合、交代後の action 紐付け不整合、`cost`/`spCost` フィールド移行漏れ。
- 中リスク: UI層がグローバル即時更新前提のため、状態注入方式へ変更時に一時的な表示差異が出る。
- 未確定事項の影響:
- `Q-BS1` は仕様上はDEC-001で解消済み。実装影響は低。
- `Q-EF1` は `EffectSlot.source` 列挙の確定待ち。v1で効果計算未実装なら影響は低〜中（主に型とCSV/記録互換）。

**条件付き可能の最小修正セット**
1. `BattleState` ストアを新設し、既存マネージャに `state/getState/setState` Adapter を挟む（グローバル直参照を段階的に除去）。
2. SP計算を `applySpChange/getEventCeiling` に一本化し、`cost/base/od/passive/clamp` の順序を関数テストで固定。
3. `swap` を `canSwapWith + allowedCharacterIds` 経由に変更し、extra中の行動権制約を強制。
4. `RecordAssembler` を先行導入し、`results/export` は当面 Adapter で旧 `battleHistory` 形式を供給して後方互換維持。
5. テストを「純粋関数ユニット + TurnState遷移表 + 既存UIスモーク」の3層に再編。