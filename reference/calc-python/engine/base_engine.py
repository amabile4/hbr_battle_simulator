import json
import os
import math

# パス定義
def _get_json_path(relative_path):
    # Try resolving relative to REAL_DIR (resolving symlinks)
    real_dir = os.path.dirname(os.path.realpath(__file__))
    path1 = os.path.abspath(os.path.join(real_dir, relative_path))
    if os.path.exists(path1):
        return path1

    # Try resolving relative to CALLED_DIR
    called_dir = os.path.dirname(os.path.abspath(__file__))
    path2 = os.path.abspath(os.path.join(called_dir, relative_path))
    if os.path.exists(path2):
        return path2

    # Try removing "../" prefix if searching in hbr_calc root
    if relative_path.startswith("../json/"):
        sub_path = relative_path[3:] # "json/styles.json"
        path3 = os.path.abspath(os.path.join(called_dir, sub_path))
        if os.path.exists(path3):
            return path3

    # Try directly under called_dir
    path4 = os.path.abspath(os.path.join(called_dir, relative_path))
    if os.path.exists(path4):
        return path4

    return relative_path

STYLES_JSON_PATH = _get_json_path("../json/styles.json")
CHARACTERS_JSON_PATH = _get_json_path("../json/characters.json")
ENEMIES_JSON_PATH = _get_json_path("../json/enemies.json")
SKILLS_JSON_PATH = _get_json_path("../json/skills.json")

class BaseCalculatorEngine:
    def __init__(self):
        self.styles = self._load_json(STYLES_JSON_PATH)
        self.characters = self._load_json(CHARACTERS_JSON_PATH)
        self.enemies = self._load_json(ENEMIES_JSON_PATH)
        self.skills = self._load_json(SKILLS_JSON_PATH)

    def _load_json(self, path):
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return []

    def _flatten_parts(self, parts):
        flat = []
        for p in parts:
            if p.get("skill_type") in ["SkillCondition", "SkillRandom", "SkillSwitch"]:
                strval = p.get("strval", [])
                if isinstance(strval, list):
                    for sub_skill in strval:
                        if isinstance(sub_skill, dict) and "parts" in sub_skill:
                            flat.extend(self._flatten_parts(sub_skill["parts"]))
                elif isinstance(strval, dict) and "parts" in strval:
                    flat.extend(self._flatten_parts(strval["parts"]))
            else:
                flat.append(p)
        return flat

    def _find_skill(self, skill_id, skill_name):
        candidates = []
        if skill_id:
            candidates = [s for s in self.skills if s["id"] == skill_id]
        if not candidates and skill_name:
            candidates = [s for s in self.skills if s["name"] == skill_name]
            
        if not candidates:
            return None
            
        # 攻撃スキルの許可リスト (部分一致による誤検出防止)
        ALLOWED_ATTACK_TYPES = [
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
        ]
        
        for c in candidates:
            parts = self._flatten_parts(c.get("parts", []))
            for p in parts:
                p_type = p.get("skill_type", "")
                if p_type in ALLOWED_ATTACK_TYPES:
                    return c
        return candidates[0]

    def _find_effect_part(self, skill_id, skill_name, target_types):
        candidates = []
        if skill_id:
            candidates = [s for s in self.skills if s["id"] == skill_id]
        if not candidates and skill_name:
            candidates = [s for s in self.skills if s["name"] == skill_name]
            
        if not candidates:
            return None
            
        for c in candidates:
            for p in self._flatten_parts(c.get("parts", [])):
                if p.get("skill_type") in target_types:
                    return p
        return None

    def resolve_effect_power_from_part(self, part, options):
        powers = part.get("power", [0.0, 0.0])
        v_min = float(powers[0]) * 100.0
        v_max = float(powers[1]) * 100.0 if len(powers) > 1 else v_min
        
        t = float(part.get("diff_for_max", 0.0))
        growths = part.get("growth", [0.03, 0.02])
        g_min = float(growths[0]) if growths else 0.03
        g_max = float(growths[1]) if len(growths) > 1 else g_min
        
        weights = part.get("parameters", {})
        provider_stats = options.get("providerStats")
        default_stat = options.get("defaultStat", 675.0)
        
        if provider_stats:
            norm_stats = {}
            for k, v in provider_stats.items():
                kl = str(k).lower()
                if kl == "int":
                    norm_stats["wis"] = float(v)
                elif kl == "mnd":
                    norm_stats["spr"] = float(v)
                else:
                    norm_stats[kl] = float(v)
            
            weighted_sum = 0.0
            weight_sum = 0.0
            for k, w in weights.items():
                if w > 0:
                    stat_val = norm_stats.get(k, 600.0)
                    weighted_sum += stat_val * w
                    weight_sum += w
            provider_stat_val = weighted_sum / weight_sum if weight_sum > 0 else default_stat
        else:
            provider_stat_val = options.get("providerWis") or options.get("providerWisOrLuk")
            if provider_stat_val is None:
                provider_stat_val = default_stat
            else:
                provider_stat_val = float(provider_stat_val)
            
        skill_level = options.get("skillLevel", 10.0)
        orb_level = options.get("orbLevel", 0.0)
        
        v_min_l = v_min * (1.0 + g_min * (skill_level - 1.0))
        v_max_l = v_max * (1.0 + g_max * (skill_level - 1.0))
        
        status_type = options.get("statusType", "")
        is_debuff = options.get("isEnemyDebuff")
        if is_debuff is None:
            is_debuff = status_type in ["DefenseDown", "ElementResistDown", "Fragile"]
        
        regime = "belowMin"
        jewel_addition = 0.0
        stat_diff = 0.0

        if is_debuff:
            enemy_border = float(options.get("enemyBorder", 770.0))
            stat_diff = provider_stat_val - enemy_border
            if stat_diff < 0:
                eff = v_min_l
                regime = "belowMin"
            elif stat_diff < t:
                eff = ((v_max_l - v_min_l) / t) * stat_diff + v_min_l
                regime = "linear"
            else:
                eff = v_max_l * (1.0 + 0.001 * (stat_diff - t))
                regime = "overCap"
                
            if orb_level > 0:
                t_orb = 20.0 * orb_level
                t_jewel = t + t_orb
                
                if stat_diff < 0:
                    jewel_addition = v_min * orb_level * 0.02
                elif stat_diff < t_jewel:
                    jewel_addition = (((v_max - v_min) / t_jewel) * stat_diff + v_min) * orb_level * 0.02
                else:
                    jewel_addition = v_max * orb_level * 0.02
                eff += jewel_addition
                
            eff = math.floor(100.0 * eff) / 100.0
        else:
            if t <= 0:
                eff = v_max_l
                regime = "overCap"
            elif provider_stat_val >= t:
                eff = v_max_l * (1.0 + 0.0002 * (provider_stat_val - t))
                regime = "overCap"
            elif provider_stat_val < 0:
                eff = v_min_l
                regime = "belowMin"
            else:
                eff = ((v_max_l - v_min_l) / t) * provider_stat_val + v_min_l
                regime = "linear"
                
            if orb_level > 0:
                t_orb = 60.0 * orb_level
                t_jewel = t + t_orb
                
                if provider_stat_val >= t_jewel:
                    jewel_addition = v_max * orb_level * 0.04
                else:
                    jewel_addition = (((v_max - v_min) / t_jewel) * provider_stat_val + v_min) * orb_level * 0.04
                eff += jewel_addition
                
        power = max(0.0, eff)
        breakdown = {
            "providerStatVal": provider_stat_val,
            "threshold": t,
            "minAtLevel": v_min_l,
            "maxAtLevel": v_max_l,
            "regime": regime,
            "jewelAddition": jewel_addition
        }
        if is_debuff:
            breakdown["statDiff"] = stat_diff

        return {"power": power, "breakdown": breakdown}

    def resolve_effect_power(self, effect, default_stat=675, default_level=10, default_orb=0, enemy_border=770):
        """
        バフ・デバフの効果量を動的に解決する (知性・運スケーリング)
        """
        if "power" in effect and effect["power"] is not None:
            return float(effect["power"])
            
        skill_name = effect.get("skillName")
        skill_id = effect.get("sourceSkillId")
        status_type = effect.get("statusType")
        
        target_types = {
            "AttackUp": ["AttackUp"],
            "ElementAttackUp": ["ElementAttackUp", "AttackUp"],
            "DefenseDown": ["DefenseDown"],
            "ElementResistDown": ["ElementResistDown", "DefenseDown"],
            "Fragile": ["Fragile"],
            "CritDamageUp": ["CritDamageUp", "CritRateUp", "CritBuff"],
            "MindEye": ["MindEye", "WeaknessAttackUp"],
            "Charge": ["BuffCharge", "Charge"],
            "Funnel": ["Funnel"],
        }.get(status_type, [status_type])
        
        part = self._find_effect_part(skill_id, skill_name, target_types)
        if not part:
            return 0.0

        resolved_options = {
            "providerStats": effect.get("providerStats") or effect.get("stats"),
            "providerWis": effect.get("providerWis"),
            "providerWisOrLuk": effect.get("providerWisOrLuk"),
            "statusType": status_type,
            "enemyBorder": enemy_border,
            "skillLevel": effect.get("skillLevel", default_level),
            "orbLevel": effect.get("orbLevel", default_orb),
            "defaultStat": default_stat,
        }

        res = self.resolve_effect_power_from_part(part, resolved_options)
        return res["power"]

    def get_enemy_border(self, enemy_id):
        """
        enemies.json から敵の防御境界値（param_border）を引き当てる
        """
        enemy = next((e for e in self.enemies if str(e["id"]) == str(enemy_id)), None)
        if enemy and "base_param" in enemy:
            border = enemy["base_param"].get("param_border", 0)
            if border > 0:
                return border
        return 770
