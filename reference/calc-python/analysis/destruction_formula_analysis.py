import os
import json
import math

def analyze():
    # Resolve absolute paths
    base_dir = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    skills_json_path = os.path.join(base_dir, "seraphdb_json", "skills.json")
    
    if not os.path.exists(skills_json_path):
        print(f"Error: {skills_json_path} does not exist.")
        return

    with open(skills_json_path, "r", encoding="utf-8") as f:
        skills = json.load(f)

    # Allowed attack part types
    ALLOWED_ATTACK_TYPES = {
        "AttackNormal", 
        "AttackSkill", 
        "DamageRateChangeAttackSkill", 
        "PenetrationCriticalAttack", 
        "PenetrationNormalAttack", 
        "PenetrationSkill",
        "TokenAttack",
        "AttackBySp",
        "AttackByOwnDpRate",
        "FixedHpDamageRateAttack"
    }

    results = []
    
    for skill in skills:
        sp_cost = float(skill.get("sp_cost", 0))
        target_type = skill.get("target_type", "Single")
        is_aoe = (target_type == "All")
        desc = skill.get("desc", "")
        skill_name = skill.get("name", "")
        skill_id = skill.get("id")

        # Determine fTag
        f_tag = 0.20 if is_aoe else 0.25
        if "[破壊率絶大]" in desc:
            f_tag = 2.50
        elif "[破壊率超特大]" in desc:
            f_tag = 1.60 if is_aoe else 2.00
        elif "[破壊率特大]" in desc:
            f_tag = 1.20 if is_aoe else 1.50
        elif "[破壊率大]" in desc:
            f_tag = 0.80 if is_aoe else 1.00

        # Raging Claw (レイジングクロー) has a permanent exception: f_tag = 5/3 (approx 1.6667)
        if skill_name == "レイジングクロー":
            f_tag = 5.0 / 3.0

        parts = skill.get("parts", [])
        # We need to flatten parts because some parts are nested under SkillCondition/SkillRandom/SkillSwitch
        flat_parts = []
        def flatten(parts_list):
            for p in parts_list:
                st = p.get("skill_type")
                if st in ["SkillCondition", "SkillRandom", "SkillSwitch"]:
                    strval = p.get("strval", [])
                    if isinstance(strval, list):
                        for sub in strval:
                            if isinstance(sub, dict) and "parts" in sub:
                                flatten(sub["parts"])
                    elif isinstance(strval, dict) and "parts" in strval:
                        flatten(strval["parts"])
                else:
                    flat_parts.append(p)
        
        flatten(parts)

        for part in flat_parts:
            st = part.get("skill_type")
            if st in ALLOWED_ATTACK_TYPES:
                multipliers = part.get("multipliers", {})
                dr = float(multipliers.get("dr", 1.0))
                
                results.append({
                    "skill_id": skill_id,
                    "skill_name": skill_name,
                    "desc": desc,
                    "sp_cost": sp_cost,
                    "is_aoe": is_aoe,
                    "f_tag": f_tag,
                    "dr": dr,
                    "part_type": st
                })

    print(f"Total attack parts found: {len(results)}")

    # Classifications
    dr_zero = []
    dr_equal_consume_sp = []
    dr_diff_consume_sp = []

    for r in results:
        f_tag = r["f_tag"]
        sp_cost = r["sp_cost"]
        dr = r["dr"]
        
        # Calculate theoretical dr based on consume SP
        dr_consume_sp = f_tag * sp_cost
        
        # We use a tolerance because of floating point numbers
        if dr == 0:
            dr_zero.append(r)
        elif abs(dr - dr_consume_sp) < 1e-4:
            dr_equal_consume_sp.append(r)
        else:
            dr_diff_consume_sp.append(r)

    print(f"DR = 0: {len(dr_zero)} parts")
    print(f"DR = fTag * consume_sp: {len(dr_equal_consume_sp)} parts")
    print(f"DR != fTag * consume_sp (non-zero): {len(dr_diff_consume_sp)} parts")

    # Analyze Virtual SP = dr / fTag for non-zero DR
    virtual_sp_stats = {}
    outliers = []

    for r in results:
        if r["dr"] == 0:
            continue
        
        # Virtual SP
        v_sp = r["dr"] / r["f_tag"]
        r["virtual_sp"] = v_sp
        
        # Check if v_sp is integer, half-integer (.5), or other
        diff_from_int = abs(v_sp - round(v_sp))
        diff_from_half = abs(v_sp - (round(v_sp * 2) / 2))
        
        if diff_from_int < 1e-4:
            v_sp_type = "int"
            v_sp_val = int(round(v_sp))
        elif diff_from_half < 1e-4:
            v_sp_type = "half"
            v_sp_val = round(v_sp * 2) / 2
        else:
            v_sp_type = "other"
            v_sp_val = v_sp
            outliers.append(r)

        virtual_sp_stats[v_sp_type] = virtual_sp_stats.get(v_sp_type, 0) + 1

    print("\nVirtual SP Classification:")
    for k, v in virtual_sp_stats.items():
        print(f"  {k}: {v}")

    print("\nOutliers (non-integer and non-half-integer Virtual SP):")
    for o in outliers:
        print(f"  ID: {o['skill_id']} | Name: {o['skill_name']} | SP Cost: {o['sp_cost']} | AoE: {o['is_aoe']} | fTag: {o['f_tag']:.4f} | DR: {o['dr']} | Virtual SP: {o['virtual_sp']:.4f}")

    # Output detailed report to json for verification
    output_data = {
        "summary": {
            "total_attack_parts": len(results),
            "dr_zero_count": len(dr_zero),
            "dr_equal_consume_sp_count": len(dr_equal_consume_sp),
            "dr_diff_consume_sp_count": len(dr_diff_consume_sp),
            "virtual_sp_classification": virtual_sp_stats,
            "outliers_count": len(outliers)
        },
        "outliers": outliers,
        "all_parts": results
    }
    
    output_path = os.path.join(base_dir, "analysis", "destruction_analysis_report.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
    print(f"\nDetailed analysis written to {output_path}")

if __name__ == "__main__":
    analyze()
