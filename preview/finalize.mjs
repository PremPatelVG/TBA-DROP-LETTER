// Finishes the single-file builds (see vite.config.ts).
// - Artifact build (preview/dist): moves <title> to the top (the artifact host reads it from the first 8KB).
// - Demo build (`node preview/finalize.mjs demo`, preview/dist-demo): names the page index.html for static hosts.
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

if (process.argv[2] === "demo") {
  const dir = new URL("./dist-demo/", import.meta.url);
  const index = new URL("index.html", dir);
  renameSync(new URL("demo.html", dir), index);
  // Vite emits the icon as its own file; inline it too, so the demo is one self-contained page.
  const html = readFileSync(index, "utf8").replace(/href="\.\/([\w.-]+\.png)"/g, (_, name) => {
    const icon = new URL(name, dir);
    const data = readFileSync(icon).toString("base64");
    rmSync(icon);
    return `href="data:image/png;base64,${data}"`;
  });
  writeFileSync(index, html);
  console.log(`preview/dist-demo/index.html ${(html.length / 1024).toFixed(0)} KB`);
  console.log("Netlify Drop: drag the folder preview/dist-demo onto https://app.netlify.com/drop");
} else {
  const f = new URL("./dist/index.html", import.meta.url);
  let html = readFileSync(f, "utf8");
  const title = "<title>TBA Drop Letter Preview</title>";
  html = title + "\n" + html.replace(title, "");
  writeFileSync(f, html);
  console.log(`preview/dist/index.html ${(html.length / 1024).toFixed(0)} KB`);
}
