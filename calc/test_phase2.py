import unittest
from damage_calc_engine import DamageCalculatorEngine

class TestPhase2Logic(unittest.TestCase):
    def setUp(self):
        self.engine = DamageCalculatorEngine()

    def test_resolve_effect_power_explicit(self):
        """
        パワー明示指定時はそのまま返されること
        """
        eff = {"statusType": "AttackUp", "power": 45.5}
        val = self.engine.resolve_effect_power(eff)
        self.assertEqual(val, 45.5)

    def test_resolve_effect_power_scaling_wis(self):
        """
        知性依存のエンハンス(ID: 46003603)が知性に応じて正しくスケーリングされること
        """
        # エンハンス (power: [0.5, 0.65], diff_for_max: 208, growth: [0.03, 0.02])
        # スキルLv10:
        # 下限 V_min = 50 * (1 + 0.03 * 9) = 63.5%
        # 上限 V_max = 65 * (1 + 0.02 * 9) = 76.7%
        # 閾値 T = 208
        
        # 1. 閾値を超える知性 (例: 300)
        eff_high = {
            "statusType": "AttackUp",
            "sourceSkillId": 46003603,
            "skillLevel": 10,
            "providerWis": 300
        }
        val_high = self.engine.resolve_effect_power(eff_high)
        self.assertAlmostEqual(val_high, 76.7, places=4)

        # 2. 閾値を下回る知性 (例: 104) -> ちょうど半分のスケーリング
        # 補間: (76.7 - 63.5) / 208 * 104 + 63.5 = 13.2 / 2 + 63.5 = 6.6 + 63.5 = 70.1%
        eff_mid = {
            "statusType": "AttackUp",
            "sourceSkillId": 46003603,
            "skillLevel": 10,
            "providerWis": 104
        }
        val_mid = self.engine.resolve_effect_power(eff_mid)
        self.assertAlmostEqual(val_mid, 70.1, places=4)

    def test_aggregate_buffs(self):
        """
        通常バフ上位2枠合計と単独発動バフ最大値の大きい方が選ばれること
        """
        # 通常バフのみ (30%, 40%, 15%) -> 上位2枠合計で 70%
        buffs_normal = [
            {"skillName": "エンハンス", "resolved_power": 30.0},
            {"skillName": "ドーピング", "resolved_power": 40.0},
            {"skillName": "フィルエンハンス", "resolved_power": 15.0}
        ]
        val_normal = self.engine.aggregate_buffs(buffs_normal)
        self.assertAlmostEqual(val_normal, 0.70, places=4)

        # 単独バフが勝るケース (通常 30%+15% = 45% vs 単独 50%) -> 50%
        buffs_single_wins = [
            {"skillName": "エンハンス", "resolved_power": 30.0},
            {"skillName": "フィルエンハンス", "resolved_power": 15.0},
            {"skillName": "[単独発動]ガーデンオブエデン", "resolved_power": 50.0}
        ]
        val_single = self.engine.aggregate_buffs(buffs_single_wins)
        self.assertAlmostEqual(val_single, 0.50, places=4)

    def test_aggregate_debuffs_categories(self):
        """
        デバフがカテゴリごとに正しく上位2枠制限され、DP防御は全加算されること
        """
        debuffs = [
            # 通常防御: 30%, 20%, 10% -> 通常枠上位2枠で 50%
            {"skillName": "ソフニング", "resolved_power": 30.0},
            {"skillName": "ソフニング", "resolved_power": 20.0},
            {"skillName": "ソフニング", "resolved_power": 10.0},
            # 永続通常防御: 15% -> 永続枠 15%
            {"skillName": "インフィニティ・ハレーション", "resolved_power": 15.0},
            # DP防御: 10%, 20% -> DP枠はすべて合計で 30%
            {"skillName": "ほてるししむら(DP防御)", "resolved_power": 10.0},
            {"skillName": "ほてるししむら(DP防御)", "resolved_power": 20.0}
        ]
        val = self.engine.aggregate_debuffs(debuffs)
        # 合計: 50% (通常) + 15% (永続) + 30% (DP) = 95% = 0.95
        self.assertAlmostEqual(val, 0.95, places=4)

    def test_aggregate_fragiles(self):
        """
        脆弱デバフが弱点属性攻撃の有無で正しくフィルタされること
        """
        fragiles = [
            # 通常脆弱 (弱点限定): 35%, 15% -> 通常脆弱上位2枠合計で 50%
            {"skillName": "ネイキッドイレイザー", "resolved_power": 35.0},
            {"skillName": "フリージング・スペル", "resolved_power": 15.0},
            # 永続脆弱 (常時): 20% -> 永続脆弱上位2枠合計で 20%
            {"skillName": "永続:まだまだ行くで！", "resolved_power": 20.0}
        ]

        # 1. 弱点攻撃時 -> 通常脆弱 + 永続脆弱 = 50% + 20% = 70% = 0.70
        val_weakness = self.engine.aggregate_fragiles(fragiles, is_weakness_attack=True)
        self.assertAlmostEqual(val_weakness, 0.70, places=4)

        # 2. 非弱点攻撃時 -> 通常脆弱は無効化、永続脆弱のみ = 20% = 0.20
        val_no_weakness = self.engine.aggregate_fragiles(fragiles, is_weakness_attack=False)
        self.assertAlmostEqual(val_no_weakness, 0.20, places=4)

    def test_element_resist_down_routing(self):
        """
        ElementResistDownデバフが正しくデバフ集約処理にルーティングされること
        """
        input_data = {
            "attacker": {
                "characterId": "手塚咲",
                "styleId": 1010103,
                "statusEffects": []
            },
            "defender": {
                "enemyId": 13000001,
                "statusEffects": [
                    {"statusType": "ElementResistDown", "skillName": "グラビトン(通常)", "power": 20.0}
                ]
            },
            "skill": {
                "name": "通常攻撃"
            }
        }
        res = self.engine.calculate_damage(input_data)
        # debuffMultiplierが 1.20 になっていること
        self.assertAlmostEqual(res["breakdown"]["debuffMultiplier"], 1.20, places=4)

    def test_token_count_fallback(self):
        """
        tokenCountが渡された場合、自動的にtokenRatioに換算(1個あたり10%)されること
        """
        input_data = {
            "attacker": {
                "characterId": "手塚咲",
                "styleId": 1010103,
                "tokenCount": 3,
                "statusEffects": []
            },
            "defender": {
                "enemyId": 13000001,
                "statusEffects": []
            },
            "skill": {
                "name": "通常攻撃"
            }
        }
        res = self.engine.calculate_damage(input_data)
        # tokenMultiplierが 1.30 になっていること
        self.assertAlmostEqual(res["breakdown"]["tokenMultiplier"], 1.30, places=4)

    def test_mindeye_and_crit_mindeye_multiplier(self):
        """
        心眼(MindEye)が弱点属性攻撃時のみ有効になり、クリティカル心眼倍率に反映されること
        """
        # 1. 弱点攻撃時 (耐性=1.5倍)
        input_weakness = {
            "attacker": {
                "characterId": "手塚咲",
                "styleId": 1010103,
                "statusEffects": [
                    {"statusType": "MindEye", "power": 30.0}
                ]
            },
            "defender": {
                "enemyId": 13000001,
                "resistances": {"Slash": 1.5, "Stab": 1.5, "Strike": 1.5},
                "statusEffects": []
            },
            "skill": {
                "name": "通常攻撃"
            }
        }
        res_weakness = self.engine.calculate_damage(input_weakness)
        # (1.5 + 0.30) / 1.5 = 1.8 / 1.5 = 1.20
        self.assertAlmostEqual(res_weakness["breakdown"]["critMindeyeMultiplier"], 1.20, places=4)

        # 2. 非弱点攻撃時 (耐性=1.0倍) -> 心眼無効
        input_normal = {
            "attacker": {
                "characterId": "手塚咲",
                "styleId": 1010103,
                "statusEffects": [
                    {"statusType": "MindEye", "power": 30.0}
                ]
            },
            "defender": {
                "enemyId": 13000001,
                "resistances": {"Slash": 1.0},
                "statusEffects": []
            },
            "skill": {
                "name": "通常攻撃"
            }
        }
        res_normal = self.engine.calculate_damage(input_normal)
        self.assertAlmostEqual(res_normal["breakdown"]["critMindeyeMultiplier"], 1.00, places=4)

    def test_ignored_effects_warning(self):
        """
        サポートされていないステータス効果がサイレントドロップされず、警告リストに入るべきこと
        """
        input_data = {
            "attacker": {
                "characterId": "手塚咲",
                "styleId": 1010103,
                "statusEffects": [
                    {"statusType": "UnknownBuff", "skillName": "謎のバフ"}
                ]
            },
            "defender": {
                "enemyId": 13000001,
                "statusEffects": [
                    {"statusType": "UnknownDebuff", "skillName": "謎のデバフ"}
                ]
            },
            "skill": {
                "name": "通常攻撃"
            }
        }
        res = self.engine.calculate_damage(input_data)
        ignored = res["breakdown"]["ignoredEffects"]
        self.assertEqual(len(ignored), 2)
        self.assertEqual(ignored[0]["statusType"], "UnknownBuff")
        self.assertEqual(ignored[1]["statusType"], "UnknownDebuff")

    def test_classify_debuff_category_and_ordering(self):
        """
        classify_debuffが明示的なcategory指定や、名前の揺らぎに関わらず正しいカテゴリに分類すること
        """
        # 明示的なカテゴリ指定
        eff1 = {"skillName": "適当な名前", "statusType": "DefenseDown", "category": "PermDefense", "power": 20.0}
        self.assertEqual(self.engine.classify_debuff(eff1), "PermDefense")

        # 名前の順序揺らぎ
        eff2 = {"skillName": "属性永続防御デバフ", "statusType": "DefenseDown", "power": 20.0}
        eff3 = {"skillName": "永続属性防御デバフ", "statusType": "DefenseDown", "power": 20.0}
        self.assertEqual(self.engine.classify_debuff(eff2), "PermElementDefense")
        self.assertEqual(self.engine.classify_debuff(eff3), "PermElementDefense")

    def test_non_attack_skills_clamp_to_zero(self):
        """
        非攻撃スキル名（例: クールダウン, フィルエンハンス）を skill.name に指定した際、
        基礎ダメージが 0.0 にクランプされ、最終ダメージ期待値も 0.0 になること
        """
        input_data = {
            "attacker": {
                "characterId": "手塚咲",
                "styleId": 1010103,
                "stats": {"str": 1000, "dex": 1000, "wis": 1000, "spr": 1000, "luk": 1000, "con": 1000},
                "statusEffects": []
            },
            "defender": {
                "enemyId": 13000001,
                "paramBorder": 950,
                "destructionRate": 1.0,
                "isHpTarget": True,
                "resistances": {"Stab": 1.0},
                "statusEffects": []
            },
            "skill": {
                "name": "クールダウン"
            },
            "activeZone": "None"
        }
        res = self.engine.calculate_damage(input_data)
        self.assertEqual(res["breakdown"]["baseDamageNormal"], 0.0)
        self.assertEqual(res["breakdown"]["baseDamageCrit"], 0.0)
        self.assertEqual(res["normal"]["expected"], 0.0)
        self.assertEqual(res["critical"]["expected"], 0.0)

    def test_active_zone_mapping_and_warning(self):
        """
        activeZone の明示的な属性マッピング、部分一致の誤適用防止、および未知のゾーン名に対する警告を検証
        """
        base_input = {
            "attacker": {
                "characterId": "茅森月歌",
                "styleId": 1010101,
                "stats": {"str": 1000, "dex": 1000, "wis": 1000, "spr": 1000, "luk": 1000, "con": 1000},
                "statusEffects": []
            },
            "defender": {
                "enemyId": 13000001,
                "paramBorder": 950,
                "destructionRate": 1.0,
                "isHpTarget": True,
                "resistances": {"Slash": 1.0},
                "statusEffects": []
            },
            "skill": {
                "skillId": 46001107,
                "name": "星火燎原"
            }
        }

        # 1. FireZone (正当なゾーン) -> zone_mult = 1.5
        input_fire = dict(base_input)
        input_fire["activeZone"] = "FireZone"
        res_fire = self.engine.calculate_damage(input_fire)
        self.assertAlmostEqual(res_fire["breakdown"]["resistMultiplier"], 1.5, places=4)
        self.assertEqual(len(res_fire["breakdown"]["ignoredEffects"]), 0)

        # 2. Fireworks (部分一致するが未知のゾーン) -> zone_mult = 1.0 且つ警告リストに入る
        input_fireworks = dict(base_input)
        input_fireworks["activeZone"] = "Fireworks"
        res_fireworks = self.engine.calculate_damage(input_fireworks)
        self.assertAlmostEqual(res_fireworks["breakdown"]["resistMultiplier"], 1.0, places=4)
        
        ignored = res_fireworks["breakdown"]["ignoredEffects"]
        self.assertEqual(len(ignored), 1)
        self.assertEqual(ignored[0]["statusType"], "activeZone")
        self.assertEqual(ignored[0]["skillName"], "Fireworks")

        # 3. IceFire (部分一致するが未知のゾーン) -> zone_mult = 1.0 且つ警告
        input_icefire = dict(base_input)
        input_icefire["activeZone"] = "IceFire"
        res_icefire = self.engine.calculate_damage(input_icefire)
        self.assertAlmostEqual(res_icefire["breakdown"]["resistMultiplier"], 1.0, places=4)
        self.assertEqual(len(res_icefire["breakdown"]["ignoredEffects"]), 1)

    def test_param_border_zero_distinction(self):
        """
        paramBorder=0 が明示的に指定された場合、欠損値（None）と区別され、敵の防御境界値 0 として計算されること
        """
        input_zero = {
            "attacker": {
                "characterId": "手塚咲",
                "styleId": 1010103,
                "stats": {"str": 800, "dex": 800, "wis": 800, "spr": 800, "luk": 800, "con": 800},
                "statusEffects": []
            },
            "defender": {
                "enemyId": 13000001,
                "paramBorder": 0,
                "destructionRate": 1.0,
                "isHpTarget": True,
                "resistances": {"Stab": 1.0},
                "statusEffects": []
            },
            "skill": {
                "name": "通常攻撃"
            }
        }
        
        input_none = {
            "attacker": {
                "characterId": "手塚咲",
                "styleId": 1010103,
                "stats": {"str": 800, "dex": 800, "wis": 800, "spr": 800, "luk": 800, "con": 800},
                "statusEffects": []
            },
            "defender": {
                "enemyId": 13000001,
                "destructionRate": 1.0,
                "isHpTarget": True,
                "resistances": {"Stab": 1.0},
                "statusEffects": []
            },
            "skill": {
                "name": "通常攻撃"
            }
        }
        
        res_zero = self.engine.calculate_damage(input_zero)
        res_none = self.engine.calculate_damage(input_none)
        
        self.assertAlmostEqual(res_zero["breakdown"]["baseDamageNormal"], 475.0, places=4)
        self.assertAlmostEqual(res_none["breakdown"]["baseDamageNormal"], 308.75, places=4)
        self.assertNotEqual(res_zero["normal"]["expected"], res_none["normal"]["expected"])

    def test_con_based_token_attack_matches_excel_snapshot(self):
        """
        青春色のシュプールは体力依存の TokenAttack として、Excel スナップショットの行 40 と一致すること
        """
        input_data = {
            "attacker": {
                "characterId": "手塚咲",
                "styleId": 1010103,
                "level": 120,
                "limitBreakCount": 0,
                "stats": {"str": 675.0, "dex": 675.0, "wis": 675.0, "spr": 675.0, "luk": 675.0, "con": 675.0},
                "statusEffects": [
                    {"buffType": "AttackUp", "power": 75.0}
                ],
                "tokenRatio": 0.0
            },
            "defender": {
                "enemyId": 13000001,
                "paramBorder": 770,
                "destructionRate": 1.0,
                "isHpTarget": True,
                "resistances": {"Stab": 1.0},
                "statusEffects": [
                    {"debuffType": "DefenseDown", "power": 0.0}
                ]
            },
            "skill": {
                "name": "青春色のシュプール",
                "level": 10.0
            },
            "activeZone": "None"
        }

        res = self.engine.calculate_damage(input_data)

        self.assertAlmostEqual(res["breakdown"]["baseDamageNormal"], 2686.578125, places=4)
        self.assertAlmostEqual(res["breakdown"]["baseDamageCrit"], 8141.976563, places=4)
        self.assertAlmostEqual(res["normal"]["expected"], 4701.511719, places=4)
        self.assertAlmostEqual(res["critical"]["expected"], 14248.45898, places=4)
        self.assertAlmostEqual(res["breakdown"]["tokenMultiplier"], 1.0, places=4)

if __name__ == "__main__":
    unittest.main()
