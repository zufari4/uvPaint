# UV Paint 1.0.0

Standalone Windows texture editor built with Electron, React, TypeScript and Three.js. Edit textures in 2D with UV guides and a live 3D preview.

## Run

Open `release/current/win-unpacked/UV Paint.exe`. Keep the entire `win-unpacked` folder together: the executable needs its adjacent runtime files. No installation, Blender, account or internet connection is required.

## Development

Use Node.js 22.12+ and npm on Windows. Dependencies are locked in `package-lock.json`.

```powershell
npm ci
npm run dev             # Vite + Electron
npm run build           # Type-check and compile production bundles
npm start               # Launch compiled bundles
npm run dist            # Build release/current/win-unpacked only
```

The first packaging run downloads Electron. Builds produce no installers or ZIP archives. Generated bundles, dependencies, releases and test results are excluded from Git.

## Workflow

1. Open a GLB or explore the built-in sample. Choose a material and texture. Selecting a UV set opens a texture linked to that UV channel; each texture keeps its own layers and undo history.
2. Use **+** in the Layers header for an empty layer. The adjacent image button or drag-and-drop imports an image.
3. Place images with Free transform. Drag inside to move, corners to scale, side handles to stretch, and the rotation handle to rotate. Hold Ctrl for rotation snapping to 5 degrees and movement in 8-texture-pixel increments. Shift unlocks proportions or snaps rotation to 15 degrees; Alt transforms around the center. Ctrl-drag a corner distorts it. Perspective and mesh Warp are also available.
4. Enter or double-click applies; Escape cancels. Applying a whole-layer placement retains its source for later transforms, including off-canvas pixels. UV masking hides pixels without deleting them. Outside-island pixels appear at 40% opacity during placement only. Painting and other pixel edits rasterize the placement.
5. UV clipping defaults to all islands. Selecting islands narrows the editing region. Brush, eraser, fill and clone respect the restriction; Delete clears the selected pixels even outside UV islands. Standalone canvases are unrestricted.
6. Export the active texture as RGBA PNG. Guides, handles and the placement ghost are excluded. Export each edited texture before closing: project persistence is not yet implemented.

Layers support names, visibility, opacity, duplication, reordering, merge down and six blend modes. Merging flattens the pair against transparency, so backdrop-dependent blends can change.

## Controls

| Action | Shortcut |
| --- | --- |
| Move / Free transform | V / Ctrl+T |
| Rectangle / lasso / polygon selection | M / L / Shift+L |
| Magic wand | W |
| Brush / eraser / fill / eyedropper / clone | B / E / G / I / S |
| Brush size / opacity | `[` and `]` / digits 1–9 and 0 |
| Sample brush color / clone source | Alt-click |
| Reset / swap colors | D / X |
| Add / subtract selection | Shift / Alt |
| Select all / deselect / invert | Ctrl+A / Ctrl+D / Ctrl+Shift+I |
| Copy / cut / paste | Ctrl+C / Ctrl+X / Ctrl+V |
| Copy / extract selection into new layer | Ctrl+J / Ctrl+Shift+J |
| Delete selected pixels | Delete |
| Apply / cancel transform | Enter / Escape |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y |
| Open GLB / export PNG | Ctrl+O / Ctrl+Shift+S |
| Pan / zoom 2D | Space-drag, H or middle-drag / wheel |
| Orbit / pan / zoom 3D | Middle-drag / Shift+middle-drag / Ctrl+middle-drag or wheel |

Shortcuts use physical keys and work with a Russian keyboard layout. In the viewport, numpad 1/3/7 chooses front/right/top, Ctrl reverses, 5 changes projection, 2/4/6/8 orbits, 9 reverses, and +/- zooms. Home or numpad decimal frames the model. The viewport uses glTF Y-up coordinates.

## Settings and materials

The hamburger menu contains Settings, Help and About. Text size (80–220%, default 160%), UV guide color and opacity persist between launches. Canvas dimensions are in Settings. Material settings stays beside the material selector.

The window starts maximized, with a compact draggable header and native window controls. Drag the vertical workspace divider or the horizontal divider above Layers / UV Guides to resize panels.

Material settings shows actual embedded image names, UV assignments, alpha mode and cutoff. UV names may be absent from GLB; labels then show channel numbers and texture roles. Optional aliases last for the session.

Alpha transfer reprojects a source image's alpha onto the active layer's UV layout, preserving RGB and supporting undo. Conflicting opacity values on overlapping destination UVs cannot be represented by one pixel. Transfer is unsuitable for such overlaps. The source GLB is never changed.

Studio lighting and edge overlays help inspect shape. Texture / Unlit shows texture color. The viewport previews the active image; it does not reconstruct a Blender node graph or combine all PBR textures into a complete material.

## Scope

Supports standard uncompressed GLB geometry and embedded browser-decodable images. Draco/Meshopt and KTX2/Basis decoders, UDIM editing, 3D painting, layer groups, GLB export and project saving are not included.

The editor uses a single 0–1 texture tile. Texture resolution is checked against GPU limits and available memory instead of a fixed 4096-pixel cap. Failed allocations preserve the document; images are not silently downscaled.

## Source layout and checks

- `electron/`: sandboxed window, native file dialogs and validated IPC.
- `src/core/`: documents, history, preferences and editing commands.
- `src/render/`: compositing, material preview and GPU transforms.
- `src/tools/`: painting, selection, UV topology and transform geometry.
- `src/import/`, `src/export/`: GLB loading and PNG export.
- `src/ui/`: workspace, controls and shortcuts.
- `tests/`, `scripts/`: unit tests, build tools and Electron regression checks.

```powershell
npm test
npm run test:e2e
npm run test:interaction
npm run test:materials
npm run test:workspace
npm run test:packaged    # After npm run dist
```

Browser tests generate their own fixtures and write disposable screenshots/results to `test-results/`. Packaged smoke testing verifies offline startup, the sample model and native PNG export. No personal model files are required.
