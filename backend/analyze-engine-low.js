const data = require('./coverage/coverage-summary.json');
const files = Object.entries(data).filter(([f]) => f !== 'total' && f.includes('ai-engine'));
const low = files.filter(([f, v]) => v.statements.pct < 50 && v.statements.total >= 20);
low.sort((a,b) => (b[1].statements.total - b[1].statements.covered) - (a[1].statements.total - a[1].statements.covered));
let shown = 0;
for(const [f, v] of low) {
  if(shown >= 30) break;
  const fname = f.split('ai-engine')[1] || f;
  const clean = fname.split('').map(c => c === '\\' ? '/' : c).join('');
  const uncov = v.statements.total - v.statements.covered;
  console.log(v.statements.pct.toFixed(1).padStart(6)+'%  '+String(uncov).padStart(5)+' uncov  '+clean);
  shown++;
}
