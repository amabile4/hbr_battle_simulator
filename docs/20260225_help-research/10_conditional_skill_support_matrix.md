# Conditional Skill Support Matrix

Generated: 2026-03-01T14:35:27.528Z

## Summary
- 条件付きスキル総数: 168
- 対応: 59
- 一部対応: 10
- 未対応: 99

## Prioritized Runtime Coverage (Turn Controller)
- スキル使用可否: `skill.cond` / `skill.iuc_cond`（認識できる式のみ強制）
- OD増減: `OverDrivePointUp/Down` の `cond/hit_condition/target_condition`（認識式対応）
- SP/EP増減: 該当パーツの条件式を認識できる範囲で評価
- 追加ターン: 追加ターン付与の可否判定で条件を評価

## Supported Expression Patterns
- `PlayedSkillCount(...) <op> N`
- `BreakHitCount() <op> N`
- `SpecialStatusCountByType(20) <op> N`
- `OverDriveGauge() <op> N`
- `Sp() <op> N`
- `IsOverDrive()` / `IsOverDrive()<op>N`
- `IsReinforcedMode()` / `IsReinforcedMode()<op>N`
- `CountBC(...) <op> N` の一部（`IsPlayer()` / `IsFront()==0&&IsPlayer()` / ExtraTurn系）

## Skill List
| status | id | chara | skill | cond_supported/total | conditions |
|---|---:|---|---|---:|---|
| 未対応 | 46001113 | 茅森 月歌 | 黒曜のオーバーロード | 0/2 | [unsupported] part.cond(DamageRateChangeAttackSkill): IsHitWeak()<br>[unsupported] part.cond(DamageRateChangeAttackSkill): IsHitWeak() |
| 未対応 | 46001117 | 茅森 月歌 | 月光 | 0/1 | [unsupported] part.cond(SkillCondition): SpecialStatusCountByType(144) > 0 |
| 未対応 | 46001121 | 茅森 月歌 | 燃やせ青春！マリンボール！ | 0/2 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && IsCharacter(RKayamori) == 1 && MotivationLevel() == 5)>0<br>[unsupported] part.cond(SkillCondition): MotivationLevel()>=4 |
| 対応 | 46001130 | 茅森 月歌 | 先導のカリスマ | 1/1 | [supported] part.hit_condition(AdditionalTurn): SpecialStatusCountByType(20)==0 |
| 対応 | 46001131 | 茅森 月歌 | アーク・オブ・ヴィクトリア | 1/1 | [supported] part.cond(SkillCondition): IsOverDrive() |
| 未対応 | 46001161 | 茅森 月歌 | 星火燎原+ | 0/1 | [unsupported] part.cond(SkillCondition): CountBC(IsPlayer() &&IsTeam(31A)==1)>=3 |
| 対応 | 46001206 | 和泉 ユキ | 流星 | 1/1 | [supported] part.hit_condition(HealSp): BreakHitCount()>0 |
| 未対応 | 46001212 | 和泉 ユキ | 光輝の夜明け | 0/2 | [unsupported] part.cond(SuperBreak): IsHitWeak()<br>[unsupported] part.cond(SuperBreak): IsHitWeak() |
| 対応 | 46001213 | 和泉 ユキ | 仮面のワルツ | 1/1 | [supported] part.hit_condition(HealSkillUsedCount): BreakHitCount()>0 |
| 対応 | 46001261 | 和泉 ユキ | 流星+ | 1/1 | [supported] part.hit_condition(HealSp): BreakHitCount()>0 |
| 未対応 | 46001314 | 逢川 めぐみ | まだまだ行くで！ | 0/1 | [unsupported] skill.cond: 0.0<DpRate() |
| 未対応 | 46001315 | 逢川 めぐみ | 最高潮！アオハルオンステージ | 0/2 | [unsupported] part.target_condition(ResistDown): IsWeakElement(Ice)==1<br>[unsupported] part.target_condition(ResistDown): IsWeakElement(Thunder)==1 |
| 未対応 | 46001361 | 逢川 めぐみ | リミット・インパクト+ | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer() &&IsTeam(31A)==1)>=3 |
| 未対応 | 46001411 | 東城 つかさ | 今宵、快楽ナイトメア | 0/1 | [unsupported] part.target_condition(Funnel): IsNatureElement(Dark)==1 |
| 未対応 | 46001509 | 朝倉 可憐 | 破壊のシニシズム | 0/1 | [unsupported] part.cond(DamageRateChangeAttackSkill): IsHitWeak() |
| 未対応 | 46001512 | 朝倉 可憐 | フグリングクラッシュ | 0/1 | [unsupported] part.cond(DamageRateChangeAttackSkill): IsHitWeak() |
| 未対応 | 46001516 | 朝倉 可憐 | ブラッディ・バーン | 0/2 | [unsupported] part.cond(DamageRateChangeAttackSkill): TargetBreakDownTurn()>0<br>[unsupported] part.cond(DamageRateChangeAttackSkill): TargetBreakDownTurn()>0 |
| 未対応 | 46001523 | 朝倉 可憐 | シンメトリー・リベレーション | 0/2 | [unsupported] skill.overwrite_cond: CountBC(IsDead()==0 && IsPlayer()==0&&SpecialStatusCountByType(172)>0)>0<br>[unsupported] part.cond(SkillCondition): CountBC(IsDead()==0 && IsPlayer()==0&&SpecialStatusCountByType(172)>0)>0 |
| 未対応 | 46001561 | 朝倉 可憐 | ブラッディ・ダンス+ | 0/1 | [unsupported] skill.overwrite_cond: CountBC(PlayedSkillCount(KAsakuraSkill51Ev1)>0)==0 |
| 未対応 | 46001707 | 國見 タマ | リバイブ・ヴェール | 0/1 | [unsupported] part.target_condition(HealSp): IsNatureElement(Fire)==1 |
| 未対応 | 46001712 | 國見 タマ | カレイド・レインシャワー | 0/1 | [unsupported] part.target_condition(HealSp): IsNatureElement(Light)==1 |
| 対応 | 46001713 | 國見 タマ | デヴォーション | 1/1 | [supported] skill.cond: CountBC(IsFront()==0&&IsPlayer())>0 |
| 未対応 | 46001716 | 國見 タマ | 秘技！霊符トルネード | 0/2 | [unsupported] skill.iuc_cond: CountBC(IsPlayer()==0&&IsDead()==0&&BreakDownTurn()>0)>0<br>[unsupported] skill.overwrite_cond: CountBC(IsPlayer()==0 && IsDead()==0 && BreakDownTurn()>0)>0 |
| 未対応 | 46002108 | 蒼井 えりか | アイドルスマイル | 0/1 | [unsupported] part.cond(DamageRateChangeAttackSkill): IsHitWeak() |
| 未対応 | 46002109 | 蒼井 えりか | ダンスインザブルー | 0/1 | [unsupported] part.target_condition(HealSp): IsNatureElement(Fire)==1 |
| 対応 | 46002110 | 蒼井 えりか | アクセラレーション | 1/1 | [supported] skill.cond: CountBC(IsPlayer())>1 |
| 未対応 | 46002114 | 蒼井 えりか | くぎづけ♡ラブリービーム | 0/3 | [unsupported] skill.iuc_cond: MoraleLevel()>=10<br>[unsupported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && IsCharacter(EAoi) == 1 && MoraleLevel() >= 6)>0<br>[unsupported] part.cond(SkillCondition): MoraleLevel()<=5 |
| 未対応 | 46002126 | 蒼井 えりか | 未来へ繋ぐ蒼の意志 | 0/1 | [unsupported] part.target_condition(Funnel): IsNatureElement(Ice)==1 |
| 未対応 | 46002210 | 水瀬 いちご | 掴め栄冠！グランドスラム！ | 0/1 | [unsupported] part.target_condition(Funnel): IsNatureElement(Light)==1 |
| 未対応 | 46002261 | 水瀬 いちご | スパークル・トライショット+ | 0/1 | [unsupported] part.cond(SkillCondition): CountBC(IsPlayer()==0&&SpecialStatusCountByType(12)>0)>0\|\|CountBC(IsPlayer()==0&&SpecialStatusCountByType(57)>0)>0 |
| 対応 | 46002303 | 水瀬 すもも | 風斬りの刃 | 1/1 | [supported] part.cond(SkillCondition): PlayedSkillCount(SMinaseSkill02)==0 |
| 未対応 | 46002307 | 水瀬 すもも | ヘイルストーム | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && IsCharacter(SMinase) == 1 && SpecialStatusCountByType(122)>0)>0 |
| 未対応 | 46002309 | 水瀬 すもも | ロココ・デストラクション | 0/1 | [unsupported] skill.overwrite_cond: CountBC(PlayedSkillCount(SMinaseSkill53)>0)==0 |
| 未対応 | 46002311 | 水瀬 すもも | キャッツアイ | 0/1 | [unsupported] skill.overwrite_cond: CountBC(PlayedSkillCount(SMinaseSkill06)>0)==0 |
| 未対応 | 46002361 | 水瀬 すもも | スパークル・トライエッジ+ | 0/2 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(12)>0)>0\|\|CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(57)>0)>0<br>[unsupported] part.cond(SkillCondition): CountBC(IsPlayer()==0&&SpecialStatusCountByType(12)>0)>0\|\|CountBC(IsPlayer()==0&&SpecialStatusCountByType(57)>0)>0 |
| 未対応 | 46002412 | 樋口 聖華 | イルミネイトラボ | 0/2 | [unsupported] part.target_condition(AttackUp): IsNatureElement(Dark)==1<br>[unsupported] part.target_condition(MindEye): IsNatureElement(Dark)==1 |
| 未対応 | 46002414 | 樋口 聖華 | 茜色 | 0/2 | [unsupported] part.target_condition(AttackUp): IsNatureElement(Fire)==0<br>[unsupported] part.target_condition(AttackUp): IsNatureElement(Fire)==1 |
| 対応 | 46002505 | 柊木 梢 | クレール・ド・リュンヌ | 1/1 | [supported] skill.cond: CountBC(IsPlayer())>1 |
| 未対応 | 46002510 | 柊木 梢 | 水影 | 0/1 | [unsupported] skill.cond: MoraleLevel() >= 6 |
| 未対応 | 46002511 | 柊木 梢 | 邪眼・マリンスラッシュ | 0/3 | [unsupported] skill.iuc_cond: MoraleLevel() >= 6<br>[unsupported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && IsCharacter(KHiiragi) == 1 && MoraleLevel() >= 6)>0<br>[unsupported] part.cond(SkillCondition): CountBC(IsPlayer() == 1 && IsCharacter(KHiiragi) == 1 && MoraleLevel()>=6)>0 |
| 対応 | 46002561 | 柊木 梢 | クレール・ド・リュンヌ+ | 1/1 | [supported] skill.cond: CountBC(IsPlayer())>1 |
| 未対応 | 46002607 | ビャッコ | 破壊の女王 | 0/1 | [unsupported] part.cond(DamageRateChangeAttackSkill): IsHitWeak() |
| 対応 | 46003109 | 山脇・ボン・イヴァール | 夢の際 | 1/1 | [supported] skill.cond: CountBC(IsPlayer())>1 |
| 対応 | 46003110 | 山脇・ボン・イヴァール | 醒めたる思い | 1/1 | [supported] part.cond(SkillCondition): PlayedSkillCount(BIYamawakiSkill53)==0 |
| 対応 | 46003113 | 山脇・ボン・イヴァール | モラール | 1/1 | [supported] skill.cond: CountBC(IsPlayer())>1 |
| 未対応 | 46003114 | 山脇・ボン・イヴァール | ヴォリション・サイス | 0/4 | [unsupported] skill.iuc_cond: CountBC(IsPlayer()==0&&IsDead()==0&&BreakDownTurn()>0)>0<br>[unsupported] skill.overwrite_cond: CountBC(IsPlayer()==0 && IsDead()==0 && BreakDownTurn()>0)>0<br>[unsupported] part.cond(SuperBreak): IsHitWeak()<br>[unsupported] part.cond(SuperBreak): IsHitWeak() |
| 対応 | 46003115 | 山脇・ボン・イヴァール | ごきげんダンス | 2/2 | [supported] skill.cond: CountBC(IsPlayer())>1<br>[supported] part.target_condition(AdditionalTurn): SpecialStatusCountByType(20) == 0 |
| 未対応 | 46003116 | 山脇・ボン・イヴァール | ギガビッグバン | 0/1 | [unsupported] skill.cond: CountBC(IsPlayer() && SpecialStatusCountByType(155) >= 1)>=6 |
| 未対応 | 46003161 | 山脇・ボン・イヴァール | 絶対零度+ | 0/1 | [unsupported] part.cond(SkillCondition): CountBC(IsPlayer() &&IsTeam(31C)==1)>=3 |
| 未対応 | 46003210 | 桜庭 星羅 | 花舞う、可憐のフレア | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(12)>0)>0\|\|CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(57)>0)>0 |
| 対応 | 46003211 | 桜庭 星羅 | 夜満ちる星天の帳 | 1/1 | [supported] part.cond(SkillCondition): PlayedSkillCount(SSakurabaSkill54) < 2 |
| 未対応 | 46003307 | 天音 巫呼 | にゃんこ大魔法 | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(3)>0)>0 |
| 対応 | 46003310 | 天音 巫呼 | レイス・カース・ダンス | 1/1 | [supported] part.cond(SkillCondition): PlayedSkillCount(MTenneSkill54) < 2 |
| 未対応 | 46003361 | 天音 巫呼 | デストロイ+ | 0/1 | [unsupported] skill.overwrite_cond: CountBC(PlayedSkillCount(MTenneSkill51Ev1)>0)==0 |
| 対応 | 46003411 | 豊後 弥生 | セイクリッド・クワイア | 1/1 | [supported] part.cond(SkillCondition): PlayedSkillCount(YBungoSkill52)==0 |
| 対応 | 46003417 | 豊後 弥生 | 三色団子乱れ撃ち | 1/1 | [supported] part.cond(SkillCondition): PlayedSkillCount(YBungoSkill53)==0 |
| 対応 | 46003420 | 豊後 弥生 | なかまをふやすおどり | 1/1 | [supported] skill.cond: CountBC(IsFront()==0&&IsPlayer())>0 |
| 未対応 | 46003421 | 豊後 弥生 | メガデストロイヤー | 0/2 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && SpecialStatusCountByType(155) >= 1)>=3<br>[unsupported] part.cond(SkillCondition): CountBC(IsPlayer() == 1 && SpecialStatusCountByType(155) >= 1)<=4 |
| 未対応 | 46003507 | 神崎 アーデルハイド | 神崎流忍術・氷塵 | 0/1 | [unsupported] part.cond(DamageRateChangeAttackSkill): IsHitWeak() |
| 未対応 | 46003509 | 神崎 アーデルハイド | 神崎流忍術・散華 | 0/1 | [unsupported] part.cond(DamageRateChangeAttackSkill): IsHitWeak() |
| 未対応 | 46003510 | 神崎 アーデルハイド | レッドラウンドイリュージョン | 0/2 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && IsCharacter(AKanzaki) == 1 && SpecialStatusCountByType(125)>0)>0<br>[unsupported] part.cond(SkillCondition): SpecialStatusCountByType(125) > 0 |
| 対応 | 46003514 | 神崎 アーデルハイド | ワイルドハウル | 2/2 | [supported] skill.overwrite_cond: IsOverDrive()<br>[supported] part.target_condition(AdditionalTurn): SpecialStatusCountByType(20) == 0 |
| 対応 | 46003515 | 神崎 アーデルハイド | フレア・オブ・ディザスター | 1/1 | [supported] part.cond(SkillCondition): PlayedSkillCount(AKanzakiSkill55) == 0 |
| 対応 | 46003608 | 佐月 マリ | ルーイン・イリュージョン | 1/1 | [supported] part.cond(SkillCondition): PlayedSkillCount(MSatsukiSkill52)==0 |
| 未対応 | 46003612 | 佐月 マリ | 次の主役はあなた | 0/1 | [unsupported] part.cond(SkillCondition): CountBC(IsPlayer()==0&&IsDead()==0&&IsBroken()==1&&DamageRate()>=200.0)>0 |
| 未対応 | 46003616 | 佐月 マリ | 浮き浮きサニー・ボマー | 0/1 | [unsupported] part.cond(SkillCondition): SpecialStatusCountByType(125) > 0 |
| 一部対応 | 46003619 | 佐月 マリ | ドミネーション・グラビティ | 1/2 | [unsupported] skill.overwrite_cond: CountBC(PlayedSkillCount(MSatsukiSkill55)>1)>0<br>[supported] part.cond(SkillCondition): PlayedSkillCount(MSatsukiSkill55) < 2 |
| 未対応 | 46003626 | 佐月 マリ | 謀略 | 0/2 | [unsupported] skill.cond: SpecialStatusCountByType(20)==0 && CountBC(IsPlayer())>1<br>[unsupported] part.target_condition(AdditionalTurn): IsFront()==1 |
| 未対応 | 46003661 | 佐月 マリ | ダイヤモンド・ダスト+ | 0/1 | [unsupported] part.cond(SkillCondition): CountBC(IsPlayer() &&IsTeam(31C)==1)>=3 |
| 対応 | 46004110 | 白河 ユイナ | シーサイドベルセルク | 1/1 | [supported] part.cond(SkillCondition): SpecialStatusCountByType(20) > 0 |
| 対応 | 46004113 | 白河 ユイナ | 蒼焔ノ迷宮 | 1/1 | [supported] part.cond(SkillCondition): SpecialStatusCountByType(20) > 0 |
| 対応 | 46004118 | 白河 ユイナ | 夜醒 | 1/1 | [supported] skill.cond: SpecialStatusCountByType(20)==0 |
| 未対応 | 46004120 | 白河 ユイナ | 蒼星のイリデッセンス | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer()==1&&IsCharacter(YShirakawa)==1&&Token()>3)>0 |
| 一部対応 | 46004121 | 白河 ユイナ | 神命を宿す瞳 | 1/2 | [unsupported] part.target_condition(Funnel): IsNatureElement(Fire)==1<br>[supported] part.hit_condition(AdditionalTurn): SpecialStatusCountByType(20) == 0 |
| 対応 | 46004124 | 白河 ユイナ | 神に捧ぐ、勝旗のラ・ピュセル | 1/1 | [supported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && SpecialStatusCountByType(20)>0)>0 |
| 対応 | 46004208 | 月城 最中 | 輝神 | 1/1 | [supported] part.cond(SkillCondition): SpecialStatusCountByType(20) > 0 |
| 一部対応 | 46004211 | 月城 最中 | 一途 | 1/2 | [unsupported] skill.iuc_cond: CountBC(IsPlayer() == 1 && IsCharacter(MTsukishiro) == 1 && SpecialStatusCountByType(20)>0) > 0<br>[supported] part.cond(SkillCondition): SpecialStatusCountByType(20) > 0 |
| 未対応 | 46004307 | 桐生 美也 | 御稲荷神話 | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(22)>0)>0 |
| 未対応 | 46004311 | 桐生 美也 | 咲き昇る宵の幻 | 0/2 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && IsCharacter(MKiryu) == 1 && FireMarkLevel()>=4)>=1<br>[unsupported] part.target_condition(MindEye): IsNatureElement(Fire)==1 |
| 未対応 | 46004407 | 菅原 千恵 | 姫君の寵愛 | 0/2 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(12)>0)>0\|\|CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(57)>0)>0<br>[unsupported] part.cond(SkillCondition): CountBC(IsPlayer()==0&&SpecialStatusCountByType(12)>0)>0\|\|CountBC(IsPlayer()==0&&SpecialStatusCountByType(57)>0)>0 |
| 対応 | 46004412 | 菅原 千恵 | ロリータフルバースト | 1/1 | [supported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && SpecialStatusCountByType(20)>0)>0 |
| 対応 | 46004417 | 菅原 千恵 | ハウリング | 1/1 | [supported] skill.cond: CountBC(IsPlayer())>1 |
| 未対応 | 46004461 | 菅原 千恵 | イノセントワイルド+ | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && IsCharacter(CSugahara) == 1 && DpRate() >= 1.0) > 0 |
| 一部対応 | 46004507 | 小笠原 緋雨 | メイド・イン・パンクチュア | 1/2 | [supported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && SpecialStatusCountByType(20)>0)>0<br>[unsupported] part.cond(SkillCondition): IsCharging() |
| 対応 | 46004511 | 小笠原 緋雨 | 夢視るデザイア | 1/1 | [supported] part.hit_condition(HealSp): BreakHitCount()>0 |
| 対応 | 46004514 | 小笠原 緋雨 | 放課後の淡いスリル | 1/1 | [supported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && SpecialStatusCountByType(20)>0)>0 |
| 未対応 | 46004515 | 小笠原 緋雨 | 捕球の極意 | 0/2 | [unsupported] part.target_condition(RemoveDebuff): IsNatureElement(Light)==0<br>[unsupported] part.target_condition(RemoveDebuff): IsNatureElement(Light)==1 |
| 未対応 | 46004608 | 蔵 里見 | 最凶のおもてなし | 0/1 | [unsupported] part.cond(DamageRateChangeAttackSkill): IsHitWeak() |
| 未対応 | 46004609 | 蔵 里見 | 飛沫きらめく水浅葱 | 0/1 | [unsupported] skill.overwrite_cond: CountBC(PlayedSkillCount(SKuraSkill53)>0)==0 |
| 対応 | 46005106 | 二階堂 三郷 | 石塔の手筋 | 1/1 | [supported] part.cond(SkillCondition): IsOverDrive() |
| 対応 | 46005110 | 二階堂 三郷 | フローズン・ワルツ | 1/1 | [supported] part.cond(SkillCondition): IsOverDrive() |
| 未対応 | 46005113 | 二階堂 三郷 | スイーツチャージ！ | 0/1 | [unsupported] skill.cond: Turn()==1 |
| 対応 | 46005114 | 二階堂 三郷 | 追風 | 1/1 | [supported] skill.overwrite_cond: IsOverDrive() |
| 対応 | 46005117 | 二階堂 三郷 | 国士無双 | 1/1 | [supported] part.cond(SkillCondition): IsOverDrive() |
| 対応 | 46005161 | 二階堂 三郷 | 石塔の手筋+ | 1/1 | [supported] part.cond(SkillCondition): IsOverDrive() |
| 未対応 | 46005207 | 石井 色葉 | 極彩色 | 0/1 | [unsupported] part.cond(SkillCondition): IsZone(Fire)==1 \|\| IsZone(Ice)==1 \|\| IsZone(Thunder)==1 \|\| IsZone(Light)==1 |
| 未対応 | 46005222 | 石井 色葉 | スペクタクルアート | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsZone(Fire)==0&&IsZone(None)==0)>0 |
| 未対応 | 46005223 | 石井 色葉 | ファーマメントブーケショット | 0/1 | [unsupported] part.cond(SkillCondition): IsZone(Fire)==1 \|\| IsZone(Ice)==1 \|\| IsZone(Thunder)==1 \|\| IsZone(Light)==1 |
| 未対応 | 46005238 | 石井 色葉 | レビン | 0/1 | [unsupported] part.cond(SkillCondition): IsZone(Thunder)==1 |
| 一部対応 | 46005261 | 石井 色葉 | アクロマティックバレット+ | 1/2 | [unsupported] skill.overwrite_cond: CountBC(PlayedSkillCount(IIshiiSkill51Ev1)>0)==0<br>[supported] part.cond(SkillCondition): PlayedSkillCount(IIshiiSkill51Ev1)==0 |
| 対応 | 46005304 | 命 吹雪 | 破滅でおやすみ | 1/1 | [supported] part.cond(SkillCondition): IsOverDrive() |
| 一部対応 | 46005308 | 命 吹雪 | コンペンセーション | 1/2 | [unsupported] skill.cond: 0.0<DpRate()<br>[supported] part.cond(SkillCondition): PlayedSkillCount(FMikotoSkill04)==0 |
| 未対応 | 46005416 | 室伏 理沙 | 胡蝶のいざない、照る初旭 | 0/2 | [unsupported] part.hit_condition(MindEye): RemoveDebuffCount()>0<br>[unsupported] part.hit_condition(AttackUp): RemoveDebuffCount()>0 |
| 未対応 | 46005461 | 室伏 理沙 | ハートフル・ボマー+ | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer() &&IsTeam(31D)==1)>=3 |
| 対応 | 46005507 | 伊達 朱里 | 哀のスノードロップ | 1/1 | [supported] part.hit_condition(OverDrivePointUp): BreakHitCount()>0 |
| 未対応 | 46005511 | 伊達 朱里 | 御祈祷オーバーヒート | 0/2 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && IsCharacter(ADate) == 1 && SpecialStatusCountByType(146) < 1) > 0<br>[unsupported] part.cond(SkillCondition): SpecialStatusCountByType(146) > 0 |
| 未対応 | 46005607 | 瑞原 あいな | 豪快！パイレーツキャノン | 0/1 | [unsupported] part.cond(SkillCondition): CountBC(IsPlayer()==0&&IsDead()==0)==3 |
| 対応 | 46005614 | 瑞原 あいな | ヌラルジャ | 1/1 | [supported] skill.overwrite_cond: IsOverDrive() |
| 未対応 | 46005616 | 瑞原 あいな | レインボーミラクルスライダー | 0/2 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer()==0 && IsDead()==0 && BreakDownTurn()>0)>0<br>[unsupported] part.cond(SkillCondition): CountBC(IsDead()==0&&IsPlayer()==0&&BreakDownTurn()>0)>0 |
| 一部対応 | 46005619 | 瑞原 あいな | 夏色ハイテンション | 1/2 | [unsupported] skill.cond: CountBC(IsPlayer()==1 && IsBroken() == 1)==0<br>[supported] part.cond(SkillCondition): PlayedSkillCount(AMizuharaSkill06)==0 |
| 未対応 | 46006107 | 大島 一千子 | とどけ！ 誓いのしるし | 0/2 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(12)>0)>0\|\|CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(57)>0)>0<br>[unsupported] part.cond(SkillCondition): CountBC(IsPlayer()==0&&SpecialStatusCountByType(12)>0)>0\|\|CountBC(IsPlayer()==0&&SpecialStatusCountByType(57)>0)>0 |
| 対応 | 46006110 | 大島 一千子 | 光の標 | 1/1 | [supported] skill.cond: OverDriveGauge() >= 0 |
| 未対応 | 46006208 | 大島 二以奈 | 爽籟に舞う仁慈 | 0/2 | [unsupported] skill.iuc_cond: CountBC(IsPlayer()==0&&IsDead()==0&&IsBroken()==1&&DamageRate()>=200.0)>0<br>[unsupported] skill.overwrite_cond: CountBC(IsPlayer()==0&&IsDead()==0&&IsBroken()==1&&DamageRate()>=200.0)>0 |
| 未対応 | 46006211 | 大島 二以奈 | 夏に恋するオードトワレ | 0/2 | [unsupported] skill.iuc_cond: SpecialStatusCountByType(164)>0<br>[unsupported] skill.overwrite_cond: CountBC(IsPlayer()==1&&IsCharacter(NiOhshima)==1&&SpecialStatusCountByType(164)>0)>0 |
| 未対応 | 46006212 | 大島 二以奈 | シトラスティント | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer()==1&&IsCharacter(NiOhshima)==1&&SpecialStatusCountByType(164)>0)>0 |
| 未対応 | 46006261 | 大島 二以奈 | 純愛アンビシャス+ | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer() &&IsTeam(31E)==1)>=3 |
| 対応 | 46006306 | 大島 三野里 | つなぐ指先 | 1/1 | [supported] skill.cond: CountBC(IsPlayer())>1 |
| 対応 | 46006307 | 大島 三野里 | 染められて、初紅葉 | 1/1 | [supported] skill.cond: OverDriveGauge() >= 0 |
| 対応 | 46006308 | 大島 三野里 | バーテンダーズ・チョイス | 2/2 | [supported] skill.cond: OverDriveGauge() >= 0<br>[supported] part.cond(SkillCondition): PlayedSkillCount(MiOhshimaSkill05)==0 |
| 一部対応 | 46006311 | 大島 三野里 | 夜注ぐスターライト・ステア | 1/2 | [supported] skill.cond: OverDriveGauge() >= 0<br>[unsupported] part.cond(SkillCondition): CountBC(IsPlayer() && IsCharacter(MiOhshima) && Token()>=6)>0 |
| 対応 | 46006404 | 大島 四ツ葉 | 決戦前夜 | 1/1 | [supported] skill.cond: CountBC(IsFront()==0&&IsPlayer())>0 |
| 対応 | 46006405 | 大島 四ツ葉 | 夢見る幻想覚醒 | 1/1 | [supported] skill.cond: CountBC(IsFront()==0&&IsPlayer())>0 |
| 一部対応 | 46006407 | 大島 四ツ葉 | ポッピング・バブル | 1/2 | [supported] skill.cond: CountBC(IsFront()==0&&IsPlayer())>0<br>[unsupported] part.target_condition(Funnel): IsNatureElement(Light)==1 |
| 未対応 | 46006408 | 大島 四ツ葉 | ネコジェット・シャテキ | 0/1 | [unsupported] skill.cond: IsFront()==0 |
| 対応 | 46006409 | 大島 四ツ葉 | フラッフィー | 1/1 | [supported] skill.cond: CountBC(IsFront()==0&&IsPlayer())>0 |
| 未対応 | 46006561 | 大島 五十鈴 | 魔炎閃獄門+ | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer() &&IsTeam(31E)==1)>=3 |
| 対応 | 46006610 | 大島 六宇亜 | サマーグレイス | 1/1 | [supported] skill.cond: IsOverDrive()==0 |
| 対応 | 46006611 | 大島 六宇亜 | メルティリトリート | 1/1 | [supported] skill.cond: IsOverDrive() |
| 対応 | 46006661 | 大島 六宇亜 | 快感・スプリント！+ | 1/1 | [supported] part.target_condition(AdditionalTurn): IsOverDrive() |
| 対応 | 46007108 | 柳 美音 | 日々のメンテナンス | 1/1 | [supported] skill.cond: CountBC(IsPlayer())>1 |
| 未対応 | 46007206 | 丸山 奏多 | ヴォイドストーム | 0/1 | [unsupported] part.cond(SkillCondition): IsCharging() |
| 未対応 | 46007213 | 丸山 奏多 | 進軍を照らす覇光 | 0/2 | [unsupported] part.target_condition(Funnel): IsNatureElement(Thunder)==0<br>[unsupported] part.target_condition(Funnel): IsNatureElement(Thunder)==1 |
| 未対応 | 46007215 | 丸山 奏多 | 王の激励 | 0/1 | [unsupported] part.cond(SkillCondition): IsCharging() |
| 未対応 | 46007261 | 丸山 奏多 | ヴォイドストーム+ | 0/1 | [unsupported] part.cond(SkillCondition): IsCharging() |
| 未対応 | 46007307 | 華村 詩紀 | 星煌のシンフォニア | 0/1 | [unsupported] part.cond(SkillCondition): IsCharging() |
| 未対応 | 46007406 | 松岡 チロル | そよ風に吹かれて | 0/1 | [unsupported] skill.overwrite_cond: CountBC(PlayedSkillCount(CMatsuokaSkill04)>0)==0 |
| 未対応 | 46007407 | 松岡 チロル | リフレッシング・チアーズ！ | 0/3 | [unsupported] skill.overwrite_cond: CountBC(PlayedSkillCount(CMatsuokaSkill52)>0)==0<br>[unsupported] part.target_condition(DefenseUp): IsNatureElement(Light)==1<br>[unsupported] part.target_condition(RegenerationDp): IsNatureElement(Light)==1 |
| 未対応 | 46007408 | 松岡 チロル | アクターズ・スーパーノヴァ | 0/1 | [unsupported] part.cond(SkillCondition): IsCharging() |
| 未対応 | 46007411 | 松岡 チロル | スターダムロード | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && IsCharacter(CMatsuoka) == 1 && IsCharging()==1) > 0 |
| 未対応 | 46007461 | 松岡 チロル | 必滅！ヴェインキック+ | 0/1 | [unsupported] skill.overwrite_cond: CountBC(PlayedSkillCount(CMatsuokaSkill51Ev1)>0)==0 |
| 未対応 | 46007505 | 夏目 祈 | 夜嵐 | 0/1 | [unsupported] part.cond(SkillCondition): IsCharging() |
| 未対応 | 46007509 | 夏目 祈 | 唯雅粛正 | 0/1 | [unsupported] part.cond(SkillCondition): IsCharging() |
| 対応 | 46007513 | 夏目 祈 | アオナツの夢 | 1/1 | [supported] skill.cond: Sp()>19 |
| 一部対応 | 46007514 | 夏目 祈 | 疾きこと風の如し | 1/2 | [supported] skill.cond: Sp()>0<br>[unsupported] part.cond(SkillCondition): IsCharging() |
| 未対応 | 46007605 | 黒沢 真希 | 覇道妄執我突邁進 | 0/1 | [unsupported] part.cond(SkillCondition): IsCharging() |
| 未対応 | 46007610 | 黒沢 真希 | 一意専心 | 0/1 | [unsupported] part.cond(DamageRateChangeAttackSkill): IsHitWeak() |
| 未対応 | 46007661 | 黒沢 真希 | 覇道妄執我突邁進+ | 0/1 | [unsupported] part.cond(SkillCondition): IsCharging() |
| 未対応 | 46008109 | キャロル・リーパー | 秘密のロマンティック | 0/2 | [unsupported] part.target_condition(AttackUp): IsNatureElement(Fire)==1<br>[unsupported] part.target_condition(Funnel): IsNatureElement(Fire)==1 |
| 未対応 | 46008110 | キャロル・リーパー | サンダー・オブ・ジャスティス | 0/1 | [unsupported] part.cond(DamageRateChangeAttackSkill): TargetBreakDownTurn()>0 |
| 対応 | 46008209 | 李 映夏 | 春の宵の塵に同じ | 1/1 | [supported] skill.cond: Sp()<0 |
| 対応 | 46008211 | 李 映夏 | 青薔薇ノ円舞曲 | 1/1 | [supported] part.cond(SkillCondition): PlayedSkillCount(LShanhuaSkill54)==0 |
| 未対応 | 46008309 | アイリーン・レドメイン | ドリーミー・ガーデン | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer()&&Sp()<=0)>0 |
| 対応 | 46008311 | アイリーン・レドメイン | セレスティアルショット | 1/1 | [supported] part.cond(SkillCondition): IsOverDrive() |
| 未対応 | 46008409 | ヴリティカ・バラクリシュナン | 饗宴アヌラーガ | 0/1 | [unsupported] part.target_condition(HealSp): IsNatureElement(Ice) |
| 未対応 | 46008461 | ヴリティカ・バラクリシュナン | 狂気乱舞のカーリー+ | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && IsCharacter(VBalakrishnan) == 1 && DpRate() >= 1.0) > 0 |
| 対応 | 46008609 | シャルロッタ・スコポフスカヤ | 恍惚のヴァージンロード | 1/1 | [supported] skill.cond: CountBC(IsPlayer())>1 |
| 未対応 | 46008611 | シャルロッタ・スコポフスカヤ | 召し上がれミラーシュカ | 0/1 | [unsupported] part.target_condition(HealSp): IsNatureElement(Fire) |
| 未対応 | 46040207 | 仲村 ゆり | トゥルー・アイシクル | 0/2 | [unsupported] part.cond(SuperBreak): IsHitWeak()<br>[unsupported] part.cond(SuperBreak): IsHitWeak() |
| 未対応 | 46040702 | 岩沢 雅美 | アルペジオ | 0/1 | [unsupported] skill.overwrite_cond: CountBC(IsDead()==0&&IsPlayer()==0&&BreakDownTurn()>0)>0 |
| 対応 | 46041403 | 手塚 咲 | 天駆の鉄槌 | 1/1 | [supported] part.target_condition(AdditionalTurn): IsReinforcedMode() |
| 対応 | 46041404 | 手塚 咲 | トリニティ・ブレイジング | 1/1 | [supported] skill.cond: Sp()>0 |
| 対応 | 46041501 | 七瀬 七海 | 宿る想い | 2/2 | [supported] skill.overwrite_cond: CountBC(IsPlayer() == 1 && SpecialStatusCountByType(20)>0)>0<br>[supported] part.hit_condition(AdditionalTurn): SpecialStatusCountByType(20)==0 |
| 対応 | 46053161 | 命 吹雪 | 破滅でおやすみ+ | 1/1 | [supported] part.cond(SkillCondition): IsOverDrive() |
| 未対応 | 46404301 | 桐生 美也 | 夏のひより | 0/1 | [unsupported] part.target_condition(FireMark): IsNatureElement(Fire)==1 |
| 未対応 | 46406101 | 大島 一千子 | モーニングルーティン | 0/1 | [unsupported] part.target_condition(AttackUp): IsTeam(31E)==1 |
| 未対応 | 46406401 | 大島 四ツ葉 | 温泉手形 | 0/1 | [unsupported] part.cond(ReplacePursuit): HasSkill(YoOhshimaSkill53)==1 |
| 未対応 | 46408401 | ヴリティカ・バラクリシュナン | ナンおかわり | 0/1 | [unsupported] part.target_condition(HealSkillUsedCount): IsNatureElement(Ice) |
| 未対応 | 46408601 | シャルロッタ・スコポフスカヤ | ぬくもりの手料理 | 0/1 | [unsupported] part.target_condition(HealSkillUsedCount): IsNatureElement(Fire) |
