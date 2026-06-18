# ダメージ計算機 完成までの残タスク WBS

> **作成日**: 2026-06-07 | **ステータス**: 🟢 進行中 | **最終更新**: 2026-06-17
> **対象ブランチ**: `feature/destruction-rate-popup`（→ main へ最終 merge）
>
> 計算の最終的な正確性を得るまでに何が必要かを整理したマスター WBS。
> 個別 plan（[damage_calculator_integration_plan.md](damage_calculator_integration_plan.md)、
> [destruction_rate_implementation_plan.md](destruction_rate_implementation_plan.md)、
> [damage_breakdown/unimplemented_elements_wbs.md](damage_breakdown/unimplemented_elements_wbs.md)）
> の横断サマリーとして機能する。個別ドキュメントと競合する場合は本 WBS を優先。

---

## 現在地（Phase A 完了済み）

| 完了項目 | 内容 |
|---|---|
| A-1 〜 A-7 | DP ダメージ MVP: charge 修正・attacker source PartySetup 化・read-only stat 表示・DP 固定・invariant・敵 param_border 実値配線 |
| 倍率内訳 | 7カテゴリ（buff / crit-mindeye / funnel / token-passive / debuff / affinity / vulnerability）表示 |
| 破壊率 接合/HP表示 | 右クリックポップアップに破壊率（暫定）手動入力 → このスキル後計算（2026-06-07 完了）。同日に `damageContext.destructionRateByEnemy` 接合、敵 `d_rate` 上昇倍率接続、DP/HP ダメージ同時表示を追加。2026-06-07 追検証で DP ダメージから破壊率乗算を除外し、SkillSwitch 子スキル（例: `46001217` コードダクネス）と対象敵名を威力詳細へ渡す経路を固定。追加調査で `criticalDamageUpRate` / `criticalRateUpRate` の summary rate 接続、新規 EnemySetup snapshot からの敵DP配線、超越バーストの破壊率上昇量+10%とcap+300%（一致属性攻撃のみ、SuperBreak/強ブレイクとは非加算）、威力詳細手入力での有効cap反映を追加。2026-06-13 に hbr_calc の `resolveEffectPowerFromPart` を turn engine へ接続し、`diff_for_max > 0` の自己バフ / 敵デバフ / DamageRateUp / DestructionUp 入力を実 stats・敵 border で解決するよう更新。2026-06-17 に damageContext へ行動時点の `remainingDpByEnemy` / `remainingHpByEnemy` / `extraHpGaugeStateByEnemy` を追加し、威力詳細の現DP/現HP表示を計算入力と同じ時点へ統一。多段HPゲージ遷移後は本来破壊率・本来capを保持しつつ、強ダウン一時capはHPゲージ破壊またはDownTurn解除で本来capへ復元する。HPゲージ破壊アクションの表示は破壊対象ゲージで打ち切り、超過分を次ゲージへ持ち越さない。空の replay cap override による上書き低下も修正。多段HPゲージ敵の自動HP消費・自動HP破壊、手動HP破壊後の次段階HP同期、`PenetrationCriticalAttack.value[0]` の相性倍率反映を追加。対象 replay では比較純計算が #5 自動HP破壊まで改善し、#4 実機手動破壊との差分は `Misfortune` / 厄など未確定実機補正として継続調査 |

---

## 残タスク一覧

> **凡例**: ❌ 未着手 / 🔶 部分着手 / ✅ 完了 / 🔵 将来対応
> **優先度**: 🔴 高（最終正確化の直接ブロッカー）/ 🟡 中 / ⚪ 低

---

### 大分類 C: バフ・デバフ接続 検証

> 現在の計算機は `preResolvedDamageModifiers`（各カテゴリ採用済み総倍率を synthetic で渡す）で
> `calculateDamage` に入力する。理論的には合うはずだが実ゲームデータで検証が必要。

| ID | 優先度 | 内容 | 状態 | 依存 |
|---|---|---|---|---|
| C-1 | 🔴 | **バフ接続検証**: `buffMultiplier`・`critMindeyeMultiplier`・`funnelMultiplier`・`tokenMultiplier` が breakdownのカテゴリ倍率と `calculateDamage` 結果で一致するか実データ確認。E2E or 実機比較。心眼（MindEye）弱点スキル判定も確認 | ✅ 検証完了 | — |
| C-2 | 🔴 | **デバフ接続検証**: `debuffMultiplier`・`vulnerabilityMultiplier`・`affinityMultiplier` の一致確認。DefenseDown / ElementResistDown / Fragile の合算パスが `calculateDamage` に届いているか | ✅ 検証完了 | — |
| C-3 | 🟡 | **接続不一致時の修正**: token-passive の DP条件倍率（attackByOwnDpRateResolvedMultiplier）が rate 加算扱いだったのを乗算に修正。`(1 + Σrates) × dp_multiplier` の正しい式に修正済み（commit bf9e861） | ✅ 修正完了 | C-1, C-2 |

---

### 大分類 S: 攻撃者・敵 ステータス実値化

> 現状: 攻撃者は PartySetup 実 stats を表示し、闘志（FightingSpirit）の固定値 stat 加算を stat delta に反映済み。敵側は全能力ダウンを stat delta に反映済み。
> 正確な計算には実際のキャラ stat（エクイップ後・バフ適用後）が必要。

| ID | 優先度 | 内容 | 状態 | 依存 |
|---|---|---|---|---|
| S-1 | 🔴 | **攻撃者 stats 実値配線**: PartySetup スナップショットにキャラ str/dex/wis/spr/luk/con を追加し、`openCharDetailPopup` 経由で `attackerInput` に実値を渡す。凸・role はすでに連携済み | ✅ 完了（commit 6067712） | PartySetup stats 欄実装 |
| S-2 | 🟡 | **stat delta 実値化（攻撃者）**: バフ適用後の実効 stat（resolved = base + buffDelta - debuffDelta）を `buildDamageStatDeltaViewModel` に実装。現状 delta=0 固定 | 🔶 部分完了（2026-06-16 に `FightingSpirit` / 闘志を固定値 stat 加算として接続。攻撃者全 stat に `fightingSpiritBonusValue` を flat 加算し、威力詳細 stat grid と計算入力へ反映。2026-06-18 に威力詳細の攻撃側補足欄も stat delta 反映対象のみへ限定。AttackUp 等は倍率カテゴリで別管理） | S-1, C-1 |
| S-3 | 🟡 | **stat delta 実値化（敵）**: 敵の DefenseDown 等の数値を stat 列の delta として表示。enemyAllAbilityDownByEnemy の計算式確定が必要 | ✅ 完了（`enemyAllAbilityDownByEnemy` を敵 stat 行の `debuffDelta` として表示。base=paramBorder、delta=-penalty、resolved=paramBorder-penalty） | C-2, E-1 |

---

### 大分類 E: 全能力ダウン（タリスマン・災難）ステータス差計算

> 敵の「全能力ダウン」は倍率ではなく **攻撃側 STR/WIS - 敵 DEF の差分** に加算され、
> ダメージに非線形に影響する。単純な multiplier として表示できない。

| ID | 優先度 | 内容 | 状態 | 依存 |
|---|---|---|---|---|
| E-1 | 🟡 | **全能力ダウン計算式確定**: `enemyAllAbilityDownByEnemy` が `calculateDamage` でどの引数にマップされるか確定（`defender.statusEffects` の DefenseDown として渡す？ or `paramBorder` 補正？）。`calculateDamage` エンジン側の受け口を確認 | ✅ 完了（`DefenseDown` は倍率カテゴリのため不採用。敵防御ステータス絶対値の低下として `defender.paramBorder - penalty` にマップ。エンジン変更不要） | — |
| E-2 | 🟡 | **全能力ダウン を calculateDamage に配線**: E-1 確定後、`buildDamageCalculationInput` に `enemyAllAbilityDownByEnemy` を渡す経路を追加 | ✅ 完了（対象敵の `enemyAllAbilityDownByEnemy` を `paramBorder` から減算し、`calculateDamage` の基礎ダメージ式へ反映） | E-1 |
| E-3 | ⚪ | **倍率内訳への表示**: debuff 枠に「タリスマン/災難 -N 能力ダウン」として差分ベースで表示。stat delta（S-3）と連動 | ❌ 設計待ち（倍率ではないため debuff multiplier には未追加） | E-1, S-3 |

---

### 大分類 D: 破壊率（HP ダメージ正確化）

> `destruction_rate_implementation_plan.md` の残項目を再掲。
> **右クリック手動入力（暫定）は 2026-06-07 完了**。turn engine 接続は 2026-06-07 に最小実装済み。同日に敵 `d_rate` 実値を破壊率上昇倍率へ接続し、`damageContext` 経由の現在破壊率を HP damage に適用、DP/HP ダメージ表示を解禁。2026-06-14 に通常攻撃式を `calculateDestruction` 内の `raw d_rate/100`（超越ゲージ100%時のみ×1.10）へ統一し、turn-controller 側の通常攻撃バイパスを削除。

| ID | 優先度 | 内容 | 状態 | 依存 |
|---|---|---|---|---|
| D-1 | ✅ | 破壊率上昇式・cap・適用条件の現行仮説整理（calculateDestruction 実装済み） | ✅ 現行実装仮説 H-2026-06-15B として運用。実測値と乖離した場合は実測値を優先して再検討 | — |
| D-2 | 🔴 | **turn engine 記録検証**: `destructionRateByEnemy` が攻撃進行（DP ダメージ発生ごと）を実際に反映しているか確認。空オブジェクトのまま進行しないか | ✅ 完了（攻撃進行では未更新、break/reset/superDown 系のみ更新と確認） | D-1 |
| D-3 | 🔴 | **turn engine 上昇計算接続**: `calculateDestruction` を turnState に接続し、攻撃ごとに `setEnemyDestructionRatePercent` を呼ぶ。cap クランプ・break 判定・snapshot 整合 | ✅ 完了（既BREAK / same-action Break・SuperBreak、cap clamp、E-shield active 除外）。敵 `d_rate` 実値は `destructionMultiplierByEnemy` に保持し、破壊率上昇式へ接続。通常攻撃も `calculateDestruction` の `isNormalAttack` 分岐へ統一し、`raw d_rate/100` と超越ゲージ100%時×1.10を適用。超越バースト中の一致属性攻撃は破壊率上昇量+10%とcap+300%を適用し、SuperBreak/強ブレイクcapとは非加算。多段HPゲージ遷移では本来破壊率・本来capを保持し、強ダウン一時capはHPゲージ破壊またはDownTurn解除で本来capへ復元する。replay の空 `enemyDestructionRateCaps` で計算済みcapを潰さない。非一致属性攻撃や SuperDown の敵状態更新ではバーストcapを参照しない。`ini_d_rate` は既存 100% 基準と衝突するため初期現在値には未接続 | D-1, D-2 |
| D-4 | 🔴 | **ダメージ式接合**: `damageContext` に per-enemy 破壊率（`enemyParamBorderByEnemy` と同パターン）を配線。`buildDamageCalculationInput` が `destructionRate` を実値化。`calculateDamage` が HP ダメージに乗算 | ✅ 完了（`destructionRateByEnemy` は `%` で保持し、builder / popup adapter が `calculateDamage` 用 rate に変換。2026-06-17 に `remainingDpByEnemy` / `remainingHpByEnemy` / `extraHpGaugeStateByEnemy` も action-time context として保持し、威力詳細表示は stateAfter ではなく damageContext を優先） | D-2, D-3 |
| D-5 | 🔴 | **HP ダメージ表示解禁**: `isHpTarget=false` 固定を解除。右ペインに「非クリ HP」「クリティカル HP」行を追加。DP/HP の表示切り替え | ✅ 完了（右クリック威力詳細で DP/HP の非クリ・クリティカル期待値と現在破壊率を同時表示） | D-4 |
| D-6 | 🟡 | **テスト補完**: unit（上昇式・cap・接合）/ E2E（HP ダメージ表示・敵タブ連動）/ 実データ DP 割れ検証 | 🔶 部分完了（dp=0 + damage=0 の post-break 破壊率加算、通常攻撃 `raw d_rate/100` と超越×1.10・補正非適用、storedRate 100% fallback、HP/DP表示・破壊率>100%時のHP>DP、敵タブ連動 E2E、DPダメージでは破壊率を乗算しないこと、SkillSwitch 子スキルID解決、対象敵名表示、超越バーストの攻撃/critical/バフ・デバフ効果量/破壊率cap非重複、未発動時ゼロ、非一致属性cap非適用、高い保存capへの非加算、`damageContext.destructionRateCapByEnemy` 経由の威力詳細手入力cap反映、通常攻撃の威力詳細手入力が `d_rate=10` で100→110になること、`DestructionUp` 保存 ratio の calculateDestruction percent 入力変換、stat/border 解決されるバフ・デバフ効果量を固定。現行仮説 H-2026-06-15B として、2026-06-15 session fixture でコードダクネスの接触9hit / 計算9hit / effective weight `[0.1,0.1,0.1,0.2,0.2,0.3,0.25,0.25,0.25]` / Break hit 7 / 破壊率weight 0.75/1.75 / 100%→132.63% と #2美也 132.63%→717.34%（+584.71%）を engine-level と Playwright E2E で固定。`destructionWeight` 単体回帰、action-time DP/HP表示、空cap override保持、多段HPゲージ遷移後の本来破壊率・本来cap保持、強ダウン一時cap復元、HPゲージ破壊アクションの次ゲージ非持ち越し、実セッションのHPダメージ表示回帰を追加） | D-3, D-4, D-5 |
| D-7 | 🟡 | **受け入れ**: HP ダメージ 3 点一致（Excel・実機・シミュレータ） | ❌ 未着手 | D-6 |

### 大分類 G: DP複数ゲージ対応

> アモンΩ Lv.2 の実データ確認で、`battles.json` には `base_param.eg.dp = [1216800, 1216800, 1216800]` が存在する一方、敵選択時の現行 runtime は `enemies.json` の `base_param.dp = 0` のみを参照し、`enemyDpByEnemy['0'] = 0` / `remainingDpByEnemy = null` / `extraDpGaugeStateByEnemy` なしとして扱うことを確認済み。
> 現状は「次のDPゲージまで削れる」バグは起きないが、DP複数ゲージ敵そのものが未対応。HP複数ゲージとは異なり、DPは同一バトルターン中に1本だけ破壊可能で、余剰ダメージは次DPゲージの残DP1まで反映できる。追加ターン・ODターンなど敵行動へ進まない継続行動は同一バトルターンとして扱う。

| ID | 優先度 | 内容 | 状態 | 依存 |
|---|---|---|---|---|
| G-1 | 🔴 | **データ正本の確定**: DP複数ゲージ値の正本を `battles.json.enemy_list[].base_param.eg.dp` とするか、`enemies.json` / override へ補完するか決める。Enemy Setup のカテゴリ選択が battle 文脈を持てない場合の対応（battle enemy ID mapping / override JSON / snapshot 補完）も決める | 🔶 部分完了（runtime は `battles.json.enemy_list[].base_param.eg.dp` を参照し、battle enemy ID / name から補完。override 方針は未整理） | — |
| G-2 | 🔴 | **状態モデル追加**: `extraDpGaugeStateByEnemy` 相当を追加し、`{ total, remaining, values }` で現在DP段階を表現する。`enemyDpByEnemy` は現在段階の最大DP互換値として維持し、既存単一DP敵との後方互換を保つ | ✅ 完了（`extraDpGaugeStateByEnemy` と同一バトルターン内の破壊済み判定用 `dpGaugeBreakTurnByEnemy` を追加） | G-1 |
| G-3 | 🔴 | **初期化・snapshot 経路**: `BattleStateManager` / Enemy Setup snapshot / session normalize に DP複数ゲージを通す。アモンΩ Lv.2 選択時に `enemyDpByEnemy['0'] = 1216800`、`remainingDpByEnemy['0'] = 1216800`、`extraDpGaugeStateByEnemy['0'] = { total: 3, remaining: 3, values: [...] }` になる回帰を追加 | 🔶 部分完了（`BattleStateManager` と初期 snapshot に配線し、アモンΩ Lv.2 / レイジングエクリプス / ダイヤモンドアイS の初期化回帰を追加。同名通常個体より `eg.dp` 複数定義を優先するよう修正。既存 session normalize の網羅は未完） | G-1, G-2 |
| G-4 | 🔴 | **DPゲージ破壊処理の集約**: DP減算・Break付与・DownTurn付与・残DP更新・次DPゲージ遷移を単一 helper にまとめる。同一バトルターン中は1本だけ破壊可能とし、余剰ダメージは次DPゲージの残DP1まで反映する。次のバトルターンへ進むまで2本目は破壊しない | ✅ 完了（`consumeEnemyDpGaugeForAction` へ集約し、`turnIndex` 単位で1本制限・次ゲージDP1 clamp を固定） | G-2, G-3 |
| G-5 | 🔴 | **Break解除・次ゲージ復帰**: DownTurn解除 / HPゲージ破壊 / manual解除など既存のBreak解除経路で、複数DPゲージの次段階 max/current を復元する。`resetEnemyRemainingDpToMax` の単一 `enemyDpByEnemy` 参照を段階 aware に置き換える | 🔶 部分完了（`resetEnemyRemainingDpToMax` は現在DP段階 max 参照に変更。DownTurn/manual 解除全経路の実データ網羅は未完） | G-4 |
| G-6 | 🟡 | **威力詳細・敵表示**: DPバー表示を単一バーから複数段階表示へ拡張する。action-time `remainingDpByEnemy` / `extraDpGaugeStateByEnemy` を damageContext に渡し、破壊 action では破壊対象DPゲージの `0 / max` を表示する | ❌ 未着手 | G-3, G-4 |
| G-7 | 🟡 | **破壊率連動の確認**: DPゲージ破壊直後のBreak/StrongBreak/破壊率加算開始hit、Eシールド破壊との同一action順序、HP複数ゲージ遷移との相互作用を再検証する。HPゲージ破壊で強ダウンcap復元する既存修正と競合しないことを固定 | 🔶 部分完了（非最終DPゲージ破壊ではBreak/DownTurnを付与しない回帰を追加。Eシールド・HP複数ゲージとの組み合わせ網羅は未完） | G-4, G-5 |
| G-8 | 🟡 | **テスト追加**: unitでアモンΩ Lv.2 初期化、DP1本目破壊で次ゲージ非持ち越し、DownTurn解除後に2本目DPへ復帰、3本破壊後の挙動を固定。PlaywrightではEnemy SetupでアモンΩを選び、威力詳細DPバーとBreak表示を確認する | 🔶 部分完了（unit でアモンΩ Lv.2 / レイジングエクリプス / ダイヤモンドアイS 初期化と同一 `turnIndex` 内1本制限・次ゲージDP1 clamp を追加。Playwright と3本完走は未完） | G-3, G-4, G-5, G-6 |
| G-9 | ⚪ | **移行・互換整理**: 既存 session の `enemyDpByEnemy` / `remainingDpByEnemy` だけを持つデータは単一DPとして扱う。DP複数ゲージ情報は計算生成値として再導出し、保存JSONに過剰な計算結果を固定しない方針を確認する | 🔶 部分完了（`extraDpGaugeStateByEnemy` がない既存 state は単一DPとして維持。保存JSON純度の網羅検証は未完） | G-2, G-3 |

### 2026-06-07 コードダクネス検算で判明した不足機能

| ID | 優先度 | 内容 | 状態 | 備考 |
|---|---|---|---|---|
| CD-1 | 🔴 | `criticalDamageUpRate` / `criticalRateUpRate` の summary rate を威力詳細 breakdown に接続する | ✅ 完了 | 具体 `activeStatusEffects` が欠けていても不足分だけを静的 contribution として加算し、二重計上を避ける |
| CD-2 | 🔴 | 敵の現在DPを `damageContext` に渡す | ✅ 完了 | `enemyDpByEnemy` に加えて action-time の `remainingDpByEnemy` を保持し、威力詳細の現DP表示も damageContext を優先。既存保存セッションで敵DP snapshot がない場合のマスタ補完は CD-5 に分離 |
| CD-3 | 🔴 | 多段攻撃中にDPが割れた場合、break hit 以降の hit だけ HP ダメージ・破壊率上昇として按分する | ✅ 完了 | Eシールド/OD用の接触hit（`baseHitCount + funnelHitBonus`）と、破壊率/DP/HP按分用の effective weight（スキル本体 `power_ratio` + Funnel `funnelRate`）を分離。コードダクネスは接触9hit・計算9hitで、Break hit 7 以降の Funnel 3hit がHP側weight 0.75として破壊率 +32.63% に寄与し、威力詳細にhit種別・weight・DP/HP按分・破壊率前後を表示 |
| CD-4 | 🟡 | 属性クリティカル威力UPなど、属性条件付きクリティカル威力が `criticalDamageUpRate` として action に入る実データ回帰を固定する | 🔶 summary 接続済み・実データ検証待ち | スクショの `トロピカルスクランブル 90%` 相当を検証対象にする |
| CD-5 | 🟡 | 既存セッションでも選択敵IDから敵DPを補完できるデータ経路を作る | ❌ 未実装 | 現在の `HbrDataStore` には enemies がなく、ブラウザ上は EnemySetup snapshot の `dp` 追加で新規保存分のみ対応 |

---

### 大分類 SP: AttackBySp SP 威力スケーリング

> Trinity・疾きこと風の如し 等、消費 SP で威力が変わるスキル。
> **ユーザー決定（2026-06-04）で別タスク・本 WBS では追跡のみ**。

| ID | 優先度 | 内容 | 状態 | 依存 |
|---|---|---|---|---|
| SP-1 | 🔵 | consumedSP の damageContext への追加・calculateDamage 反映 | ❌ 別タスク | — |

---

### 大分類 V: 最終受け入れ検証

| ID | 優先度 | 内容 | 状態 | 依存 |
|---|---|---|---|---|
| V-1 | 🔴 | **DP ダメージ 3 点一致**: Excel（ユーザー持ち込み未着）・実機・シミュレータの 3 数値一致。C-1/C-2 接続検証も兼ねる | ❌ Excel 未着 | C-1, C-2, S-1 |
| V-2 | 🔴 | **HP ダメージ 3 点一致**: 破壊率適用後 HP ダメージの 3 数値一致 | ❌ 未着手 | D-5, V-1 |
| V-3 | 🟡 | **実データ DP 検証**: 実敵データで DP が正しく割れるか・割れないか確認 | ❌ 未着手 | V-1 |

---

### 大分類 I: hbr_calc インターフェース調整

> `calculateDamage` / `calculateDestruction` / コントラクト（`src/contracts/damage-calculation.js`）は
> **hbr_calc（別リポジトリ）** で管理される。エンジン型の追加・変更を伴う実装は
> hbr_calc との合意が前提となる。
>
> **現行エンジン型** (`src/contracts/damage-calculation.js` より):
> - buff: `AttackUp | CritDamageUp | CritBuff | MindEye | Charge | Funnel | ElementAttackUp`
> - debuff: `DefenseDown | ElementResistDown | Fragile`

| ID | 優先度 | 内容 | 状態 | 依存 |
|---|---|---|---|---|
| I-1 | ⚪ | **ShadowClone（影分身）の計算式確定**: 分身攻撃倍率の仕組みを確認。engine 変更要否を判断し必要なら合意 | ❌ 未着手 | — |
| I-2 | ⚪ | **Hacking（ハッキング）の分類確定**: Fragile / DefenseDown と同型か否かを確認。既存型に吸収できるなら engine 変更不要 | ✅ 完了（全能力ダウン source として `enemyAllAbilityDownByEnemy` へ固定100を集約し、既存の `defender.paramBorder` 補正へ接続。engine 型追加不要） | E-1 |
| I-4 | 🟡 | **全能力ダウン engine マッピング合意**: `enemyAllAbilityDownByEnemy` をエンジン入力のどの引数に渡すか hbr_calc 側と確定（E-1 の実装前提） | ✅ 本repo側判断完了（既存 `defender.paramBorder` 補正で対応、追加engine API不要） | E-1 |
| I-5 | 🔵 | **破壊率 API 拡張の合意**: D-3 実装で `calculateDestruction` インターフェース変更が生じた場合、hbr_calc 側と合意 | 🔵 D-3 で判断 | D-3 |

**調整手順**:
1. 本リポジトリ側で「何が必要か（計算式・型の候補）」を明確化
2. hbr_calc の issue / PR で変更案を提案 → 双方合意後に engine 更新
3. engine 更新後に本リポジトリ側の `buildDamageCalculationInput` / breakdown を修正

---

## 依存グラフ（実装順の骨格）

```
C-1 ──┬──────────────────────────────┐
C-2 ──┘                              ▼
       C-3（不一致修正）         V-1（DP 3点一致）
                                      │
S-1（stats 実値）──┬──> S-2（stat delta attacker）
                   └──> S-3（stat delta enemy） ──> E-3
E-1（全能力ダウン式）──> E-2（配線）──> E-3

D-2 ──> D-3 ──> D-4 ──> D-5 ──> D-6 ──> D-7 ──> V-2
```

**推奨着手順**:
1. **C-1 / C-2（バフ・デバフ検証）** — 最初。追加実装ゼロで現状の接続が正しいか確認できる
2. **S-1（attacker stats 実値）** — C-1 検証後。DP ダメージの数値精度向上に直結
3. **V-1（DP 3 点一致）** — Excel 到着次第。C-1/C-2 + S-1 が入れば実施可能
4. **D-2 / D-3（破壊率 turn 接続）** — V-1 完了後に HP ダメージへ進む
5. **E-1 / E-2（全能力ダウン）** — 設計コスト高い。V-1 後に着手

---

## 各サブ WBS との対応

| 本 WBS ID | 参照ドキュメント | 参照箇所 |
|---|---|---|
| C-1 / C-2 | damage_calculator_integration_plan.md | Phase B（新規）|
| S-1 / S-2 / S-3 | damage_calculator_integration_plan.md | Q-V3-2 / v1 placeholder |
| E-1 / E-2 / E-3 | damage_breakdown/unimplemented_elements_wbs.md | §3 敵デバフ枠 |
| D-1 〜 D-7 | destruction_rate_implementation_plan.md | §4 WBS |
| SP-1 | damage_calculator_integration_plan.md | スコープ外項目 |
| V-1 〜 V-3 | damage_calculator_integration_plan.md | 受け入れ基準 |
| I-1 〜 I-5 | 本 WBS 付録「状態変化タブ 全数検査結果」| ⚠️ 要調査 6 件 |

---

## 抜け漏れチェック（網羅性確認）

| 論点 | 確認結果 |
|---|---|
| MindEye の弱点判定は計算機に届いているか | C-1 で確認対象に含む（弱点スキル＝affinity群の倍率≥1.5 のケース） |
| Funnel（連撃）ヒット数は正しく渡っているか | C-1 で確認対象。effectiveHitCountPerEnemy が destroyInput と damage input 両方に渡るか |
| 敵の属性相性（affinity）は実値で渡っているか | ✅ A-7 で effectiveDamageRatesByEnemy 配線済み |
| 敵の武器耐性（resistances）は渡っているか | ⚠️ 現状 `resistances: {}` 固定（C-2 検証スコープ）。enemies.json に耐性フィールドがあれば追加 |
| チャージ（chargeEffects）は渡っているか | ⚠️ damageContext に含まれず、damage-breakdown.js が member から取得。接続経路の再確認が C-1 スコープ |
| 複数敵（E2/E3）での各ターゲット計算 | ✅ 敵タブ連動は A-7 で実装済み |
| OD 中の攻撃者 OD ブースト | ❌ damageContext に含まれるか未確認（C-1 スコープ） |
| 破壊率の cap 超え処理（strongBreak 等） | D-3 スコープ |
| session 保存・replay での破壊率整合 | D-3 snapshot 整合の範囲 |
| AcccessoryAttackUpRate | 🔵 将来（アクセサリ DB 整備後） |
| foodBuffAttackUpRate / highBoostSkillAtkRate 表示 | ✅ Priority 1 チェック済み（unimplemented_elements_wbs.md）|
| 状態変化タブ 全 90 件の計算機接続状況 | → 付録「状態変化タブ 全数検査結果」参照。✅ 19件 / ⚠️ 5件（I-1〜I-3/E 対象）/ 🔵 66件 |

---

## 付録: 状態変化タブ 全数検査結果

> **検査日**: 2026-06-07 | **対象**: `ui-next/utils/char-detail-popup.js` の `STATUS_LABELS`（90 件）
>
> 各ステータスタイプが `src/domain/damage-breakdown.js` のダメージ計算に接続されているかを全数確認。
> 判定基準: `collectXxx` 関数でステータスタイプとして直接フィルタされる / `iconStatusType` として使用される / 専用フィールド経由（`foodBuffAttackUpRate` 等）で接続されている。

**凡例**:
- ✅ 反映済み: ダメージ計算に影響し、breakdown に表示される
- ⚠️ 要調査: 影響する可能性があるが未接続または仕様未確定
- 🔵 スコープ外: ダメージ倍率に影響しない（HP 管理・状態管理・OD 管理等）

| ステータスタイプ | 表示名 | 判定 | 計算機上の位置 / 備考 |
|---|---|---|---|
| AttackUp | 攻撃力アップ | ✅ | buff群（直接フィルタ `collectAttackBuffContributions`） |
| AttackDown | 攻撃力ダウン | 🔵 | 敵専用・被ダメ計算 |
| AttackUpIncludeNormal | 攻撃力アップ（通常攻撃含む）| 🔵 | isNormalAttack フラグ別管理。damage-breakdown では拾われない |
| DefenseUp | 防御力アップ | 🔵 | 被ダメ計算用 |
| DefenseDown | 防御力ダウン | ✅ | debuff群（直接フィルタ `collectEnemyStatusContributions`） |
| DamageRateUp | 破壊率上昇量アップ | ⚠️ | **大分類D**: ダメージ倍率ではなく破壊率蓄積速度に影響。D-3 接続時に評価 |
| ResistDown | 属性耐性ダウン | ✅ | debuff群（直接フィルタ） |
| ResistDownOverwrite | 属性耐性打ち消し | ✅ | debuff群（直接フィルタ） |
| ToughnessUpValue | 体力アップ | 🔵 | HP上限変化 |
| Fragile | 脆弱 | ✅ | debuff群（弱点時のみ有効） |
| Undermine | 蝕 | 🔵 | 状態変化効果量変動系 |
| Shredding | 速弾き | 🔵 | SPがマイナスでもスキル使用可能にする特殊状態。スキル使用可否のみに影響し、ダメージ倍率には非影響 |
| HighBoost | ハイブースト | ✅ | buff群（`highBoostSkillAtkRate` 専用フィールド経由） |
| Mocktail | モクテル | 🔵 | SP/EP 回復系 |
| Babied | オギャり | ✅ | token-passive群（`babiedSkillAttackUpRate` 専用フィールド経由） |
| GiveAttackBuffUp | スキル攻撃力上昇の効果アップ | 🔵 | バフ付与量増加（自己ダメージ計算外） |
| GiveDebuffUp | デバフスキル効果量アップ | 🔵 | デバフ付与量増加 |
| GiveDefenseDebuffUp | 防御力ダウン効果アップ | 🔵 | デバフ付与量増加 |
| CriticalRateUp | クリティカル確率アップ | ✅ | criticalRateBreakdown（直接フィルタ） |
| CriticalRateDown | クリティカル確率ダウン | 🔵 | 敵専用 |
| CriticalDamageUp | クリティカルダメージアップ | ✅ | crit-mindeye群（直接フィルタ） |
| CriticalDamageDown | クリティカルダメージダウン | 🔵 | 敵専用 |
| HealDp | HP回復 | 🔵 | HP管理 |
| HealDpByDamage | ダメージHP回復 | 🔵 | HP管理 |
| HealDown | 回復量ダウン | 🔵 | 回復管理 |
| RegenerationDp | HP継続回復 | 🔵 | HP管理 |
| ReviveDp | DPゲージ復活 | 🔵 | DP管理 |
| HealSp | SP回復 | 🔵 | SP管理 |
| HealSpRandom | 確率でSPを回復 | 🔵 | SP管理 |
| OverwriteSp | SP上書き | 🔵 | SP管理 |
| SpecifySp | SP指定 | 🔵 | SP管理 |
| SpLimitOverwrite | SP上限上書き | 🔵 | SP管理 |
| HealEp | EP回復 | 🔵 | EP管理 |
| HealSkillUsedCount | スキル使用回数回復 | 🔵 | スキル管理 |
| OverDrivePointUp | ODゲージアップ | 🔵 | OD管理 |
| OverDrivePointDown | ODゲージダウン | 🔵 | OD管理 |
| OverDrivePointUpByToken | トークンによるODゲージアップ | 🔵 | OD管理 |
| ConfusionRandom | 混乱 | 🔵 | 状態異常 |
| ImprisonRandom | 束縛 | 🔵 | 状態異常 |
| StunRandom | 気絶 | 🔵 | 状態異常 |
| RecoilRandom | 反動ダメージ | 🔵 | 固定ダメージ（倍率計算外） |
| Misfortune | 不幸 | ⚠️ | 現状は duration 敵状態として保持のみ。`/Users/ram4/Downloads/ui_next_session_2026-06-05T21-24-36.194+09-00.json` の #4 HP破壊差分では、純計算が約16.67M不足しており、厄が実機で被ダメージ補正を持つか要確認 |
| SelfDamage | 自傷ダメージ | 🔵 | 固定ダメージ |
| DebuffGuard | デバフ無効 | 🔵 | 状態管理 |
| BuffCharge | チャージ | ✅ | buff群（`chargeEffects` 経由でチャージ倍率として加算） |
| Invincible | 無敵 | 🔵 | 被ダメ無効 |
| Cover | かばう | 🔵 | ターゲット管理 |
| Dodge | 回避 | 🔵 | 命中管理 |
| Provoke | 挑発 | 🔵 | ターゲット管理 |
| Break | BREAK | 🔵 | 状態遷移（大分類D 破壊率対象） |
| SuperBreak | 強ブレイク | 🔵 | 状態遷移（破壊率cap。D-3 スコープ） |
| BreakGuard | ブレイクガード | 🔵 | 状態管理 |
| SuperBreakDown | 超ダウン | 🔵 | 状態管理 |
| DownTurn | ダウンターン | 🔵 | ターン管理 |
| BreakDownTurnUp | ブレイクダウンターン延長 | 🔵 | ターン管理 |
| MindEye | 心眼 | ✅ | buff群（弱点時クリ昇格。`selectedMindEyeEffects` 経由） |
| FightingSpirit | 闘志 | ✅ | 全ステータス flat 加算バフ。`SpecialStatusCountByType=185` として保持し、複数付与時は最高 power 1つを採用。`damageContext.fightingSpiritBonusValue` から威力詳細 stat grid / `calculateDamage` 入力 / 攻撃側補足欄へ反映 |
| Morale | 士気 | 🔵 | 複合バフ。個別効果は各型で収集 |
| Motivation | やる気 | 🔵 | 複合バフ |
| EternalOath | 永遠の誓い | 🔵 | 複合バフ |
| ShadowClone | 影分身 | ⚠️ | **I-2**: 分身攻撃倍率の仕組みを確認。エンジン未対応 |
| Funnel | 連撃数アップ | ✅ | funnel群（`funnelEffects` 経由で連撃ヒット×倍率加算） |
| Diva | 歌姫の加護 | ✅ | token-passive群（`divaSkillAttackUpRate` 専用フィールド経由） |
| Hacking | ハッキング | ✅ | 全能力ダウン source。`enemyAllAbilityDownByEnemy` へ固定100として集約し、`defender.paramBorder - penalty` に反映 |
| FireMark | 火の印 | ✅ | buff群（`markAttackUpRate` / crit-mindeye群（`markCriticalDamageUp`）/ critRate（`markCriticalRateUp`）経由） |
| AdditionalTurn | 追加ターン | 🔵 | ターン管理 |
| DoubleActionExtraSkill | EXスキル連続発動 | 🔵 | 行動管理 |
| ByakkoDoubleActionAttackSkill | ラッシュ | 🔵 | 行動管理 |
| SkillCondition | スキル条件 | 🔵 | 条件管理 |
| SkillRandom | スキルランダム | 🔵 | スキル管理 |
| SkillSwitch | スキルスイッチ | 🔵 | スキル管理 |
| FixedHpDamageRateAttack | 固定HP割合攻撃 | 🔵 | 固定ダメージ（倍率計算外） |
| TokenSet | トークン上昇 | ✅ | token-passive群（`tokenAttackTotalRate` / `damageRateUpPerTokenRate` / `attackUpPerTokenRate` 経由） |
| RemoveBuff | バフ解除 | 🔵 | 状態管理 |
| RemoveDebuff | デバフ解除 | 🔵 | 状態管理 |
| RemoveSpecialStatus | 特殊状態解除 | 🔵 | 状態管理 |
| Talisman | 霊符状態 | ✅ | 全能力ダウン source。`enemyAllAbilityDownByEnemy` へレベル比例値を集約し、`defender.paramBorder - penalty` に反映 |
| Disaster | 禍状態 | ✅ | 全能力ダウン source。`enemyAllAbilityDownByEnemy` へレベル比例値を集約し、`defender.paramBorder - penalty` に反映 |
| ZoneUpEternal | フィールド状態永続 | 🔵 | フィールド管理（フィールドの攻撃倍率は `zonePowerRate` で buff群に反映済み） |
| ReviveTerritory | 再生の陣 | 🔵 | HP回復フィールド |
| ArrowCherryBlossoms | 桜花の矢 | 🔵 | キャラ固有状態 |
| BIYamawakiServant | 山脇様のしもべ | 🔵 | キャラ固有状態 |
| Curry | カリー | ✅ | buff群（`foodBuffAttackUpRate` 専用フィールド経由） |
| Gelato | ジェラート | ✅ | buff群（`foodBuffAttackUpRate` 専用フィールド経由） |
| Shchi | シチー | ✅ | buff群（`foodBuffAttackUpRate` 専用フィールド経由） |
| Steak | ステーキ | ✅ | buff群（`foodBuffAttackUpRate` 専用フィールド経由） |
| SpeedUp | 速度アップ | 🔵 | 速度管理 |
| SpeedDown | 速度ダウン | 🔵 | 速度管理 |
| Reinforce | 鬼神化中 | 🔵 | 変身状態（ATK増加効果は AttackUp 等として収集） |
| ActionDisabled | 行動不能 | 🔵 | 行動管理 |

**集計: ✅ 22件 / ⚠️ 3件 / 🔵 65件 （合計 90件）**

| 区分 | タイプ一覧 |
|---|---|
| ✅ 反映済み（22件）| AttackUp, DefenseDown, ResistDown, ResistDownOverwrite, Fragile, HighBoost, Babied, CriticalRateUp, CriticalDamageUp, BuffCharge, MindEye, Funnel, Diva, Hacking, TokenSet, FireMark, Curry, Gelato, Shchi, Steak, Talisman, Disaster |
| ⚠️ 要調査（3件）| DamageRateUp（大分類D）, ShadowClone（I-1）, Misfortune（対象 replay のHP差分候補）|
| 🔵 スコープ外（65件）| 上記以外（Shredding はスキル使用可否のみ） |
