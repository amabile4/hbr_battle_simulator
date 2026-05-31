# 威力詳細 未掲載要素 WBS

> **ステータス**: 🟢 進行中 | **最終更新**: 2026-05-31

## 目的

現在の威力詳細パネル（v1）に掲載されていないが、ダメージ計算に関与する要素を洗い出し、  
実装優先度と分類を整理する。Claude と Codex の協議結果を反映済み（2026-05-31）。

## 分類基準

| 記号 | 意味 |
|---|---|
| **A** | 追加実装対象 — 倍率として明確に表示価値があり、設計上の障壁がない |
| **B** | 将来対応 — 前提となるデータ基盤が未整備 |
| **C** | 意図的スコープ外 — 表示不要、または別箇所で代替できる / 二重計上リスクあり |
| **D** | 要設計 — 表示すべきだが実装前に設計が必要なもの |

---

## 1. 攻撃バフ枠（buff group）への追加候補

| 要素 | フィールド | 分類 | 備考 |
|---|---|---|---|
| 食事バフ攻撃力アップ | `foodBuffAttackUpRate` | **A** | `damageContext` に送られているが breakdown 未掲載。食事ステータスの statusType は Curry/Steak 等であり `collectAttackBuffContributions` では拾われないため、個別フィールドとして追加するのが正しい |
| ハイブーストパッシブ攻撃力 | `highBoostSkillAtkRate` | **A** | `resolveHighBoostModifiersForMember` が数値のみ返すが、ラベルを「ハイブースト」固定にすれば十分表示可能。源泉名を持たせる設計への移行は Priority 2 以降で行う |
| パッシブ固定攻撃力アップ合算 | `attackUpRate` | **C** | `activeStatusEffects.AttackUp + specialAttackUp + markAttackUp + attackUpPerToken + babied + diva + food` の合算値。既表示済み要素と **二重計上** になるため、この合算値をそのまま表示してはならない。個別 source 付き contribution へ分解できた場合のみ再検討 |

## 2. トークン・固有枠（token-passive group）への追加候補

| 要素 | フィールド | 分類 | 備考 |
|---|---|---|---|
| トークン連動ダメージアップ | `damageRateUpPerTokenRate` | **A** | `damageRateUpRate` として `specialPassiveModifiers` に存在。既存の `tokenAttackTotalRate`（トークン攻撃倍率）とは別効果なので独立した枠として表示 |
| マーク必殺技倍率アップ | `markDevastationRateUp` | **D** | token-passive 枠への配置が適切（ラベル案: 「固有マーク必殺技倍率」）。ただし `damageContext` は値のみ保持しており、必殺技スキルにのみ適用されるという条件を表示側が判定する必要がある。`isDevastationSkill` フラグを `damageContext` に追加してから対応 |

## 3. 敵デバフ枠（debuff group）への追加候補

| 要素 | フィールド | 分類 | 備考 |
|---|---|---|---|
| 全能力ダウン合算値 | `enemyAllAbilityDownByEnemy` | **A** | `buildEnemyAllAbilityPenaltyMaps` 内で Talisman / Disaster のうち高い方を採用した合算値。debuff 枠に直接追加可能。**注意**: percent 形式（例: 30 = 30%）なので contribution.value へ渡す際は `/100` する |
| タリスマンレベル | `enemyTalismanLevelByEnemy` | **C** | `enemyAllAbilityDownByEnemy` に Talisman が既に含まれており内訳として重複する。レベル数値→能力ダウン率の換算が別途必要なため、合算値表示で代替する |
| 災難レベル | `enemyDisasterLevelByEnemy` | **C** | 同上。Talisman/Disaster のうち高い方のみが採用されるため、合算値 `enemyAllAbilityDownByEnemy` で代替する |

## 4. DP条件詳細

| 要素 | フィールド | 分類 | 備考 |
|---|---|---|---|
| 低DP倍率・高DP倍率・基準DP | `attackByOwnDpRateLowDpMultiplier` 等 | **C** | `resolvedMultiplier` は token-passive 枠で既表示。詳細はツールチップ拡張の設計を別途行ってから対応。v1 スコープ外で妥当 |

## 5. アクセサリ補正

| 要素 | フィールド | 分類 | 備考 |
|---|---|---|---|
| アクセサリ攻撃力アップ | `accessoryAttackUpRate` | **B** | v1 で意図的に 0 固定。アクセサリデータ基盤整備後に対応 |
| アクセサリ個別補正 | `accessoryContributions` | **B** | 同上。interface（フィールドと contribution shape）は v1 で用意済み |

## 6. 意図的スコープ外（ダメージ倍率に直接関与しない概念）

| 要素 | フィールド | 分類 | 理由 |
|---|---|---|---|
| 自己防御力アップ | `defenseUpRate` | **C** | 被ダメ計算用。攻撃ダメージ倍率への経路なし（将来「防御力→攻撃転換」系が来た場合は別フィールドで扱う） |
| 防御力トークン連動 | `defenseUpPerTokenRate` | **C** | 同上 |
| マークダメージ軽減 | `markDamageTakenDownRate` | **C** | 被ダメ側。威力詳細の対象外 |
| OD増加量アップ | `babiedOdGaugeGainUpRate` | **C** | OD管理用。ダメージ倍率ではない |
| 食事バフDP回復率 | `foodBuffHealDpByDamageRate` | **C** | ダメージ由来の回復量。威力倍率ではない |
| ヒット数詳細 | `baseHitCount` / `funnelHitBonus` / `effectiveHitCountPerEnemy` | **C** | OD 計算用内部値。倍率表示の構成要素ではない |

## 7. criticalRateBreakdown で既表示（追加不要）

| 要素 | フィールド | 分類 | 備考 |
|---|---|---|---|
| クリティカル確率アップ | `criticalRateUpRate` | **C** | criticalRateBreakdown 内で既に表示 |
| 貫通クリティカル | `hasPenetrationCritical` | **C** | 同上 |

---

## 実装優先度

### Priority 1（次バージョンで対応推奨）

データが揃っており、`damageBreakdownInput` へ 1 フィールドを追加するだけで掲載できるもの：

- [ ] `foodBuffAttackUpRate` → buff 枠に「食事バフ攻撃力」として追加（`damageBreakdownInput` に渡し、`collectAttackBuffContributions` で個別処理）
- [ ] `highBoostSkillAtkRate` → buff 枠に「ハイブースト」として追加（ラベル固定）
- [ ] `damageRateUpPerTokenRate` → token-passive 枠に「トークン連動ダメージアップ」として追加
- [ ] `enemyAllAbilityDownByEnemy` → debuff 枠に「全能力ダウン」として追加（`/100` 変換を忘れずに）

### Priority 2（設計確定後）

実装前に `damageContext` フィールドまたは表示設計の追加が必要なもの：

- [ ] `markDevastationRateUp` → token-passive 枠「固有マーク必殺技倍率」として追加。`damageContext` に `isDevastationSkill: boolean` を追加してから
- [ ] `highBoostSkillAtkRate` の source 付き contribution 化 → `resolveHighBoostModifiersForMember` が sourceSkillName を返せるよう改修後
- [ ] タリスマン・災難の内訳表示（任意）→ `enemyAllAbilityDownByEnemy` の内訳として level/rate 変換設計後

### Priority 3（将来対応）

前提となるデータ基盤または UI 設計が必要なもの：

- [ ] `accessoryAttackUpRate` / `accessoryContributions` → アクセサリデータ基盤整備後
- [ ] DP 条件詳細（低・高倍率）→ ツールチップ設計後

---

## 協議記録（2026-05-31）

- `attackUpRate` はスキルバフ AttackUp / markAttackUp / attackUpPerToken / babied / diva / food の **合算値** であり、これをそのまま表示すると既表示済み項目との二重計上が発生する。表示対象から除外することを Claude / Codex 双方で確認。
- `enemyAllAbilityDownByEnemy` は `buildEnemyAllAbilityPenaltyMaps` 内で Talisman / Disaster のうち高い方を採用した合算値。Talisman と Disaster を個別に加算しない方針。
- `markDevastationRateUp` の配置は crit-mindeye ではなく token-passive（固有マーク系）が適切であることを Codex が提案し確定。
- `defenseUpRate` が攻撃ダメージ倍率に影響しないことをコードレベルで確認済み。
