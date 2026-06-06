import json
import math
import sys
import os
# Resolve path to engine
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../engine")))
from damage_calc_engine import DamageCalculatorEngine

CALC_DIR = os.path.dirname(__file__)

def run_fixed_fixtures_tests():
    print("=== Running Fixed Fixtures Damage Calculator Regression Tests ===")
    
    engine = DamageCalculatorEngine()
    
    fixtures_path = os.path.join(CALC_DIR, "fixtures/test_cases_fixed.json")
    if not os.path.exists(fixtures_path):
        fixtures_path = os.path.join(CALC_DIR, "test_cases_fixed.json")
    with open(fixtures_path, "r", encoding="utf-8") as f:
        fixtures = json.load(f)
        
    passed = 0
    failed = 0
    tolerance = 1e-4
    
    for fixture in fixtures:
        name = fixture["name"]
        inp = fixture["input"]
        expected = fixture["expected"]
        
        print(f"Testing scenario: {name} ...")
        
        try:
            result = engine.calculate_damage(inp)
        except Exception as e:
            print(f"❌ Scenario '{name}' crashed: {e}")
            failed += 1
            continue
            
        scenario_passed = True
        
        # 検証項目: expectedの通常期待値、クリ期待値、breakdown
        for cat in ["normal", "critical"]:
            for key in ["expected", "min", "max"]:
                val_py = result[cat][key]
                val_exp = expected[cat][key]
                if not math.isclose(val_py, val_exp, rel_tol=tolerance, abs_tol=1e-2):
                    print(f"  ❌ Mismatch in {cat}.{key}: Py={val_py:.4f} | Expected={val_exp:.4f}")
                    scenario_passed = False
                    
        for key in ["baseDamageNormal", "baseDamageCrit", "buffMultiplier", "critMindeyeMultiplier", 
                    "debuffMultiplier", "vulnerabilityMultiplier", "resistMultiplier", 
                    "affinityMultiplier", "tokenMultiplier", "funnelMultiplier"]:
            val_py = result["breakdown"][key]
            val_exp = expected["breakdown"][key]
            if not math.isclose(val_py, val_exp, rel_tol=tolerance, abs_tol=1e-2):
                print(f"  ❌ Mismatch in breakdown.{key}: Py={val_py:.4f} | Expected={val_exp:.4f}")
                scenario_passed = False
                
        # ignoredEffects
        ignored_py = result["breakdown"].get("ignoredEffects", [])
        ignored_exp = expected["breakdown"].get("ignoredEffects", [])
        if len(ignored_py) != len(ignored_exp):
            print(f"  ❌ Mismatch in breakdown.ignoredEffects length: Py={len(ignored_py)} | Expected={len(ignored_exp)}")
            scenario_passed = False
            
        if scenario_passed:
            print(f"  ✅ Scenario '{name}' passed.")
            passed += 1
        else:
            failed += 1
            
    print(f"\nFixed Fixtures Validation Summary: Passed={passed} | Failed={failed}")
    if failed == 0:
        print("\n🎉 SUCCESS! All fixed fixtures match expected results perfectly!")
        sys.exit(0)
    else:
        print("\n😭 FAILURE! Mismatch detected in fixed fixtures.")
        sys.exit(1)

if __name__ == "__main__":
    run_fixed_fixtures_tests()
