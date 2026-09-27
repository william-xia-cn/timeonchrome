export function createOptionalEvidenceRunner(run, { timeoutMs = 15000 } = {}) {
  let inFlight = null;
  return {
    start() {
      if (inFlight) return false;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      inFlight = Promise.resolve().then(() => run(controller.signal)).catch(() => {}).finally(() => {
        clearTimeout(timer);
        inFlight = null;
      });
      return true;
    },
    get busy() { return inFlight !== null; },
  };
}
