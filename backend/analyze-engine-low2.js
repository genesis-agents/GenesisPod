const data = require('./coverage/coverage-summary.json');
const files = Object.entries(data).filter(([f]) => f !== 'total');
// Filter for engine files (Windows paths use backslashes)
const eng = files.filter(([f, v]) => f.indexOf('ai-engine') !== -1);
const low = eng.filter(([f, v]) => v.statements.pct < 50 && v.statements.total >= 20);
low.sort((a,b) => (b[1].statements.total - b[1].statements.covered) - (a[1].statements.total - a[1].statements.covered));
console.log('Engine files with <50% coverage, sorted by uncovered count:');
let shown = 0;
for(const [f, v] of low) {
  if(shown >= 25) break;
  const parts = f.split('ai-engine');
  const clean = (parts[1] || f).replace(/\\/g, '/');
  const uncov = v.statements.total - v.statements.covered;
  process.stdout.write(v.statements.pct.toFixed(1).padStart(6)+'%  '+String(uncov).padStart(5)+' uncov  '+clean+'\n');
  shown++;
}
console.log('Total engine files:', eng.length);
