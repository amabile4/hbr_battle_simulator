# Support Skills & Resonance Abilities Specification

## Overview

This document outlines the findings and implementation specifications for **Support Skills** (also known as Resonance Abilities / 共鳴アビリティ) within the HEAVEN BURNS RED Battle Simulator data structure.

### 1. Data Source

The primary data source for Resonance Abilities is **`json/support_skills.json`**.
Unlike standard active skills (`skills.json`) or passive skills (`passives.json`), Resonance Abilities are maintained in a completely separate JSON endpoint on the master data server.

### 2. Linkage to Styles

A Style is granted a Resonance Ability if it has the `resonance` key defined in `json/styles.json`.

- **Example from `styles.json`**:

  ```json
  {
    "id": 1006506,
    "name": "夜語りのひとしずく",
    "resonance": "SupportSkill_IrOhshima01"
  }
  ```

The `resonance` value (e.g., `"SupportSkill_IrOhshima01"`) corresponds to the `group` key within the `styles` array inside `support_skills.json`.

### 3. Structure of `support_skills.json`

`support_skills.json` contains two main arrays: `skills` and `styles`.

#### `skills` Array

This array defines the actual abilities. Each entry represents a support skill and includes varying `power` / `value` / `diff_for_max` fields that scale based on the condition (which is typically tied to the Limit Break level of the style set in the support slot).

- Important fields per entry in `skills`:
  - `id`: The internal support skill ID.
  - `name`: The visible name of the Resonance Ability (e.g., `"素敵な夜"` for Mocktail, `"フィーバー・サマータイム"`).
  - `desc`: A description of what the support skill does.
  - `parts`: The actual skill logic (similar to standard `skills.json` or `passives.json`), defining `skill_type`, `effect_type`, `power`, `value`, etc.

#### `styles` Array

This array acts as the bridge mapping specific Character/Style IDs to the Support Skill groups.

- Example:

  ```json
  "styles": [
    {
      "id": 1006506,
      "label": "IrOhshima06",
      "group": "SupportSkill_IrOhshima01"
    }
  ]
  ```

This links the internal ID (`1006506`) to the group `"SupportSkill_IrOhshima01"`. The implementation must find the corresponding skill set within the `skills` array that shares the ID mapped internally by this relationship (though often, the `skills` array elements directly match by character context or internal reference IDs).

### 4. Characteristics of Resonance Abilities

- **Trigger**: They function strictly as passive buffs that activate *only* when the style possessing them is placed in the **Support Slot** of an SS/SSR main style of the same element.
- **Scaling**: Many support skills have effects that scale up based on the Limit Break (限界突破) tiers in the game. When building the simulator logic, the parameter calculations for these skills must account for the Support Style's current Limit Break level.
- **Exclusion**: If a style with a Resonance Ability is placed in the Main Slot and enters battle directly, the Resonance Ability is **ignored** and does not grant its passive effect to the party.

### 5. Implementation Roadmap

To integrate this into the simulator:

1. **Data Loading**: Ensure `support_skills.json` is loaded alongside other asset databases in the simulator's initialization phase.
2. **Party Formation UI**: Allow users to set a `supportStyleId` (from a list of valid same-element styles) for any SS/SSR character in the party.
3. **Stat Bonus**: Automatically apply `10%` of the support style's total stats (post-Limit Break, post-level calculations) to the main style.
4. **Passive Injection (Resonance)**: During battle initialization (or Turn Start depending on the exact `timing`/`cond` of the skill), verify if `mainStyle.supportStyleId` has a valid `resonance` mapping in `styles.json`. If true, extract the corresponding skill from `support_skills.json` and inject it into the main style's active passive effects pool.
