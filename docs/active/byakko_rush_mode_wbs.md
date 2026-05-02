# Byakko06 ラッシュモード実装 WBS

> **ステータス**: ✅ 完了 | **作成**: 2026-05-01 | **最終更新**: 2026-05-02

## 対象スタイル

- Style: `1002606` / `戦場の白き牙` / Byakko06
- Role/Type: `Blaster` / `Stab` / `Dark`
- 主要説明: 自身の DP が 100%以上のとき【ラッシュ】状態となり、攻撃スキルを 2 回連続で発動できる

## 実データ調査サマリ

### 新規または要確認の runtime 要素

| 種別 | データ | 調査結果 | 実装方針 |
|------|--------|----------|----------|
| Passive | `Passive.Start_DoubleActionAttackSkill01` / ラッシュモード | `OnPlayerTurnStart`, `condition=DpRate()>=1.0`, part `ByakkoDoubleActionAttackSkill`, `exitCond=PlayerTurnEnd`, `exitVal=1` | 新規 player status として実装。既存 `DoubleActionExtraSkill` の二連発動基盤を攻撃スキル用へ拡張する |
| Passive | `Passive.Start_UseEX_HealSp02` / 獅子奮迅 | `AdditionalHitOnExtraSkill + HealSp AllyAllWithoutSelf +2`, `value[0]=30` | 既存 `AdditionalHitOnExtraSkill` と SP30 上限突破経路で対応済み。実データ回帰を追加する |
| Skill | `46002609` / アサルトクロー | 闇単体攻撃 + `Fragile` EnemyTurnEnd 1 | 既存 enemy status 経路で対応済み。ラッシュ時に二連対象 |
| Skill | `46002610` / ディスラプト | 闇単体攻撃 + `DefenseDown` Eternal | 既存 enemy status 経路で対応済み。ラッシュ時に二連対象 |
| Skill | `46002611` / シャドウ・ランペイジ | 闇全体 EX、`Funnel` AllyAll, Only, PlayerTurnEnd 3, target `IsNatureElement(Dark)==1`, 対DP+50% | 既存 Funnel / EX 使用回数 / 対DP multiplier 経路で対応済み。ラッシュ対象でもあるが、EX 残回数 2 以上の扱いを固定する |
| Limit break | LB1 `Turn_HealSp01`, LB3 `Start_HealSpAcc05` | 既存 HealSp passive | 対応済み。追加実装不要 |

### 既存コード上の主要接続点

- `src/turn/turn-controller.js`
  - `DoubleActionExtraSkill` は status 付与、preview で `castCount=2`、commit で 1 回分 SP / 2 回分使用回数消費に対応済み。
  - 現在の `shouldRepeatWithDoubleActionExtraSkill()` は `skill.isRestricted` の EX 専用判定。
  - `applyPassiveTiming()` 系では unknown skill type の許可リストに入らない限り `ByakkoDoubleActionAttackSkill` は未対応扱いになる。
- `src/domain/character-style.js`
  - `DoubleActionExtraSkill` 専用の status accessor / consume helper がある。
  - ラッシュ用にも同等 accessor を追加するか、二連 action status を汎用 helper 化する。
- `ui-next/utils/char-detail-popup.js`
  - status label map に `DoubleActionExtraSkill` はあるが、`ByakkoDoubleActionAttackSkill` は未登録。
- `assets/skill_type/ByakkoDoubleActionAttackSkill.webp`
  - 新規アイコン asset は取り込み済み。UI 表示に利用可能。

## 仕様仮定

- 「攻撃スキル」は通常攻撃・追撃を除く、damage part を持つ player skill を対象にする。
- `ByakkoDoubleActionAttackSkill` は EX に限定しない。EX も攻撃スキルなので対象に含む。
- 二連発動時の共通挙動は既存 `DoubleActionExtraSkill` と同じにする。
  - SP 消費は 1 回分。
  - スキル使用回数は各 cast で消費される。
  - Count 型 Funnel / MindEye / AttackUp は 1 発目で消費され、2 発目には残らない。
  - derived repeat は break/kill/follow-up/manual outcome を引き継がない。
- ラッシュ状態は `PlayerTurnEnd` で消えるため、同一 player turn 内の該当行動にのみ有効。

## WBS

### WBS-0 調査・計画

- [x] `1002606` の styles / skills / passives を JSON パーサーで抽出する。
- [x] 既存 `DoubleActionExtraSkill` / `DpRate` / SP30 上限突破の実装状況を確認する。
- [x] WBS を `docs/active` に追加し、`docs/README.md` へ登録する。

### WBS-1 エンジン実装

- [x] `ByakkoDoubleActionAttackSkill` の定数、status 付与 helper、consume helper を追加する。
- [x] `OnPlayerTurnStart` の passive timing で `ByakkoDoubleActionAttackSkill` を status として付与する。
- [x] preview の repeat 判定を「EX 二連」と「攻撃スキル二連」に分離し、通常攻撃・追撃・非攻撃スキルを除外する。
- [x] commit 時の二連 status 消費を status type ごとに正しく行う。
- [x] passive report / unsupported 判定に新規 skill type を反映する。

### WBS-2 UI 表示

- [x] char detail / status 表示に `ByakkoDoubleActionAttackSkill` のラベルを追加する。
- [x] `assets/skill_type/ByakkoDoubleActionAttackSkill.webp` が既存 asset resolver で表示できることを確認する。
- [x] turn row 上の状態アイコン表示は既存 skill_type asset resolver / status effect 表示経路で追加対応不要と確認する。

### WBS-3 テスト

- [x] unit: DP100%以上の Byakko06 がターン開始時にラッシュ状態を得る。
- [x] unit: DP100%未満ではラッシュ状態を得ない。
- [x] unit: ラッシュ中の非 EX 攻撃スキルが 2 cast になる。
- [x] unit: ラッシュ中の EX 攻撃スキルが 2 cast になり、使用回数 2 未満では単発になる。
- [x] unit: 通常攻撃・追撃・非攻撃スキルはラッシュ対象外。
- [x] unit: `獅子奮迅` は Byakko06 EX 使用後に自身以外へ SP+2、SP30 上限突破を適用する。
- [x] Playwright: browser 実挙動に依存する UI 変更ではないため追加なし。既存 unit 全体 (`npm test`) で turn row / char detail 周辺も確認済み。

### WBS-4 ドキュメント同期・完了処理

- [x] 実装完了時に本 WBS のチェックを更新する。
- [x] `docs/README.md` の該当行のステータス・概要・最終更新日を更新する。
- [x] 実行した unit / Playwright 結果を最終報告に記載する。
- [x] 2026-05-01 追補: `シャドウ・ランペイジ` 二連時にマスタースキル連撃（Eternal）とスキル自身の連撃（PlayerTurnEnd 3T）が同時採用され、各 cast が `5hit + 2hit + 3hit = 10hit` / OD `+25%` になるよう Funnel の `Only` 競合を duration 別に分離する。
- [x] 2026-05-02 追補: ラッシュ任意 ON/OFF を直接 override せず、`DpStateByPartyIndex` と `EnemyAttackTargetCharacterIds` による DP 状態表現へ接続する。

### WBS-5 ラッシュ DP 状態制御追補

- [x] `EnemyAttackTargetCharacterIds` の対象へ固定 `1 DP` の簡易被弾ダメージを追加し、DP BREAK させず `source: enemy_attack` の `dpEvents` として記録する。
- [x] 敵攻撃ターゲット指定時も既存 `TokenSetByAttacked` / motivation 減少を従来どおり発火させる。
- [x] DP100%未満の `OnPlayerTurnStart` で既存ラッシュ状態を整理し、`夏色ハイテンション` などの DP 消費後にラッシュが残らないよう固定する。
- [x] `DpStateByPartyIndex` override を TurnEngineManager の preview / commit / replay / edit stateBefore 経路へ適用する。
- [x] DP override 適用時に Byakko06 のラッシュ状態を DP 条件へ同期し、`DP 100%` / `DP 99%` の手動制御を preview に反映する。
- [x] UI Next turn row に折りたたみ式の `敵行動` 操作を追加し、展開時のみ味方ごとの `被弾` / `100` / `99` を表示する。draft / committed edit の `overrideEntries` として保存・復元する。
- [x] replay JSON save/load 後も `EnemyAttackTargetCharacterIds` と `DpStateByPartyIndex` が再計算に反映される回帰を追加する。

## 検証結果

- `node --test tests/turn-state-transitions.test.js --test-name-pattern "ByakkoDoubleActionAttackSkill|enemy attack"`: 487 tests pass
- `node --test tests/lightweight-replay-script.test.js tests/ui-next-turn-engine-manager.test.js tests/ui-next-turn-ui.test.js`: 155 tests pass
- `npm run lint`: pass
- 既存完了時: `npm test`: 1154 tests pass

## リスク・未確定事項

- 実機上の「攻撃スキル」が `AttackSkill` part のみか、`DamageRateChangeAttackSkill` 等の派生攻撃 skill type も含むかは追加流入データで確認する。実装は「damage part を持つ、通常攻撃・追撃以外のスキル」へ寄せる。
- 同一ターン内に `DoubleActionExtraSkill` と `ByakkoDoubleActionAttackSkill` が同時に有効な場合は、二重に 4 cast へ増やさず `castCount=2` に留める。優先消費 status は実装時に明示する。
