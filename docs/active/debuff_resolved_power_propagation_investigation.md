# デバフ解決済み効果値の伝播・再計算整合性 調査と実装設計

| 項目 | 値 |
|------|----|
| ステータス | 🟢 進行中 |
| 作成日 | 2026-06-13 |
| 起票者 | user（ram4）/ 設計: Fable5 |
| 関連 | [[buff-debuff-apply-time-resolution]]（付与時解決方式）, active/damage_calculator_remaining_wbs.md |

---

## 1. 課題（ユーザー提起）

**対象は敵デバフに限らず、計算に関わる全バフ・全デバフ・全状態変化**（自バフ効果値#1 / 敵デバフ効果値#2 / 全 statusType）。

> JSON保存は「操作したことだけ」を保持し、再計算すれば全部正しく出る設計を期待している。
> ただOD3・追加ターンなど **ゲーム内ターンは進まないが行動が蓄積され続ける** 時、
> 過去に計算した効果値（stat差・効果量アップで正しく解決された値）は伝播して残っているか？

正しさの要件（user 明示）:
- **同一ターン内保持は当然**。
- **ターンを跨いでも、消費/失効しない限り保持されないとおかしい**（複数ターン継続デバフは当然存在する）。
- 付与時解決した解決済み ratio が、ターン非進行の行動蓄積・ターン跨ぎをまたいで
  生き残り、かつ **再計算で正しく再導出**されること。

---

## 2. 調査結果（現状アーキテクチャ）

### 2.1 付与と保存

- 敵デバフは `applyEnemyStatusEffectsFromActions`（turn-controller.js:10100）が **行動ごと**に処理。
- 効果値は `resolveEnemyStatusEffectPowerRatio`（:1563）→ `resolveEffectPowerRatioFromPart` で
  **付与時の actor stat + enemyBorder + 効果量アップ** から解決し、ratio で `enemyState.statuses` に格納
  （`upsertEnemyStatus` :3999、`mergeEnemyStatuses` は power=`Math.max` で統合 :2598）。
- 解決入力 part は `resolveSourceEffectPowerPart(sourceSkill, part, partIndex)` で
  **生 source skill** から取得（preview snapshot のレンジ正規化済み値ではない）。

### 2.2 行動蓄積中（OD3 / 追加ターン）の保持 ✅ 正しい

`commitTurn`（:14648）のターン終了処理:

```js
// :14786
if (!playerTurnContinuesAfterActions) {
  tickEnemyStatusDurations(state.turnState, 'PlayerTurnEnd');
}
```

`playerTurnContinuesAfterActions` は **OD残行動>1 / 追加ターン残>1 / 割込OD / extra付与** で true。
→ **継続中は tick されず remainingTurns 減衰も削除も起きない**。
→ 解決済みデバフ ratio は `enemyState.statuses` に保持され、同一ターンブロック内の後続行動の
   ダメージ計算でも正しく参照される。**この経路は設計どおり正しい。**

### 2.3 再計算（recompute / replay）の経路 ⚠️ 懸念点

OD3・追加ターンは **複数の ReplayTurn レコードに分割**される（各 commit が 1 record を push、
OD残行動・extra は `remainingOdActions`/`extraTurnState.remainingActions` で次 record へ継続）。

再計算ループ `#recalculateAllBestEffort`（turn-engine-manager.js:2112）:

```js
let state = clone(initialState);
for (each turn) {
  result = #replayTurnBestEffort(i, state);   // 内部で #applyScenarioTurnEnemyOverrides
  state = result.nextState;                    // enemyState を次ターンへ carry-forward
}
```

各ターン開始時 `#applyScenarioTurnEnemyOverrides`（:1744）が、そのレコードの
`overrideEntries` に保存された **enemyStatuses スナップショットで carry-forward 値を置換**する。

このスナップショットは commit 時 `#buildTurnStartEnemyOverrideEntries`（:1732）が
**ターン開始時 enemyState を initialState と差分比較**して記録（`buildEnemyStateOverrideSnapshot` は
`enemyStatuses: structuredClone(enemyState.statuses)` を含む :2846）。
適用は `applyEnemyStateOverrideSnapshot`（:2884）で **置換**（merge ではなく snapshot で上書き、
比較再計算時のみ一部 preserve :2950-2952）。

### 2.4 懸念の核心（要検証の仮説）

> デバフ存在後の各ターン record は、**ターン開始時点の解決済みデバフ power を含む
> enemyStatuses override を凍結保存**している。再計算時はそれを再導出せず、
> **凍結スナップショットで置換**する。

帰結（仮説）:
- **無編集の再計算**: 凍結値 == 再導出値 なので結果一致。**問題は顕在化しない。**
- **過去行動の caster stat / 効果量アップ源を編集 → 再計算**:
  - デバフが **付与されるターン record 内**では `applyEnemyStatusEffectsFromActions` が
    新 stat で再解決 → 正しい。
  - しかし **後続の OD/extra record のターン開始 override** には旧解決値が凍結されており、
    carry-forward された正しい値を **置換して陳腐化**させる懸念。
  - → 「全部正しく再計算される」というユーザー期待を **編集時に破る可能性**。

### 2.5 追加調査で確定した事実（2026-06-13 Explore + 直接確認）

1. **OD3/追加ターンは複数 ReplayTurn レコードに分割される（確定）**。
   `computeNextTurnState`（:14458）が `remainingOdActions>1` で次 state も `turnType='od'` を維持
   → 次ラウンドは別 `commitNextTurn` = 別レコード。→ 2.4 の前提は正しい。
2. **enemyStatuses override は通常 OD/追加ターンでも常に記録される**（force 不問、initialState 差分で記録）。
3. **通常再計算では全置換**（`preserveCurrentStatusPredicate` は比較再計算時のみ、かつ Break/DownTurn/Dead 系のみ保護）。
4. **自バフ（member.statusEffects, #1）と敵デバフ（enemyState.statuses, #2）で経路が非対称**:
   - `#applyScenarioTurnPlayerOverrides`（:1762）は **`dpStateByPartyIndex` のみ**処理。
     自バフは override 凍結されず、carry-forward + `applyActiveBuffStatusEffectsFromActions` で
     **毎再計算 action 単位に再導出** → **編集追従が正しい（陳腐化なし）**。
   - 敵デバフは turn-start `enemyStatuses` override で**凍結置換**される
     → **編集追従が壊れる懸念（陳腐化ベクトル）**。
   - **この非対称性が本件の核心**。自バフ側は安全、敵デバフ側が要修正候補。
5. **手動編集経路**: 敵デバフの **power(効果値) を直接編集する UI は無い**（Explore 結論）。
   敵の手動編集は **パラメータ（d_rate / param_border / 耐性 / DP / HP 等）に限定**（enemy-setup.js）。
   → user 回答「手動編集がある」は、この**パラメータ編集**または**威力詳細の手入力**を指す可能性。要すり合わせ（Q-D1 更新）。
6. **既存テスト**: `tests/t34-enemy-status-integration.test.js` に
   「committed snapshot 一致」「Undermine の recalculation 保持」「power 競合 max 採択」
   「committed statuses survive replay」「複数ターン伝播」あり。
   ただし **「上流編集→再計算で効果値が追従するか」「追加ターン跨ぎ」の明示テストは無い**（= 検証の穴）。

※ 陳腐化が **実際に顕在化するか**は characterization test（T0-1）で確定する。
no-edit の純再生は凍結値=再導出値で一致するため再現性は保たれるが、
**上流編集→再計算**で敵デバフが追従しなければバグ確定。

---

## 3. WBS

### Phase 0: 仮説検証（最優先・赤テスト先行）
- **T0-1**: characterization test 作成。
  - シナリオ: T1 で脆弱付与（caster stat 既知）→ OD3 で同一敵に複数行動蓄積。
  - 「T1 caster の stat を変更 → recalculateAll」後、**後続 OD 行動のデバフ依存ダメージ/破壊率**が
    新 stat 基準に追従するか検証。
  - 追従しなければ陳腐化バグ確定（赤）。追従すれば override は再導出経路で上書きされており問題なし。
- **T0-2**: enemyStatuses override entry が「通常 OD/extra ターン」で実際に記録されるかをログ/単体で確認
  （記録されない＝懸念は空振り、の可能性も潰す）。

### Phase 1: 設計確定（T0 で赤の場合のみ）
- **T1-1**: enemyStatuses を **再計算時に再導出させる**方針決定。候補:
  - (a) **enemyStatuses を turn-start override から除外**し、carry-forward + action 再解決に一本化。
    user 手動編集デバフ（敵詳細 popup 等）の保存経路と衝突しないか要確認。
  - (b) override は **user 明示編集分のみ**記録、エンジン自動付与デバフは記録しない（source 区別）。
  - (c) override 適用時に **解決済み power を破棄して part から再解決**（適用後に再 resolve pass）。
  - 推奨: (b)。「操作のみ保存」という JSON 理念と最も整合。自動付与は再計算で再導出が筋。
- **T1-2**: 単位契約の維持確認（ratio 保存 / percent 計算入力、[[buff-debuff-apply-time-resolution]] の契約を壊さない）。

### Phase 2: 実装
- **T2-1**: override 記録側（`#buildTurnStartEnemyOverrideEntries` / `buildEnemyStateOverrideSnapshot`）で
  自動付与デバフと user 編集を区別、自動分を override から除外 or 再導出マーク付与。
- **T2-2**: 適用側（`applyEnemyStateOverrideSnapshot` / `buildOverrideEnemyStatuses`）で
  自動分を carry-forward 優先に。比較再計算 preserve predicate との整合。
- **T2-3**: save/load migration（既存 session の凍結 override を読み込んでも破綻しない後方互換）。

### Phase 3: テスト・検証
- **T3-1**: Phase0 の赤テストを緑化。
- **T3-2**: OD3 / 追加ターン / 割込OD / extra→base 遷移をまたぐデバフ伝播の単体テスト網羅。
- **T3-3**: 編集→再計算でのデバフ依存ダメージ追従の integration test。
- **T3-4**: Playwright（ui-next）で「過去ターン編集→反映→後続ターンのデバフ反映」E2E。
- **T3-5**: session save→load→recompute の往復回帰。

### Phase 4: ドキュメント収束
- 本doc・docs/README ステータス更新、関連 active doc への相互リンク。

---

## 4. テスト作成方針（全網羅）

- **全網羅方針を採用**（user 確定）。バフ・デバフ各 statusType は固有事情（消費トリガー・継続型・
  Count/Only・効果量アップ・cap 判定）を持ちうるため、特徴的なものだけでは漏れる。
- **マトリクス: statusType × ライフサイクル局面** で網羅:
  - 局面: (a) 付与時解決値の正しさ / (b) **同一ターン内**行動蓄積での保持 /
    (c) **ターン跨ぎ**（消費・失効しない限り保持）/ (d) 消費・失効での正しい除去 /
    (e) **上流編集→再計算での追従**（陳腐化検出の本丸）/ (f) save→load→recompute 往復。
  - statusType: 自バフ（AttackUp/ElementAttackUp/CritDamageUp/MindEye/Charge/Funnel…）、
    敵デバフ（Fragile/DefenseDown/ElementResistDown/Undermine…）、DestructionUp、
    継続ターン型・Count 型・Only 型を各々。
- **赤テスト先行**（dev_principles 準拠）。Phase0（T0-1）で敵デバフの (e) を最初に確定。
- 計算機コア（destruction-calculator / damage-calculator / calculator-helpers）は **無変更前提**
  （[[hbr-calc-owns-calculator-core]]）。本件は turn-controller / turn-engine-manager の
  **状態伝播・override 経路の問題**であり、効果値計算式そのものではない。
- unit（node:test）+ integration + Playwright の 3 層。
- 自バフ側は「安全である」ことを **回帰固定**する網羅も含める（非対称性が将来崩れない保証）。

---

## 5. タスク分担（サブエージェント / agmsg）

| 担当 | 種別 | タスク | 理由 |
|------|------|--------|------|
| **claude（本セッション）** | 実装 | Phase0 赤テスト作成・実行、Phase2 配線、Phase3 緑化 | turn-controller/turn-engine-manager はシミュレータ本体管轄。インライン実装（サブエージェントはEdit不可: [[subagent-edit-permission-blocked]]） |
| **Explore サブエージェント** | 調査のみ | override entry 記録条件・preserve predicate・比較再計算フラグの全呼び出し経路洗い出し | 読み取り専用の広域探索が得意。Edit不要 |
| **ag（hbr_calc）** | 不要 | — | 計算式変更なしのため hbr_calc 関与なし。**今回コア変更は発生しない** |
| **codex** | 補助実装（任意） | Playwright E2E（T3-4）/ save-load 回帰（T3-5）を分担可 | 並行で E2E を進められる。本体ロジックは claude が担当し衝突回避 |

> 注: 本件は **hbr_calc 管轄外**（効果値計算式は不変、状態伝播のバグ）。
> サブエージェントは調査限定、実装は本セッションがインラインで担当する。

---

## 6. 未決事項（user 確認候補）

- Q-D1: user が敵詳細 popup 等で **手動でデバフ効果値を編集**する経路は現状あるか？
  ある場合、自動付与デバフとの区別キー（source）が override 設計の要。
- Q-D2: 「操作のみ保存・計算は再導出」を enemyStatuses にも貫徹してよいか（推奨方針 (b)）。
  既存 session の凍結 override をどう migration するか。
