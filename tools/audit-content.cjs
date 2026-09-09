const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: {}, console });
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [, file] of html.matchAll(/<script src="([^"]+)"/g)) {
  if (file === 'script.js') break;
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const report = vm.runInContext('({ originalEntries: Vocabulary.length, studyEntries: Learning.cleanEntries(Vocabulary).length, corrections: Quality.corrections, excluded: Quality.excluded })', context);
fs.writeFileSync(path.join(root, 'data/quality-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({originalEntries:report.originalEntries, studyEntries:report.studyEntries, corrected:report.corrections.length, flagged:report.excluded.length}));
