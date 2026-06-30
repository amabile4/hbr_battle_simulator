import os
import json

def analyze():
    base_dir = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    skills_json_path = os.path.join(base_dir, "seraphdb_json", "skills.json")

    with open(skills_json_path, "r", encoding="utf-8") as f:
        skills = json.load(f)

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

    def get_f_tag(desc, is_aoe):
        if "[破壊率絶大]" in desc:
            return 2.50
        elif "[破壊率超特大]" in desc:
            return 1.60 if is_aoe else 2.00
        elif "[破壊率特大]" in desc:
            return 1.20 if is_aoe else 1.50
        elif "[破壊率大]" in desc:
            return 0.80 if is_aoe else 1.00
        return 0.20 if is_aoe else 0.25

    for skill in skills:
        skill_name = skill.get("name", "")
        parent_desc = skill.get("desc", "")
        skill_id = skill.get("id")

        # Flat parts helper
        def process_parts(parts_list, sub_desc=None, sub_sp=None):
            for p in parts_list:
                st = p.get("skill_type")
                if st in ["SkillCondition", "SkillRandom", "SkillSwitch"]:
                    strval = p.get("strval", [])
                    if isinstance(strval, list):
                        for sub in strval:
                            if isinstance(sub, dict) and "parts" in sub:
                                # Determine sub desc and sp
                                s_desc = sub.get("desc", sub_desc)
                                s_sp = sub.get("sp_cost", sub_sp)
                                process_parts(sub["parts"], s_desc, s_sp)
                    elif isinstance(strval, dict) and "parts" in strval:
                        s_desc = strval.get("desc", sub_desc)
                        s_sp = strval.get("sp_cost", sub_sp)
                        process_parts(strval["parts"], s_desc, s_sp)
                elif st in ALLOWED_ATTACK_TYPES:
                    multipliers = p.get("multipliers", {})
                    dr = float(multipliers.get("dr", 1.0))
                    is_aoe = (p.get("target_type") == "All") or (skill.get("target_type") == "All")
                    
                    # Refined fTag logic
                    # Determine description to use based on sub-skill or parent
                    desc_to_use = parent_desc
                    if sub_desc:
                        # Conditional descriptions:
                        # e.g. "オーバードライブ中" vs "オーバードライブ中以外"
                        # If sub_desc is "オーバードライブ中以外" or "士気レベル6未満" or "ダウンターン中の敵がいない", 
                        # we should strip the conditional extra destruction tag from parent_desc if it is only for the positive condition.
                        if "オーバードライブ中以外" in sub_desc or "士気レベル6未満" in sub_desc or "ダウンターン中の敵がいない" in sub_desc or "未チャージ" in sub_desc:
                            # Strip the positive condition tag
                            if skill_name == "邪眼・マリンスラッシュ":
                                desc_to_use = "敵全体に... [破壊率特大]"
                            elif skill_name == "レインボーミラクルスライダー":
                                desc_to_use = "敵単体に..."
                            elif skill_name == "アーク・オブ・ヴィクトリア":
                                desc_to_use = "敵に氷属性の10連撃"
                            elif skill_name == "覇道妄執我突邁進" or skill_name == "覇道妄執我突邁進+":
                                desc_to_use = "[破壊率大]"
                            elif skill_name == "セレスティアルショット":
                                desc_to_use = "[破壊率特大]"
                            else:
                                desc_to_use = parent_desc
                                for tag in ["[破壊率絶大]", "[破壊率超特大]", "[破壊率特大]", "[破壊率大]"]:
                                    if f"{tag}" in parent_desc:
                                        desc_to_use = parent_desc.replace(tag, "")
                                        break
                        elif "オーバードライブ中" in sub_desc or "士気レベル6以上" in sub_desc or "ダウンターン中の敵がいる" in sub_desc:
                            # Positive condition gets the full description
                            desc_to_use = parent_desc

                    # Special rule for part-level conditions:
                    # If the part itself has cond: "IsHitWeak()", its dr is calculated based on the base fTag (without weakness tag).
                    part_cond = p.get("cond", "")
                    if part_cond == "IsHitWeak()":
                        # The database dr is calculated using base fTag (e.g. 0.2 for AoE, 1.0 if [破壊率大] is base)
                        if skill_name == "破壊のシニシズム" or skill_name == "フグリングクラッシュ":
                            desc_to_use = "敵全体に攻撃"
                        elif skill_name == "アイドルスマイル":
                            desc_to_use = "敵全体に突属性攻撃"
                        elif skill_name == "神崎流忍術・氷塵" or skill_name == "神崎流忍術・散華":
                            desc_to_use = "[破壊率大]"

                    f_tag = get_f_tag(desc_to_use, is_aoe)
                    
                    # Raging Claw (レイジングクロー) has a permanent exception: f_tag = 5/3
                    if skill_name == "レイジングクロー":
                        f_tag = 5.0 / 3.0

                    results.append({
                        "skill_id": skill_id,
                        "skill_name": skill_name,
                        "sub_desc": sub_desc,
                        "sp_cost": sub_sp if sub_sp is not None else float(skill.get("sp_cost", 0)),
                        "is_aoe": is_aoe,
                        "f_tag": f_tag,
                        "dr": dr,
                        "part_type": st
                    })

        process_parts(skill.get("parts", []))

    # Calculate Virtual SP and classify
    virtual_sp_stats = {}
    outliers = []

    for r in results:
        if r["dr"] == 0:
            continue
        
        v_sp = r["dr"] / r["f_tag"]
        r["virtual_sp"] = v_sp
        
        diff_from_int = abs(v_sp - round(v_sp))
        diff_from_half = abs(v_sp - (round(v_sp * 2) / 2))
        
        if diff_from_int < 1e-4:
            v_sp_type = "int"
            r["v_sp_val"] = int(round(v_sp))
        elif diff_from_half < 1e-4:
            v_sp_type = "half"
            r["v_sp_val"] = round(v_sp * 2) / 2
        else:
            v_sp_type = "other"
            r["v_sp_val"] = v_sp
            outliers.append(r)

        virtual_sp_stats[v_sp_type] = virtual_sp_stats.get(v_sp_type, 0) + 1

    print(f"Total active parts analyzed: {len(results)}")
    print(f"Virtual SP classification:")
    for k, v in virtual_sp_stats.items():
        print(f"  {k}: {v}")

    if outliers:
        print(f"\nRemaining outliers: {len(outliers)}")
        for o in outliers:
            print(f"  Name: {o['skill_name']} | SP Cost: {o['sp_cost']} | fTag: {o['f_tag']:.4f} | DR: {o['dr']} | Virtual SP: {o['virtual_sp']:.4f}")
    else:
        print("\n🎉 SUCCESS! Zero outliers remaining. All active parts fit the fTag * Virtual SP formula perfectly!")

if __name__ == "__main__":
    analyze()
