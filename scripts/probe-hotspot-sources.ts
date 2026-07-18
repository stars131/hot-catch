import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { getHotspotPayload } = await import("../lib/hotspots/hotspot-service");
  const payload = await getHotspotPayload({ refresh: true, limit: 5 });
  const rows = payload.sourceHealth.map((source) => ({
    code: source.platformCode,
    source: source.platform,
    ok: source.ok ? "yes" : "no",
    items: source.count,
    backend: source.backend,
    error: source.message ?? "",
  }));

  console.table(rows);
  console.log(JSON.stringify(payload.summary, null, 2));

  const failures = rows.filter((source) => source.ok === "no");
  if (failures.length) {
    console.error(`Hotspot probe finished with ${failures.length} unavailable source(s).`);
    process.exitCode = 1;
  }
}

void main();
