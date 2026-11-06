// Stages the npm package in dist-npm/: node scripts/pack-npm.mjs (run npm run build first).
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const root = JSON.parse(await readFile("package.json", "utf8"));
const out = "dist-npm";
await rm(out, { recursive: true, force: true });
await mkdir(out);
await cp("dist", `${out}/dist`, { recursive: true });
await cp("dist-electron", `${out}/dist-electron`, { recursive: true });
await cp("npm/bin", `${out}/bin`, { recursive: true });
await cp("LICENSE", `${out}/LICENSE`);
// npmjs.com does not resolve repository-relative links, so point them at GitHub.
const raw = "https://raw.githubusercontent.com/zufari4/uvPaint/main/";
const readme = (await readFile("README.md", "utf8"))
  .replace(/(src="|\]\()((?:docs|public)\/[^")]+)/g, `$1${raw}$2`)
  .replace(/\]\(LICENSE\)/g, "](https://github.com/zufari4/uvPaint/blob/main/LICENSE)")
  .replace(/\]\(#[^)]*\)/g, "](https://github.com/zufari4/uvPaint#readme)");
await writeFile(`${out}/README.md`, readme);
const manifest = {
  name: "uvpaint",
  version: root.version,
  productName: root.build.productName,
  description: "Texture workbench for 3D models: paint in 2D with UV guides and see it live in 3D.",
  keywords: ["texture", "texture-painting", "uv", "uv-mapping", "glb", "gltf", "threejs", "electron", "pixel-art", "3d"],
  homepage: "https://github.com/zufari4/uvPaint#readme",
  repository: { type: "git", url: "git+https://github.com/zufari4/uvPaint.git" },
  bugs: { url: "https://github.com/zufari4/uvPaint/issues" },
  license: root.license,
  author: "zufari4",
  main: "dist-electron/main.cjs",
  bin: { uvpaint: "bin/uvpaint.js" },
  files: ["bin", "dist", "dist-electron"],
  engines: { node: ">=18" },
  dependencies: { electron: root.devDependencies.electron.replace(/^[\^~]/, "") },
};
await writeFile(`${out}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Staged ${manifest.name}@${manifest.version} in ${out}/`);
