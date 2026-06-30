import sys
import os
import unittest

# Resolve path to engine
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../engine")))
from damage_calc_engine import DamageCalculatorEngine
from destruction_calc_engine import DestructionCalculatorEngine

class TestEffectResolutionAPI(unittest.TestCase):
    def setUp(self):
        self.damage_engine = DamageCalculatorEngine()
        self.destruction_engine = DestructionCalculatorEngine()

    def test_resolve_effect_power_from_part_buff_scenarios(self):
        # 1. threshold <= 0 (always capped/overCap)
        part1 = {
            "power": [0.10, 0.20],
            "growth": [0.03, 0.02],
            "diff_for_max": 0,
            "parameters": {"wis": 1}
        }
        res1 = self.damage_engine.resolve_effect_power_from_part(part1, {
            "providerStats": {"wis": 100},
            "skillLevel": 10,
            "isEnemyDebuff": False
        })
        self.assertEqual(res1["breakdown"]["regime"], "overCap")
        self.assertAlmostEqual(res1["power"], 23.6, places=4)

        # 2. providerStatVal < 0 (belowMin)
        part2 = {
            "power": [0.10, 0.20],
            "growth": [0.03, 0.02],
            "diff_for_max": 100,
            "parameters": {"wis": 1}
        }
        res2 = self.damage_engine.resolve_effect_power_from_part(part2, {
            "providerStats": {"wis": -50},
            "skillLevel": 10,
            "isEnemyDebuff": False
        })
        self.assertEqual(res2["breakdown"]["regime"], "belowMin")
        self.assertAlmostEqual(res2["power"], 12.7, places=4)

        # 3. Linear region
        res3 = self.damage_engine.resolve_effect_power_from_part(part2, {
            "providerStats": {"wis": 50},
            "skillLevel": 10,
            "isEnemyDebuff": False
        })
        self.assertEqual(res3["breakdown"]["regime"], "linear")
        self.assertAlmostEqual(res3["power"], 18.15, places=4)

        # 4. Over cap (overCap)
        res4 = self.damage_engine.resolve_effect_power_from_part(part2, {
            "providerStats": {"wis": 150},
            "skillLevel": 10,
            "isEnemyDebuff": False
        })
        self.assertEqual(res4["breakdown"]["regime"], "overCap")
        self.assertAlmostEqual(res4["power"], 23.836, places=4)

        # 5. Orb levels addition
        res5 = self.damage_engine.resolve_effect_power_from_part(part2, {
            "providerStats": {"wis": 200},
            "skillLevel": 10,
            "orbLevel": 1,
            "isEnemyDebuff": False
        })
        self.assertAlmostEqual(res5["power"], 24.872, places=4)
        self.assertAlmostEqual(res5["breakdown"]["jewelAddition"], 0.8, places=4)

    def test_resolve_effect_power_from_part_debuff_scenarios(self):
        part = {
            "power": [0.30, 0.45],
            "growth": [0.03, 0.02],
            "diff_for_max": 150,
            "parameters": {"wis": 1}
        }

        # 1. statDiff < 0 (belowMin)
        res1 = self.damage_engine.resolve_effect_power_from_part(part, {
            "providerStats": {"wis": 700},
            "enemyBorder": 750,
            "skillLevel": 10,
            "isEnemyDebuff": True
        })
        self.assertEqual(res1["breakdown"]["regime"], "belowMin")
        self.assertEqual(res1["power"], 38.1)

        # 2. statDiff in linear region
        res2 = self.damage_engine.resolve_effect_power_from_part(part, {
            "providerStats": {"wis": 800},
            "enemyBorder": 750,
            "skillLevel": 10,
            "isEnemyDebuff": True
        })
        self.assertEqual(res2["breakdown"]["regime"], "linear")
        self.assertEqual(res2["power"], 43.1)

        # 3. statDiff over cap (overCap)
        res3 = self.damage_engine.resolve_effect_power_from_part(part, {
            "providerStats": {"wis": 950},
            "enemyBorder": 750,
            "skillLevel": 10,
            "isEnemyDebuff": True
        })
        self.assertEqual(res3["breakdown"]["regime"], "overCap")
        self.assertEqual(res3["power"], 55.75)

        # 4. Orb levels addition
        res4 = self.damage_engine.resolve_effect_power_from_part(part, {
            "providerStats": {"wis": 950},
            "enemyBorder": 750,
            "skillLevel": 10,
            "orbLevel": 1,
            "isEnemyDebuff": True
        })
        self.assertEqual(res4["power"], 56.65)

    def test_resolve_effect_power_from_part_parameters_and_normalization(self):
        part = {
            "power": [0.10],
            "growth": [0.03],
            "diff_for_max": 100,
            "parameters": {"wis": 2, "luk": 1}
        }
        # 1. int and mnd aliases and weighting
        res1 = self.damage_engine.resolve_effect_power_from_part(part, {
            "providerStats": {"int": 700, "luk": 400},
            "skillLevel": 1,
            "isEnemyDebuff": False
        })
        self.assertEqual(res1["breakdown"]["providerStatVal"], 600)
        self.assertAlmostEqual(res1["power"], 11.0, places=4)

        # 2. Missing stat fallback to 600
        res2 = self.damage_engine.resolve_effect_power_from_part(part, {
            "providerStats": {"wis": 600},
            "skillLevel": 1,
            "isEnemyDebuff": False
        })
        self.assertEqual(res2["breakdown"]["providerStatVal"], 600)
        self.assertAlmostEqual(res2["power"], 11.0, places=4)

    def test_destruction_up_integration(self):
        input_data = {
            "attacker": {
                "styleId": 1,
                "role": "Attacker",
                "statusEffects": [
                    {"statusType": "DestructionUp", "power": 45.32}
                ]
            },
            "defender": {
                "enemyId": "dummy",
                "destructionRate": 1.5
            },
            "skill": {
                "spCostOverride": 4,
                "isNormalAttack": False
            },
            "hits": [
                {"damage": 100, "isBreakHit": True}
            ]
        }
        
        # Mocking or loading master data in engine
        self.destruction_engine.styles = [{"id": 1, "role": "Attacker"}]
        self.destruction_engine.enemies = [{"id": "dummy", "base_param": {"d_rate": 1.0, "max_d_rate": 300.0}}]
        self.destruction_engine.skills = []

        res = self.destruction_engine.calculate_destruction(input_data)
        self.assertAlmostEqual(res["breakdown"]["baseDestruction"], 0.0581, places=4)
        self.assertAlmostEqual(res["breakdown"]["buffMultiplier"], 0.4532, places=4)

if __name__ == "__main__":
    unittest.main()
