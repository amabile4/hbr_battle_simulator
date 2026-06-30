from base_engine import BaseCalculatorEngine
import math

class DamageCalculatorEngine(BaseCalculatorEngine):
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
        style = next((s for s in self.styles if s["id"] == style_id), None)
        role = style.get("role", "Attacker") if style else "Attacker"
        
        stats = self.get_role_template_stats(role)
        lb_bonus = int(limit_break_count) * 20
        for k in stats:
            stats[k] += lb_bonus
            
        return stats

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
        options = input_data.get("options", {})
        clamp_over_limit = bool(options.get("clampOverLimit", options.get("clamp_over_limit", True)))
        
        character_id = attacker_data.get("characterId")
        style_id = attacker_data.get("styleId")
        limit_break_count = attacker_data.get("limitBreakCount", 0)
        
        # 1. 攻撃者ステータスの決定
        style = next((s for s in self.styles if s["id"] == style_id), None)
        stats = attacker_data.get("stats")
        if not stats:
            stats = self.get_interpolated_stats(character_id, style_id, limit_break_count)
            
        # 2. スキルパラメータの取得
        skill_id = skill_data.get("skillId")
        skill_name = skill_data.get("name")
        clean_name = skill_name
        if skill_name:
            clean_name = skill_name.replace("[単独発動]", "").split("[")[0].split("(")[0].split("（")[0].strip()
            
        skill = self._find_skill(skill_id, clean_name)
            
        sp = 4.0
        e_mapped = None
        is_aoe = False
        is_normal_attack = False
        is_pursuit = False
        
        if "isNormalAttack" in skill_data and skill_data["isNormalAttack"] is not None:
            is_normal_attack = bool(skill_data["isNormalAttack"])
        elif skill and skill.get("name") == "通常攻撃" and str(skill.get("id", "")).endswith("01"):
            is_normal_attack = True
            
        if "isPursuit" in skill_data and skill_data["isPursuit"] is not None:
            is_pursuit = bool(skill_data["isPursuit"])
        elif skill and skill.get("name") == "追撃" and str(skill.get("id", "")).endswith("91"):
            is_pursuit = True
            
        if "isAoe" in skill_data and skill_data["isAoe"] is not None:
            is_aoe = bool(skill_data["isAoe"])
        elif skill:
            is_aoe = (skill.get("target_type") == "All")
            
        if "spCostOverride" in skill_data and skill_data["spCostOverride"] is not None:
            sp = float(skill_data["spCostOverride"])
        elif skill:
            sp = float(skill.get("sp_cost", 4.0))
            
        if "eMappedOverride" in skill_data and skill_data["eMappedOverride"] is not None:
            e_mapped = float(skill_data["eMappedOverride"])
                    
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
        
        weighted_sum = 0.0
        weight_sum = 0.0
        for stat_name, weight in weights.items():
            if weight > 0:
                key_map = {"str": "str", "dex": "dex", "wis": "wis", "spr": "spr", "luk": "luk", "con": "con"}
                stat_val = stats.get(key_map.get(stat_name, stat_name), 600)
                weighted_sum += stat_val * weight
                weight_sum += weight
                
        status_atk = (weighted_sum / weight_sum) if weight_sum > 0 else (sum(stats.values()) / len(stats) if stats else 600.0)
        
        enemy_id = defender_data.get("enemyId")
        param_border = defender_data.get("paramBorder")
        if param_border is None:
            param_border = self.get_enemy_border(enemy_id)
            
        skill_level = float(skill_data.get("level", 10.0))
        
        if is_normal_attack:
            threshold = 100.0
            min_power = 237.5
            max_power = 475.0
        elif is_pursuit:
            threshold = 114.0
            min_power = 645.0
            max_power = 1290.0
        else:
            threshold = e_mapped if e_mapped is not None else (105.0 + sp * 3.0)
            if is_aoe:
                min_power = (159.0 + 9.0 * (sp**2 - 1.0)) * (1.0 + (skill_level - 1.0) * 0.05) * 2.5
                max_power = (795.0 + 45.0 * (sp**2 - 1.0)) * (1.0 + (skill_level - 1.0) * 0.02)
            else:
                min_power = (162.0 + 12.0 * (sp**2 - 1.0)) * (1.0 + (skill_level - 1.0) * 0.05) * 2.5
                max_power = (810.0 + 60.0 * (sp**2 - 1.0)) * (1.0 + (skill_level - 1.0) * 0.02)
                
        diff_normal = status_atk - param_border
        
        if diff_normal < 0:
            base_damage_normal = (min_power / threshold) * (diff_normal + threshold)
        elif diff_normal < threshold:
            base_damage_normal = ((max_power - min_power) / threshold) * diff_normal + min_power
        else:
            if clamp_over_limit:
                base_damage_normal = max_power
            else:
                base_damage_normal = max_power + max_power * (diff_normal - threshold) * 0.0025
            
        base_damage_normal = max(0.0, base_damage_normal)
        
        threshold_crit = threshold / 2.0 if is_normal_attack else threshold
        
        ability_spr_correction = float(attacker_data.get("abilitySprCorrection") or attacker_data.get("as48") or 0.0)
        border_crit = param_border - 50.0 - max(0.0, -50.0 - ability_spr_correction)
        diff_crit = status_atk - border_crit
        
        if diff_crit < 0:
            base_damage_crit = (min_power / threshold_crit) * (diff_crit + threshold_crit) * 1.5
        elif diff_crit < threshold_crit:
            base_damage_crit = (((max_power - min_power) / threshold_crit) * diff_crit + min_power) * 1.5
        else:
            if clamp_over_limit:
                base_damage_crit = max_power * 1.5
            else:
                base_damage_crit = (max_power + max_power * (diff_crit - threshold_crit) * 0.0025) * 1.5
            
        base_damage_crit = max(0.0, base_damage_crit)

        if not part:
            base_damage_normal = 0.0
            base_damage_crit = 0.0
        
        buffs = attacker_data.get("statusEffects", [])
        debuffs = defender_data.get("statusEffects", [])
        ignored_effects = []
        
        token_ratio = attacker_data.get("tokenRatio")
        if token_ratio is None:
            token_count = attacker_data.get("tokenCount", 0)
            token_ratio = token_count * 0.10
        else:
            token_ratio = float(token_ratio)
            
        for b in buffs:
            if "statusType" not in b:
                b["statusType"] = b.get("buffType") or "AttackUp"
            if "skillName" not in b:
                b["skillName"] = ""
        for d in debuffs:
            if "statusType" not in d:
                d["statusType"] = d.get("debuffType") or "DefenseDown"
            if "skillName" not in d:
                d["skillName"] = ""

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
                
            b_res = dict(b)
            if "providerStats" not in b_res and "stats" not in b_res and "providerWis" not in b_res and "providerWisOrLuk" not in b_res:
                b_res["providerStats"] = stats
                
            p_resolved = self.resolve_effect_power(b_res)
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
                
            d_res = dict(d)
            p_resolved = self.resolve_effect_power(d_res, enemy_border=param_border)
            d_res["resolved_power"] = p_resolved
            
            if st in ["DefenseDown", "ElementResistDown"]:
                debuffs_resolved.append(d_res)
            elif st == "Fragile":
                fragiles_resolved.append(d_res)

        is_hp_target = defender_data.get("isHpTarget", True)
        special_effect = multipliers.get("hp" if is_hp_target else "dp", 1.0)
        
        resistances = defender_data.get("resistances", {})
        weapon_type = style.get("type", "Slash") if style else "Slash"
        affinity_mult = resistances.get(weapon_type, 1.0)
        
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
                ignored_effects.append({
                    "statusType": "activeZone",
                    "skillName": input_data.get("activeZone"),
                    "side": "context"
                })
            
        element_mult = 1.0
        for element in part_elements:
            el_key = str(element).strip()
            el_val = resistances.get(el_key)
            if el_val is None:
                el_val = resistances.get(el_key.lower())
            if el_val is None and "element" in resistances:
                el_val = resistances["element"].get(el_key)
                if el_val is None:
                    el_val = resistances["element"].get(el_key.lower())
            if el_val is not None:
                try:
                    numeric_el = float(el_val)
                    if numeric_el > 10:
                        element_mult *= numeric_el / 100.0
                    else:
                        element_mult *= numeric_el
                except ValueError:
                    pass

        resistance_total = affinity_mult * element_mult
        is_weakness_attack = (affinity_mult > 1.0) or (element_mult > 1.0)
        
        mindeye_buff_total = sum(d.get("resolved_power", 0.0) for d in mindeye_buffs_resolved) / 100.0
        if not is_weakness_attack or is_normal_attack or is_pursuit:
            mindeye_buff_total = 0.0
        
        buff_mult = 1.0 + self.aggregate_buffs(buffs_resolved) + zone_buff_rate + mindeye_buff_total
        
        debuff_val = self.aggregate_debuffs(debuffs_resolved)
        fragile_val = self.aggregate_fragiles(fragiles_resolved, is_weakness_attack)
        debuff_mult = 1.0 + debuff_val + fragile_val
        fragile_mult = 1.0

        crit_buff_total = sum(d.get("resolved_power", 0.0) for d in crit_buffs_resolved) / 100.0
        crit_scale = (1.5 + crit_buff_total) / 1.5
        funnel_mult = 1.0 + sum(d.get("resolved_power", 0.0) for d in funnel_buffs_resolved) / 100.0
        token_mult = 1.0 + token_ratio
        
        # ナイトキルエッジなどの一時的破壊率上書きの解決
        destruction_rate = defender_data.get("destructionRateOverride")
        if destruction_rate is None:
            destruction_rate = defender_data.get("destructionRate", 1.0)
        else:
            destruction_rate = float(destruction_rate)

        # ピアス装備（減衰型・ヒット数解決済み ratio）: アタック=対HPのみ / ブレイク=対DPのみ。
        # スキル攻撃力カテゴリのため通常攻撃・追撃には適用しない。
        attack_pierce_up_rate = float(attacker_data.get("attackPierceUpRate") or 0.0)
        break_pierce_up_rate = float(attacker_data.get("breakPierceUpRate") or 0.0)
        pierce_up_rate = attack_pierce_up_rate if is_hp_target else break_pierce_up_rate
        pierce_up_rate = max(0.0, pierce_up_rate)
        pierce_multiplier = 1.0 if (is_normal_attack or is_pursuit) else (1.0 + pierce_up_rate)
        
        expected_normal = base_damage_normal * resistance_total * destruction_rate * special_effect * debuff_mult * buff_mult * token_mult * funnel_mult * pierce_multiplier
        expected_crit = base_damage_crit * resistance_total * destruction_rate * special_effect * debuff_mult * buff_mult * token_mult * crit_scale * funnel_mult * pierce_multiplier

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
                "pierceMultiplier": pierce_multiplier,
                "ignoredEffects": ignored_effects
            }
        }
