# UI Next ターゲット選択修正タスクリスト

> **ステータス**: ✅ 完了 | 📅 開始: 2026-03-20 | ✅ 完了: 2026-03-20 | 🔄 最終更新: 2026-03-20
>
> **進捗サマリー**: T01〜T05 完了

## 目的

- `ui-next` の敵数・ターゲット選択まわりの不整合を修正する
- `enemyCount` を preview 専用の一時値ではなく、turn ごとに保持される正式な入力にする
- ターゲット選択 UI を常時表示の listbox から、必要時のみ開くフローティング選択へ置き換える
- 味方単体指定も含め、engine 入力と replay 保存の target モデルを統一する

## タスク

### T01: docs と修正方針の固定

- [x] 本タスクリストを正本として登録する
- [x] 実装順を「状態修正 → target モデル修正 → UI 再設計 → テスト → docs 完了更新」で固定する

完了条件:

- [x] docs/README.md から辿れる
- [x] 実装完了時にこの文書と関連 docs を更新する対象が明示されている

### T02: enemyCount 永続化と replay 経路修正

- [x] `TurnAreaController` の commit で現在行の `enemyCount` を必ず渡す
- [x] `TurnEngineManager` が `enemyCount` を commit record / next state / replay override に保存する
- [x] `recalculateFrom()` が turn ごとの `EnemyCount` override を反映する

完了条件:

- [x] T1 で 3 を選んで commit した次ターンの初期値が 3 になる
- [x] replay ベース再計算後も `enemyCount` が維持される

### T03: target モデルの正規化

- [x] UI Next の `slotActions[position].target` を replay target 形式へ統一する
- [x] enemy target は `targetEnemyIndex`、ally target は `targetCharacterId` へ materialize する
- [x] setup 再適用で対象 style が消えた場合は explicit target を破棄してフォールバックする

完了条件:

- [x] preview / commit / recalc のすべてで target が同じ意味で解釈される
- [x] commit record に enemy / ally の target が正しく残る

### T04: UI 再設計

- [x] Enemy Setup の checkbox をトグルスイッチへ置き換える
- [x] inline target select を廃止し、必要時だけ開くフローティング選択へ置き換える
- [x] 敵 target は enemy chip、味方 target は style icon で選ぶ
- [x] `AllySingleWithoutSelf` と `IsFront()==1` に応じて候補をグレーアウトする
- [x] 全体攻撃では target UI を表示しない

完了条件:

- [x] 詳細モードでも manual target 不要スキルでは target UI が出ない
- [x] 開いていない限り target 候補 UI が画面に露出しない

### T05: テストと docs 完了更新

- [x] `TurnEngineManager` の unit test を追加する
- [x] `ui-next` の JSDOM テストを追加する
- [x] 関連非 E2E テストを実行して結果を確認する
- [x] 完了時にこの文書、`docs/README.md`、`ui_next_design.md` を更新する

完了条件:

- [x] `tests/e2e/` を変更せずに必要カバレッジが追加されている
- [x] 本タスクの docs ステータスが `✅ 完了` に更新されている

## 実装結果

- `enemyCount` を turn ごとの正式入力として commit / replay / recalculate に通した
- `slotActions[position].target` を replay target へ正規化し、engine 直前で enemy / ally target に materialize する形へ整理した
- 敵詳細 target UI を常時表示 listbox から、必要時のみ開くフローティング chip / icon picker へ置き換えた
- 詳細モード OFF、全体攻撃、対象不要 skill では manual target UI を出さないようにした
- `TurnRowController.update()` に `enemyParams` を通し、再初期化後の既存行にも最新モードを再適用するようにした

## 検証

- 実行コマンド: `node --test tests/lightweight-replay-script.test.js tests/ui-next-turn-engine-manager.test.js tests/ui-next-turn-ui.test.js`
- 結果: 12 tests passed / 0 failed
