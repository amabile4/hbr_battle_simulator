# 共鳴アビリティ パラメータ接続 残タスク

> **ステータス**: 🟢 進行中 | 📅 作成: 2026-06-13 | 最終更新: 2026-06-13

## 経緯

サポート枠の共鳴アビリティ（`json/support_skills.json`、全25グループ・skill_type 15種）について、
シミュレータ計算への接続状況を監査した（2026-06-13、gemini調査 + claude/codex検証）。
接続済みを除いた未接続分を本書で残タスクとして管理する。

関連: [pierce_equipment_implementation.md](pierce_equipment_implementation.md)（DamageRateUp=破壊率上昇量+ の接続記録）

## 接続済み（A: 対応不要・9種）

AttackUp / DamageRateUp（`resonanceDestructionRateBonus`、2026-06-13接続） /
OverDrivePointUp（ターン開始時・ブレイク時の2系統） / AdditionalHitOnBreaking /
AdditionalHitOnHealedSpWithoutSelfHeal / HealDpRate / Morale / Mocktail

- ステータス+: 全25グループの `parts[].parameters` に非ゼロ値なし。
  サポート基本ステータス10%加算（`resolveStatsWithSupport`）で過不足なし（共鳴固有のステータス直接補正は存在しない）。

## 残タスク

いずれも供給側（turn-controller）の実装で完結し、計算機コア（hbr_calc 管轄の
`damage-calculator.js` / `destruction-calculator.js`）の変更は不要。

### 優先度: 高（与ダメージ計算に直結）

- [ ] **GiveAttackBuffUp**（4グループ・分類C: 完全未接続）
  - 意味: 自身がかけるスキル攻撃力バフの効果量+
  - 現状: turn-controller:12500 付近でイベント集計（ログ）のみ
  - 接続案: `resolvePassiveGiveAttackBuffUpForMember` を新設し、
    バフ付与倍率を計算する `resolveAttackBuffSkillEffectMultiplier`（turn-controller:1429 付近）へマージ
- [ ] **GiveDefenseDebuffUp**（3グループ・分類C: 完全未接続）
  - 意味: 自身がかける防御デバフの効果量+
  - 現状: turn-controller:12498 付近でイベント集計（ログ）のみ
  - 接続案: `resolvePassiveGiveDefenseDebuffUpForMember` を新設し、
    デバフ付与倍率を計算する `resolveEnemyDebuffSkillEffectMultiplier`（turn-controller:1442 付近）へマージ

### 優先度: 中（行動計画に直結）

- [ ] **SkillLimitCountUp**（1グループ・分類B: ログのみ）
  - 意味: ダメージスキル使用回数+1
  - 現状: turn-controller:13631 付近で「tracked state を変えない」としてログ扱い
  - 接続案: キャラクターのスキル使用可能回数にマージし、スキル実行時に消費させる

### 優先度: 低（被ダメージ計算が主用途／影響軽微）

- [ ] **DefenseUp**（2グループ・分類B: ログのみ）
  - 意味: 自身の防御力上昇
  - 接続案: 被ダメージシミュレーション実装時に `resolvePassiveDefenseUpForMember` を新設して適用
- [ ] **BIYamawakiServant**（1グループ・分類B: 状態付与のみ）
  - 意味: 自身をしもべ状態(155)にする
  - 現状: 状態は付与されるが「防御力+10%」効果が実計算に未反映
  - 接続案: 被ダメージ計算時に状態(155)を判定して防御補正にマージ
- [ ] **RemoveSpecialStatus**（1グループ・分類C: 未接続）
  - 意味: スタン解除
  - 接続案: 発動評価時に `target.removeStatusEffectsWhere` 相当で実際に状態異常をクリアする

### 対象外（接続不要で確定）

- **HealSkillUsedCount**（4グループ）: バトル勝利時（OnBattleWin）の属性スキル回数回復。
  バトル中のみを扱う本シミュレータでは未接続のままで可。

## 実装時の規約

- 計算機コア（`src/domain/damage-calculator.js` 等）は hbr_calc 管轄のため編集禁止（AGENTS.md 参照）
- `json/` 配下は1行minified JSONのため grep 不可。jq / node のJSONパーサーを使う
- 既存の支援パッシブ評価（`resolvePassiveAttackUpForMember` /
  `resolvePassiveResonanceDestructionRateBonusForMember`）の流儀に合わせる
