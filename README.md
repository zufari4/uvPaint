# UV Paint

A standalone Windows texture editor built with Electron, TypeScript, React and Three.js. Edit Base Color and alpha on a 2D canvas with UV guides and an unlit, live 3D preview. No Blender, account, network service or installation is required to run the portable build.

## Windows build

Run `release/UV-Paint-1.0.0-Windows-x64.exe`. An unpacked copy is also available at `release/win-unpacked/UV Paint.exe`; keep that entire folder together. The portable executable includes Electron and extracts its runtime to a temporary directory at startup. It is unsigned.

## Develop and build

Use Node.js 22.12+ and npm on Windows. Dependencies are locked in `package-lock.json`.

```powershell
npm ci
npm run dev        # Vite + Electron with isolated preload
npm run build      # Type-check renderer/main/preload, build production bundles
npm start          # Launch production bundles
npm test           # Projective math and history tests
npm run test:e2e   # Actual Electron application, GPU and file IPC acceptance tests
npm run dist       # Windows x64 portable EXE + unpacked application
```

Packaging needs network access on the first run to download Electron and NSIS build tools. The resulting application works offline. No local server is used by the packaged application.

## First texture

1. **Open GLB** loads a self-contained binary glTF with existing UVs and embedded PNG, JPEG or WebP textures. Choose a material in the top bar. Each material retains its own layer stack, selection, UV settings and undo history.
2. The material's existing Base Color image becomes its first layer. A material without a map starts with a transparent canvas; use **Canvas** to change its dimensions, then paint or import an image. The preview displays the texture itself, without material tint, lighting, vertex colors or PBR maps.
3. **Add image**, or drop images onto the 2D workspace. Placement starts at the image's native resolution. Full source pixels remain available during placement, including pixels outside the canvas. Scale and move, then press Enter to commit.
4. Select with rectangle, freehand lasso, polygonal lasso or magic wand. **Extract** / Ctrl+J cuts the selected pixels into their own layer. Shift adds to a selection; Alt subtracts. Polygonal lasso closes with Enter or a double-click.
5. **Perspective** exposes four independent corners. Drag a corner to distort, or drag elsewhere to translate the fragment. **Warp** exposes a 4×4 control-point grid. Use numeric width, height and angle controls for scaling and rotation; the proportion checkbox links width and height. Flip buttons reflect the transform. Enter applies; Escape cancels.
6. Use **UV guides** to select islands, change line appearance, or choose another UV set. Shift-click selects multiple islands. **Clip edits to selected islands** restricts image placement, transforms, brush, eraser, clone, fill, cut and paste. With clipping enabled and no islands selected, edits are blocked everywhere.
7. **Export PNG** writes the active material's clean, composited RGBA texture. Guides, checkerboard, selections and handles are separate display overlays and are never exported. Export each material before closing the session.

The built-in **sample project** is generated locally and can be used to explore the workflow without an external model.

## Tools and shortcuts

| Action                                   | Shortcut / gesture                                        |
| ---------------------------------------- | --------------------------------------------------------- |
| Move / transform                         | V                                                         |
| Rectangle / freehand / polygon selection | M / L / P                                                 |
| Magic wand                               | W; tolerance 0–255; contiguous toggle                     |
| Brush / eraser / fill / eyedropper       | B / E / G / I                                             |
| Clone stamp                              | S; Alt-click source, then paint                           |
| Brush size                               | `[` / `]`                                                 |
| Select UV island                         | U; Shift-click adds/removes                               |
| Copy / cut / paste                       | Ctrl+C / Ctrl+X / Ctrl+V                                  |
| Extract into new layer                   | Ctrl+J                                                    |
| Deselect / invert                        | Ctrl+D / Ctrl+Shift+I                                     |
| Clear selected pixels                    | Delete                                                    |
| Apply / cancel transform                 | Enter / Escape                                            |
| Undo / redo                              | Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y                           |
| Open GLB / export PNG                    | Ctrl+O / Ctrl+Shift+S                                     |
| Pan / zoom 2D                            | Space-drag, H or middle-drag / wheel                      |
| Orbit / pan / zoom 3D                    | Left-drag / right-drag / wheel                            |
| Resize workspace                         | Drag the divider; focused divider also accepts arrow keys |

Layer rows support editable names, visibility and selection. The layer footer adds, duplicates, reorders, merges down and deletes layers. Layer properties support opacity and Normal, Multiply, Screen, Overlay, Darken and Lighten. Merge down flattens the pair against transparency; backdrop-dependent blend modes may therefore change when merged over additional lower layers.

## Architecture

| Folder                      | Responsibility                                                                  |
| --------------------------- | ------------------------------------------------------------------------------- |
| `electron/`                 | Sandboxed Electron window, validated native file dialogs and byte-only file IPC |
| `src/core/`                 | Documents, material-local history, canvas allocation and editing commands       |
| `src/render/`               | Canvas compositing and Three.js GPU projective/mesh rasterization               |
| `src/tools/`                | Selection masks, flood fill, paint strokes, UV topology and homography          |
| `src/import/`               | GLTFLoader integration, embedded images, local sample and file selection        |
| `src/export/`               | Clean RGBA PNG encoding and native save flow                                    |
| `src/ui/`                   | Focused React workspace components, pointer interactions and shortcuts          |
| `tests/`, `scripts/e2e.mjs` | Unit tests and Electron acceptance tests                                        |

Pixels use browser Canvas 2D's sRGB, premultiplied internal compositing, with straight RGBA PNG output. Three.js preview textures are tagged sRGB, use `flipY=false` for glTF UVs, and render through `MeshBasicMaterial` with no tone mapping or postprocessing. Layer snapshots share unchanged canvases; edits replace buffers instead of mutating history. History prunes oldest snapshots above an approximate 384 MiB layer-buffer budget, retaining at least one undo step. UI-only settings and model-part visibility are view state.

The perspective tool solves an eight-unknown homography using **ml-matrix**. A Three.js fragment shader inverse-maps each destination pixel into the original source image. This is a true projective mapping, not an affine triangle approximation. Mesh warping uses Three.js indexed geometry and UV interpolation across a 3×3 cell grid. Drag updates always sample the original transform-session pixels; rasterization is committed once on Enter. A later transform starts from the committed raster, as in a conventional raster editor.

### Library choices and verified capabilities

- [Three.js ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html) and [BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html): custom projective shaders and editable mesh UV rasterization.
- [Three.js MeshBasicMaterial](https://threejs.org/docs/pages/MeshBasicMaterial.html) and [color management](https://threejs.org/manual/pages/color-management.html): unlit, alpha-capable, sRGB preview.
- [ml-matrix](https://github.com/mljs/matrix): maintained matrix decomposition and solving for the projective coefficients.
- Chromium Canvas 2D: image decoding, native path rasterization, alpha clipping, six blend modes and PNG encoding. Flood-fill membership and editing gestures are small app-specific adapters over these native primitives.
- [Konva Transformer](https://konvajs.org/api/Konva.Transformer.html) was evaluated: its documented resize/rotate/scale controls do not supply the required arbitrary four-corner projective warp. Adding a second scene graph would not eliminate that work, so the editor uses Three.js for both complex GPU transforms and the 3D viewport.
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) and [IPC](https://www.electronjs.org/docs/latest/tutorial/ipc): sandboxed renderer, context-isolated preload and per-operation validated IPC; no arbitrary filesystem or IPC access is exposed.

## Resolution and scope

There is no hard-coded 4096-pixel limit. New/resize/import operations check the actual WebGL texture, renderbuffer and viewport limits, available system memory, and a real 2D canvas allocation. Failures explain the limiting resource and preserve the current document; textures are never silently downscaled. Performance depends on dimensions, layer count and GPU/CPU memory. Large CPU selection operations can briefly block the UI.

The first version edits the single 0–1 texture tile. Out-of-tile UV triangles are clipped by the canvas; this is not a UDIM editor. Texture sampling transforms are preserved and reflected in the guides, but repeated copies of out-of-tile islands are not listed as separate islands. The UV-set selector changes guides; it does not change the GLB's original Base Color UV channel. Coincident UV islands may overlap in the canvas; choose an individual one from the list.

Standard uncompressed GLB geometry and embedded browser-decodable images are supported. Draco/Meshopt-compressed geometry and KTX2/Basis textures need optional decoder integrations and are not included. Existing geometry, material assignments and PBR source materials remain intact in memory; the viewport uses separate unlit materials. No AO/normal/roughness/metallic editing, 3D painting, layer groups, user-facing masks, GLB export or custom project persistence is included.

## Verification

`npm run test:e2e` launches Electron, encodes a real two-material GLB fixture, imports it through the production loader, and checks extraction, perspective accuracy against an analytic gradient, original-source stability during dragging, mesh warp, UV clipping, material switching, undo/redo, brush/eraser/fill/clone, selection, image placement and PNG consistency. It also exercises pointer-driven selection and corner dragging, verifies the preload boundary, and exports a real PNG through native IPC. PNG/preview comparisons allow expected 8-bit color/alpha rounding of up to a few levels; export consistency is checked over every pixel with a one-level tolerance.

Screenshots and machine-readable results are written to `test-results/`. `npm run test:packaged` runs the unpacked Windows build without Vite, verifies launch, sample rendering, and native export. This must be run after `npm run dist`.
