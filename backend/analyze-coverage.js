const d = require('./coverage/coverage-summary.json');
const files = Object.entries(d).filter(function(e) { return e[0] !== 'total'; });
const eng = files.filter(function(e) { return e[0].indexOf('ai-engine') !== -1; });
const app = files.filter(function(e) { return e[0].indexOf('ai-app') !== -1; });

function agg(list) {
  var s=0,sc=0,b=0,bc=0,f=0,fc=0,l=0,lc=0;
  list.forEach(function(e) {
    var v=e[1];
    s+=v.statements.total; sc+=v.statements.covered;
    b+=v.branches.total; bc+=v.branches.covered;
    f+=v.functions.total; fc+=v.functions.covered;
    l+=v.lines.total; lc+=v.lines.covered;
  });
  return {
    stmts: (sc/s*100).toFixed(1),
    branches: (bc/b*100).toFixed(1),
    funcs: (fc/f*100).toFixed(1),
    lines: (lc/l*100).toFixed(1),
    files: list.length,
    uncoveredStmts: s - sc
  };
}

var e = agg(eng);
var a = agg(app);
console.log('=== AI ENGINE (' + e.files + ' files) ===');
console.log('  Statements: ' + e.stmts + '%  Branches: ' + e.branches + '%  Functions: ' + e.funcs + '%  Lines: ' + e.lines + '%');
console.log('  Uncovered statements: ' + e.uncoveredStmts);
console.log('');
console.log('=== AI APPS (' + a.files + ' files) ===');
console.log('  Statements: ' + a.stmts + '%  Branches: ' + a.branches + '%  Functions: ' + a.funcs + '%  Lines: ' + a.lines + '%');
console.log('  Uncovered statements: ' + a.uncoveredStmts);

var low = files.filter(function(e) {
  return e[1].statements.pct < 70 && e[1].statements.total >= 15;
});
low.sort(function(a,b) {
  return (b[1].statements.total - b[1].statements.covered) - (a[1].statements.total - a[1].statements.covered);
});
if (low.length > 0) {
  console.log('\n=== LOW COVERAGE FILES (<70%, >=15 stmts) ===');
  low.slice(0, 25).forEach(function(e) {
    var f = e[0], v = e[1];
    var clean = f.replace(/\/g, '/');
    var idx = clean.indexOf('src/modules/');
    if (idx >= 0) clean = clean.substring(idx + 12);
    var uncov = v.statements.total - v.statements.covered;
    console.log('  ' + v.statements.pct.toFixed(1).padStart(5) + '%  ' + String(uncov).padStart(4) + ' uncov  ' + clean);
  });
}
