import json
import math
import sys
import os

# Resolve path to engine
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../engine")))
from destruction_calc_engine import DestructionCalculatorEngine

TEST_CASES_PATH = os.path.join(os.path.dirname(__file__), "fixtures/test_cases_destruction.json")

def run_destruction_tests():
    print("=== Running Destruction Rate Calculator Regression Tests ===")
    
    if not os.path.exists(TEST_CASES_PATH):
        print(f"❌ Test cases file not found: {TEST_CASES_PATH}")
        sys.exit(1)
        
    with open(TEST_CASES_PATH, "r", encoding="utf-8") as f:
        test_cases = json.load(f)
        
    engine = DestructionCalculatorEngine()
    
    mismatches = 0
    passed = 0
    
    tolerance = 1e-4
    
    # Load sp_mapping locally
    sp_mapping_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../seraphdb_json/skill_sp_mapping.json"))
    sp_mapping = {}
    if os.path.exists(sp_mapping_path):
        with open(sp_mapping_path, "r", encoding="utf-8") as f:
            sp_mapping = json.load(f)

    for i, tc in enumerate(test_cases):
        name = tc.get("name", f"Case {i}")
        print(f"\nRunning test {i+1}: {name}")
        
        input_data = tc["input"]
        expected = tc["expected"]
        
        # Inject overrides from sp_mapping
        skill_data = input_data.get("skill", {})
        skill_name = skill_data.get("name")
        
        mapping_info = None
        if skill_name:
            clean_name = skill_name.replace("[単独発動]", "").split("[")[0].split("(")[0].split("（")[0].strip()
            mapping_info = sp_mapping.get(skill_name)
            if not mapping_info:
                mapping_info = sp_mapping.get(clean_name)
                
        if mapping_info:
            sp_val = mapping_info.get("sp")
            if sp_val is not None and sp_val != "-":
                skill_data["spCostOverride"] = float(sp_val)
            else:
                skill_data["spCostOverride"] = 0.0
            skill_data["isNormalAttack"] = mapping_info.get("is_normal_attack", False)
            skill_data["isPursuit"] = mapping_info.get("is_pursuit", False)
        else:
            if skill_name:
                if "通常攻撃" in skill_name:
                    skill_data["isNormalAttack"] = True
                elif "追撃" in skill_name:
                    skill_data["isPursuit"] = True

        # Resolve accessories boundary condition
        attacker_data = input_data.get("attacker", {})
        if "accessoryDestructionRateBonus" not in attacker_data or attacker_data["accessoryDestructionRateBonus"] is None:
            accs = attacker_data.get("accessories", [])
            if any(a in ["BlastPierce", "ブラストピアス"] for a in accs):
                attacker_data["accessoryDestructionRateBonus"] = 0.15
            else:
                attacker_data["accessoryDestructionRateBonus"] = 0.0
        input_data["autoBreak"] = True
        try:
            result = engine.calculate_destruction(input_data)
        except Exception as e:
            print(f"  ❌ crashed: {e}")
            mismatches += 1
            continue
            
        py_rate = result["destructionRate"]
        ex_rate = expected["destructionRate"]
        
        py_breakdown = result["breakdown"]
        ex_breakdown = expected["breakdown"]
        
        case_passed = True
        
        # 最終破壊率の一致確認
        if not math.isclose(py_rate, ex_rate, rel_tol=tolerance, abs_tol=1e-4):
            print(f"  ❌ destructionRate mismatch: Py={py_rate:.4f} | Expected={ex_rate:.4f}")
            case_passed = False
            
        # 内訳の一致確認
        for key in ["baseDestruction", "finalBaseDestruction", "blasterCorrection", "buffMultiplier", "accessoryBonus", "resonanceBonus", "limitExceedBonus"]:
            py_val = py_breakdown.get(key)
            ex_val = ex_breakdown.get(key)
            if ex_val is None:
                ex_val = 0.0 # フォールバック(旧テストケース用)
            if py_val is None:
                print(f"  ❌ Breakdown key '{key}' missing: Py={py_val} | Expected={ex_val}")
                case_passed = False
                continue
                
            if not math.isclose(py_val, ex_val, rel_tol=tolerance, abs_tol=1e-4):
                print(f"  ❌ Breakdown key '{key}' mismatch: Py={py_val:.4f} | Expected={ex_val:.4f}")
                case_passed = False
                
        if case_passed:
            print("  ✅ PASS")
            passed += 1
        else:
            mismatches += 1
            
    print(f"\nDestruction Validation summary: Passed={passed} | Mismatches={mismatches}")
    
    if mismatches == 0:
        print("\n🎉 SUCCESS! Python destruction rate calculator matches expected values perfectly!")
        sys.exit(0)
    else:
        print("\n😭 FAILURE! Mismatch detected in destruction rate calculations.")
        sys.exit(1)

if __name__ == "__main__":
    run_destruction_tests()
