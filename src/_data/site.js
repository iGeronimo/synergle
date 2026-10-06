import fs from "node:fs";

/**
 * Site settings from site.config.json. Environment variables override them,
 * which is handy on a hosting provider:
 *   SITE_URL, ADSENSE_CLIENT, ADSENSE_SLOT_BELOW_GAME, ADSENSE_SLOT_IN_CONTENT,
 *   ADSENSE_SLOT_RAIL_LEFT, ADSENSE_SLOT_RAIL_RIGHT, ADSENSE_SLOT_FOOTER, GA_MEASUREMENT_ID
 */
export default function () {
  const cfg = JSON.parse(fs.readFileSync(new URL("../../site.config.json", import.meta.url), "utf8"));
  const env = process.env;
  const runMode = env.ELEVENTY_RUN_MODE || "build";
  const isDev = runMode !== "build";

  const slots = { ...cfg.adsense.slots };
  const slotEnv = {
    belowGame: "ADSENSE_SLOT_BELOW_GAME",
    inContent: "ADSENSE_SLOT_IN_CONTENT",
    railLeft: "ADSENSE_SLOT_RAIL_LEFT",
    railRight: "ADSENSE_SLOT_RAIL_RIGHT",
    footer: "ADSENSE_SLOT_FOOTER",
  };
  for (const [name, key] of Object.entries(slotEnv)) if (env[key]) slots[name] = env[key];

  const adsenseClient = (env.ADSENSE_CLIENT || cfg.adsense.client || "").trim();
  return {
    ...cfg,
    url: (env.SITE_URL || cfg.url).replace(/\/+$/, ""),
    adsense: {
      client: adsenseClient,
      // ads.txt wants the "pub-..." part of "ca-pub-..."
      publisherId: adsenseClient.replace(/^ca-/, ""),
      slots,
    },
    analytics: { gaMeasurementId: (env.GA_MEASUREMENT_ID || cfg.analytics.gaMeasurementId || "").trim() },
    isDev,
    // Grey boxes where ads will go, only while developing without an AdSense id.
    showAdPlaceholders: isDev && !adsenseClient,
    year: new Date().getFullYear(),
    buildDate: new Date().toISOString().slice(0, 10),
  };
}
