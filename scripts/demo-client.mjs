// Reference client for the Compose demo. Stub: waits for the API to be live, then exits.
// The evaluate loop (with 150ms timeouts and client_fallback) lands with the demo-client work.

const baseUrl = process.env.SEMAPHORE_URL ?? "http://localhost:8080";
const timeoutMs = 150;
const attempts = 20;

async function isLive() {
  try {
    const res = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

for (let i = 1; i <= attempts; i++) {
  if (await isLive()) {
    console.log(`demo-client: api live at ${baseUrl}; evaluate not implemented yet, exiting`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.error(`demo-client: api not live at ${baseUrl} after ${attempts} attempts`);
process.exit(1);
