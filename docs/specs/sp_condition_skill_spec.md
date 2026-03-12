# SP条件スキル（cond: Sp()...）実装仕様

> 作成日: 2026-03-12
> 対象ファイル: `src/turn/turn-controller.js`, `src/domain/character-style.js`

## 1. 概要

一部スキルには `cond` フィールドに SP 量を前提とする条件式が設定されている。
シミュレータはこの条件を `previewTurn` 時に評価し、未達の場合はエラーをスローする。

また `sp_cost: -1` は「現在 SP を全消費」を意味する特殊値であり、これらは SP 条件スキルと組み合わせて使われることがある。

---

## 2. 該当スキル一覧（実データ）

| スキル ID | 名前 | cond | sp_cost | 説明 |
|-----------|------|------|---------|------|
| 46008209 | 春の宵の塵に同じ | `Sp()<0` | 0 | SP が 0 未満のときのみ使用可能。HP 割合ダメージ＋防御力低下 |
| 46007513 | アオナツの夢 | `Sp()>19` | 0 | SP が 20 以上のときのみ使用可能。チャージ＋SP +5（SP30まで） |
| 46007514 | 疾きこと風の如し | `Sp()>0` | -1 | SP > 0 のとき、現在 SP を全消費して 8 連撃（消費 SP に応じて威力上昇） |
| 46041404 | トリニティ・ブレイジング | `Sp()>0` | -1 | SP > 0 のとき、現在 SP を全消費して全体攻撃（消費 SP に応じて威力上昇） |

---

## 3. 実装状況

### 3.1 スキル `cond` の評価パス

```
previewTurn()
  └─ buildSortedActionEntries()               src/turn/turn-controller.js:4817
       └─ evaluateConditionExpression(cond, state, member, ...)
            └─ evaluateSingleConditionClause()
                 └─ FUNCTION_COMPARISON_CONDITION_RE でマッチ
                      └─ resolveZeroArgConditionValue('Sp', ...) → member.sp.current
                           └─ compareNumbers(current, '<', 0)
```

- `cond` 未充足時: `throw new Error('Skill X cannot be used because cond is not satisfied.')`
- `cond` が空文字の場合はスキップ（常に使用可能）

### 3.2 `Sp()` の評価値

`Sp()` は `member.sp.current` をそのまま返す（src/turn/turn-controller.js:636）。
負の値もそのまま返すため、`Sp()<0` 判定は正しく機能する。

### 3.3 `sp_cost: -1`（現在SP全消費）の処理

src/domain/character-style.js:403 のコメントより：

```js
// HBR特殊値: sp_cost = -1 は「現在SPを全消費」。
if (rawCost === -1) {
  deltaSP = -startSP;  // 全SP消費 → endSP = 0（sp.min = 0 の場合）
}
```

- `previewTurn` の出力: `spCost: -1`（スキル定義値）, `endSP: 0`（実際の結果）
- ReduceSp 削減は `baseSpCost <= 0` の場合は適用しない（line 3597）

### 3.4 SP がマイナスになる条件

`CharacterStyle` の `sp.min` は `input.spMin ?? 0` で初期化される（line 263）。
デフォルト値は `0` で、マイナス SP は発生しない。
マイナス SP を許可するには明示的に `spMin` をマイナス値（例: `-5`）に設定する必要がある。

UI では `FORCE_RESOURCE_MIN = -999` として強制的に全メンバーの `sp.min` を下げる機能がある（src/ui/dom-adapter.js:6628）。

### 3.5 `applySpChange` の下限クランプ

```js
export function applySpChange(current, delta, min, eventCeiling) {
  if (delta > 0) { ... }
  return Math.max(min, current + delta);  // 回復は凍結ルール, 消費は下限クランプのみ
}
```

`sp.min = -5` のとき、SP が -5 未満にはならない。

---

## 4. 各スキルの使用フロー

### 4.1 「春の宵の塵に同じ」（Sp()<0, sp_cost: 0）

1. `sp.min` を負値（例 -5）に設定し `sp.current` が -3 などになっている状態で
2. `previewTurn` → `cond: "Sp()<0"` を評価 → `sp.current < 0` → true → 使用可能
3. `sp_cost: 0` なので SP 変化なし（`endSP = startSP`）

### 4.2 「疾きこと風の如し」「トリニティ・ブレイジング」（Sp()>0, sp_cost: -1）

1. `sp.current > 0` の状態で
2. `previewTurn` → `cond: "Sp()>0"` 評価 → true → 使用可能
3. `rawCost = -1` → `deltaSP = -startSP` → `endSP = 0`
4. 出力: `spCost: -1`（定義値）, `startSP: X`, `endSP: 0`

### 4.3 「アオナツの夢」（Sp()>19, sp_cost: 0）

1. `sp.current >= 20` の状態で
2. `previewTurn` → `cond: "Sp()>19"` 評価 → true → 使用可能
3. `sp_cost: 0`、スキル部位 `BuffCharge`（チャージ付与）＋SP 回復

---

## 5. 未実装・スコープ外

| 項目 | 状態 | 備考 |
|------|------|------|
| `SpMinOverwrite` passive | データなし | 専用 passive は存在しない（UI の FORCE_RESOURCE_MIN で代替） |
| 「消費 SP に応じて威力上昇」計算 | 未実装 | `sp_cost: -1` の消費量をダメージ計算に反映する仕組みが必要（将来実装候補） |
| 「SP30まで上限突破可」（アオナツの夢） | 別途実装済み | `SpLimitOverwrite` passive で `sp.max = 30` を設定（歴戦パッシブ） |
| 速弾き（Shredding）状態 | 未実装 | 芳岡ユイの「かき鳴らせキラーチューン」(id=46040604) が付与するバフ状態。速弾き中は全スキルが SP>=0 で使用可能になり SP がマイナスに突入する。`sp.min` の動的変更・状態管理が必要。詳細は `docs/active/shredding_implementation_tasklist.md` を参照。 |
| `is_adv: true` スキルの SP>=0 条件（仕組みB） | 未実装 | `is_adv: true && sp_cost > 0` のスキル（全37件）は速弾き状態なしでも常に SP>=0 で使用可能。`is_adv` が完全識別子（`is_adv: false` で SP0以上条件を持つスキルは 0 件）。`hbr-data-store.js` のロード時に `cond: 'Sp()>=0'` を付与して既存 cond 評価パスで処理する計画。 |

---

## 6. テストカバレッジ

`tests/turn-state-transitions.test.js` に以下のテストが追加されている：

| テスト名 | 確認内容 |
|---------|---------|
| `Sp()<0` 条件スキル: SP >= 0 のときエラーをスロー | cond 未充足で throw |
| `Sp()<0` 条件スキル: SP < 0（spMin 設定済み）のとき使用可能 | cond 充足で正常 preview |
| `Sp()>0` + `sp_cost: -1` 条件スキル: SP = 0 のときエラーをスロー | cond 未充足で throw |
| `Sp()>0` + `sp_cost: -1` 条件スキル: 全 SP 消費で endSP = 0 | sp_cost=-1 の正常処理 |
| `Sp()>19` 条件スキル: SP = 19 のときエラーをスロー | cond 未充足で throw |
| `Sp()>19` 条件スキル: SP = 20 のとき使用可能 | cond 充足で正常 preview |
