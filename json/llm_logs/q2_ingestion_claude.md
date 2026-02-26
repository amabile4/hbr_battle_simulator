一致点: characters->styles->skills の主joinは妥当。
相違点: style-skillはM:N前提が必要。
採用案: 複合キー/中間関係を許容し、legacyはread互換中心。
不採用理由: name単独keyは将来崩壊リスク。
判定: Conditional Go。
