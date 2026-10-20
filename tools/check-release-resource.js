const fs = require('fs');

async function checkResource(url, expected, { fetcher = fetch, attempts = 6, delay = 2000,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
      if (response.ok && Buffer.from(await response.arrayBuffer()).equals(expected)) return;
    } catch { /* Network failure and stale bytes have the same bounded retry budget. */ }
    if (attempt < attempts) await wait(delay);
  }
  throw new Error(`Release resource mismatch or unavailable after ${attempts} attempts`);
}

module.exports = { checkResource };
if (require.main === module) {
  checkResource(process.argv[2], fs.readFileSync(process.argv[3])).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
