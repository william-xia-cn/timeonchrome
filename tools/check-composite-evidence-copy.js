const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const canonical = path.resolve(__dirname, '../contracts/composite-page-evidence/v1.js');
function checkCopy(target) {
  if (!fs.existsSync(target)) throw new Error('Composite evidence consumer copy is missing');
  const source = fs.readFileSync(canonical);
  if (!source.equals(fs.readFileSync(target))) throw new Error('Composite evidence consumer differs from canonical source');
  return createHash('sha256').update(source).digest('hex');
}
module.exports = { checkCopy };
if (require.main === module) {
  try {
    const target = process.argv[2];
    if (!target) throw new Error('Usage: node tools/check-composite-evidence-copy.js <consumer-file>');
    console.log('Composite evidence copy PASS SHA-256=' + checkCopy(path.resolve(target)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
