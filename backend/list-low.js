/* eslint-disable */
const d = require("./coverage/coverage-summary.json");
const files = Object.entries(d).filter(function (e) {
  return e[0] !== "total" && e[0].includes("ai-app");
});
const low = files.filter(function (e) {
  return e[1].statements.pct < 40 && e[1].statements.total >= 20;
});
low.sort(function (a, b) {
  return (
    b[1].statements.total -
    b[1].statements.covered -
    (a[1].statements.total - a[1].statements.covered)
  );
});
for (var i = 0; i < Math.min(low.length, 30); i++) {
  var f = low[i][0],
    v = low[i][1];
  var idx = f.indexOf("ai-app");
  var clean = "";
  var sub = f.substring(idx + 7);
  for (var j = 0; j < sub.length; j++) {
    clean += sub[j] === "\\" ? "/" : sub[j];
  }
  var uncov = v.statements.total - v.statements.covered;
  console.log(
    v.statements.pct.toFixed(1).padStart(6) +
      "%  " +
      String(uncov).padStart(4) +
      " uncov  " +
      clean,
  );
}
