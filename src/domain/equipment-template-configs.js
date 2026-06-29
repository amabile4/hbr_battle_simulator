const CHARMS_MAX = [
  { id: 5024001, enhanceTier: 4 },
  { id: 5024002, enhanceTier: 4 },
  { id: 5024003, enhanceTier: 4 },
  { id: 5024004, enhanceTier: 4 },
  { id: 5024005, enhanceTier: 4 },
  { id: 5024006, enhanceTier: 4 },
];

const SOUL_EMOTIONAL = (stat) => ({
  id: 5010112,
  enhanceLevel: 5,
  slotEffects: [
    { stat, value: 3 },
    { stat, value: 3 },
    { stat, value: 3 },
  ],
});

export const EQUIPMENT_BUILD_TEMPLATES = Object.freeze([
  {
    id: 'no_equipment',
    label: '装備なし（デフォルト）',
    config: null,
  },
  {
    id: 'force_max',
    label: '力最優先',
    config: {
      soul: SOUL_EMOTIONAL('str'),
      booster: { id: 86000601 },
      chips: [{ id: 87005001 }, { id: 87005001 }, { id: 87005001 }, { id: 87005001 }],
      accessories: [
        { id: 5000307, enhanceTier: 0, slotEffects: [{ stat: 'str', value: 3 }, { stat: 'str', value: 3 }, { stat: 'str', value: 3 }] },
        { id: 5021002, enhanceTier: 2, slotEffects: [{ stat: 'str', value: 3 }, { stat: 'str', value: 3 }, { stat: 'str', value: 3 }] },
        { id: 5022828, enhanceTier: 0, slotEffects: [{ stat: 'str', value: 3 }, { stat: 'str', value: 3 }, { stat: 'str', value: 3 }] },
        { id: 5025003, enhanceTier: 0, slotEffects: [{ stat: 'str', value: 3 }, { stat: 'str', value: 3 }, { stat: 'str', value: 3 }] },
      ],
      charms: CHARMS_MAX,
    },
  },
  {
    id: 'dexterity_max',
    label: '器用さ最優先',
    config: {
      soul: SOUL_EMOTIONAL('dex'),
      booster: { id: 86000602 },
      chips: [{ id: 87005001 }, { id: 87005001 }, { id: 87005001 }, { id: 87005001 }],
      accessories: [
        { id: 5000309, enhanceTier: 0, slotEffects: [{ stat: 'dex', value: 3 }, { stat: 'dex', value: 3 }, { stat: 'dex', value: 3 }] },
        { id: 5021001, enhanceTier: 2, slotEffects: [{ stat: 'dex', value: 3 }, { stat: 'dex', value: 3 }, { stat: 'dex', value: 3 }] },
        { id: 5022928, enhanceTier: 0, slotEffects: [{ stat: 'dex', value: 3 }, { stat: 'dex', value: 3 }, { stat: 'dex', value: 3 }] },
        { id: 5025007, enhanceTier: 0, slotEffects: [{ stat: 'dex', value: 3 }, { stat: 'dex', value: 3 }, { stat: 'dex', value: 3 }] },
        { id: 5004004, enhanceTier: 0, slotEffects: [] },
      ],
      charms: CHARMS_MAX,
    },
  },
  {
    id: 'wisdom_max',
    label: '知性優先',
    config: {
      soul: SOUL_EMOTIONAL('wis'),
      booster: { id: 86000603 },
      chips: [{ id: 87005003 }, { id: 87005003 }, { id: 87005003 }, { id: 87005003 }],
      accessories: [
        { id: 5000317, enhanceTier: 0, slotEffects: [{ stat: 'wis', value: 3 }, { stat: 'wis', value: 3 }, { stat: 'wis', value: 3 }] },
        { id: 5021003, enhanceTier: 2, slotEffects: [{ stat: 'wis', value: 3 }, { stat: 'wis', value: 3 }, { stat: 'wis', value: 3 }] },
        { id: 5022804, enhanceTier: 0, slotEffects: [{ stat: 'wis', value: 3 }, { stat: 'wis', value: 3 }, { stat: 'wis', value: 3 }] },
        { id: 5023006, enhanceTier: 0, slotEffects: [{ stat: 'wis', value: 3 }, { stat: 'wis', value: 3 }, { stat: 'wis', value: 3 }] },
        { id: 5004018, enhanceTier: 0, slotEffects: [] },
      ],
      charms: CHARMS_MAX,
    },
  },
  {
    id: 'luck_max',
    label: '運優先',
    config: {
      soul: SOUL_EMOTIONAL('luk'),
      booster: { id: 86000603 },
      chips: [{ id: 87005003 }, { id: 87005003 }, { id: 87005003 }, { id: 87005003 }],
      accessories: [
        { id: 5000322, enhanceTier: 0, slotEffects: [{ stat: 'luk', value: 3 }, { stat: 'luk', value: 3 }, { stat: 'luk', value: 3 }] },
        { id: 5021003, enhanceTier: 2, slotEffects: [{ stat: 'luk', value: 3 }, { stat: 'luk', value: 3 }, { stat: 'luk', value: 3 }] },
        { id: 5022928, enhanceTier: 0, slotEffects: [{ stat: 'luk', value: 3 }, { stat: 'luk', value: 3 }, { stat: 'luk', value: 3 }] },
        { id: 5023006, enhanceTier: 0, slotEffects: [{ stat: 'luk', value: 3 }, { stat: 'luk', value: 3 }, { stat: 'luk', value: 3 }] },
        { id: 5004018, enhanceTier: 0, slotEffects: [] },
      ],
      charms: CHARMS_MAX,
    },
  },
  {
    id: 'defense_balance',
    label: '精神・体力バランス',
    config: {
      soul: { id: 5010112, enhanceLevel: 5, slotEffects: [{ stat: 'con', value: 3 }, { stat: 'con', value: 3 }, { stat: 'spr', value: 3 }] },
      booster: { id: 86000701 },
      chips: [{ id: 87005002 }, { id: 87005002 }, { id: 87005002 }, { id: 87005002 }],
      accessories: [
        { id: 5000312, enhanceTier: 0, slotEffects: [{ stat: 'con', value: 3 }, { stat: 'spr', value: 3 }, { stat: 'spr', value: 3 }] },
        { id: 5021002, enhanceTier: 2, slotEffects: [{ stat: 'con', value: 3 }, { stat: 'con', value: 3 }, { stat: 'spr', value: 3 }] },
        { id: 5022928, enhanceTier: 0, slotEffects: [{ stat: 'con', value: 3 }, { stat: 'spr', value: 3 }, { stat: 'spr', value: 3 }] },
        { id: 5025002, enhanceTier: 0, slotEffects: [{ stat: 'con', value: 3 }, { stat: 'spr', value: 3 }, { stat: 'spr', value: 3 }] },
        { id: 5004016, enhanceTier: 0, slotEffects: [] },
      ],
      charms: CHARMS_MAX,
    },
  },
]);
