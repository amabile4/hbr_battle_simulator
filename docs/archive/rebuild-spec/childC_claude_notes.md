# Child C (Claude) 分析備忘録

## 全体統合のスナップショット
- `globals.js` が `characterDatabase`・`currentParty`・`turnActions`・`battleHistory` などの状態を一元化し、`DataManager` → `PartyManager` → `DisplayManager` → `ControlManager` → `ResultsManager` の順に画面と履歴を更新する単方向パイプラインになっているが、依然として DOM 操作と状態更新が入り混じっており、実行・更新のタイミング制御が散在している。
- `skillDatabase.json` からロードした 58 キャラクター・443 スキルのデータは `characterDatabase` に格納され、グローバルな `currentParty` に参照される。`positionMap`/`turnActions` で前衛ポジションにひもづく操作を管理することで、配置交換・スキル選択の UI との同期を取っている。
- `event-handlers.js` の `SwapManager`/`SkillManager`、`ControlManager` のターン実行・SP 회復/次ターン処理、`ResultsManager` のテーブル生成という分離は利点な一方、SP 変動の「理由」や特殊ターン状態（OD/追加ターン）を扱うレイヤーが仮想的にしか存在せず、再利用可能なドメインモデルが不足している。

## 要件正規化に向けた課題
- `README.md` にある SP 基本復帰+2、パッシブ/装備/追加効果での初期値・ターン経過回復、OD 回復などの分類は文書化済みだが、実装側では `currentParty.character.currentSP` と `spBonus` の加算のみで抽象化されており、`SPChange` の根拠（例：パッシブ、アクティブ、OD）を示すメタ情報が欠落。
- ターン管理仕様（通常、OD1-3、追加ターン）・配置交代制限・バフ/デバフ履歴管理・CSV 出力フォーマットまで `README.md` で定義済みだが、フロントエンド実装では「ターン番号」と「行動」だけを記録しており、特殊ターンステータスや列ヘッダー構造の再現、バフ継続ターンなどが正規化されていない。
- スキル分類（ダメージ vs 非ダメージ）や SP 回復アクション、配置依存効果といった要件は `skillDatabase.json` の `type` 属性と README の分類で裏付けられるため、インターフェース設計時点で共通スキーマ（SkillCatalog の `type`, `cost`, `targets`, `effects`）に統一することで、CSV/シミュレーション/将来の AI 内部モデルでも再利用可能。

## 再開発向け仕様案
- **ドメインモデル**: `BattleState`（全体ターン・配置・履歴）、`CharacterState`（name/position/sp/currentBuffs）、`SkillAction`（skillId/cost/type/target/trigger）、`TurnRecord`（turnId, phase, specialStatus, actions[]）といったクラスを定義し、すべての更新は状態遷移関数 `applyAction(battleState, skillAction)` 経由とする。
- **SP イベントストリーム**: `SPChangeEntry` に `source`（autoRecover/baseBonus/passive/active/OD）、`amount`, `targetCharacter`, `preSP`, `postSP` を記録し、UI/CSV/デバッグで `amount` と `source` を併記する。`ControlManager` 類を削減し、状態を差分で生成する `StateEngine` を導入することで、`savedSPState` のような副作用の多い保存処理を排除。
- **特殊ターンと配置ルール**: `TurnRecord.specialStatus` に `odLevel`, `extraTurns`, `swapAllowedPositions` を持たせ、UI イベントはこのメタ情報で動作制限。`BattleState.phase` でフェーズ（非ダメージ→ダメージ）を明示し、`ResultsManager` は `TurnRecord` をベースに列ヘッダーと CSV フォーマット（3 行ヘッダー + 3 列 × 6 キャラ）を生成。
- **要件・データ正規化**: `skillDatabase.json` を再構築する際には `effects`: [`{type:'spRecover', value:6, scope:'target'}`] のような構造体を付与。`requirements.md`（本ファイルの補助）では、SP 回復/消費/OD/追加ターンのトリガー一覧を 1.2.3 体系で整理し、再開発チームに渡せるデータ辞書として展開する。
