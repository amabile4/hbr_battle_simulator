# 破壊率（destructionRate）実装プラン — 検討 & WBS

> **ステータス**: 🟢 現行仮説で実装・D-1〜D-5完了・D-6検証中・D-7未着手 | **ブランチ**: `feature/integrate-hbr-calc` | **更新日**: 2026-06-15
>
> **破壊率式の扱い**: 破壊率上昇式と部分HP時の按分は、現時点では確定仕様ではなく **現行実装仮説 H-2026-06-15B** として扱う。コメント欄・動画コマ送り等の実機実測値を正とし、式がずれた場合は実測値に合わせて再検討する。
>
> ダメージ計算機統合（[damage_calculator_integration_plan.md](damage_calculator_integration_plan.md)）の **Phase B** に属する単独タスク。HP ダメージの正確化に必須。
> エンジン単体（calculateDestruction）は実装済み。2026-06-07 に turn engine から `destructionRateByEnemy` を攻撃ごとに更新する最小接続を追加し、敵 `d_rate` を破壊率上昇倍率として接続。2026-06-13 に EnemySetup の手動入力・snapshot 往復・`buildEnemyStateOverrides` から `destructionMultiplierByEnemy` への反映、および威力詳細の手入力破壊率計算への `damageContext.destructionMultiplierByEnemy` 接続を追加。`damageContext` 経由で現在破壊率をダメージ計算へ渡し、HP ダメージ表示を解禁。同日の追検証で DP ダメージから破壊率乗算を除外し、コードダクネス実データの `skillHitCount=9` / `breakHitCount=1` まで確認。新規 EnemySetup snapshot では敵DPを `enemyDpByEnemy` として配線し、多段DP→HP按分の入力を準備。超越バーストの有効破壊率capは `damageContext.destructionRateCapByEnemy` として威力詳細へ渡し、手入力の「このスキル後」計算にも反映済み。2026-06-13 後続で `hbr_calc` 統一式を同期し、SkillCondition 解決済み `attackPart` と target別 `IsHitWeak()` 条件結果を turn 経路・威力詳細手入力へ配線。2026-06-14 に Issue #18 として通常攻撃式を実機実測の `raw d_rate / 100`（超越ゲージ100%時のみ×1.10）へ `calculateDestruction` 内で統一し、turn-controller の通常攻撃専用バイパスを削除。Issue #19 としてスキル攻撃式を `dr × d_rate / 100 × 加算ボーナス × Funnel倍率`（ヒット数非依存）に根本修正し、Blaster +2.0 / hit slope の dead code を削除、火の印・共鳴・チェーン・ブラストピアス・超越・DestructionUp を同一加算グループへ統一した。Issue #20 で Count Funnel 消費時に `metadata.damageBonus` を保持し、連撃破壊率倍率は実データ `value[0]` 由来の `metadata.damageBonus` のみから解決するよう修正した。2026-06-15 時点の最新仮説では、スキル式は `dr × d_rate / 100 × 加算ボーナス × Funnel倍率`、部分HP時は effective weight 按分を採用する。2026-06-15 に威力詳細タブの破壊率プレビューを turn-controller の action 別 breakdown 正本へ接続し、session load 直後も damage calculation data を注入して action 前破壊率・DP-aware 増分を表示するよう修正した。同日後続で、Eシールド/ODの接触hit数（base+Funnel）、スキル本体 `power_ratio` + Funnel `funnelRate` による表示hit effective weight、破壊率加算開始hitを分離した。#2ユキのコードダクネスは effective weight `[0.1,0.1,0.1,0.2,0.2,0.3,0.25,0.25,0.25]` の7hit目でBreakし、HP側weight 0.75/総weight 1.75 により 100%→132.63%（+32.63%）。#2美也は 132.63%→717.34%（+584.71%）として固定し、威力詳細に接触hit・計算hit・破壊率weight・hit種別・DP/HP按分・HP適用・破壊率前後・破壊率加算を表示する。
> 右クリックポップアップへの破壊率手動入力（暫定）は 2026-06-07 完了。
> 残タスクの横断サマリーは [damage_calculator_remaining_wbs.md](damage_calculator_remaining_wbs.md) §大分類D を参照。

## 1. 背景・なぜ単独タスクか

- HP ダメージは破壊率係数が乗る。この係数は **100%（=1.0x 基準）から非常に大きな倍率（ユーザー実測で最大 1299% 級 = 約13x）** までダメージを変える支配的因子。
- Phase A（DP ダメージ MVP）では破壊率不要のため `destructionRate=1` 固定・HP 非表示とした。HP ダメージを正確化するには破壊率の「**記録・上昇計算・表示・ダメージ式接合**」の4要素が必要。
- 上昇計算（攻撃進行に伴う破壊率の動的変化）はゲーム機構として重く、単独タスクに値する。

## 2. 現状調査（2026-06-04・file:line 根拠）

### 2.1 既に存在するもの ✅

| 区分 | 実体 | 場所 |
|---|---|---|
| 敵データ | `ini_d_rate` / `d_rate` / `max_d_rate` / `od_rate` / `break_down_turn` | `json/enemies.json` `base_param` |
| エンジン状態 | `destructionRateByEnemy`(%) / `destructionRateCapByEnemy`(%) / `breakStateByEnemy` / `odRateByEnemy` | `src/turn/turn-controller.js` getEnemyState (L2438-2491) |
| getter/setter | `getEnemyDestructionRatePercent` / `getEnemyDestructionRateCapPercent` / `setEnemyDestructionRatePercent` / break state 管理 | turn-controller L3322-3470 |
| break 遷移 | 強制ブレイク(`applyEnemyStrongBreakState`) / 超ダウン(`applyEnemySuperDownState`/`removeEnemySuperDownState`) / HP破壊リセット(`resetEnemyHpBreakPhaseState`) / cap 計算(`computeEnemySpecialBreakCapPercent`) | turn-controller L3576-3705 |
| 定数 | `DEFAULT_DESTRUCTION_RATE_PERCENT=100` / `DEFAULT_DESTRUCTION_RATE_CAP_PERCENT=300` / `SPECIAL_BREAK_CAP_BONUS_PERCENT=300` | `src/config/battle-defaults.js` L12-14 |
| snapshot 保持 | override / clone / status tick で destruction 状態を保持 | turn-controller L2526-2585, 6173 |
| ダメージ式スロット | `calculateDamage` が `isHpTarget=true` のときだけ `defender.destructionRate`(既定1) を乗算。DP ダメージには破壊率を乗算しない | `src/domain/damage-calculator.js` |
| 破壊率上昇計算コア | `calculateDestruction` が 1.0 ベースで破壊率を算出し、`spMapping`、`destructionMultiplier`、手動 `isBreakHit` / 任意 `autoBreak` に対応 | `src/domain/damage-calculator.js` |
| 初期表示 | Enemy Setup の各 enemy slot snapshot に `destructionRate=1` を保持し、セットアップタブで現在破壊率を `%` 表示 | `ui-next/components/enemy-setup.js` |

### 2.2 欠落・WIP ⚠️❌

| # | 不足 | 根拠 |
|---|---|---|
| a | **攻撃ごとの破壊率上昇モデルの turn engine 接続**（DP ダメージ／OD 進行で rate が増える動的計算）は最小接続済み | 2026-06-07: `applyCommittedActionSideEffects` から break 状態反映後に `calculateDestruction` を呼び、`setEnemyDestructionRatePercent` へ反映。攻撃前 E-shield active は対象外。敵 `d_rate` は `destructionMultiplierByEnemy` に保持し、`calculateDestruction` へ rate 化して渡す |
| b | **破壊率の詳細表示**（威力詳細／計算機ペイン）は現在破壊率表示まで実装済み | `markDestructionRateGainBonusRate` など上昇量内訳表示は未実装。`damage_breakdown/unimplemented_elements_wbs.md` でも `isDestructionRateGainSkill` を将来対応扱い |
| c | **ダメージ式への接合** | 2026-06-07: `damageContext.destructionRateByEnemy` を追加し、`damage-calculator-input-builder.js` が対象敵の `%` 値を `calculateDamage` 用 rate に変換。enemy adapter 側の `destructionRate` があれば優先 |
| d | **HP ダメージ表示の解禁** | 2026-06-07: 右クリック威力詳細の計算機ペインで DP/HP の非クリ・クリティカル期待値を同時表示。HP 側は `isHpTarget=true` で破壊率適用後の値を計算 |

## 3. 現行仮説と実測済み前提

> 以下は「確定済みのゲーム仕様」ではなく、現行実装仮説と実測済み前提の整理。実測値と乖離した場合は実測値を優先する。

- **Q-D1**: **基本破壊率と上昇モデル**: アクティブスキルの全hit時破壊率上昇量は `raw d_rate × dr / 100 × (1 + 超越 + 火の印 + チェーン + ブラストピアス + 共鳴 + DestructionUp) × (1 + funnelRate × funnelHitCount)`。`funnelRate` は `Funnel` part の `value[0]` 由来で保持した `metadata.damageBonus` のみを使い、`power[1]` fallback は使わない。`funnelHitCount` は固定回数なら `power[0]`、可変回数なら `power[0]`〜`power[1]` を `diff_for_max` / `parameters` と付与者 stats で解決して使う。通常攻撃は実機実測に基づき `raw d_rate/100` とし、超越ゲージ100%時のみ×1.10、共鳴・装備・武器種・キャラ等の補正は非適用。部分HP時は、スキル本体 `power_ratio` と Funnel `funnelRate` を連結した effective weight 列でDP→HP跨ぎを判定し、HPへ1以上入ったhitのweightぶん `finalBaseDestruction × weight` を加算する。追撃式は実機データ未確定のため既存式を維持。
- **Q-D2**: **HPダメージへの適用**: 最終破壊率はHPダメージに対して全倍率乗算される。DPが存在する間のヒットでは破壊率は蓄積しない。ただし同一 action 内で DP→HP をまたぐヒットでは、Break 発生 hit のオーバーキル HP ダメージ分も破壊率加算対象に含めるため、Break 発生 hit およびそれ以降で加算する。
- **Q-D3**: **破壊率上限の決定**: 最終上限は `敵固有破壊上限 (max_d_rate / 100)` + `上限超越補正` となる。これにより300%を超える上限値が再現可能。
- **Q-D4**: **break_down_turn の影響**: 破壊率の直接的な進行計算には影響を与えない（状態異常管理やシミュレーションのフェーズ遷移にのみ影響）。
- **Q-D5**: **DPブレイク判定のモデル化**: `calculateDestruction` に `dp` と `hits` 配列を渡し、累積ダメージでブレイク判定を行う（`autoBreak` 時）か、または `isBreakHit` フラグで判定。

## 4. WBS（破壊率タスク）

> 依存: **D-1（現行仮説整理）が D-3/D-4 の前提**。D-4 は D-2/D-3 に依存。D-5 は D-4 に依存。

| ID | 分類 | 内容 | 依存 | 状況 |
|---|---|---|---|---|
| D-1 | Spec | 破壊率上昇式・cap・適用条件の現行仮説整理（Q-D1〜D5）。Excel/Python/実機を突き合わせて式を文書化 | — | ✅ 現行仮説として実装（通常攻撃は `raw d_rate/100`、超越ゲージ100%時のみ×1.10、共鳴/装備/武器種等は非適用。アクティブは `raw d_rate × dr / 100 × 加算ボーナス × Funnel倍率`、部分HP適用時はスキル本体 `power_ratio` + Funnel `funnelRate` の effective weight で按分、手動/自動break入力契約、火の印/チェーン/ピアス/共鳴/超越/Funnel をコード化。追撃式は現状維持） |
| D-2 | Engine(記録) | 既存 `destructionRateByEnemy` が実戦闘進行を反映するか検証。攻撃進行による破壊率の現在値を「記録」する経路を確認・補完 | D-1 | ✅ 完了（調査時点では turn-controller から `calculateDestruction` 呼び出しなし。break/reset/superDown 系のみが更新していたため D-3 で補完） |
| D-3 | Engine(上昇計算) | D-1 の式を engine に実装（DP ダメージ／OD／break 連動で rate を上昇、cap でクランプ）。snapshot 保持・replay 整合 | D-1, D-2 | ✅ 完了（既BREAK / same-action Break・SuperBreak で上昇、cap clamp、E-shield active 除外）。敵 `d_rate` 実値を `destructionMultiplierByEnemy` として保持し、破壊率上昇式へ接続。2026-06-13 に EnemySetup 手動入力（既定 raw `d_rate=5` / enemies.json `base_param.d_rate` 初期値 / 手動上書き可）と snapshot 往復、威力詳細の手入力破壊率計算への倍率反映を追加。2026-06-16 に session JSON / enemy preset の `d_rate` 欠損 fallback を raw `5` に統一し、旧 `100` fallback を廃止。`ini_d_rate` は既存 100% 基準と衝突するため初期現在値には未接続。統一式同期後、`applyDestructionRateFromActions` は解決済み `attackPart` と対象敵別 `IsHitWeak()` 結果を `calculateDestruction` へ渡す。2026-06-14 に通常攻撃専用バイパスを削除し、通常攻撃も `calculateDestruction` の `isNormalAttack` 分岐へ統一。Issue #19 で `baseHitCount` / `funnelHitCount` / `funnelRate` / `markDestructionRateGainBonusRate` を接続し、Blaster slope dead code を削除。Issue #20 で Count Funnel 消費済み effect に `metadata.damageBonus` を残し、`power[1]` マッピング fallback を削除。2026-06-15 に same-action autoBreak の hit 解析を追加し、DP→HPをまたぐBreak発生hitのオーバーキル分を加算対象に含める補正を `destructionBreakdownByEnemy` に記録。同日後続で連撃込みhit数による9等分を廃止し、スキル本体 `power_ratio` + Funnel `funnelRate` の effective weight 列を使ってDP/HP按分と破壊率加算weightを導出するよう修正した |
| D-4 | Integration(接合) | `damageContext` に per-enemy 破壊率（と cap）を配線（A-7 の `enemyParamBorderByEnemy` と同パターン）。builder が `destructionRate` を渡す。`calculateDamage` が HP ダメージに適用。HP/DP 出し分け | D-2, D-3 | ✅ 完了（`destructionRateByEnemy` / `destructionRateCapByEnemy` は `%` で保持し、builder / popup adapter が `calculateDamage` / `calculateDestruction` 用 rate に変換） |
| D-5 | UI(表示) | 威力詳細／計算機ペインに破壊率（現在値・cap）と適用後 HP ダメージを表示。Phase A で非表示にした HP 行を解禁 | D-4 | ✅ 完了（DP/HP の非クリ・クリティカル期待値、現在破壊率、cap、手入力後の破壊率を表示。2026-06-15 に committed action では action 前破壊率を入力初期値とし、turn-controller の `destructionBreakdownByEnemy` 増分を「このスキル後」へ使用するよう更新。威力詳細に接触hit、計算hit、基礎hit、連撃hit、連撃倍率、hit ratio、Break hit、DP/HP総ダメージ、hit別DP按分/DP消費/HP按分/HP適用/破壊率前後/破壊率加算を表示） |
| D-6 | Test | unit（上昇式・cap・接合）／ E2E（破壊率表示・HP ダメージ・敵タブ連動）／ 実データ DP 検証（敵 DP 割れ判定） | D-3, D-4, D-5 | 🔶 部分完了（`calculateDestruction` 回帰、Issue #19 の実機確認15ケース、dp=0 + damage=0 post-break 加算、destructionMultiplier 倍率反映、通常攻撃 `raw d_rate/100` と超越×1.10・補正非適用、storedRate 100% fallback、context/builder 接合、敵 `d_rate` snapshot/save-load 往復、EnemySetup UI初期値、BattleStateManager override反映、HP表示・破壊率>100%時 HP>DP・敵タブ連動 E2E、DPダメージの破壊率除外、SkillSwitch 子スキルID解決、対象敵名表示、`enemyDpByEnemy` の新規 snapshot 配線、超越capの `damageContext.destructionRateCapByEnemy` 接続と威力詳細手入力反映、通常攻撃の威力詳細手入力が `d_rate=10` で100→110になること、2026-06-15 の session fixture 回帰で #1 美也/#1 ユキの未ブレイク無変化、#2 ユキ action 前100%→132.63%（接触9hit / 計算9hit / hit ratio [0.1,0.1,0.1,0.2,0.2,0.3,0.25,0.25,0.25] / Break hit 7 / 破壊率weight 0.75/1.75 / +32.63%）、#2 美也 132.63%→717.34%（+584.71%）を engine-level と Playwright E2E で固定、`destructionWeight` 単体回帰を追加。既存保存セッションの敵DP補完は残） |
| D-7 | 受け入れ | HP ダメージの 3点一致（Excel／実機／本シミュレータ）＋実データ DP 検証で OK | D-6 | 未着手 |

## 5. リスク・留意点

- **最大リスクは D-1（仕様未確定）**。上昇式が不明なまま D-3 に進むと手戻り。Excel フィックス版（ユーザー持ち込み予定）と Python 正本（`calc/`）の突き合わせを先行する。
- engine の破壊率は **replay/session snapshot** に波及する（override/clone/tick で既に保持実装あり）。上昇計算を足す際は snapshot 整合・回帰を必ず確認。
- 破壊率は **HP ダメージ専用**。DP ダメージ（Phase A）には乗らない。`isHpTarget` 連動を崩さないこと。
- AttackBySp 消費SP威力スケーリング（別タスク）とは独立だが、両方揃って初めて HP ダメージが完全正確化する。

## 6. スコープ境界

- **本タスク（破壊率）**: 記録・上昇計算・表示・ダメージ式接合（D-1〜D-7）。
- **別タスク**: AttackBySp 消費SP威力スケーリング（[damage_calculator_integration_plan.md](damage_calculator_integration_plan.md) スコープ外項目）。
- **前提（完了済み）**: Phase A（DP ダメージ MVP・実敵 param_border 配線）。
