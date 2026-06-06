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

class DamageCalculatorEngine:
    def __init__(self):
        self.styles = self._load_json(STYLES_JSON_PATH)
        self.characters = self._load_json(CHARACTERS_JSON_PATH)
        self.enemies = self._load_json(ENEMIES_JSON_PATH)
        self.skills = self._load_json(SKILLS_JSON_PATH)
        self.sp_mapping = self._load_json_dict(_get_json_path("skill_sp_mapping.json"))

    def _load_json_dict(self, path):
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {}

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

    def get_role_template_stats(self, role):
        """
        最大育成・最上位テンプレート装備におけるロールごとの基準能力値
        """
        role = str(role).lower()
        if role in ["attacker", "blaster"]:
            return {"str": 650, "dex": 650, "wis": 600, "spr": 600, "luk": 600, "con": 600}
        elif role in ["buffer"]:
            return {"str": 600, "dex": 600, "wis": 670, "spr": 620, "luk": 600, "con": 600}
        elif role in ["debuffer"]:
            return {"str": 600, "dex": 600, "wis": 650, "spr": 600, "luk": 670, "con": 600}
        elif role in ["defender", "healer"]:
            return {"str": 600, "dex": 600, "wis": 600, "spr": 670, "luk": 600, "con": 650}
        else: # Default
            return {"str": 620, "dex": 620, "wis": 620, "spr": 620, "luk": 620, "con": 620}

    def get_interpolated_stats(self, character_id, style_id, limit_break_count=0):
        """
        指定されたキャラクターとスタイル、限界突破数から、最大レベル（Lv120）時のステータスを自動算出（補完）する。
        """
        # styles.json からスタイルを特定
        style = next((s for s in self.styles if s["id"] == style_id), None)
        role = style.get("role", "Attacker") if style else "Attacker"
        
        # ロールテンプレートのステータスを取得
        stats = self.get_role_template_stats(role)
        
        # 限界突破（凸数：0〜4）による主要ステータス補正を加算 (+20 * N)
        lb_bonus = int(limit_break_count) * 20
        for k in stats:
            stats[k] += lb_bonus
            
        return stats

    def get_enemy_border(self, enemy_id):
        """
        enemies.json から敵の防御境界値（param_border）を引き当てる
        """
        # enemy_id が数値か文字列か曖昧な場合に対応
        enemy = next((e for e in self.enemies if str(e["id"]) == str(enemy_id)), None)
        if enemy and "base_param" in enemy:
            border = enemy["base_param"].get("param_border", 0)
            if border > 0:
                return border
        # スコアアタック難易度40グレード35相当の代表値 (マスタ欠損または敵未指定時のフォールバック)
        return 770

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

    def resolve_effect_power(self, effect, default_stat=675, default_level=10, default_orb=0):
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
            
        powers = part.get("power", [0.0, 0.0])
        v_min = float(powers[0]) * 100.0
        v_max = float(powers[1]) * 100.0 if len(powers) > 1 else v_min
        
        t = float(part.get("diff_for_max", 0.0))
        growths = part.get("growth", [0.03, 0.02])
        g_min = float(growths[0]) if growths else 0.03
        g_max = float(growths[1]) if len(growths) > 1 else g_min
        
        weights = part.get("parameters", {})
        dep_param = "wis"
        for k, w in weights.items():
            if w > 0:
                dep_param = k
                break
                
        provider_stat_val = effect.get("providerWis") or effect.get("providerWisOrLuk")
        if provider_stat_val is None:
            provider_stat_val = default_stat
            
        skill_level = effect.get("skillLevel", default_level)
        orb_level = effect.get("orbLevel", default_orb)
        
        v_orb = 0.04 * orb_level
        t_orb = 60.0 * orb_level
        
        v_min_l = v_min * (1.0 + g_min * (skill_level - 1))
        v_max_l = v_max * (1.0 + g_max * (skill_level - 1)) * (1.0 + v_orb)
        t_final = t + t_orb
        
        if t_final <= 0:
            eff = v_max_l
        elif provider_stat_val >= t_final:
            eff = v_max_l
        else:
            eff = ((v_max_l - v_min_l) / t_final) * provider_stat_val + v_min_l
            
        return max(0.0, eff)

    def aggregate_buffs(self, buffs_resolved):
        """
        通常発動バフ上位2枠合計と、単独発動バフ最大値の大きい方を返す
        """
        normal_buffs = []
        single_buffs = []
        
        for b in buffs_resolved:
            name = b.get("skillName", "")
            limit_type = b.get("limitType") or b.get("limit_type")
            power = b.get("resolved_power", 0.0)
            if limit_type == "Only" or "[単独発動]" in name or "単独発動" in name:
                single_buffs.append(power)
            else:
                normal_buffs.append(power)
                
        normal_buffs.sort(reverse=True)
        normal_total = sum(normal_buffs[:2])
        
        single_buffs.sort(reverse=True)
        single_max = single_buffs[0] if single_buffs else 0.0
        
        return max(normal_total, single_max) / 100.0

    def classify_debuff(self, effect):
        # 明示的なカテゴリ指定があれば優先
        if "category" in effect and effect["category"]:
            return effect["category"]

        status_type = effect.get("statusType") or effect.get("debuffType") or ""
        if status_type == "ElementResistDown":
            return "ElementDefense"
        return "NormalDefense"

    def aggregate_debuffs(self, debuffs_resolved):
        """
        防御デバフのカテゴリ別集約
        """
        categories = {
            "NormalDefense": [],
            "PermDefense": [],
            "ElementDefense": [],
            "PermElementDefense": [],
            "DPDefense": []
        }
        
        for d in debuffs_resolved:
            cat = self.classify_debuff(d)
            power = d.get("resolved_power", 0.0)
            categories[cat].append(power)
            
        total = 0.0
        for cat, powers in categories.items():
            powers.sort(reverse=True)
            if cat == "DPDefense":
                total += sum(powers)
            else:
                total += sum(powers[:2])
                
        return total / 100.0

    def classify_fragile(self, effect):
        # 明示的なカテゴリ指定があれば優先
        if "category" in effect and effect["category"]:
            return effect["category"]

        return "NormalFragile"

    def aggregate_fragiles(self, fragiles_resolved, is_weakness_attack):
        """
        脆弱デバフの通常（弱点限定）と永続の集約
        """
        categories = {
            "NormalFragile": [],
            "PermFragile": []
        }
        
        for f in fragiles_resolved:
            power = f.get("resolved_power", 0.0)
            cat = self.classify_fragile(f)
            categories[cat].append(power)
            
        normal_powers = categories["NormalFragile"]
        normal_powers.sort(reverse=True)
        normal_total = sum(normal_powers[:2]) if is_weakness_attack else 0.0
        
        perm_powers = categories["PermFragile"]
        perm_powers.sort(reverse=True)
        perm_total = sum(perm_powers[:2])
        
        return (normal_total + perm_total) / 100.0

    def calculate_damage(self, input_data):
        """
        ダメージ期待値（通常・クリティカル）と内訳を算出する
        """
        attacker_data = input_data.get("attacker", {})
        defender_data = input_data.get("defender", {})
        skill_data = input_data.get("skill", {})
        
        character_id = attacker_data.get("characterId")
        style_id = attacker_data.get("styleId")
        limit_break_count = attacker_data.get("limitBreakCount", 0)
        
        # 1. 攻撃者ステータスの決定
        style = next((s for s in self.styles if s["id"] == style_id), None)
        stats = attacker_data.get("stats")
        if not stats:
            # get_interpolated_stats is a fallback approximation.
            stats = self.get_interpolated_stats(character_id, style_id, limit_break_count)
            
        # 2. スキルパラメータの取得
        skill_id = skill_data.get("skillId")
        skill_name = skill_data.get("name")
        
        # Look up in mapping
        mapping_info = self.sp_mapping.get(skill_name) if isinstance(self.sp_mapping, dict) else None
        clean_name = skill_name
        if skill_name:
            clean_name = skill_name.replace("[単独発動]", "").split("[")[0].split("(")[0].split("（")[0].strip()
            
        if not mapping_info and skill_name:
            mapping_info = self.sp_mapping.get(clean_name) if isinstance(self.sp_mapping, dict) else None
            
        skill = self._find_skill(skill_id, clean_name)
            
        sp = 4.0
        e_mapped = None
        is_aoe = False
        is_normal_attack = False
        is_pursuit = False
        
        if mapping_info:
            sp_val = mapping_info.get("sp")
            if sp_val is not None and sp_val != "-":
                sp = float(sp_val)
            else:
                sp = 0.0
                
            e_val = mapping_info.get("e")
            if e_val is not None:
                e_mapped = float(e_val)
                
            is_aoe = mapping_info.get("is_aoe", False)
            is_normal_attack = mapping_info.get("is_normal_attack", False)
            is_pursuit = mapping_info.get("is_pursuit", False)
        else:
            if skill:
                sp = float(skill.get("sp_cost", 4.0))
                is_aoe = (skill.get("target_type") == "All")
            if skill_name:
                if "通常攻撃" in skill_name:
                    is_normal_attack = True
                elif "追撃" in skill_name:
                    is_pursuit = True
                    
        hit_count = 1
        parts = []
        if skill:
            hit_count = int(skill.get("hit_count", 1))
            parts = self._flatten_parts(skill.get("parts", []))
            
        if not parts:
            parts = [{
                "skill_type": "AttackNormal",
                "power": [200.0, 400.0],
                "parameters": {"str": 1, "dex": 1, "wis": 0, "spr": 0, "luk": 0, "con": 0},
                "multipliers": {"hp": 1.0, "dp": 1.0, "dr": 1.0}
            }]
            
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
        
        part = None
        for p in parts:
            p_type = p.get("skill_type", "")
            if p_type in ALLOWED_ATTACK_TYPES:
                part = p
                break
                
        if part:
            weights = part.get("parameters", {"str": 1, "dex": 1})
            multipliers = part.get("multipliers", {"hp": 1.0, "dp": 1.0})
            part_elements = part.get("elements", [])
        else:
            weights = {}
            multipliers = {"hp": 1.0, "dp": 1.0}
            part_elements = []
        
        # 3. 適用能力値 (AJ8) の計算
        weighted_sum = 0.0
        weight_sum = 0.0
        for stat_name, weight in weights.items():
            if weight > 0:
                key_map = {"str": "str", "dex": "dex", "wis": "wis", "spr": "spr", "luk": "luk", "con": "con"}
                stat_val = stats.get(key_map.get(stat_name, stat_name), 600)
                weighted_sum += stat_val * weight
                weight_sum += weight
                
        status_atk = (weighted_sum / weight_sum) if weight_sum > 0 else (sum(stats.values()) / len(stats) if stats else 600.0)
        
        # 4. 敵の防御値の決定 (AY6 / AY5)
        enemy_id = defender_data.get("enemyId")
        param_border = defender_data.get("paramBorder")
        if param_border is None:
            param_border = self.get_enemy_border(enemy_id)
            
        # 5. 通常基礎ダメージ (W59) の計算
        skill_level = float(skill_data.get("level", 10.0))
        
        if is_normal_attack:
            e59 = 100.0
            l59 = 237.5
            m59 = 475.0
        elif is_pursuit:
            e59 = 114.0
            l59 = 645.0
            m59 = 1290.0
        else:
            e59 = e_mapped if e_mapped is not None else (105.0 + sp * 3.0)
            if is_aoe:
                l59 = (159.0 + 9.0 * (sp**2 - 1.0)) * (1.0 + (skill_level - 1.0) * 0.05) * 2.5
                m59 = (795.0 + 45.0 * (sp**2 - 1.0)) * (1.0 + (skill_level - 1.0) * 0.02)
            else:
                l59 = (162.0 + 12.0 * (sp**2 - 1.0)) * (1.0 + (skill_level - 1.0) * 0.05) * 2.5
                m59 = (810.0 + 60.0 * (sp**2 - 1.0)) * (1.0 + (skill_level - 1.0) * 0.02)
                
        diff_normal = status_atk - param_border
        
        if diff_normal < 0:
            base_damage_normal = (l59 / e59) * (diff_normal + e59)
        else:
            base_damage_normal = ((m59 - l59) / e59) * min(diff_normal, e59) + l59
            
        base_damage_normal = max(0.0, base_damage_normal)
        
        # 6. クリティカル基礎ダメージ (X59) の計算
        # 通常攻撃のみ e_crit = e_normal / 2.0 (Excel仕様)
        e_crit = e59 / 2.0 if is_normal_attack else e59
        
        ability_spr_correction = float(attacker_data.get("abilitySprCorrection") or attacker_data.get("as48") or 0.0)
        border_crit = param_border - 50.0 - max(0.0, -50.0 - ability_spr_correction)
        diff_crit = status_atk - border_crit
        
        if diff_crit < 0:
            base_damage_crit = (l59 / e_crit) * (diff_crit + e_crit) * 1.5
        else:
            base_damage_crit = (((m59 - l59) / e_crit) * min(diff_crit, e_crit) + l59) * 1.5
            
        base_damage_crit = max(0.0, base_damage_crit)

        # 攻撃 part が存在しない場合は基礎ダメージを 0.0 に固定
        if not part:
            base_damage_normal = 0.0
            base_damage_crit = 0.0
        
        # 7. バフ・デバフ、トークンの集約
        buffs = attacker_data.get("statusEffects", [])
        debuffs = defender_data.get("statusEffects", [])
        ignored_effects = []
        
        # tokenCount と tokenRatio の統一
        token_ratio = attacker_data.get("tokenRatio")
        if token_ratio is None:
            token_count = attacker_data.get("tokenCount", 0)
            token_ratio = token_count * 0.10 # デフォルト: トークン1つあたり +10%
        else:
            token_ratio = float(token_ratio)
            
        # 標準化（後方互換性のため）
        for b in buffs:
            if "statusType" not in b:
                b["statusType"] = b.get("buffType") or "AttackUp"
            if "skillName" not in b:
                b["skillName"] = b.get("skillName") or ""
        for d in debuffs:
            if "statusType" not in d:
                d["statusType"] = d.get("debuffType") or "DefenseDown"
            if "skillName" not in d:
                d["skillName"] = d.get("skillName") or ""

        # サイレントドロップ防止用のサポート効果定義
        SUPPORTED_BUFFS = ["AttackUp", "CritDamageUp", "CritBuff", "MindEye", "Charge", "Funnel", "ElementAttackUp"]
        SUPPORTED_DEBUFFS = ["DefenseDown", "ElementResistDown", "Fragile"]

        buffs_resolved = []
        debuffs_resolved = []
        fragiles_resolved = []
        crit_buffs_resolved = []
        mindeye_buffs_resolved = []
        funnel_buffs_resolved = []
        
        for b in buffs:
            st = b.get("statusType")
            if st not in SUPPORTED_BUFFS:
                ignored_effects.append({"statusType": st, "skillName": b.get("skillName"), "side": "attacker"})
                continue
                
            p_resolved = self.resolve_effect_power(b)
            b_res = dict(b)
            b_res["resolved_power"] = p_resolved
            
            if st in ["AttackUp", "Charge", "ElementAttackUp"]:
                buffs_resolved.append(b_res)
            elif st in ["CritDamageUp", "CritBuff"]:
                crit_buffs_resolved.append(b_res)
            elif st == "MindEye":
                mindeye_buffs_resolved.append(b_res)
            elif st == "Funnel":
                funnel_buffs_resolved.append(b_res)
                
        for d in debuffs:
            st = d.get("statusType")
            if st not in SUPPORTED_DEBUFFS:
                ignored_effects.append({"statusType": st, "skillName": d.get("skillName"), "side": "defender"})
                continue
                
            p_resolved = self.resolve_effect_power(d)
            d_res = dict(d)
            d_res["resolved_power"] = p_resolved
            
            if st in ["DefenseDown", "ElementResistDown"]:
                debuffs_resolved.append(d_res)
            elif st == "Fragile":
                fragiles_resolved.append(d_res)

        # 8. 耐性・弱点 (AJ88) & 特効 (AJ11)
        is_hp_target = defender_data.get("isHpTarget", True)
        special_effect = multipliers.get("hp" if is_hp_target else "dp", 1.0)
        
        resistances = defender_data.get("resistances", {})
        weapon_type = style.get("type", "Slash") if style else "Slash"
        affinity_mult = resistances.get(weapon_type, 1.0)
        
        # activeZone の正規化とマッピング判定
        active_zone = str(input_data.get("activeZone", "None")).strip().lower()
        zone_buff_rate = 0.0
        
        ZONE_ELEMENT_MAP = {
            "firezone": "fire",
            "icezone": "ice",
            "thunderzone": "thunder",
            "darkzone": "dark",
            "lightzone": "light"
        }
        
        if active_zone != "none":
            if active_zone in ZONE_ELEMENT_MAP:
                zone_element = ZONE_ELEMENT_MAP[active_zone]
                skill_elements = [str(el).strip().lower() for el in part_elements]
                if zone_element in skill_elements:
                    zone_buff_rate = 0.5
            else:
                # 未知のゾーン文字列は警告として ignoredEffects に追加
                ignored_effects.append({
                    "statusType": "activeZone",
                    "skillName": input_data.get("activeZone"),
                    "side": "context"
                })
            
        resistance_total = affinity_mult
        
        # 弱点属性攻撃の判定 (耐性補正が 1.0 を超えているか)
        is_weakness_attack = (resistance_total > 1.0)
        
        # 集約された倍率
        mindeye_buff_total = sum(d.get("resolved_power", 0.0) for d in mindeye_buffs_resolved) / 100.0
        if not is_weakness_attack or is_normal_attack or is_pursuit:
            mindeye_buff_total = 0.0
        
        buff_mult = 1.0 + self.aggregate_buffs(buffs_resolved) + zone_buff_rate + mindeye_buff_total
        
        debuff_val = self.aggregate_debuffs(debuffs_resolved)
        fragile_val = self.aggregate_fragiles(fragiles_resolved, is_weakness_attack)
        debuff_mult = 1.0 + debuff_val + fragile_val
        fragile_mult = 1.0

        # クリティカル枠 (加算)
        crit_buff_total = sum(d.get("resolved_power", 0.0) for d in crit_buffs_resolved) / 100.0
        crit_scale = (1.5 + crit_buff_total) / 1.5
        
        # 連撃枠
        funnel_mult = 1.0 + sum(d.get("resolved_power", 0.0) for d in funnel_buffs_resolved) / 100.0
        
        token_mult = 1.0 + token_ratio
        
        # 9. 最終ダメージ期待値の計算
        destruction_rate = defender_data.get("destructionRate", 1.0)
        
        expected_normal = base_damage_normal * resistance_total * destruction_rate * special_effect * debuff_mult * buff_mult * token_mult * funnel_mult
        expected_crit = base_damage_crit * resistance_total * destruction_rate * special_effect * debuff_mult * buff_mult * token_mult * crit_scale * funnel_mult

        expected_normal = max(0.0, expected_normal)
        expected_crit = max(0.0, expected_crit)
        
        return {
            "normal": {
                "expected": expected_normal,
                "min": expected_normal * 0.9,
                "max": expected_normal * 1.1
            },
            "critical": {
                "expected": expected_crit,
                "min": expected_crit * 0.9,
                "max": expected_crit * 1.1
            },
            "breakdown": {
                "baseDamageNormal": base_damage_normal,
                "baseDamageCrit": base_damage_crit,
                "buffMultiplier": buff_mult,
                "critMindeyeMultiplier": crit_scale,
                "debuffMultiplier": debuff_mult,
                "vulnerabilityMultiplier": fragile_mult,
                "resistMultiplier": 1.0,
                "affinityMultiplier": affinity_mult,
                "tokenMultiplier": token_mult,
                "funnelMultiplier": funnel_mult,
                "ignoredEffects": ignored_effects
            }
        }

    def calculate_destruction(self, input_data):
        """
        破壊率（Destruction Rate）の計算およびヒットごとの累積シミュレーションを行う
        """
        attacker_data = input_data.get("attacker", {})
        defender_data = input_data.get("defender", {})
        skill_data = input_data.get("skill", {})
        hits_data = input_data.get("hits", [])
        
        ignored_effects = []
        
        # 1. 攻撃者の解決とロールの特定
        style_id = attacker_data.get("styleId")
        style = next((s for s in self.styles if s["id"] == style_id), None)
        role = style.get("role", "Attacker") if style else "Attacker"
        
        # ブラスターロール補正（+200% = 2.00）
        bg27 = 2.00 if str(role).lower() == "blaster" else 0.0
        
        # 装備アクセサリ（ブラストピアス等）
        accessories = attacker_data.get("accessories", []) or []
        if "BlastPierce" in accessories or "ブラストピアス" in accessories:
            bg27 += 0.15
            
        # 2. スキルの基本情報の取得 (BG30)
        skill_id = skill_data.get("skillId")
        skill_name = skill_data.get("name")
        
        clean_name = skill_name
        if skill_name:
            clean_name = skill_name.replace("[単独発動]", "").split("[")[0].split("(")[0].split("（")[0].strip()
            
        skill = self._find_skill(skill_id, clean_name)
        
        bg30 = 0.0
        hit_count = 1
        part = None
        
        if skill:
            hit_count = int(skill.get("hit_count", 1))
            parts = self._flatten_parts(skill.get("parts", []))
            
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
            
            for p in parts:
                p_type = p.get("skill_type", "")
                if p_type in ALLOWED_ATTACK_TYPES:
                    part = p
                    break
                    
        if part:
            multipliers = part.get("multipliers", {})
            bg30_raw = float(multipliers.get("dr", 1.0))
            
            is_normal_attack = False
            is_pursuit = False
            if skill_name:
                if "通常攻撃" in skill_name:
                    is_normal_attack = True
                elif "追撃" in skill_name:
                    is_pursuit = True
                    
            if is_normal_attack:
                bg30 = 0.08
            elif is_pursuit:
                bg30 = bg30_raw
            else:
                sp_cost = float(skill.get("sp_cost", 0.0)) if skill else 0.0
                mapping_info = self.sp_mapping.get(clean_name) if isinstance(self.sp_mapping, dict) else None
                if mapping_info:
                    sp_val = mapping_info.get("sp")
                    if sp_val is not None and sp_val != "-":
                        sp_cost = float(sp_val)
                bg30 = (bg30_raw * sp_cost) / 100.0
        else:
            # フォールバック
            bg30 = 1.0
            if skill_name:
                if "通常攻撃" in skill_name:
                    bg30 = 0.08
                elif "追撃" in skill_name:
                    bg30 = 1.0
            
        # 3. バフの集約 (AS39)
        # 破壊率アップバフのみを処理
        SUPPORTED_BUFFS = ["DestructionUp"]
        buffs = attacker_data.get("statusEffects", []) or []
        destruction_buffs_resolved = []
        
        for b in buffs:
            st = b.get("statusType")
            if st not in SUPPORTED_BUFFS:
                ignored_effects.append({"statusType": st, "skillName": b.get("skillName"), "side": "attacker"})
                continue
                
            p_resolved = self.resolve_effect_power(b)
            b_res = dict(b)
            b_res["resolved_power"] = p_resolved
            destruction_buffs_resolved.append(b_res)
            
        # 破壊率バフの集約ルール（通常バフと同様に、上位2枠の合計を適用）
        destruction_buffs_resolved.sort(key=lambda x: x.get("resolved_power", 0.0), reverse=True)
        as39 = sum(b.get("resolved_power", 0.0) for b in destruction_buffs_resolved[:2]) / 100.0
        
        # 4. デバフ側の処理 (現在サポートされていないデバフはすべて警告)
        debuffs = defender_data.get("statusEffects", []) or []
        for d in debuffs:
            st = d.get("statusType")
            ignored_effects.append({"statusType": st, "skillName": d.get("skillName"), "side": "defender"})
            
        # 5. 敵の耐性と破壊上限の解決
        al10 = float(defender_data.get("destructionResist", 0.0))
        
        # 破壊上限 (max_d_rate) の取得
        destruction_limit = defender_data.get("destructionLimit")
        if destruction_limit is None:
            enemy_id = defender_data.get("enemyId")
            enemy = next((e for e in self.enemies if str(e["id"]) == str(enemy_id)), None)
            if enemy and "base_param" in enemy:
                max_d_rate = enemy["base_param"].get("max_d_rate", 150)
                destruction_limit = max_d_rate / 100.0
            else:
                destruction_limit = 3.0 # デフォルト 300%
                
        # 6. 基本破壊率の計算 (D_base)
        is_normal_attack = False
        is_pursuit = False
        if skill_name:
            if "通常攻撃" in skill_name:
                is_normal_attack = True
            elif "追撃" in skill_name:
                is_pursuit = True
                
        if is_normal_attack or is_pursuit:
            d_base = bg30
        elif bg27 == 0:
            d_base = math.floor((bg30 * (1.0 + as39)) * 10000) / 10000.0
        else:
            # ブラスター補正 (スロープ補正) の計算
            b_pct = bg27 * 100.0
            if hit_count < 11:
                slope_pct = 5.0 + ((b_pct - 5.0) * (hit_count - 1.0)) / 9.0
            else:
                slope_pct = b_pct
                
            d_base = math.floor((bg30 * (100.0 + slope_pct + as39 * 100.0) / 100.0) * 10000) / 10000.0
            
        destruction_multiplier = float(defender_data.get("destructionMultiplier", 1.0))
        d_final_base = d_base * (1.0 - al10) * destruction_multiplier
        
        # 7. ヒットごとの累積シミュレーション
        initial_destruction = float(defender_data.get("destructionRate", 1.0))
        dp_initial = float(defender_data.get("dp", 0.0))
        auto_break = input_data.get("autoBreak") is True
        
        current_destruction = initial_destruction
        accumulated_damage = 0.0
        
        # ヒットリストのシミュレーション
        for hit in hits_data:
            damage = float(hit.get("damage", 0.0))
            is_multi_hit = bool(hit.get("isMultiHit", False))
            hit_ratio = float(hit.get("hitRatio", 1.0))
            
            accumulated_damage += damage
            
            # ブレイク判定
            if auto_break:
                is_broken = (accumulated_damage >= dp_initial)
            else:
                is_broken = (hit.get("isBreakHit") is True)
            
            if is_broken:
                if is_multi_hit:
                    # 連撃ヒット
                    add_val = d_final_base * hit_ratio
                else:
                    # 通常ヒット
                    add_val = d_final_base / hit_count
            else:
                add_val = 0.0
                
            current_destruction = min(destruction_limit, current_destruction + add_val)
            
        return {
            "destructionRate": current_destruction,
            "breakdown": {
                "baseDestruction": d_base,
                "finalBaseDestruction": d_final_base,
                "blasterCorrection": bg27,
                "buffMultiplier": as39,
                "destructionMultiplier": destruction_multiplier,
                "ignoredEffects": ignored_effects
            }
        }
