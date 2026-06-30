import json
import random
import os
import sys

# Resolve path to engine
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../engine")))
from destruction_calc_engine import DestructionCalculatorEngine

def generate_large_fixtures():
    engine = DestructionCalculatorEngine()
    
    # Load sp_mapping locally
    sp_mapping_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../seraphdb_json/skill_sp_mapping.json"))
    sp_mapping = {}
    if os.path.exists(sp_mapping_path):
        with open(sp_mapping_path, "r", encoding="utf-8") as f:
            sp_mapping = json.load(f)
            
    # Get available styles, enemies, skills
    styles = engine.styles
    enemies = engine.enemies
    
    # Filter skills that have attack parts
    skills = []
    for s in engine.skills:
        parts = engine._flatten_parts(s.get("parts", []))
        has_attack = False
        for p in parts:
            if p.get("skill_type") in [
                "AttackNormal", "AttackSkill", "DamageRateChangeAttackSkill",
                "PenetrationCriticalAttack", "PenetrationNormalAttack", "PenetrationSkill",
                "TokenAttack", "AttackBySp", "AttackByOwnDpRate", "FixedHpDamageRateAttack"
            ]:
                has_attack = True
                break
        if has_attack:
            skills.append(s)
            
    # Add special placeholders
    skills.append({"name": "通常攻撃", "id": 46001101})
    skills.append({"name": "追撃", "id": 46001191})
    
    cases = []
    
    for i in range(1000):
        # Choose a random style
        style = random.choice(styles)
        # Choose accessories
        accs = []
        accessory_destruction_rate_bonus = 0.0
        if random.random() < 0.2:
            # Various accessory destruction rate bonuses that exist in-game
            accessory_destruction_rate_bonus = random.choice([0.10, 0.12, 0.15])
            
        # Choose random buffs
        buffs = []
        # destruction buffs
        num_buffs = random.randint(0, 3)
        for _ in range(num_buffs):
            buffs.append({
                "statusType": "DestructionUp",
                "power": round(random.uniform(5.0, 120.0), 2),
                "skillName": f"BuffSkill{random.randint(1, 5)}"
            })
        # ignored buffs
        if random.random() < 0.3:
            buffs.append({
                "statusType": random.choice(["AttackUp", "CritRateUp", "MindEye"]),
                "power": 30.0,
                "skillName": "IgnoredSkill"
            })
            
        # Choose random enemy
        enemy = random.choice(enemies)
        
        # Choose random debuffs
        debuffs = []
        if random.random() < 0.3:
            debuffs.append({
                "statusType": "DefenseDown",
                "power": 30.0,
                "skillName": "DebuffSkill"
            })
            
        # Choose random skill
        skill = random.choice(skills)
        
        # Generate random hits
        num_hits = random.randint(1, 12)
        hits = []
        for _ in range(num_hits):
            hits.append({
                "damage": round(random.uniform(0.0, 150000.0), 2),
                "isMultiHit": random.choice([True, False]),
                "hitRatio": round(random.uniform(0.05, 1.0), 2)
            })
            
        input_data = {
            "attacker": {
                "characterId": style.get("chara", "Unknown"),
                "styleId": style["id"],
                "accessories": [],
                "accessoryDestructionRateBonus": accessory_destruction_rate_bonus,
                "statusEffects": buffs
            },
            "defender": {
                "enemyId": enemy["id"],
                "enemyName": enemy.get("name", "Unknown"),
                "destructionRate": round(random.uniform(1.0, 3.0), 4),
                "destructionLimit": random.choice([None, round(random.uniform(3.0, 5.0), 2)]),
                "dp": round(random.uniform(0.0, 300000.0), 2),
                "destructionResist": round(random.uniform(0.0, 0.5), 4),
                "statusEffects": debuffs
            },
            "skill": {
                "skillId": skill["id"],
                "name": skill["name"]
            },
            "hits": hits
        }
        
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
        input_data["autoBreak"] = True
        
        try:
            expected = engine.calculate_destruction(input_data)
            cases.append({
                "name": f"Random Case {i}",
                "input": input_data,
                "expected": expected
            })
        except Exception as e:
            # Skip cases that crash (e.g. invalid setup/fallback)
            continue
            
    output_path = os.path.join(os.path.dirname(__file__), "fixtures/test_cases_destruction_large.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(cases, f, indent=2, ensure_ascii=False)
        
    print(f"Generated {len(cases)} randomized destruction test cases in {output_path}")

if __name__ == "__main__":
    generate_large_fixtures()
