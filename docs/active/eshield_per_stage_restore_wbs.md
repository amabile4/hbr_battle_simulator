# Eシールド段階別復帰バグ修正 WBS

> **ステータス**: ✅ 完了 | **ブランチ**: `feature/eshield-per-stage-restore` / `feature/eshield-replay-override-stage-fix` | **作成日**: 2026-06-05 | **最終更新**: 2026-06-06

## 背景

敵 `13312940` / `カレイドウロボロス・コスモス` は HP ゲージ3本と Eシールドを持つ。個別詳細データでは HP 段階ごとに `ReviveEShield` が発動し、Eシールド値は `30 -> 35 -> 40` へ変化する。

現状の `json/enemies.json` には一覧データ由来の `extra_gauge.esp: 30` しかなく、HPゲージ破壊時の `restoreEnemyEShieldAfterHpBreak()` は常に単一 max へ戻すため、2段階目以降も Eシールドが 30 に戻る。ただし `json/enemies.json` はデータ更新で再生成されるため、手書き補正は専用 override に分離する。

## 方針

- `json/enemies.json` は canonical のまま維持し、`json/enemy_eshield_overrides.json` で該当敵の段階別 Eシールド値を補完する。
- Enemy Setup の手動 Eシールド編集からも段階別 max を CSV で入力できるようにする。
- Eシールド状態に段階別 max 配列を保持し、HP破壊後に進んだ段階 index に対応する max/current へ復帰する。
- 段階別データが無い敵は従来通り現在の max へ復帰する。
- 優先順位は手動 Eシールド編集 > override > なしとし、snapshot、replay override は既存の `eShieldState` 正規化経路で段階別情報を保持する。
- 2026-06-06 follow-up: 旧 replay の `EnemyEShields` override が `maxByStage` を持たない場合でも、override 内の stale `max` で段階別値を落とさず、現在状態 / catalog 側の `maxByStage` と HP 段階から `max` を再導出する。DownTurn 自然回復も段階別値がある場合は現在 HP 段階の max へ戻す。

## WBS

| ID | 内容 | 状況 |
|---|---|---|
| E-1 | `13312940` に override で段階別 Eシールド値を補完 | ✅ 完了 |
| E-2 | `enemy-e-shield` 正規化で段階別 max を保持 | ✅ 完了 |
| E-3 | HPゲージ破壊後の Eシールド復帰を段階別 max に対応 | ✅ 完了 |
| E-4 | Enemy Setup 手動入力 / BattleState / snapshot 経路の保持確認 | ✅ 完了 |
| E-5 | unit / Playwright / lint で回帰確認 | ✅ 完了 |
| E-6 | docs/README 同期・Claudeレビュー依頼 | ✅ 完了 |
| E-7 | 旧 replay `EnemyEShields` override の `maxByStage` 欠落補正と DownTurn 段階別復帰 | ✅ 完了 |

## 受け入れ条件

- `カレイドウロボロス・コスモス` の連続 HP 破壊で Eシールドが `30 -> 35 -> 40` に復帰する。
- `json/enemies.json` は canonical のまま維持され、段階別値は override から供給される。
- Enemy Setup の手動 Eシールド編集で段階別最大値を入力でき、override より優先される。
- 段階別 Eシールド値がない敵は従来通り単一 max へ復帰する。
- Eシールド状態の snapshot / replay override で段階別 max が落ちない。
- 旧 replay の stale `EnemyEShields` override に `maxByStage` がなくても、HP破壊後は `35 -> 40` へ復帰する。
- DownTurn 終了時の Eシールド自然回復は、段階別値がある場合に現在 HP 段階の max へ復帰する。
- `npm test`、lint、関連 Playwright が通過する。

## 検証

- `node --test tests/data-store-operations.test.js tests/ui-next-enemy-list.test.js tests/ui-next-initial-setup.test.js tests/ui-next-battle-state-manager.test.js tests/enemy-e-shield-restore.test.js tests/turn-state-transitions.test.js`
- `npm run lint -- --quiet`
- `npm test`
- `npx playwright test tests/e2e/turn-row-e-shield-edit.spec.js tests/e2e/enemy-setup-eshield-overflow.spec.js tests/e2e/normal-attack-belt-e-shield.spec.js`
