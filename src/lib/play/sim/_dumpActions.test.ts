import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadPlayCatalog } from '../server/catalog';
import { BOT_PROFILES } from '../server/botPolicy';
import { playOneGame } from './selfPlay';
import { SEAT_COLORS } from '../types';
function realWinner(vp:Record<string,number>){let b:string|null=null,bv=29;for(const[s,v]of Object.entries(vp))if(v>=30&&v>bv){bv=v;b=s}return b}
// Diagnostic dump (no assertions — writes /tmp/actions3.json). Skipped in CI like the
// other `_`-prefixed sim diagnostics; run manually with `.only` to refresh balance
// metrics. (It was timing out at ~10min after the class rebalance — it's a dev tool,
// not a gate. Re-baseline balance via the sim harness when needed.)
test.skip('density + winrate', async () => {
  const c = await loadPlayCatalog();
  const lineups: Record<string,string[]> = {
    mixed: ['pvphunter','hard','rushpatient','cullean'],
    economy: ['hard','rushpatient','cullean','cultivator'],
  };
  const out: any = {};
  for (const [name, lineup] of Object.entries(lineups)) {
    let act=0, vis=0, dec=0, rsum=0;
    for (let i=0;i<70;i++){
      const r=playOneGame(c,{seed:1+i, profiles:lineup.map(n=>BOT_PROFILES[n]), maxRounds:300});
      act+=r.locRowActions; vis+=r.locVisits;
      const w=realWinner(r.finalVP); if(w){dec++; rsum+=r.rounds}
    }
    out[name]={ actionsPerVisit:+(act/vis).toFixed(2), decisive:`${dec}/70`, avgRounds:dec?+(rsum/dec).toFixed(1):null };
  }
  writeFileSync('/tmp/actions3.json', JSON.stringify(out,null,2));
}, 180000);
