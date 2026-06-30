# ダメージ計算機 統合実装プラン

> **ステータス**: 🟢 Phase A 完了・Phase B 残タスク整理済み | **ブランチ**: `feature/damage-calculator-integration` | **作成日**: 2026-06-03 | **最終更新**: 2026-06-07
>
> v2 実装（commit 384d805）に対しユーザーから設計思想の乖離指摘あり。設計改訂 v3 で解決済み（2026-06-04）。
> 2026-06-07 の接続再検証で buff / crit / funnel / debuff / affinity の breakdown → synthetic 効果経路は一致確認済み。token-passive は DP条件倍率を rate 加算ではなく乗算として扱うよう修正し、builder 経由の `tokenRatio` 連携まで回帰で固定。
> **Phase B 以降の残タスクは [damage_calculator_remaining_wbs.md](damage_calculator_remaining_wbs.md) を参照**。

## 概要

威力詳細タブに `calculateDamage()` を使った実ダメージ計算結果を追加表示する。
現在の倍率ブレイクダウン表示と並列表示し、攻撃者・敵のステータスを入力として
実際に与えるダメージ期待値・最大/最小を表示する。

---

## 設計改訂 v3（ユーザー指摘によるアーキテクチャ修正 2026-06-04）

v2 実装（commit 384d805）を実機確認したユーザーから、設計思想の乖離が3点指摘された。
いずれも「仮おき」ではなく、当初プランの設計前提そのものの修正が必要。

### 指摘と判定

| # | 指摘 | 判定 | 根拠（実コード） |
|---|---|---|---|
| 1 | 威力詳細タブ左上に**トリニティ・ブレイジング**と表示されているのに、計算結果は**通常攻撃の威力**になる。表示スキルと計算スキルが相違している | 🔴 整合性バグ（最重要） | タイトル=`action.skillName`、左ペイン内訳=当該スキルの`damageBreakdown`、右ペイン計算=同一`damageContext`→`calculateDamage`（skillId 解決）。turn-controller L8039-8046 で damageContext は `skillId/skillName/isNormalAttack` を正しく保持するため、**静的には表示スキルと同一スキルが計算されるはず**。実機で通常攻撃が出る＝実バグ（要再現特定）。※前回の「previewActionFlow 束縛で閲覧時に通常攻撃」という診断は誤り（タイトルが正しいスキルを出している＝アクション束縛は正常） |
| 2 | role/凸は PartySetup で定義済み。ペインで再入力させる項目は不要 | 🔴 設計思想の乖離 | PartySetup が凸数を `limitBreakLevelsByPartyIndex` で保持（party-setup.js L290/L351）、role は style 由来。ペインの `<select Role>`/`<input 凸>`（char-detail-popup.js L876-877）は当初プランの手動入力設計で冗長 |
| 3 | ステータス入力は PartySetup タブに入るべき。戦闘中不変、変更時は PartySetup で変更→再計算 | 🔴 設計思想の乖離 | ペインのステータスは編集可能な手動入力（L841 `damage-calc-stat-input`）。戦闘不変の正本を PartySetup に置く思想と乖離 |

### 根本原因

当初プラン（codex設計＋3者レビュー）は、計算機ペインを**手動入力の独立した what-if 計算機**としてモデル化していた。
ユーザーの実際のメンタルモデルは異なる:

> **PartySetup が攻撃者（ステータス/role/凸）の単一の正（single source of truth）。
> 計算機ペインはそれを読み取り、「実際に閲覧しているスキル」のダメージを表示するだけ。**

### 確定した修正方針（ユーザー決定）

- **点1: 低ダメージの真因対応（再診断済み・スコープ確定）** — 実機 probe で「通常攻撃化」は否定。真因は ①攻撃者 stats がプレースホルダ default で低い ②AttackBySp 消費SP威力スケーリング未実装、の合わせ技。
  - **① は V3 スコープ内**: PartySetup stats 連携（V3-2/3/4）で statusAtk を実値化し解消。
  - **② AttackBySp SP-scaling は V3 スコープ外（別タスク・ユーザー決定 2026-06-04）**: `calculateDamage` エンジン本体の機能追加であり統合配線とは別。正本（calc/damage_calc_engine.py）の式抽出は行うが、実装は独立タスクに切り出す。**Trinity 等の AttackBySp スキルは本タスク完了後も SP-scaling 分は正確値にならない点をユーザー了承済み**。
  - invariant（`resolvedSkill` / displayed==calculated）は引き続き有効だが、真因が skill mismatch でないため優先度は stats 連携より下。
- **点2/3: PartySetup を単一の正に** — role/凸/ステータスは PartySetup から読み取る。ペインの手動入力（role/凸/stat）を撤去。ステータス編集UIは PartySetup タブの将来機能（戦闘不変・変更時は PartySetup で編集→再計算反映）。計算機ペインは resolved 値を read-only 表示。

### 実装フェーズ順序（ユーザー方針 2026-06-04・DPダメージ優先）

HP ダメージは破壊率（destructionRate）と AttackBySp 消費SP威力スケーリングの両方が未実装で、特に**破壊率係数はダメージを 100%→最大1299% に変える巨大係数**のため、現状の HP ダメージは検証に不向き。
一方 **DP ダメージ（isHpTarget=false）は破壊率が原理的に不要**で、一般スキルなら現行 `calculateDamage` の式で正しく計算できる（`specialEffect = multipliers.dp`、destructionRate 不要）。

よって実装順を以下に確定:

- **Phase A（最優先・MVP）: 一般スキルの DP ダメージを期待通りに計算・表示**
  - 残ブロッカーは V3-2（PartySetup stats 連携で statusAtk 実値化）＋ V3-1（charge 過小計上修正）。これらが入れば一般スキルの DP ダメージは正確値になる。
  - 計算対象を DP（isHpTarget=false）に固定。**HP は破壊率未対応で不正確なため Phase A では非表示**（ユーザー決定 2026-06-04・DPのみ表示）。HP 表示は Phase B（破壊率実装）後に追加。
  - **一般的な計算結果を早期に可視化する**のが本フェーズのゴール。
- **Phase B（後続・別タスク群）: 不足要素の受け渡し（例外的に少数のパラメータ）**
  - 破壊率（HP ダメージ用 destructionRate）、AttackBySp 消費SP（SP-scaling）、その他特殊パラメータの受け渡し。
  - これらが揃って初めて HP ダメージ・SP条件スキルが正確値になる。

> 検証の現実的な順序: まず Phase A で「一般スキル DP ダメージが期待通り」を確認 → その後 Phase B で特殊要素を順次追加。

### 再利用可能 / 要再設計の切り分け

| 区分 | 対象 |
|---|---|
| ♻️ 再利用可 | damageContext 拡張フィールド（chargeEffects 等）、calculateDamage 接続、2ペインレイアウト、敵タブ、affinityRate/destructionRate 整理、stat delta placeholder の view model 構造 |
| 🔧 要再設計 | T1.1 AttackerStatsInput（手動入力→PartySetup 読み取りに転換）、T2.3 攻撃者入力フォーム（撤去→read-only 表示）、**計算対象スキルの束縛（行動フロー→スキル駆動）** |

### 三者再整合の open questions

- **Q-V3-1（codex/logic・是正）**: 点1は再設計ではなく整合性バグ。表示スキル（action.skillName）と計算スキル（calculateDamage の解決結果）が相違する原因を実機再現で特定すること。候補: (a) 消費側 action.damageContext.isNormalAttack が誤って true、(b) damageContext.skillId が skills DB の id と不一致で findSkill が name フォールバック→さらに通常攻撃へ、(c) 消費している previewActionFlow action と表示タイトルの action がずれている。特定後、`displayed skill == calculated skill` を固定する回帰テストを追加。
  - **ユーザー確定（2026-06-04）**: 右ペインの計算ダメージ**数値が（トリニティ・ブレイジングにしては）低い**。「通常」ラベル（非クリの意味）の誤読ではない。
  - **codex 実機 probe で原因確定（2026-06-04・候補(a)は否定）**: commitTurn の実アクションで `action.damageContext = {skillId:46041404, skillName:'トリニティ・ブレイジング', isNormalAttack:false, baseHitCount:8}`。**damageContext は正しく Trinity を指しており、通常攻撃化していない**。よって「isNormalAttack 誤 true」「displayed≠calculated skill」は真因ではない。
  - **真因（合わせ技）**:
    1. **攻撃者 stats がプレースホルダのデフォルト値（低い）** → `calculateBaseDamage`（damage-calculator.js L330-341）は `diff = statusAtk - paramBorder` で min/maxPower を補間。default stats 由来の statusAtk が paramBorder(770) を下回ると低ブランチに落ち低ダメージ（LB0≈6634 / LB4≈15629）。→ V3 の PartySetup stats 連携で解消見込み。
    2. **AttackBySp の消費SP威力スケーリングが未モデル化**: Trinity は `skill_type=AttackBySp, sp_cost=-1, cond=Sp()>0, power=[13880.625,27761.25], diff_for_max=179`。`buildDamageCalculationContext` / builder は `startSP/endSP/spCost/consumedSP` を保持・伝播していない。`docs/specs/sp_condition_skill_spec.md` も「消費SPに応じて威力上昇」を未実装候補と明記。**ただし正式な計算式は Excel/Python 正本で要確認**。
  - **invariant は依然必要**: `result.breakdown` に `resolvedSkill {id,name,isNormalAttack}` を追加し、displayed skill == calculated skill を回帰テストで固定（codex 提案 B）。ただし表示を damageContext に寄せるだけの対症療法は不可（書き込み側が正しいことが前提）。
- **Q-V3-2（ag/data・✅解決 2026-06-04）**: PartySetup の member 公開フィールドを ag が確定。
  - **role** = `member.role`（src/domain/character-style.js:337。style.role 由来・フォームチェンジで自動更新）。
  - **凸** = `member.limitBreakLevel`（:361。`member.partyIndex`(:370) で PartySetup snapshot.limitBreakLevelsByPartyIndex と紐づくが、直接参照で足りる）。
  - **ステータス正本は存在しない**: PartySetup/CharacterStyle に str 等のフィールドなし。戦闘不変ステータス編集は**新規スコープ**（PartySetup スロット/snapshot に stats 追加が必要）。
  - **member 特定** = `openCharDetailPopup(member,...)` 第1引数の `member.partyIndex`(:370) で一意。生 snapshot が要る場合は openCharDetailPopup の引数(stateOrRecord/opts)経由で渡す。
  - **→ Phase A の attacker source 確定**: `role=member.role` / `limitBreakCount=member.limitBreakLevel` / `stats=resolveDefaultStats(member.role, member.limitBreakLevel)`（read-only base）。手動入力は全撤去。PartySetup snapshot の追加配線は Phase A では不要（stats 正本が無いため）。
- **Q-V3-3（全員・確定）**: WBS 再構成は下記「Phase A 確定 WBS」を参照。

### Phase A 確定 WBS（DPダメージ MVP・実装可能）

3者再整合の結果、Phase A は以下で確定。実装担当 codex → claude レビュー。

| ID | 状況 | 内容 | 詳細 |
|---|---|---|---|
| A-1 | ✅ | charge 過小計上修正 | builder の charge 分離を廃止し、buff group multiplier を**単一 synthetic AttackUp** として渡す。往復等価性テストで buff/debuff/crit/funnel/token/affinity 倍率一致を固定 |
| A-2 | ✅ | attacker source を PartySetup(member) 読取に転換 | `role=member.role` / `limitBreakCount=member.limitBreakLevel` / `stats=resolveDefaultStats(...)`。AttackerStatsInput の責務を手動入力→member 読取へ転換 |
| A-3 | ✅ | 右ペイン手動入力撤去→read-only 表示 | Role select / 凸 input / stat number input を削除。base/delta/resolved は read-only（delta=0 placeholder 継続） |
| A-4 | ✅ | 計算対象を DP 固定・HP 非表示 | `isHpTarget=false`。結果ラベルを `非クリ DP` / `クリティカル DP` とし、HP 行は描画しない |
| A-5 | ✅ | invariant | `result.breakdown.resolvedSkill {id,name,isNormalAttack}` を追加。表示タイトルは `damageContext.skillName` を優先し、displayed==calculated 回帰を固定 |
| A-6 | ✅ | docs/test | docs status 更新、`npm test` 1263件 / lint / Playwright 2件 PASS |
| A-7 | ✅ | 敵 param_border を実値配線（claude レビュー指摘・ユーザー決定 2026-06-04） | `EnemySetupController` が選択敵の `base_param.param_border` を snapshot に保持し、`BattleStateManager` → `enemyState.paramBorderByEnemy` → `damageContext.enemyParamBorderByEnemy` → `resolveDamageCalculatorEnemyAdapter` の経路で敵タブごとの実値を使用。値なし・summon は 770 fallback。clone / override snapshot / status tick でも保持。unit / Playwright 回帰を追加 |

> Phase A 完了 = 一般スキルの DP ダメージが PartySetup 由来 stats で期待通り表示される状態。

#### claude レビュー結果（2026-06-04・commit c85f170）

- **コア承認**: A-1〜A-5 は確定事項通り実装。特に A-1 は前回レビュー指摘（charge 過小計上＋往復等価性テスト欠如）を完全解消（単一 synthetic AttackUp + `calculateDamage` 倍率一致テスト）。ユニット11件 / E2E（invariant・DP表示・手動入力撤去）PASS を claude が再実行確認。
- **対応完了 A-7**: 敵 param_border の 770 固定を解消。選択敵ごとの実値を damageContext に配線し、敵タブ切替と 770 fallback を回帰で固定。
- **既知の許容事項**: 攻撃者 stats は role標準＋凸 の placeholder（ステータス正本不在・PartySetup ステータス編集は別スコープ）。実キャラ stats は後続。
- **E2E 全体**: codex 報告で 92 PASS / 4 FAIL。4件は既存 superbreak-hefty-guardian fixture（enemy preset 13490231 未検出）の同一原因で本変更と無関係。
- **A-7 検証**: `npm test` 1263件 / lint / `tests/e2e/damage-breakdown-popup.spec.js` 2件 PASS。

### 受け入れ基準（最終 OK 条件・ユーザー確定 2026-06-04）

自動テスト（unit / E2E）は随時実施するが、それは中間検証であり最終 OK ではない。
**最終 OK は以下の「3点一致」と「実データ DP 検証」が取れたとき。**

1. **3点一致**: 次の3つの数字が一致すること。
   - ① ローカルで動くフィックス版 Excel（Google Spreadsheet 由来）の計算結果。**※Excel ファイルはユーザーが後日このリポジトリに持ち込む（未着）。**
   - ② 実機（実ゲーム）の実ダメージ。
   - ③ 本シミュレータ（calculateDamage 経由の右ペイン表示）の計算結果。
2. **実データ DP 検証**: 実データを JSON 入力して実際に動かし、敵の DP を割れたか／割れなかったか等のゲーム挙動を確認する。

> 現状: フィックス版 Excel 未着・実機数値未取得のため**最終 OK は未達**。Excel 到着後に 3点一致を検証する。
> main への merge は本受け入れ基準を満たし、かつユーザー確認が取れてから（Phase A は先行 merge 済みだが据え置き）。

### スコープ外（別タスク・トラッキング）

- **[別タスク] AttackBySp 消費SP威力スケーリングの実装**（ユーザー決定 2026-06-04・本統合タスクのスコープ外）
  - 対象: `calculateDamage`（src/domain/damage-calculator.js）エンジン本体。消費SP（sp_cost=-1=全消費時の startSP-endSP 等）を威力解決に反映する。
  - 正本: `calc/damage_calc_engine.py` の AttackBySp 経路（式抽出は本タスク中に実施し、別タスクの設計入力とする）。
  - 影響: calculateDamage / damage-calculation-context（startSP/endSP/spCost/consumedSP の保持・伝播）/ contract / test。
  - 影響範囲メモ: Trinity・疾きこと風の如し 等の AttackBySp / SP条件スキルは、本実装まで威力が正確値にならない（既知・許容）。

> 本セクション合意後、下記 v2 仕様（ゴール以降）の該当箇所を改訂する。それまで v2 記述は参考として残す。

---

## ゴール（確定レイアウト v2）

威力詳細タブの中身のみを2ペイン構成に改修する。左ペインは従来表示を横幅半分に縮小して維持、右ペインに計算機を新設する。

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [状態変化] [アビリティ] [パッシブ] [フィールド] [[威力詳細]]      (大元タブ／既存)   │
├────────────────────────────────┬───────────────────────────────────────────────┤
│           左ペイン (~50%)        │                右ペイン (~50%／新規)              │
│                                │                                                 │
│  ★ 従来の威力詳細をそのまま     │   [ E1 ]   [ E2 ]   [ E3 ]   (敵選択タブ)        │
│     横幅半分にして配置          │  ┌─────────────────────────────────────────┐  │
│   ・スキル名                    │  │ ダメージ・補足情報エリア（上部 約3割）     │  │
│   ・クリティカル率              │  │  ・対象の敵へのダメージ（通常/クリ）      │  │
│   ・倍率                        │  │  ・その他補足情報                         │  │
│   ・カテゴリ｜アイコン一覧      │  └─────────────────────────────────────────┘  │
│   (※中身は一切変更なし)        │  ┌────────────────────┬────────────────────┐  │
│                                │  │ 自身のパラメータ    │ 敵のパラメータ      │  │
│                                │  │ （下部7割・左）     │ （下部7割・右）     │  │
│                                │  │ ・攻撃者ステ(元値)  │ ・敵ステ(元値)      │  │
│                                │  │ ・適用バフ/デバフ値 │ ・適用バフ/デバフ値 │  │
│                                │  │                    │ ・補足記述スペース  │  │
│                                │  └────────────────────┴────────────────────┘  │
└────────────────────────────────┴───────────────────────────────────────────────┘
```

### レイアウト構成の要点

- **大元タブ（既存）**: `状態変化 / アビリティ / パッシブ / フィールド / 威力詳細` の5つ。改修は `威力詳細` タブの中身のみ。
- **左ペイン（~50%・従来そのまま）**: スキル名・クリティカル率・倍率・カテゴリ｜アイコン一覧。中身は変更せず横幅だけ半分にする。
- **右ペイン（~50%・新規）**:
  - **敵選択タブ（E1/E2/E3）**: 計算対象の敵を切り替える。Enemy Setup の使用スロット数に連動。
  - **上部（約3割）ダメージ・補足情報エリア**: 選択した敵へのダメージ計算結果（通常/クリティカル）＋補足情報。
  - **下部（約7割）パラメータエリア（左右分割）**:
    - 左: 自身のパラメータ（攻撃者ステータス元値＋適用バフ値/デバフ値）。手動入力・設定可能。
    - 右: 敵のパラメータ（敵ステータス元値＋適用バフ値/デバフ値＋補足記述スペース）。

#### レイアウト v2 設計レビュー反映（codex フィードバック + ユーザー補足）

- **レスポンシブ fallback は必須**: char detail popup は既に情報密度が高く、50/50 では左ペインの contribution block が詰まる。desktop は2ペイン、一定幅未満では縦積み（または右ペインを下に回す）。
- **攻撃者 stat 入力 state は action 単位で保持**: 敵タブ切替で入力中の攻撃者ステータスを消さない。敵タブ切替では敵依存の表示/結果だけ更新する。
- **補足記述 textarea は v1 では非永続のプレースホルダ扱い**（ユーザー補足で確定）: 中身は未定で「将来必要になったら追加できる余白」。save 対象や replay/session schema には入れない。
- **計算結果が出せない場合**は「計算不可」ではなく「敵 param 未取得」等の具体的な missing reason を表示する。
- **実装順**: ① target tab + readonly 計算結果表示 → ② 攻撃者 stat input → ③ 補足 textarea の順が安全。

---

## 確定インターフェース定義（机上設計完了）

### AttackerStatsInput 型定義（T1.1確定）

```js
/**
 * @typedef {object} AttackerStatsInput
 * @property {number|null|undefined} [str]  力。null/undefined は role 既定値へ fallback。
 * @property {number|null|undefined} [dex]  器用さ。null/undefined は role 既定値へ fallback。
 * @property {number|null|undefined} [wis]  知性。null/undefined は role 既定値へ fallback。
 * @property {number|null|undefined} [spr]  精神。null/undefined は role 既定値へ fallback。
 * @property {number|null|undefined} [luk]  運。null/undefined は role 既定値へ fallback。
 * @property {number|null|undefined} [con]  体力。null/undefined は role 既定値へ fallback。
 * @property {0|1|2|3|4} [limitBreakCount=0]         凸数。0〜4 にクランプ。
 * @property {number} [abilitySprCorrection=0]        アビリティ精神補正。
 * @property {number} [tokenCount=0]                  トークン個数。
 * @property {number|null|undefined} [tokenRatio]     トークン倍率。指定時は tokenCount より優先。
 * @property {'Attacker'|'Blaster'|'Breaker'|'Buffer'|'Debuffer'|'Defender'|'Healer'|'Admiral'|'Rider'} [role='Attacker']
 *   role 別デフォルトステータスの選択に使う（styles.json の role フィールドに準拠）。
 */
```

#### role 別デフォルトステータステーブル（ag調査 + Python実装準拠）

| role | str | dex | wis | spr | luk | con |
|------|-----|-----|-----|-----|-----|-----|
| Attacker / Blaster / Breaker | 650 | 650 | 600 | 600 | 600 | 600 |
| Buffer | 600 | 600 | 670 | 620 | 600 | 600 |
| Debuffer | 600 | 600 | 650 | 600 | 670 | 600 |
| Defender / Healer | 600 | 600 | 600 | 670 | 600 | 650 |
| Admiral / Rider / 不明 | 620 | 620 | 620 | 620 | 620 | 620 |

### DamageCalculatorEnemyAdapter 型定義（T1.2確定）

```js
/**
 * @typedef {object} DamageCalculatorEnemyAdapter
 * @property {number|null} [enemyId]              選択中の敵ID（EnemySetupSnapshot.enemySlots[i].selectedEnemyId）
 * @property {string} [enemyName]                 表示用敵名
 * @property {number|null|undefined} [paramBorder] 防御境界値。null → enemies.json から自動取得、未存在時は 770。
 * @property {boolean} [isHpTarget=true]          HP対象: true、DP対象: false。v1 は true 固定（取得経路なし）。
 * @property {number} [destructionRate=1]         破壊率倍率。v1 は 1.0 固定（正本フィールド未確定）。effectiveDamageRatesByEnemy とは別物。
 * @property {number} [affinityRate=1]            属性相性による有効ダメージ率。damageContext.effectiveDamageRatesByEnemy[targetEnemyIndex] ÷ 100。
 * @property {Record<string, number>} [resistances={}] 武器・属性耐性マップ。v1 は空（全属性 1.0）。
 * @property {Array<object>} [statusEffects=[]]   デバフ効果。v1 は空（damageBreakdown groups から逆算しない）。
 */
```

**注意**: `enemies.json` の `base_param` には `param_border` のみで武器属性耐性マップは存在しない。
v1 では `resistances` を省略（全 1.0 扱い）とし、将来的に damageBreakdown の affinity グループから補完を検討する。

### buildDamageCalculationInput() シグネチャ（T1.3確定）

```js
// src/domain/damage-calculator-input-builder.js（新規）

/**
 * damageContext と外部入力から DamageInputContext を組み立てる。
 *
 * 設計方針（Hybrid Approach）:
 *   - スキル・キャラクター情報: damageContext から直接取得
 *   - 攻撃者ステータス: AttackerStatsInput（手動 or role デフォルト）
 *   - バフ倍率: damageBreakdown.groups の合計 multiplier を pre-resolved power として渡す
 *   - 敵パラメータ: DamageCalculatorEnemyAdapter（Enemy Setup から取得）
 *
 * @param {ReturnType<import('./damage-calculation-context.js').buildDamageCalculationContext>} damageContext
 * @param {AttackerStatsInput} [attackerStatsInput={}]
 * @param {DamageCalculatorEnemyAdapter} [enemyAdapter={}]
 * @returns {import('../contracts/damage-calculation.js').DamageInputContext}
 */
export function buildDamageCalculationInput(damageContext, attackerStatsInput = {}, enemyAdapter = {}) {}

/**
 * role と limitBreakCount からデフォルトステータスを解決する。
 * @param {string} role
 * @param {number} limitBreakCount
 * @returns {{ str:number, dex:number, wis:number, spr:number, luk:number, con:number }}
 */
export function resolveDefaultStats(role, limitBreakCount = 0) {}
```

#### stat delta provider シグネチャ（T3.2・Stat view lane 正本）

右ペインの能力値表示（base/delta/resolved）の正本。**calculateDamage には流し込まない**（2レーン分離）。

```js
/**
 * @typedef {{ base:number, buffDelta:number, debuffDelta:number, resolved:number }} StatDeltaCell
 *
 * 右ペインの能力値表示 view model を組み立てる。
 * v1: 実効ステータス算出経路が未実装のため buffDelta=debuffDelta=0、resolved=base を返す（placeholder）。
 * 将来: バフ適用後の実効ステータス算出 provider が定まり次第 delta/resolved を実値化。
 *
 * @param {object} damageContext
 * @param {AttackerStatsInput} attackerStatsInput
 * @param {DamageCalculatorEnemyAdapter} enemyAdapter
 * @returns {{ attacker: Record<string, StatDeltaCell>, enemy: Record<string, StatDeltaCell> }}
 */
export function buildDamageStatDeltaViewModel(damageContext, attackerStatsInput = {}, enemyAdapter = {}) {}
```

> **v1 方針（ユーザー確定）**: stat delta 表示は placeholder 枠として UI を確保するが、`buffDelta`/`debuffDelta` は 0 固定。実効ステータス算出（バフ適用後の能力値）は後続フェーズで provider を実装してから実値化する。

#### 重要な変換ルール

| DamageInputContext フィールド | 取得元 | 変換 |
|---|---|---|
| `skill.kind` | `damageContext.isNormalAttack` | `true` → `'normal_attack'` |
| `skill.skillId` / `skill.name` | `damageContext.skillId` / `skillName` | そのまま |
| `attacker.characterId` / `styleId` | `damageContext.actorCharacterId` / `actorStyleId` | そのまま |
| `attacker.tokenCount` / `tokenRatio` | `damageContext.tokenAttackTokenCount` / `tokenAttackTotalRate` | そのまま |
| `activeZone` | `damageContext.zoneType` + `zonePowerRate` | `zonePowerRate > 0` → `'${zoneType}Zone'`、それ以外 `'None'` |
| `defender.affinityRate`（耐性有効率） | `damageContext.effectiveDamageRatesByEnemy[targetEnemyIndex]` | % ÷ 100。**これは破壊率ではなく属性相性による有効ダメージ率**（`computeEnemyEffectiveDamageRatePercentForSkill` 由来・`DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT` 基準） |
| `defender.destructionRate` | **v1 では 1.0 固定** | 破壊率の正本フィールドは未確定。`effectiveDamageRatesByEnemy` を流用しない（意味が異なる）。将来 enemy data の `d_rate`/`od_rate` 等から確定 |
| `attacker.preResolvedDamageModifiers` | `damageBreakdown.groups[*].multiplier` | **synthetic aggregate（採用済み総倍率）として渡す**。後述「2レーン分離」参照 |

> ⚠️ **codex/ag レビュー反映（重要）**: `damageBreakdown.groups['buff']` には AttackUp 以外に Zone / MindEye / 装備 / 食事 / highBoost 等が混在しており、**個別の raw statusEffect（AttackUp 等）へ復元することは不可能**。calculateDamage へ再投入する際は、個別 contribution を statusEffects に戻さず、**カテゴリ別の採用済み総倍率（synthetic aggregate）を1件として渡す**（または calculateDamage に `buffMultiplierOverride` 入力を新設する）。Funnel の `(multiplier - 1) * 100` も「採用済み総倍率の再投入」であり raw Funnel の再現ではない旨を明記する。

**chargeEffects の注意**: `damageContext` に含まれないため、turn-controller が
`damageContext` に `chargeEffects`（および T1.3 が必要とする最小 raw/adopted inputs 一式）を追加保持することが T1.3 の前提条件となる（T3.0 で対応）。

### 2レーン分離（calculateDamage 入力 / stat 表示）— codex レビュー反映

T1.3 と T3.2 は**独立した2レーン**であり、互いに値を流し込まない。

| レーン | 役割 | データソース | 出力先 |
|---|---|---|---|
| **Damage calculation lane** | 実ダメージ算出 | `DamageInputContext`（威力カテゴリ倍率・敵param・スキル情報） | `calculateDamage()` |
| **Stat view lane** | 右ペインの能力値表示 | base/delta/resolved の view model | 右ペイン stat grid（表示のみ） |

- `damageBreakdown` contribution は**左ペイン/威力倍率の正本**。stat delta は**右ペイン/能力値表示の正本**。
- **stat delta を `DamageInputContext.attacker.stats` に足し込まない**。`stats` は手動入力 or role default の base/resolved 攻撃ステータスとして扱い、威力カテゴリ contribution とは別に表示する（二重計上防止）。

### EnemySetupController.getSnapshot() 取得経路（T1.2確定）

```js
// EnemySetupSnapshot の主要フィールド（ag調査確認済み）
{
  // スロット個別データ（E1/E2/E3）
  enemySlots: [{
    slotIndex: 0,
    selectedEnemyId: 13000001,     // ← enemies.json の id に一致
    selectedEnemyName: '○○',
    isManual: false,
    resistances: { element: { Fire: 1.5, Ice: 1.0, ... } },  // 属性耐性（元素のみ）
    od_rate, max_d_rate, ...
  }],
  // Legacy flat fields (E1相当)
  selectedEnemyId,
  selectedEnemyName,
  enemyCount,
  ...
}

// param_border の取得パス
const enemies = loadDamageCalculationData().enemies;
const enemy = enemies.find(e => e.id === snapshot.selectedEnemyId);
const paramBorder = enemy?.base_param?.param_border > 0
  ? enemy.base_param.param_border
  : 770;  // デフォルト（スコアアタック難易度40G35基準）
```

### UI HTML 構造仕様 v2（T2.1〜T2.4確定）

レイアウト確定 v2 に基づく構造。右ペインは「E1/E2/E3 敵選択タブ + 上部ダメージ(3割) + 下部パラメータ左右分割(7割)」。

```html
<section class="char-popup-damage-action" data-role="char-popup-damage-action">
  <div class="char-popup-damage-action-title">...</div>
  <div class="char-popup-damage-layout" data-role="char-popup-damage-layout">

    <!-- ══ 左ペイン: 既存の倍率グループ表示（幅 ~50%・中身不変） ══ -->
    <div class="char-popup-damage-left" data-role="char-popup-damage-left">
      <!-- 既存: critical note / target breakdowns / group table をそのまま移動 -->
    </div>

    <!-- ══ 右ペイン: 計算機（幅 ~50%・新規） ══ -->
    <aside class="char-popup-damage-right" data-role="char-popup-damage-calculator">

      <!-- 敵選択タブ（※下記は例示。実装では enemySlots から動的生成・下記「敵選択タブの出し分け」参照） -->
      <div class="char-popup-damage-enemy-tabs" data-role="damage-calc-enemy-tabs" role="tablist">
        <!-- availableTargets = enemySlots.filter(s => s.selectedEnemyId != null) でループ生成 -->
        <!-- data-enemy-index は targetEnemyIndex を正本にする（配列 index ではない） -->
        <!-- button text = enemyName || targetBreakdown.targetLabel || `E${targetEnemyIndex+1}` -->
        <button type="button" class="char-popup-damage-enemy-tab" data-role="damage-calc-enemy-tab" data-enemy-index="0" aria-selected="true">（敵名 or E1）</button>
      </div>

      <!-- ── 上部（約3割）: ダメージ・補足情報エリア ── -->
      <section class="char-popup-damage-calc-result" data-role="damage-calc-result">
        <div class="char-popup-damage-result-table" data-role="damage-calc-result-table">
          <div class="char-popup-damage-result-row" data-result="normal">
            <span>通常</span>
            <output data-value="min"></output>
            <output data-value="expected"></output>
            <output data-value="max"></output>
          </div>
          <div class="char-popup-damage-result-row" data-result="critical">
            <span>クリ</span>
            <output data-value="min"></output>
            <output data-value="expected"></output>
            <output data-value="max"></output>
          </div>
        </div>
        <div class="char-popup-damage-result-note" data-role="damage-calc-result-note">
          <!-- その他補足情報（破壊率・対象ゲージ HP/DP など） -->
        </div>
      </section>

      <!-- ── 下部（約7割）: パラメータエリア（左右分割） ── -->
      <div class="char-popup-damage-param-area" data-role="damage-calc-param-area">

        <!-- 左: 自身のパラメータ -->
        <section class="char-popup-damage-param-self" data-role="damage-calc-attacker">
          <div class="char-popup-damage-calc-heading">自身のパラメータ</div>
          <label class="char-popup-damage-field" data-stat="role">
            <span>ロール</span>
            <select data-role="damage-calc-role"><!-- Attacker/Blaster/.../Rider --></select>
          </label>
          <label class="char-popup-damage-field" data-stat="limitBreakCount">
            <span>凸</span>
            <input type="number" min="0" max="4" step="1" data-role="damage-calc-limit-break">
          </label>
          <!-- ステータス: 元値(base) + 補正(delta) + 最終(resolved) の3列構成 -->
          <!-- ⚠ v1 は delta=0 固定（実効ステータス算出 provider 未実装のため）。resolved=base 表示 -->
          <div class="char-popup-damage-stat-grid" data-role="damage-calc-stats">
            <div class="char-popup-damage-stat-row" data-stat="str">
              <span>力</span>
              <input data-role="damage-calc-stat-base" data-stat="str"><!-- 元値 base -->
              <output data-role="damage-calc-stat-delta" data-stat="str"></output><!-- 補正 +delta（v1=0） -->
              <output data-role="damage-calc-stat-resolved" data-stat="str"></output><!-- 最終 resolved -->
            </div>
            <!-- dex/wis/spr/luk/con も同形式 -->
          </div>
        </section>

        <!-- 右: 敵のパラメータ -->
        <section class="char-popup-damage-param-enemy" data-role="damage-calc-enemy">
          <div class="char-popup-damage-calc-heading">敵のパラメータ</div>
          <div class="char-popup-damage-enemy-name" data-role="damage-calc-enemy-name">（未選択）</div>
          <div class="char-popup-damage-enemy-param">
            <span>防御境界値</span>
            <output data-role="damage-calc-param-border">770</output>
          </div>
          <!-- 敵ステータス: 元値 + 適用バフ値 + デバフ値 -->
          <div class="char-popup-damage-enemy-stat-grid" data-role="damage-calc-enemy-stats">
            <!-- 敵ステータス行（元値/バフ/デバフ） -->
          </div>
          <!-- 補足記述スペース -->
          <textarea class="char-popup-damage-enemy-note" data-role="damage-calc-enemy-note" placeholder="補足メモ"></textarea>
        </section>

      </div>
    </aside>
  </div>
</section>
```

**命名方針**:
- 既存の `char-popup-damage-*` に準拠。
- JS操作用は `data-role="damage-calc-*"`、stat識別は `data-stat="str"` で分離。
- 結果値は `<output>`（`data-value="min|expected|max"`）。
- ステータスは `base`（入力）/ `delta`（補正・output）/ `resolved`（最終・output）の3列。`data-role="damage-calc-stat-base"` / `damage-calc-stat-delta` / `damage-calc-stat-resolved`。**v1 は delta=0 固定・resolved=base**（実効ステータス provider 未実装）。
- 敵選択タブ切替時は `data-enemy-index` で計算対象を切り替え、右ペイン全体（ダメージ・敵パラメータ）を再描画する。

**敵選択タブの出し分け**: Enemy Setup の使用スロット数（`enemySlots` のうち `selectedEnemyId !== null` の数）に応じてタブを出す。単体敵時は1タブのみ表示。
- **内部キー / 表示ラベルの分離（ユーザー補足で確定）**: タブの内部キーは `targetEnemyIndex` を正本とする。配列 index ではなく `targetEnemyIndex` 一致で参照する。
- 表示ラベルは **敵名が定義されていれば敵名**（`targetBreakdown.targetLabel`）を使い、**未定義時のみ E1/E2/E3 にフォールバック**する。
- **未使用スロットは出さない**。`dead/unused` の表示状態は区別する。
- `targetBreakdown` が存在しない敵を選んだ場合は disabled / empty 表示にする（calculateDamage 入力不足時は「敵 param 未取得」等の具体的な missing reason を出す）。

---

## WBS タスク一覧（更新）

### 🔴 Phase 1: データ基盤

#### T1.1: ステータス入力スキーマの定義 ✅ 机上設計完了
- 型定義: `AttackerStatsInput`（上記参照）
- role 別デフォルトステータステーブル（上記参照）
- `resolveDefaultStats(role, limitBreakCount)` の関数シグネチャ確定

#### T1.2: 敵ステータス取得アダプタ ✅ 机上設計完了
- `DamageCalculatorEnemyAdapter` 型定義（上記参照）
- `EnemySetupController.getSnapshot()` → `selectedEnemyId` → `enemies.json` → `param_border` の取得パス確定
- **v1 制約**: `resistances` は空（武器耐性データが enemies.json に存在しない）

#### T1.3: DamageInputContext 組み立て関数 ✅ 実装完了
- `buildDamageCalculationInput()` シグネチャ確定（上記参照）
- **前提条件**: `chargeEffects` を `damageContext` に追加保持するよう turn-controller を修正する必要がある

---

### 🟡 Phase 2: UI 実装

#### T2.1: 威力詳細タブのレイアウト変更 ✅ 実装完了
- 左ペイン（既存・横幅半分）＋右ペイン（新規計算機）の2ペイン構造（v2、上記参照）
- 左ペインは既存 critical note / target breakdowns / group table を中身不変で移設

#### T2.2: 右ペイン上部 ダメージ・補足情報エリア + 敵選択タブ ✅ 実装完了
- E1/E2/E3 敵選択タブ（使用スロット数に連動）
- 通常・クリ 最小/期待/最大 の `<output>`、補足情報欄

#### T2.3: 右ペイン下部 自身のパラメータ（左） ✅ Phase A 改訂完了
- `member.role` / `member.limitBreakLevel` 由来の6ステータスを read-only 表示
- base＋delta＋resolved の3列。Phase A は delta=0・resolved=base
- role select / 凸 input / stat number input は撤去

#### T2.4: 右ペイン下部 敵のパラメータ（右） ✅ 実装完了
- 敵名・param_border、敵ステータス（元値＋バフ/デバフ、stat delta レーン）、補足記述スペース（textarea）
- textarea は v1 では非永続プレースホルダ（save/replay/session schema に入れない）

#### T2.5: CSS スタイリング ✅ 実装完了
- `.char-popup-damage-layout`（左右2ペイン flex、各 ~50%・狭幅で縦積み）
- `.char-popup-damage-right`（敵タブ + 上部3割/下部7割の縦配分）
- `.char-popup-damage-enemy-tabs` / `.char-popup-damage-enemy-tab`（敵選択タブ・選択状態）
- `.char-popup-damage-param-area`（下部7割の左右2分割）
- `.char-popup-damage-stat-grid` / `.char-popup-damage-stat-row`（元値/バフ/デバフの3列）
- `.char-popup-damage-result-table`（最小/期待/最大 の3列）
- `.char-popup-damage-enemy-note`（補足記述 textarea）

---

### 🟢 Phase 3: 計算連携

#### T3.0: turn-controller に chargeEffects を damageContext へ追加（前提条件） ✅ 実装完了
- `buildDamageCalculationContext()` の入力に `chargeEffects` を追加
- turn-controller で `chargeEffects` を damageContext に渡す

#### T3.1: `calculateDamage` の呼び出し接続 ✅ 実装完了
- `buildDamageCalculationInput()` 実装
- `resolveDefaultStats()` 実装
- Phase A は PartySetup(member) 由来の read-only attacker input を使用
- **敵選択タブ切替時**に対象敵を `targetEnemyIndex` 一致で切り替えて再計算・敵依存表示のみ再描画（攻撃者 stat 入力 state は保持）
- 左ペイン倍率表示は `damageContext.damageBreakdown.targetBreakdowns[]` を `targetEnemyIndex` 一致で参照
- 右ペイン計算結果は targetBreakdowns だけでは不足。`paramBorder / isHpTarget / affinityRate / resistances / 敵 status・採用済み debuff` を enemyAdapter または追加 damageContext field から取得する必要あり（`destructionRate` は v1=1.0 固定）
- `effectiveDamageRatesByEnemy`（属性相性有効率）/ `enemyAllAbilityDownByEnemy` は `targetEnemyIndex` keyed。タブ切替時は同じ index で参照（targetBreakdown=表示倍率、keyed maps=計算入力 という役割差を保つ）

#### T3.2: stat delta 表示連携（v2新規・v1 は placeholder） ✅ 実装完了
- **正本の区別（ユーザー補足で確定）**: 右ペインの「バフ値/デバフ値」は **ステータス実数差分（stat delta）** を指す。例: `STR 650 (+25) = 675`。
  - これは **`damageBreakdown` contribution（ダメージ倍率カテゴリ）とは別物**（Stat view lane）。倍率カテゴリの値を流用しない。
  - `damageBreakdown` contribution = 威力カテゴリ表示の正本（左ペイン）。右ペイン stat delta = 能力値表示の正本（別レーン）。
- **v1 実装方針（ユーザー確定・調査で経路不在を確認）**: バフ適用後の実効ステータスを算出する既存エンジン経路は存在しない（`calculateDamage` は AttackUp 等を倍率処理し、ステータス加算しない）。
  - → Phase A は `buildDamageStatDeltaViewModel()` で、**`base`（member role/凸由来 default）/ `delta`=0 / `resolved`=base の placeholder 表示**とする。
  - 実効ステータス算出 provider が定まり次第、delta/resolved を実値化（後続フェーズ）。
- 表示: `元値（base）/ 補正（+delta, v1=0）/ 最終（resolved）`。base（手動入力）と delta/resolved（自動算出）を視覚的に分離。

#### T3.3: `loadDamageCalculationData()` のキャッシュ ✅ 実装完了
- 初回のみ読み込み、以降はキャッシュ（`HbrDataStore` 既存機構と整合）

---

### 🔵 Phase 4: テスト

#### T4.1: input builder のユニットテスト ✅ 実装完了
- `buildDamageCalculationInput()` の変換ロジックカバレッジ
- `resolveDefaultStats()` の role 別デフォルト値テスト（全 role）

#### T4.2: Playwright E2E テストの追加 ✅ Phase A 改訂完了
- `tests/e2e/damage-breakdown-popup.spec.js` に右ペイン計算機・敵タブ切替・member role/凸由来 read-only stats・DP表示・表示スキル一致の回帰を追加

---

## 進捗状況

3者レビュー（claude/codex/ag, 2026-06-03）の GO/NOGO 判定と、レビュー反映後の到達状況。

| タスクID | 分類 | 内容 | レビュー判定 | 状況 |
|:---|:---|:---|:---|:---|
| T1.1 | Data | ステータス入力スキーマ定義 | 🟢 GO | ✅ 机上設計完了 |
| T1.2 | Data | 敵ステータス取得アダプタ | 🟢 GO（destructionRate訂正済） | ✅ 机上設計完了 |
| T1.3 | Data | DamageInputContext 組み立て関数 | 🟢 GO（synthetic aggregate/2レーン分離明記済） | ✅ 実装完了 |
| T2.1 | UI | 威力詳細タブ 2ペイン化（左既存/右計算機） | 🟢 GO | ✅ 実装完了 |
| T2.2 | UI | 右ペイン上部 ダメージ+敵選択タブ（動的生成） | 🟢 GO（動的生成仕様反映済） | ✅ 実装完了 |
| T2.3 | UI | 右ペイン下部 自身パラメータ（base/delta/resolved） | 🟢 GO（列定義統一済） | ✅ 実装完了 |
| T2.4 | UI | 右ペイン下部 敵パラメータ+補足記述 | 🟢 GO（textarea非永続/敵stat=placeholder） | ✅ 実装完了 |
| T2.5 | UI | CSS スタイリング（2ペイン+3割/7割+左右分割） | 🟢 GO | ✅ 実装完了 |
| T3.0 | Logic | turn-controller に最小 raw/adopted inputs 追加 | 🟢 GO | ✅ 実装完了 |
| T3.1 | Logic | calculateDamage 呼び出し接続＋敵タブ切替再計算 | 🟢 GO（T1.3確定により） | ✅ 実装完了 |
| T3.2 | Logic | stat delta 表示（v1 placeholder/delta=0） | 🟢 GO（provider新設・v1方針確定） | ✅ 実装完了 |
| T3.3 | Logic | JSON データキャッシュ | 🟢 GO | ✅ 実装完了 |
| T4.1 | Test | input builder ユニットテスト | 🟢 GO | ✅ 実装完了 |
| T4.2 | Test | E2E テスト追加 | 🟢 GO | ✅ 実装完了 |

**総合判定**: 初回レビューは 3者全員 NOGO（T1.3/T2.3/T3.1/T3.2 の設計不整合が理由）。
上記レビュー指摘6点（synthetic aggregate明記 / 2レーン分離節追加 / 列定義 base-delta-resolved 統一 / stat delta provider新設・v1=placeholder確定 / 敵タブ動的生成仕様 / destructionRate誤用訂正）を反映したうえで、`src/domain/damage-calculator-input-builder.js`、威力詳細右ペイン UI、`damageContext` 入力追加、テスト追加まで完了。

**Phase A 完了確認（2026-06-04）**:
- `npm test` PASS（1263 tests）
- `npm run lint` PASS
- `npx playwright test tests/e2e/damage-breakdown-popup.spec.js` PASS（2 tests）
- AttackBySp 消費SP威力スケーリング、HP破壊率、stat delta 実値 provider は Phase A スコープ外

---

## 参照ドキュメント

- `docs/active/damage_calculator_context_mapping.md` — damageContext フィールドマッピング詳細分析
- `docs/calc/porting_design_guideline.md` — `DamageInputContext` 型定義
- `docs/calc/phase2_design_specification.md` — バフ・デバフ集計ルール
- `docs/specs/damage_breakdown_design.md` — 威力詳細タブ現行設計
- `src/domain/damage-calculator.js` — `calculateDamage()` 実装
- `src/contracts/damage-calculation.js` — 型定義・定数
- `src/domain/damage-calculation-context.js` — damageContext 全フィールド
