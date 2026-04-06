# UI Next 未実装タスクリスト

> **ステータス**: 🟢 進行中 | 📅 作成: 2026-04-05 | 🔄 最終更新: 2026-04-07
>
> **目的**: `ui_next_implementation_tasklist.md` から未完了項目を分離し、active ドキュメントに散在していた未実装作業をこの 1 ファイルで追跡する。
>
> **運用ルール**:
> - 実装が完了した項目はこのファイルで `[x]` に更新する。
> - まとまりで完了した項目は `docs/archive/` へ移し、`ui_next_implementation_tasklist.md` には完了履歴として反映する。
> - 完了時は `docs/README.md` の該当行も同期更新する。
> - 他 active 文書で未実装項目を追加した場合は、同じ項目をこのファイルにも追記する。

## 統合元ドキュメント

- `ui_next_implementation_tasklist.md`（初回 38 項目）
- `setup_panel_layout_and_perf_tasklist.md`
- `implementation_priority_tasklist.md`
- `skill_limit_implementation_tasklist.md`
- `stage_setup_gimmick_pattern_analysis.md`

## 優先順（現時点）

1. T34: 敵状態変化（バフ/デバフ）管理・表示
2. T16-B: Summon による敵数増加
3. T19: use_count 表示・管理
4. T20-D/T20-E: モバイル UI/タッチ UX
5. T32: Stage Setup Phase2/3
6. T33: 固有スキル/パッシブ未反映監査

## 1) T16-B: Summon による敵数増加（5項目）

詳細計画/WBS:

- [t16b_summon_enemy_slot_wbs.md](t16b_summon_enemy_slot_wbs.md)

進捗メモ:

- 2026-04-06: Summon 本体着手前の基盤として、enemy slot 正本化、kill=`Dead`、per-enemy `od_rate`、dead slot 条件除外、UI dead badge/disable、replay enemy snapshot を反映。残りは Summon 入力/UI/commit と新規 slot metadata 生成。
- 2026-04-07: turn row `敵状態確認` ヘッダに `Summon.webp` の手動 summon ボタンを追加し、listbox から敵 preset を選んで `SummonEnemy` operation を積めるようにした。commit / replay / recalculate / popup まで反映し、sample enemy は `Dimension_03_C_DeathSlugWhite` / `Dimension_03_C1_DeathSlugWhiteBit` / `Dimension_03_C1_EnergyPit_Pink_e` の 3 体で固定。残りは敵行動データからの自動 summon 化と、summon 後 selector 回帰 coverage。

- [x] 手動 `Summon` を turn 単位の敵数増加イベントとして入力できる
- [x] Summon 実行後の `enemyCount` を commit / replay / recalculate で維持する
- [x] Summon 後に増えた敵スロットの情報表示（名前 / OD率 / 最大破壊率 / 耐性 / 吸収属性）を追加する
- [ ] break / follow-up / enemy detail popup など既存の敵選択 UI が増加後スロットにも追従する
- [ ] `BattleStateManager` / turn state に Summon 後の敵数と新規敵スロット情報を反映する

## 2) T19: use_count 表示・管理（集約）

`T19` は `9) Skill Usage Limits` へ正規化済み。ここでは重複チェックを持たず、実装管理は `9)` のみで行う。

## 3) T20-D/T20-E: モバイル UI/タッチ UX（8項目）

- [x] ボタンのタップターゲットを `min-h-[44px]` に統一（iOS HIG 基準）
- [x] モバイルでの `select` (スキル選択 / LB等) タップ時のネイティブ picker との干渉確認
- [x] モバイル（375px〜430px）で各タブ（Party / Enemy Setup / Settings）の表示崩れを確認・修正
- [x] ターン行（turn-row）の横幅・文字サイズ・ボタン配置がモバイルで使えるレベルか確認・修正
- [x] utility bar（ヘッダー）がモバイルで潰れていないか確認・修正
  - 2026-04-06: Safari Responsive Design Mode（iPhone SE 相当）で確認し、toolbar overflow 時はヘルプ文言を非表示にして横幅を圧縮する対応を反映。iOS シミュレータ確認でタッチヘルプの黄色パルスを指先リングへ調整。`turn-replay-status` は mobile で上部へ移動し、popup / overlay / Passive Log 表示中は非表示化。turn-row の mobile compact 試行として、コミット済み行の `OD前%→OD後%` 1行化、味方 target ラベルの shortest-name 化と footer 側への退避、前衛バフアイコンの mobile 非表示化、コミット済み行の前衛/後衛を前衛寄り比率へ調整し、前衛アイコンも後衛よりさらに約2割大きくし、`バトル終了` 表示は header 帯から切り離して2行目へ送る案を branch 上で検証中
- [x] setup-area の max-h 制限（`max-h-[50dvh]`）と turn-area のスクロールが正常に機能しているか再確認
  - 2026-04-06: Playwright mobile (`iPhone SE` / `iPhone 15 Pro`) で `Party / Enemy / Stage / Global` の横 overflow なしを確認。あわせて `setup-area` の `max-h-[50dvh]` 制約と、setup 側 active panel / `turn-area` の独立スクロールを E2E (`tests/e2e/mobile-setup-tabs.spec.js`) で固定
- [x] iPhone SE / iPhone 15 Pro 相当の実機またはエミュレータで主要操作が一通りできる
- [x] タッチ操作だけで主要導線を完結できる
  - 2026-04-06: Playwright mobile profile (`iPhone SE` / `iPhone 15 Pro`) で toolbar / setup / input-row の 44px tap target を E2E 固定（`tests/e2e/mobile-touch-targets.spec.js`）。turn-row は committed / input 両方の mobile layout を回帰化し、tap-driven turn editing と popup / used-skills 導線を E2E で確認（`tests/e2e/mobile-touch-flow.spec.js`）。`data-skill-select` は tap focus 後に値変更しても char detail / icon swap が誤発火しないことを確認。さらに空状態からの touch-only 編成開始〜戦闘開始フローも同 spec に追加し、style picker main mode の touch pointer commit (`pointerup(pointerType=touch)` / `touchend`) を通して前衛3枠選択→picker close→`戦闘開始` まで完結することを固定

## 4) T32: Stage Setup Phase2/3（集約）

`T32` の抽象タスクは `10) Stage Setup ギミック実装残` へ正規化済み。ここでは重複チェックを持たず、実装管理は `10)` のみで行う。

## 5) T33: 固有スキル/パッシブ未反映監査（6項目）

- [ ] 実データ基準で未反映・未対応の固有スキル / パッシブを列挙する
- [ ] `effectType` / `condition` / `timing` ごとに未対応理由を分類する
- [ ] 再現ケースを unit / integration / 必要に応じて browser test に落とす
- [ ] 優先度順に修正対象を backlog 化する
- [ ] 未反映効果の一覧と再現テストが揃っている
- [ ] 以後の effect 実装をテスト駆動で進められる状態になっている

## 6) T34: 敵状態変化（バフ/デバフ）管理・表示（最優先 / 8項目）

詳細計画/WBS:

- [t34_enemy_status_management_plan_wbs.md](t34_enemy_status_management_plan_wbs.md)

実行順（設計 → 実装 → 表示 → テスト）:

- [ ] 1. 敵側 status effect のデータモデルを整理し、付与 / 残ターン減少 / 永続 / 消滅を一貫管理する
- [ ] 2. 敵への状態変化付与を replay / 再計算で再現できるようにする
- [ ] 3. 敵状態変化（バフ/デバフ）を turn row / popup / enemy UI 上へ表示する
- [ ] 4. 画面上で敵バフ/デバフと残ターンが確認できる
- [ ] 5. enemy-side status の unit / integration / 必要に応じて E2E を追加する
- [ ] 6. 敵の状態変化が戦闘中に正しく付与・更新・消滅する

T34 UI 段階導入（WBS 同期）:

- [x] T34-UI-Stage1: 既存 break/follow-up メニュー類似の敵選択 UI で enemy popup を表示する
	- DoD: 複数敵（1-3体）から対象 enemyIndex を選び、選択敵の detail popup を開ける
	- DoD: 既存 break/follow-up と同種の操作感（対象選択 -> 実行）で導線を提供する
- [ ] T34-UI-Stage2: enemy 関連メニュー（break / follow-up / enemy status）の対象選択 UI を統合する
	- DoD: 共通 enemy selector component へ集約し、重複導線を削減する
	- DoD: 既存 break/follow-up 操作に回帰がないことを test で固定する

T34 follow-up（Day 1 設計ゲートで分離）:

- [ ] T34-FU1: C-2 選択肢B（`effectId` 単位の per-source instance 管理）を別タスクで設計・実装する
	- DoD: identity model 変更の影響範囲（engine/UI/tests）を文書化し、既存 merged 前提テストとの差分移行計画を提示する

T34 issue（main 管理票への追記）:

- [x] T34-ISSUE-OD-POPUP-DEFAULT-FALLBACK: JSON読込時の敵詳細 popup で OD率/最大D率が既定値（×1.00/999）表示になる不具合を修正（2026-04-05）
	- 原因: [ui-next/components/turn-row.js](ui-next/components/turn-row.js#L1448) の popup payload が statuses のみで、od_rate/max_d_rate を渡していなかった
	- 修正: [ui-next/components/turn-row.js](ui-next/components/turn-row.js#L1469) で enemyState.odRateByEnemy / destructionRateCapByEnemy を payload へ追加
	- 検証: turn UI テスト実行（836 PASS）

## 7) Setup パネル レイアウト改善 & ロード高速化（11項目）

Source: `setup_panel_layout_and_perf_tasklist.md`

- [ ] ブラウザの DevTools Network タブで fetch 開始タイミングが早まることを確認
- [ ] `app.js` の実行開始より前に fetch が始まっている（Network ウォーターフォール確認）
- [ ] 動作確認: 初回ロード後にオフラインでリロードしても表示されること
- [ ] 2回目以降のロードで Network タブに JSON fetch が出ない（キャッシュから配信）
- [ ] `hbr-data-v1` → `hbr-data-v2` にキャッシュキーを変えると強制リフレッシュされる
- [ ] `InitialSetupController.mount()` を `await Promise.all()` の前に呼べるよう、`store` を constructor から切り離す
- [ ] `PartySetupController` も同様に `setStore(store)` を追加
- [ ] `app.js` の初期化順序を変更
- [ ] ページロード直後（JSON fetch 完了前）に Party タブの空スロットが表示される
- [ ] JSON fetch 完了後にキャラクター選択ボタンが有効化される
- [ ] 戦闘開始ボタンは store 活性化後も引き続き正常動作する

## 8) PRI-018 / enemy-side 条件整理（14項目）

Source: `implementation_priority_tasklist.md`

- [ ] enemy-side `SpecialStatusCountByType(12/57)` を含む条件群を `Provoke` / `Attention` / `Cover` の3概念に分離して整理する
- [ ] `SpecialStatusCountByType(3/22/172)` と enemy status report / passive condition report の対応表を active ドキュメントへ集約する
- [ ] `SpecialStatusCountByType` の敵参照ID一覧（3/12/22/57/172）を runtime 実装集合とテスト集合の両面で監査する
- [ ] `Cover` を enemy status のまま扱うケースと、player-side self status/buff として扱うケースを仕様上切り分ける
- [ ] `エンジェルズ・ウィング` / `聖女の守護` で「自身へ Cover 状態を付与する」が正なら、engine 保存先を `enemyState` から player-side status 表現へ移す設計を起こす
- [ ] browser E2E は player-side Cover を観測できる UI 表現（バッジ・詳細ポップアップ・session JSON 等）が固まってから追加する
- [ ] **被弾時パッシブ発火条件**: 敵の攻撃によってプレイヤー側が被弾した際にパッシブが発動する仕組みが未実装
- [ ] **敵の攻撃挙動**: 敵がどのメンバーを攻撃対象に選ぶか（単体 vs 全体、Cover による強制変更）がシミュレーター上で未実装
- [ ] **Cover + 全体攻撃 による被弾パッシブ3回発動**: 上記2点が実装されて初めて検証可能

注記: use_count/残弾関連の5項目は `9) Skill Usage Limits` に正規化済み。

## 9) Skill Usage Limits（実装タスク5項目）

Source: `skill_limit_implementation_tasklist.md`

- [ ] **T01**: スキル固有の「最大使用可能回数（`limit`）」と、`SkillLimitCountUp` の補正を合算した動的な上限値算出ロジックの実装
- [ ] **T02**: 指定ターンの状態（`turnState` または `record` 履歴）から、「各スキルの消費済み回数」を正確に導出する仕組みの構築
- [ ] **T03**: `HealSkillUsedCount` による「消費済み回数の回復（減算）」処理の実装と記録（特定のスキル条件に合致する場合のみ回復するなど、対象の絞り込みも含む）
- [ ] **T04**: `turn-controller` の `previewTurn` および `scenario` の validation で、計算上の残弾が `0` 以下の場合にエラーとするハードリミットの導入
- [ ] **T05**: UI (dom-adapter) にて、選択キャラのスキル残弾が 0 の場合にセレクトボックスへの表示を無効化する（あるいは warning 表示する）対応

DoD（受け入れ条件）:

- 限度回数が設定されたスキルを規定回数を超えて使用しようとした際に、シミュレーションがエラー（またはブロック）になる
- `HealSkillUsedCount` 系効果が発動した際に、消費済み回数が正しく回復し、再度スキル使用が可能になる
- UI で残弾 0 のスキルが見える化（または disabled 表示）される
- 全ての既存テストおよび追加の回数制限テストが PASS する

## 10) Stage Setup ギミック実装残（14項目）

Source: `stage_setup_gimmick_pattern_analysis.md`

- [ ] #2 3ターン味方全体の防御力+30%（エンジン対応済み。UIは50%/Eternal固定のため、power・ターン数のパラメータ化が必要）
- [ ] #14 毎ターンDP+10%（`HealDpRate` + `OnEveryTurn` は既存。UI入力 + エンジン経路追加が必要）
- [ ] #4 ターン開始時SP0未満の前衛の味方のSP+2（`Sp()<0` + `IsFront()` 条件は既存）
- [ ] #5 ターン開始時SP0未満の後衛の味方のSP+2（#4 と同様、後衛条件）
- [ ] #7 ターン開始時ダウンターン中の敵がいるとSP+2（`BreakDownTurn()` 条件は既存）
- [ ] #13 敵を倒したとき敵1体につき味方全体のSP+1（`AdditionalHitOnKillCount` + `HealSp` は既存）
- [ ] #3 ODゲージ上昇量+20%（OD獲得量倍率の常時バフ管理）
- [ ] #9 回復スキルの効果量+50%（回復計算への倍率統合）
- [ ] #6 ターン開始時スタン状態の味方のスタン解除（`RemoveSpecialStatus` 実体ロジック）
- [ ] #18 破壊率上昇量+100%（破壊率上昇量の常時倍率管理）
- [ ] #19 行動開始時ダウンターン中の敵がいるとクリティカルダメージ+30%（行動開始時timing + 永続ギミック注入）
- [ ] #20 行動開始時ダウンターン中の敵がいるとスキル攻撃力+50%（#19 と同様）
- [ ] #21 行動開始時ダウンターン中の敵がいると破壊率上昇量+30%（#19 + 破壊率倍率）
- [ ] #22 行動開始時ダウンターン中の敵がいると破壊率上昇量+50%（#21 と同様）
