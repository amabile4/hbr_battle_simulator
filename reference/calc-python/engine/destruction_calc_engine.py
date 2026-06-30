from base_engine import BaseCalculatorEngine
import math

class DestructionCalculatorEngine(BaseCalculatorEngine):
    def _find_attack_part(self, skill):
        if not skill:
            return None
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
        parts = self._flatten_parts(skill.get("parts", []))
        for p in parts:
            if p.get("skill_type") in ALLOWED_ATTACK_TYPES:
                return p
        return None

    def calculate_destruction(self, input_data):
        attacker_data = input_data.get("attacker", {})
        defender_data = input_data.get("defender", {})
        skill_data = input_data.get("skill", {})
        hits = input_data.get("hits", [])

        # 1. Look up attacker style & role
        style_id = attacker_data.get("styleId")
        style = next((s for s in self.styles if s["id"] == style_id), None)
        role = style.get("role", "Attacker") if style else "Attacker"

        # 2. Look up skill
        skill_id = skill_data.get("skillId")
        skill_name = skill_data.get("name")
        clean_name = skill_name
        if skill_name:
            clean_name = skill_name.replace("[単独発動]", "").split("[")[0].split("(")[0].split("（")[0].strip()
            
        skill = self._find_skill(skill_id, clean_name)

        part = None
        if "attackPart" in skill_data and skill_data["attackPart"] is not None:
            part = skill_data["attackPart"]
        elif skill:
            part = self._find_attack_part(skill)

        # 3. SP cost and attack type resolution
        is_normal_attack = False
        is_pursuit = False
        sp = 4.0

        if "isNormalAttack" in skill_data and skill_data["isNormalAttack"] is not None:
            is_normal_attack = bool(skill_data["isNormalAttack"])

        if "isPursuit" in skill_data and skill_data["isPursuit"] is not None:
            is_pursuit = bool(skill_data["isPursuit"])

        if "spCostOverride" in skill_data and skill_data["spCostOverride"] is not None:
            sp = float(skill_data["spCostOverride"])
        elif skill:
            sp = float(skill.get("sp_cost", 4.0))
        sp = max(0.0, sp)

        # Resolve dr value
        dr = None
        if part and "multipliers" in part and part["multipliers"] is not None and "dr" in part["multipliers"] and part["multipliers"]["dr"] is not None:
            condition_results = skill_data.get("conditionResults")
            if part.get("skill_type") == "DamageRateChangeAttackSkill" and part.get("cond") and condition_results and condition_results.get(part.get("cond")) is True:
                dr = float(part.get("value", [0])[0])
            else:
                dr = float(part["multipliers"]["dr"])

        if dr is None:
            if is_normal_attack:
                dr = 1.0
            elif is_pursuit:
                dr = 0.75

        # 4. Resolve destruction factor (F_tag) and AoE flag (only used as fallback when dr is missing)
        is_aoe = False
        if skill:
            is_aoe = (skill.get("target_type") == "All" or skill.get("is_aoe") is True)
        if skill_data.get("isAoE") is True:
            is_aoe = True

        f_tag = 0.20 if is_aoe else 0.25
        if skill:
            desc = skill.get("desc", "") or ""
            if "[破壊率絶大]" in desc:
                f_tag = 2.50
            elif "[破壊率超特大]" in desc:
                f_tag = 1.60 if is_aoe else 2.00
            elif "[破壊率特大]" in desc:
                f_tag = 1.20 if is_aoe else 1.50
            elif "[破壊率大]" in desc:
                f_tag = 0.80 if is_aoe else 1.00

        # 5. Resolve enemy destructionMultiplier
        enemy_id = defender_data.get("enemyId")
        enemy = next((e for e in self.enemies if str(e["id"]) == str(enemy_id)), None)
        
        dest_mult = defender_data.get("destructionMultiplier")
        if dest_mult is None:
            if enemy and "base_param" in enemy:
                dest_mult = float(enemy["base_param"].get("d_rate", 1.0))
            else:
                dest_mult = 1.0
        else:
            dest_mult = float(dest_mult)

        # 6. Calculate base destruction rate before buffs
        if dr is not None:
            if is_normal_attack or is_pursuit:
                base_dest_rate = dr * 8.0 * dest_mult / 100.0
            else:
                base_dest_rate = dr * 4.0 * dest_mult / 100.0
        else:
            # Fallback tag-based calculation
            sp_val = 8.0 if (is_normal_attack or is_pursuit) else sp
            dr_val = dest_mult / 25.0
            base_dest_rate = f_tag * sp_val * dr_val

        # 7. Blaster correction & accessories
        blaster_correction = 0.0
        if role.lower() == "blaster":
            blaster_correction += 2.0
            
        # アクセサリー破壊率ボーナスの動的解決
        accessory_bonus = attacker_data.get("accessoryDestructionRateBonus")
        if accessory_bonus is not None:
            accessory_bonus = float(accessory_bonus)
        else:
            accessory_bonus = 0.0
        blaster_correction += accessory_bonus

        # 8. Resolve buffs (DestructionUp)
        buffs = attacker_data.get("statusEffects", [])
        dest_buffs = [b for b in buffs if b.get("statusType") == "DestructionUp"]
        
        destruction_buffs_resolved = []
        for b in dest_buffs:
            p_resolved = self.resolve_effect_power(b)
            destruction_buffs_resolved.append(p_resolved)
            
        # 上位2枠の合計を適用
        destruction_buffs_resolved.sort(reverse=True)
        buff_multiplier = sum(destruction_buffs_resolved[:2]) / 100.0

        # 9. Total hits count (h)
        h = sum(1 for hit in hits if not hit.get("isMultiHit", False))
        if h == 0:
            if skill:
                h = int(skill.get("hit_count", 1))
            else:
                h = 1

        # 10. Blaster slope correction
        if blaster_correction > 0.0:
            b_pct = blaster_correction * 100.0
            if h < 11:
                s_pct = 5.0 + ((b_pct - 5.0) * (h - 1)) / 9.0
            else:
                s_pct = b_pct
            s_ratio = s_pct / 100.0
        else:
            s_ratio = 0.0

        # 11. Base destruction with buffs and blaster
        flat_destruction_bonus = float(attacker_data.get("flatDestructionRateBonus") or 0.0)

        if is_normal_attack or is_pursuit:
            base_destruction = base_dest_rate
        else:
            base_destruction = math.floor(base_dest_rate * (1.0 + s_ratio + buff_multiplier + flat_destruction_bonus) * 10000.0) / 10000.0

        # 12. Apply enemy destructionResist
        dest_resist = defender_data.get("destructionResist")
        if dest_resist is None:
            dest_resist = 0.0
        else:
            dest_resist = float(dest_resist)
            
        # 共鳴アビリティボーナスの適用（乗算枠）
        resonance_bonus = attacker_data.get("resonanceDestructionRateBonus")
        if resonance_bonus is not None:
            resonance_bonus = float(resonance_bonus)
        else:
            resonance_bonus = 0.0
            
        final_base_destruction = base_destruction * (1.0 - dest_resist) * (1.0 + resonance_bonus)

        # 13. Resolve destruction rate limit (超ブレイク等の上限超越を加算)
        dest_limit = defender_data.get("destructionLimit")
        if dest_limit is None:
            if enemy and "base_param" in enemy:
                dest_limit = float(enemy["base_param"].get("max_d_rate", 150.0)) / 100.0
            else:
                dest_limit = 3.0
        else:
            dest_limit = float(dest_limit)
            
        # 上限超越ボーナスの加算
        limit_exceed_bonus = attacker_data.get("destructionLimitExceedBonus")
        if limit_exceed_bonus is not None:
            limit_exceed_bonus = float(limit_exceed_bonus)
        else:
            limit_exceed_bonus = 0.0
            
        final_dest_limit = dest_limit + limit_exceed_bonus

        # 14. Simulation
        auto_break = bool(input_data.get("autoBreak", False))
        dp_init = float(defender_data.get("dp", 0.0))
        destruction_rate = float(defender_data.get("destructionRate", 1.0))

        dmg_accum = 0.0
        is_broken = dp_init <= 0.0
        for hit in hits:
            dmg_accum += float(hit.get("damage", 0.0))
            hit_is_break = (dmg_accum >= dp_init) if auto_break else bool(hit.get("isBreakHit", False))
            if hit_is_break or is_broken:
                is_broken = True
                if hit.get("isMultiHit", False):
                    add_i = final_base_destruction * float(hit.get("hitRatio", 1.0))
                else:
                    add_i = final_base_destruction / h
                # 超越された上限でクランプ
                destruction_rate = min(final_dest_limit, destruction_rate + add_i)

        # 15. Ignored effects warning
        ignored_effects = []
        for b in buffs:
            if b.get("statusType") != "DestructionUp":
                ignored_effects.append({
                    "statusType": b.get("statusType"),
                    "skillName": b.get("skillName"),
                    "side": "attacker"
                })

        return {
            "destructionRate": destruction_rate,
            "breakdown": {
                "baseDestruction": base_destruction,
                "finalBaseDestruction": final_base_destruction,
                "blasterCorrection": blaster_correction,
                "buffMultiplier": buff_multiplier,
                "accessoryBonus": accessory_bonus,
                "resonanceBonus": resonance_bonus,
                "limitExceedBonus": limit_exceed_bonus,
                "flatDestructionRateBonus": flat_destruction_bonus,
                "ignoredEffects": ignored_effects
            }
        }
