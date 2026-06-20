import { describe, expect, test } from 'vitest';
import { loadPlayCatalog } from '../server/catalog';
import { buildLocationInteractions } from '../locationInteractions';

const RUN_SIM = !!process.env.RUN_SIM;
describe.skipIf(!RUN_SIM)('aug dump', () => {
  test('class augments offered per location', async () => {
    const catalog = await loadPlayCatalog();
    const byClass: Record<string, string[]> = {};
    for (const loc of catalog.locations ?? []) {
      const rows = buildLocationInteractions(loc.rewardRows);
      for (const r of rows) {
        for (const g of r.gains) {
          if (g.type !== 'chooseRune') continue;
          for (const opt of g.options) {
            const cls = opt.classId ? catalog.classes.find((c) => c.id === opt.classId)?.name : undefined;
            if (!cls) continue;
            (byClass[cls] ??= []).push(`${loc.name}#row${r.rowIndex}`);
          }
        }
      }
    }
    console.log('\n=== class AUGMENTS offered (class -> locations) ===');
    for (const [cls, locs] of Object.entries(byClass)) console.log(`${cls.padEnd(16)} ${[...new Set(locs)].join(', ')}`);
    if (Object.keys(byClass).length === 0) console.log('(none found via chooseRune options)');
    expect(catalog.classes.length).toBeGreaterThan(0);
  }, 120000);
});
