import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import { HtmlBasePlugin } from "@11ty/eleventy";

let outputDir = "_site";

/** Bundles the TypeScript game and the stylesheet into <output>/assets. */
async function buildAssets(runMode) {
  const production = runMode === "build";
  await esbuild.build({
    entryPoints: {
      "assets/app": "src/assets/ts/main.ts",
      "assets/styles": "src/assets/css/main.css",
    },
    outdir: outputDir,
    bundle: true,
    format: "esm",
    target: ["es2020", "chrome90", "edge90", "firefox90", "safari15"],
    minify: production,
    sourcemap: production ? false : "linked",
    external: ["../fonts/*", "/img/*"],
    logLevel: "warning",
  });
}

export default function (eleventyConfig) {
  // Prefixes root-relative URLs in the HTML output with pathPrefix (e.g. "/synergle/" on GitHub Pages).
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addPassthroughCopy({ "src/public": "/" });
  eleventyConfig.addWatchTarget("./src/assets/");
  eleventyConfig.addWatchTarget("./shared/");
  eleventyConfig.addWatchTarget("./data/");
  eleventyConfig.addWatchTarget("./site.config.json");

  eleventyConfig.on("eleventy.before", async ({ runMode, directories }) => {
    if (directories?.output) outputDir = directories.output;
    await buildAssets(runMode);
  });

  // Cache-busting: "/assets/app.js" -> "/assets/app.js?v=<hash>"
  eleventyConfig.addFilter("asset", (url) => {
    try {
      const file = path.join(outputDir, url);
      const hash = crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 10);
      return `${url}?v=${hash}`;
    } catch {
      return url;
    }
  });

  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  // Escapes text, then turns line breaks into <br> (paragraph gaps collapse to one break).
  eleventyConfig.addFilter("nl2br", (str) => escapeHtml(str ?? "").replace(/\n+/g, "<br>"));
  eleventyConfig.addFilter("json", (value) => JSON.stringify(value).replace(/</g, "\\u003c"));
  eleventyConfig.addFilter("absoluteUrl", (url, base) => new URL(url, base + "/").toString());
  eleventyConfig.addFilter("isoDate", (date) => new Date(date).toISOString().slice(0, 10));
  eleventyConfig.addFilter("pluralize", (count, singular, plural) => (count === 1 ? singular : plural ?? singular + "s"));
  eleventyConfig.addFilter("slug", (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    // Set by the GitHub Pages workflow; "/" when the site lives at the domain root.
    pathPrefix: process.env.PATH_PREFIX || "/",
    templateFormats: ["njk", "md", "11ty.js"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
