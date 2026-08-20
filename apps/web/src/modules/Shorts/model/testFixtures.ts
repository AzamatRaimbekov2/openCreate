// apps/web/src/modules/Shorts/model/testFixtures.ts
// TEST-ONLY shared fixtures for the Shorts module. Nothing under components/ or
// routes/ may import this file.
//
// A shorts template on the proven vertical triple (ADR shorts-studio §6): 9:16,
// an 8-second beat grid, one free title card, three generated beats — the
// loopable three-beat shape §10 names.
//
// It lives in model/ rather than beside one spec because SIX specs need the same
// template and the same catalog, and the one thing they all lean on is that the
// client's per-beat arithmetic (3 × 30) agrees with the server's tier price (90).
// Two drifting copies of that fixture would quietly retire the drift check.
import type { CatalogModel, TemplateSummary } from '@opencreate/contracts'

// The tier model. Its price table is the source of every number below:
// 3 generated beats × 8s = 3 × 30 = 90 credits per short.
export const TIER_MODEL: CatalogModel = {
  id: 'wan-2-7',
  type: 'video',
  name: 'Cinema',
  providerLabel: 'Wan 2.7',
  air: 'wan:2@7',
  tier: 'plus',
  supportsImageInput: true,
  aspectRatios: ['9:16', '16:9'],
  durationOptions: [5, 8],
  creditsByDuration: { '5': 20, '8': 30 },
}

export const SHORTS_TEMPLATE: TemplateSummary = {
  id: 'street-hook',
  category: 'shorts',
  name: 'Street hook',
  tagline: 'One question, three answers, back to frame one.',
  description: 'A three-beat vertical loop.',
  previewUrl: null,
  aspectRatio: '9:16',
  shotCount: 4,
  clipCount: 3,
  totalDurationSeconds: 26,
  beats: [
    // Free: a title card costs nothing and must never appear in the itemisation.
    { label: 'Title', durationSeconds: 2, generated: false },
    { label: 'Hook', durationSeconds: 8, generated: true },
    { label: 'Turn', durationSeconds: 8, generated: true },
    { label: 'Return to frame 1', durationSeconds: 8, generated: true },
  ],
  tiers: [
    { tier: 'draft', modelId: 'pixverse-v6', modelName: 'Swift', credits: 45, note: null },
    { tier: 'standard', modelId: 'wan-2-7', modelName: 'Cinema', credits: 90, note: null },
    { tier: 'premium', modelId: 'veo-3-1-fast', modelName: 'Premiere', credits: 210, note: null },
  ],
  variables: [
    {
      key: 'hook',
      kind: 'text',
      label: 'Hook line',
      defaultValue: 'What do you regret most?',
      maxLength: 120,
    },
    {
      key: 'setting',
      kind: 'select',
      label: 'Setting',
      defaultValue: 'tokyo',
      options: [
        { value: 'tokyo', label: 'Tokyo at night' },
        { value: 'lisbon', label: 'Lisbon at noon' },
      ],
    },
  ],
  hasVoiceover: false,
  // Both are REQUIRED on TemplateSummary (ADR shorts-studio §10 and §12) — a
  // compliance field nobody has to fill in is a compliance field nobody fills in.
  // `loopable: true` matches this fixture's beat sheet, whose last beat is
  // literally "Return to frame 1"; on a real template that claim is enforced
  // against the final beat's authored prompt by the API's catalog test.
  loopable: true,
  disclosureTier: 'none',
  musicPrompt: null,
}
