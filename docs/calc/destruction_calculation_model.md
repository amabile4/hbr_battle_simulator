# 破壊率（Destruction Rate）計算モデル仕様

HBRにおける破壊率（Destruction Rate）は、敵のDPをブレイクした後に攻撃をヒットさせることで蓄積されます。本ドキュメントは、Googleスプレッドシートの「ダメージ計算機」シートを解析して得られた破壊率の計算モデルを仕様化したものです。

---

## 1. 破壊率計算の概要

破壊率の計算は以下の2つのフェーズに分かれています。

1. **基本破壊率の計算**: スキル全体の基本破壊率（破壊率上昇量ボーナス適用後）を算出する。
2. **ヒットごとの累積シミュレーション**: ダメージの発生と連動し、DPブレイク判定を行いながら、ヒットごとに破壊率を累積する（上限超越の適用を含む）。

---

## 1.5 公式破壊率計算式（実測・公知情報）

破壊率上昇量の計算式は以下の通り公知となっている。

### スキル破壊率上昇量の正式式

2026-06-14 の Issue #19 対応で、実機確認済みの式へ更新した。

$$
\Delta D =
\frac{d\_rate}{8} \times h_{\text{base}} \times
(1 + B_{\text{add}}) \times dr \times
(1 + r_{\text{funnel}} \times h_{\text{funnel}})
$$

- $\Delta D$: 破壊率上昇量（%表記）。実装内では `/100` した ratio として扱う。
- $d\_rate$: enemies.json の raw `base_param.d_rate`。
- $h_{\text{base}}$: スキル本来の hit 数。Funnel 追加 hit は含めない。
- $dr$: skills.json の攻撃 part `multipliers.dr`。
- $B_{\text{add}}$: 超越、火の印、エンシェントチェーン、ブラストピアス、共鳴、DestructionUp の加算合計。
- $r_{\text{funnel}}$: 連撃 1hit あたりの破壊率上昇量（小 0.06 / 中 0.12 / 大 0.25 / 特大 0.50）。実データの `Funnel` part では `value[0]` に入り、runtime では `metadata.damageBonus` として保持する。`power[1]` は可変回数などの補助値であり、破壊率倍率の解決には使わない。
- $h_{\text{funnel}}$: Funnel の追加 hit 数。

通常攻撃は実機実測に基づき、別式として `d_rate / 100` を使用する。追撃は実機データ未確定のため既存式を維持する。

---

## 2. スキル基本破壊率の計算

スキルの基本破壊率 $D_{\text{base}}$（および耐性や共鳴アビリティ等を適用した後の最終基本破壊率 $D_{\text{final\_base}}$）は、以下の入力パラメータに基づいて算出されます。

### 入力パラメータ
- $dr$: スキルデータの攻撃 part `multipliers.dr`。
- $h_{\text{base}}$: スキル本来の hit 数。
- $h$: 実際に配分する総 hit 数（スキル本来の hit + Funnel 追加 hit）。
- $\text{funnelRate}$ / $\text{funnelHitCount}$: Funnel 連撃補正。`funnelRate` は消費・採用された Funnel effect の `metadata.damageBonus` からのみ解決する。
- $\text{accessoryDestructionRateBonus}$: ブラストピアス等の破壊率上昇量ボーナス。呼び出し側が解決済みの数値を渡す（例: `0.15`）。
- $\text{flatDestructionRateBonus}$: エンシェントチェーン等の固定加算ボーナス。
- $\text{markDestructionRateGainBonusRate}$: 火の印 Lv3 以上の破壊率上昇量ボーナス。
- $\text{transcendenceBurstDestructionRateGainBonusRate}$: 超越ゲージ100%時の破壊率上昇量ボーナス。
- $\text{resonanceDestructionRateBonus}$: 共鳴アビリティ補正。
- $AS_{39}$: DestructionUp status の破壊率バフ合計。
- $AL_{10}$ (敵の破壊率耐性): 敵が持つ破壊率に対する耐性（デフォルトは $0.0$）。
- $\text{destructionMultiplier}$ (敵 raw `d_rate`): 敵データの `base_param.d_rate` をそのまま渡す値（デフォルトは $1.0$）。

### 計算ロジック

#### ① 通常攻撃の場合
通常攻撃は実機実測に基づき、敵 raw `d_rate` をそのまま破壊率上昇%として扱います。ブラスター補正、破壊率上昇バフ、装備、共鳴、敵破壊率耐性は適用しません。超越ゲージ100%時の破壊率上昇率ボーナスのみ適用します。
$$D_{\text{base}} = \frac{d\_rate}{100} \times (1.0 + \text{transcendenceBurstDestructionRateGainBonusRate})$$

#### ② 追撃の場合
追撃はブラスター補正やバフを受けません。
$$D_{\text{base}} = dr \times 8.0 \times \frac{d\_rate}{100}$$

#### ③ スキル攻撃の場合
スキル本来の hit 数で基礎値を作り、破壊率上昇量ボーナスを一つの加算グループとして適用し、小数点以下4桁で切り捨てます。Blaster ロール固有の `+2.0` 補正とヒット数スロープはゲーム仕様に存在しないため使用しません。

$$
D_{\text{base}} =
\text{floor}\left(
\frac{dr \times d\_rate \times h_{\text{base}}}{8 \times 100}
\times (1.0 + B_{\text{add}}),
4
\right)
$$

#### ⑤ 最終基本破壊率の算出
通常攻撃以外では、敵の破壊率耐性 $AL_{10}$ を適用します。敵 raw `d_rate` と共鳴アビリティ補正はすでに $D_{\text{base}}$ へ内包済みのため、ここでは二重に乗算しません。
$$D_{\text{final\_base}} = D_{\text{base}} \times (1.0 - AL_{10})$$

---

## 3. ヒットごとの累積シミュレーション

破壊率は、攻撃前DPを累積ダメージが超えた瞬間（ブレイク後）から加算されます。

### 入力パラメータ
- $D_{\text{init}}$ (攻撃前破壊率): 攻撃開始時の蓄積破壊率（例: 250% の場合 $2.50$。基本値は $1.0$）。
- $D_{\text{limit}}$ (敵固有破壊率上限): 敵固有の破壊率上限値（例: 300% の場合 $3.00$）。
  - 算出式: $\text{max\_d\_rate} / 100$（倍率表記）。マスタデータの `max_d_rate` は破壊率上限をそのままパーセントで保持している（例: `max_d_rate=150` → $1.5$、すなわち上限150%）。
- $\text{destructionLimitExceedBonus}$ (上限超越補正): 超ブレイク・強ブレイク等の効果による、破壊率上限の追加拡張値（デフォルトは $0.0$）。
- $DP_{\text{init}}$ (攻撃前敵DP): 敵の残りDP。
- ヒットリスト: 各ヒット $i$ の情報（ダメージ $dmg_i$、break 指定など）。

### アルゴリズム

1. $D_{\text{current}} = D_{\text{init}}$
2. $\text{dmg\_accum} = 0$
3. 配分用の総ヒット数を $h = h_{\text{base}} + h_{\text{funnel}}$ とし、Funnel 連撃倍率を $M_{\text{funnel}} = 1 + \text{funnelRate} \times \text{funnelHitCount}$ とする。
4. **最終破壊率上限の決定**:
   敵固有の破壊上限値に上限超越補正を加算します。
   $$D_{\text{limit\_final}} = D_{\text{limit}} + \text{destructionLimitExceedBonus}$$
5. 各ヒット $i$ に対し、以下の処理を順に適用する：

   - $\text{dmg\_accum} = \text{dmg\_accum} + dmg_i$
   - **ブレイク判定**: $\text{dmg\_accum} \ge DP_{\text{init}}$ の場合、そのヒットは有効ヒットとする。
   - **破壊率加算量 $add_i$ の計算**:
     - 有効ヒットでない場合:
       $$add_i = 0.0$$
     - 有効ヒットの場合:
       $$add_i = \frac{D_{\text{final\_base}} \times M_{\text{funnel}}}{h}$$

   - **累積値の更新と上限クランプ**:
     $$D_{\text{current}} = \min(D_{\text{limit\_final}}, D_{\text{current}} + add_i)$$

6. 全ヒット処理完了後の $D_{\text{current}}$ が、最終的な「攻撃後の破壊率」となります。

---

## 4. 入力インターフェース設計方針

### アクセサリー補正の渡し方

`calculateDestruction()` はアクセサリーの**名称文字列**（`accessories: ['BlastPierce']` 等）を受け取りません。

呼び出し側が装備内容を解決し、補正値を **数値** で渡してください：

```js
// ✅ 正しい使い方
calculateDestruction({
  attacker: {
    styleId: 2,
    accessoryDestructionRateBonus: 0.15, // ブラストピアス装備時
  },
  // ...
}, data);

// ❌ 誤った使い方（文字列マッチは廃止済み）
calculateDestruction({
  attacker: {
    styleId: 2,
    accessories: ['BlastPierce'], // エンジン内では参照されない
  },
  // ...
}, data);
```

### 廃止の理由

`accessories` 配列の文字列名による暗黙判定（`accessories.includes('BlastPierce')`）は廃止しました。理由は以下の通りです：

1. **誤検出リスク**: アクセサリー名の表記揺れ（日本語/英語、略称等）で検出漏れが発生しうる
2. **保守性の問題**: アクセサリー種類が増えるたびにエンジン内の文字列定数を更新しなければならない
3. **責務の分離**: エンジンは純粋な数値計算に徹し、「どのアクセサリーが何%の補正をもたらすか」の解決は呼び出し側（テストランナー・UIレイヤー等）が担う

### アクセサリー補正値の管理について

具体的な補正値（`accessoryDestructionRateBonus` に渡す数値）は、アクセサリーの種類・ランクによって異なります。エンジンはこれらの対応関係を持ちません。呼び出し側（UIレイヤー・テストランナー等）が装備情報から補正値を解決して渡してください。

---

## 4. 将来の課題 (WIP)

### ① ヒットごとの破壊率累積とダメージ計算の連動
* **背景と課題**: 
  * 現在のダメージ計算エンジンは、スキル発動時点の敵の破壊率を一律で使用して総ダメージを計算します。
  * しかし、実際のゲーム内および `hbr-tool.com` の詳細シミュレーションでは、ヒットごとにダメージと破壊率上昇が順番に計算されます。
  * これにより、多段ヒット攻撃の2ヒット目以降は、1ヒット目によって上昇した新たな破壊率補正（`BreakRate`）を受けてダメージが増加します。
* **対応ロードマップ**:
  1. 現在の「静的破壊率」による基本ダメージ計算および破壊率の最終累積ロジックの精度検証を完了させる。
  2. 将来的な機能拡張（WIP）として、ダメージ算出ループ内でヒットごとに「ダメージ確定 → 敵の被ダメージ累積 → 被破壊率上昇・反映 → 次のヒットのダメージ計算」をシミュレートする動的連動エンジンを構築する。

> 注: 2026-06-14 に Issue #18 の根本修正として、通常攻撃の破壊率上昇を `calculateDestruction` 内で **enemy raw d_rate / 100**（超越ゲージ100%で×1.10）へ統一した。turn-controller 側の通常攻撃専用バイパスは削除し、威力詳細プレビューも同じ計算機経路を使用する。
