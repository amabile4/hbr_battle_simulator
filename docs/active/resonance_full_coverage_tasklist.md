# 共鳴アビリティ全件テストカバレッジ タスクリスト

> **ステータス**: ✅ 完了 | 📅 最終更新: 2026-03-11

## 目的

`support_skills.json` の全21グループについて、共鳴アビリティが正しくパッシブとして発火することをテストで保証する。

## 対象ファイル

- **新規テストファイル**: `tests/support-skills-resonance-full-coverage.test.js`

## 設計方針

- 既存テストで確認済みの5グループ（31A / 31C / 31D / ADate01 / CSugahara01）は本ファイルでは重複させない
- 各テストは「passiveLogEntries にパッシブ名が含まれること」を基本とする
- silent-skip 仕様（Mocktail / HealSkillUsedCount）は「ログに出ない」ことを確認するネガティブテストまたはドメインレベル確認に切り替える
- 条件付きパッシブ（DpRate 条件）は正常発火・不発の両方を確認する
- Turn()<=3 条件は現在 unknown（未実装）として true 評価されるため、毎ターン発動する挙動を記録する
- AdditionalHit系パッシブ（31X / IRedmayne01）はタイミングパイプラインで silent-skip のため、ドメインレベル確認に切り替える
- 共通ユーティリティ `pickFiveUniqueOthers(store, excludeCharaLabels)` をファイル内に定義する

## テスト一覧（全22テスト）

### グループ: 31B — Love and Peace（OnEveryTurn + DefenseUp）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T01 | 31B (Love and Peace) OnEveryTurn で commitCurrentTurn 後に passiveLogEntries に記録されること | passiveLogEntries に "Love and Peace" が含まれる | commitCurrentTurn | main=1001103 / support=1002107 |
| T02 | 31B (Love and Peace) Turn()<=3 の境界: T3 でも発動すること | T3でcommit後も "Love and Peace" が含まれる | 3ターンコミット後 | 同上 |
| T03 | 31B (Love and Peace) OnEveryTurn が複数ターンにわたって継続発動すること（Turn()条件は unknown のため毎ターン発動） | T5コミット後もT4より件数が増える | 5ターンコミット後 | 同上 |

### グループ: 31E — Get it together!（OnPlayerTurnStart + GiveDefenseDebuffUp）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T04 | 31E (Get it together!) OnPlayerTurnStart で initializeBattle 後 T1 開始時に passiveLogEntries に記録されること | passiveLogEntries に "Get it together!" が含まれる | initializeBattle | main=1001104 / support=1006104 |

### グループ: 31F — We Live Better（OnPlayerTurnStart + GiveAttackBuffUp）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T05 | 31F (We Live Better) OnPlayerTurnStart で initializeBattle 後 T1 開始時に passiveLogEntries に記録されること | passiveLogEntries に "We Live Better" が含まれる | initializeBattle | main=1001103 / support=1007104 |

### グループ: 30G — Faith（OnFirstBattleStart + Morale）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T06 | 30G (Faith) OnFirstBattleStart で initializeBattle 後に passiveLogEntries に記録されること | passiveLogEntries に "Faith" が含まれる | initializeBattle | main=1001108 / support=1004106 |

### グループ: 31X — Excelsior!（OnFirstBattleStart + AdditionalHitOnBreaking + OverDrivePointUp）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T07 | 31X (Excelsior!) buildCharacterStyle の passives に OnFirstBattleStart タイミングのパッシブが含まれること（AdditionalHit系はsilent-skip） | passives に timing="OnFirstBattleStart" / name="Excelsior!" が含まれる | ドメインレベル | support=1008105 |

### グループ: SupportSkill_MSatsuki01 — 暗躍（OnPlayerTurnStart + AttackUp）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T08 | SupportSkill_MSatsuki01 (暗躍) OnPlayerTurnStart で initializeBattle 後 T1 開始時に passiveLogEntries に記録されること | passiveLogEntries に "暗躍" が含まれる | initializeBattle | main=1001103 / support=1003607 |

### グループ: SupportSkill_VBalakrishnan01 — ムクワス（OnBattleWin + HealSkillUsedCount）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T09 | SupportSkill_VBalakrishnan01 (ムクワス) buildCharacterStyle の passives に OnBattleWin タイミングのパッシブが含まれること | passives に timing="OnBattleWin" / name="ムクワス" が含まれる | ドメインレベル | support=1008406 |

> **補足**: `HealSkillUsedCount` はタイミングパイプライン外で処理（silent-skip）のため passiveLogEntries には表示されない。パッシブが正しく注入されていることをドメインレベルで確認する。

### グループ: SupportSkill_CSkopovskaya01 — ザクースカ（OnBattleWin + HealSkillUsedCount）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T10 | SupportSkill_CSkopovskaya01 (ザクースカ) buildCharacterStyle の passives に OnBattleWin タイミングのパッシブが含まれること | passives に timing="OnBattleWin" / name="ザクースカ" が含まれる | ドメインレベル | support=1008607 |

### グループ: SupportSkill_SMinase01 — つめとぎ（OnPlayerTurnStart + AttackUp）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T11 | SupportSkill_SMinase01 (つめとぎ) OnPlayerTurnStart で initializeBattle 後 T1 開始時に passiveLogEntries に記録されること | passiveLogEntries に "つめとぎ" が含まれる | initializeBattle | main=1001111 / support=1002307 |

### グループ: SupportSkill_IrOhshima01 — 素敵な夜（OnBattleStart + Mocktail）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T12 | SupportSkill_IrOhshima01 (素敵な夜) Mocktail は action-time modifier のため initializeBattle 後 passiveLogEntries に表示されないこと | passiveLogEntries に "素敵な夜" が含まれない（silent-skip仕様確認） | initializeBattle | main=1001108 / support=1006506 |

### グループ: SupportSkill_IRedmayne01 — Q.E.D.（OnFirstBattleStart + AdditionalHitOnHealedSpWithoutSelfHeal + OverDrivePointUp）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T13 | SupportSkill_IRedmayne01 (Q.E.D.) buildCharacterStyle の passives に OnFirstBattleStart タイミングのパッシブが含まれること（AdditionalHit系はsilent-skip） | passives に timing="OnFirstBattleStart" / name="Q.E.D." が含まれる | ドメインレベル | support=1008307 |

### グループ: SupportSkill_TTojo01 — フィーバー・サマータイム（OnPlayerTurnStart + GiveAttackBuffUp, DpRate()>=0.5 条件）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T14 | SupportSkill_TTojo01 (フィーバー・サマータイム) DP 50% 以上のとき passiveLogEntries に記録されること | passiveLogEntries に "フィーバー・サマータイム" が含まれる | initializeBattle（initialDp=1.0） | main=1001104 / support=1001404 |
| T15 | SupportSkill_TTojo01 (フィーバー・サマータイム) DP 50% 未満のとき passiveLogEntries に記録されないこと | passiveLogEntries に "フィーバー・サマータイム" が含まれない | initializeBattle（initialDp=0.49） | 同上 |

### グループ: SupportSkill_MTenne01 — 毛づくろい（OnOverdriveStart + GiveDefenseDebuffUp）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T16 | SupportSkill_MTenne01 (毛づくろい) OnOverdriveStart で OD 開始後に passiveLogEntries に記録されること | passiveLogEntries に "毛づくろい" が含まれる | confirmOdDialog | main=1001111 / support=1003304 |

### グループ: SupportSkill_IMinase01 — ライブ・ブースト（OnPlayerTurnStart + AttackUp）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T17 | SupportSkill_IMinase01 (ライブ・ブースト) OnPlayerTurnStart で initializeBattle 後 T1 開始時に passiveLogEntries に記録されること | passiveLogEntries に "ライブ・ブースト" が含まれる | initializeBattle | main=1001104 / support=1002204 |

### グループ: SupportSkill_YIzumi01 — ディスチャージ（OnPlayerTurnStart + GiveDefenseDebuffUp, DpRate()>=0.5 条件）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T18 | SupportSkill_YIzumi01 (ディスチャージ) DP 50% 以上のとき passiveLogEntries に記録されること | passiveLogEntries に "ディスチャージ" が含まれる | initializeBattle（initialDp=1.0） | main=1001107 / support=1001205 |
| T19 | SupportSkill_YIzumi01 (ディスチャージ) DP 50% 未満のとき passiveLogEntries に記録されないこと | passiveLogEntries に "ディスチャージ" が含まれない | initializeBattle（initialDp=0.49） | 同上 |

### グループ: SupportSkill_BIYamawaki01 — 忠義（OnFirstBattleStart + BIYamawakiServant + DefenseUp）

| # | テスト名 | 確認内容 | トリガー | スタイルID |
|---|---------|---------|---------|-----------|
| T20 | SupportSkill_BIYamawaki01 (忠義) OnFirstBattleStart で initializeBattle 後に passiveLogEntries に記録されること | passiveLogEntries に "忠義" が含まれる（DefenseUp part が発動）| initializeBattle | main=1001103 / support=1003109 |
| T21 | SupportSkill_BIYamawaki01 (忠義) passiveEvents に defenseUpRate が記録されること | passiveEventsLastApplied の "忠義" エントリに defenseUpRate > 0 が含まれる | initializeBattle | 同上 |
| T22 | SupportSkill_BIYamawaki01 (忠義) BIYamawakiServant は silent-skip のため passiveLogEntries の "忠義" エントリに characterName が正しく設定されること | passiveLogEntries の "忠義" エントリの characterName がメインキャラ名と一致する | initializeBattle | 同上 |

---

## 使用スタイルID まとめ

| グループ | サポートStyleId | サポートキャラ | 属性 | メインStyleId | メイン属性 |
|---------|---------------|-------------|-----|--------------|----------|
| 31B | 1002107 | EAoi | 無属性 | 1001103 | 無属性(SS) |
| 31E | 1006104 | IcOhshima | Fire | 1001104 | Fire(SS) |
| 31F | 1007104 | MYanagi | 無属性 | 1001103 | 無属性(SS) |
| 30G | 1004106 | YShirakawa | Dark | 1001108 | Dark+Fire(SSR) |
| 31X | 1008105 | CReaper | Fire | 1001104 | Fire(SS) |
| MSatsuki01 | 1003607 | MSatsuki | 無属性 | 1001103 | 無属性(SS) |
| VBalakrishnan01 | 1008406 | VBalakrishnan | Ice | 1001111 | Ice(SSR) |
| CSkopovskaya01 | 1008607 | CSkopovskaya | Fire | 1001104 | Fire(SS) |
| SMinase01 | 1002307 | SMinase | Ice | 1001111 | Ice(SSR) |
| IrOhshima01 | 1006506 | IrOhshima | Dark | 1001108 | Dark+Fire(SSR) |
| IRedmayne01 | 1008307 | IRedmayne | 無属性 | 1001103 | 無属性(SS) |
| TTojo01 | 1001404 | TTojo | Fire | 1001104 | Fire(SS) |
| MTenne01 | 1003304 | MTenne | Ice | 1001111 | Ice(SSR) |
| IMinase01 | 1002204 | IMinase | Fire | 1001104 | Fire(SS) |
| YIzumi01 | 1001205 | YIzumi | Thunder | 1001107 | Thunder(SS) |
| BIYamawaki01 | 1003109 | BIYamawaki | 無属性 | 1001103 | 無属性(SS) |

---

## 実装チェックリスト

- [x] `tests/support-skills-resonance-full-coverage.test.js` 新規作成
  - [x] `pickFiveUniqueOthers(store, excludeCharaLabels)` ユーティリティ定義
  - [x] T01 31B OnEveryTurn 発火確認
  - [x] T02 31B Turn()<=3 T3発動確認
  - [x] T03 31B OnEveryTurn 継続発動確認（Turn()条件はunknown評価）
  - [x] T04 31E OnPlayerTurnStart 発火確認
  - [x] T05 31F OnPlayerTurnStart 発火確認
  - [x] T06 30G OnFirstBattleStart 発火確認
  - [x] T07 31X ドメインレベル確認（AdditionalHit系はsilent-skip）
  - [x] T08 MSatsuki01 OnPlayerTurnStart 発火確認
  - [x] T09 VBalakrishnan01 ドメインレベル確認
  - [x] T10 CSkopovskaya01 ドメインレベル確認
  - [x] T11 SMinase01 OnPlayerTurnStart 発火確認
  - [x] T12 IrOhshima01 silent-skip 確認
  - [x] T13 IRedmayne01 ドメインレベル確認（AdditionalHit系はsilent-skip）
  - [x] T14 TTojo01 DP高（発火）確認
  - [x] T15 TTojo01 DP低（不発）確認
  - [x] T16 MTenne01 OnOverdriveStart 発火確認
  - [x] T17 IMinase01 OnPlayerTurnStart 発火確認
  - [x] T18 YIzumi01 DP高（発火）確認
  - [x] T19 YIzumi01 DP低（不発）確認
  - [x] T20 BIYamawaki01 passiveLogEntries 発火確認
  - [x] T21 BIYamawaki01 defenseUpRate 値確認
  - [x] T22 BIYamawaki01 characterName 確認
- [x] `npm test` 全件 PASS 確認（全468テスト PASS）
- [x] `docs/README.md` ステータス更新
