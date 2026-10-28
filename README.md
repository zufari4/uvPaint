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
2. Layers sits on the right inside the texture editor. Use **+** in its bottom toolbar for an empty layer. The adjacent image button or drag-and-drop opens the image import dialog. Choose Rectangle, Lasso, Polygon, Magic wand, or Whole image, then choose a destination layer (New layer by default). Existing-layer imports add pixels over its content and preserve its visibility mask. Importing a selected area retains its irregular alpha shape and crops to the selection's bounds at native resolution. Cancel leaves the document unchanged.
3. Place images with Free transform. Drag inside the frame to move, corners to scale, side handles to stretch, and outside the frame to rotate. Hold Ctrl for rotation snapping to 5 degrees and movement in 10-texture-pixel increments. Shift unlocks proportions or snaps rotation to 15 degrees; Alt transforms around the center. Ctrl-drag a corner distorts it. Perspective and mesh Warp are also available.
4. Enter or double-click applies; Escape cancels. Applying a whole-layer placement retains its source for later transforms, including off-canvas pixels. UV masking hides pixels without deleting them. Outside-island pixels appear at 40% opacity during placement only. Painting and other pixel edits rasterize the placement.
5. In Layers, choose **UV island** or use the adjacent pipette to pick an island on the 2D canvas or 3D model. Escape cancels picking. Each layer keeps its own binding: pixels outside the linked island are hidden, and painting and transformation use that mask regardless of the current island selection. The binding can be changed, removed or undone without deleting source pixels. Unlinked layers use the global UV clipping setting, enabled by default. Delete clears selected pixels even outside islands.
6. Export the active texture as RGBA PNG. Guides, handles and the placement ghost are excluded. Export each edited texture before closing: project persistence is not yet implemented.

Copy, cut and extract use the selection independently of UV clipping, including pixels hidden outside islands. Pasted pixels remain intact and can be moved onto an island later. Transform drags reuse render buffers and coalesce pointer events per frame. Only the 3D preview temporarily uses a texture up to 512 pixels while dragging; releasing the mouse restores full resolution. Layer pixels, the 2D texture and PNG exports always keep their native dimensions.

Layers support names, visibility, opacity, duplication, reordering, merge down and six blend modes. Merge down is in the Layers header and is disabled for the bottom layer. Merging flattens the pair against transparency, so backdrop-dependent blends can change.

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

Brush, eraser and clone tools show their diameter under the pointer, scaled with the canvas zoom. Ctrl+Z / Ctrl+Shift+Z use the document history; repeated Delete on an already empty area adds no undo steps.

On UV-mapped textures, Fill (G) fills the entire island under the pointer, across existing color boundaries. It leaves other islands and empty UV space unchanged, even when global clipping is off. A layer's binding and pixel selection still limit the fill. Standalone textures without UVs retain color-based bucket fill.

## Settings and materials

The hamburger menu contains Open GLB, Export PNG, Settings, Help and About. Text size (80–220%, default 140%), UV display mode, guide color and opacity persist between launches. Existing custom text sizes are preserved. Canvas dimensions are in Settings. Material settings stays beside the material selector.

UV display starts Off. Settings also offers Triangles, Outline (including hole boundaries), and approximate Quads. Quad guides pair compatible adjacent triangles with continuous UVs, convex contours and normals within 15 degrees, preferring contours with right angles. This only changes guides, never editing masks or PNG pixels.

Selecting an island with the UV tool highlights its original faces in 3D; Shift adds or removes islands. Right-click the canvas or model to hide other islands, show all, or show all except the selection. Hidden islands remain available in the layer dropdown. Face visibility persists across material and UV switches and resets on model load. It affects the entire model's preview and UV lines, independently of object visibility, without changing texture pixels, layer bindings or pixel undo history.

A normal click on a model face selects its material, UV island and linked layer. When multiple layers share that island, the active matching layer stays selected; otherwise the top visible matching layer is chosen. Clicking empty space keeps the selection. Middle-button navigation and the island-binding pipette remain separate actions.

The UV map selector is beside the material selector. UV map aliases and global clipping are in Settings. There is no separate UV Guides panel. A layer binding retains its original UV channel when another map is displayed. Duplicate and extracted layers retain the binding; pasted and imported images inherit the active layer's binding. New empty layers start unlinked. Merge down flattens both visible layer masks and clears the binding on the merged layer.

The view cube follows the camera. Click a face for one of six orthographic views, use Persp/Ortho to change projection, or Iso to return to an isometric perspective. These controls share navigation with Numpad and preserve the orbit center and viewing scale.

The window starts maximized, with a compact draggable header and native window controls. Drag the vertical dividers to resize the texture editor, its Layers sidebar and the 3D preview.

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
npm run test:transform
npm run test:materials
npm run test:workspace
npm run test:islands
npm run test:layer-islands
npm run test:import
npm run test:undo
npm run test:fill
npm run test:packaged    # After npm run dist
```

Browser tests generate their own fixtures and write disposable screenshots/results to `test-results/`. Packaged smoke testing verifies offline startup, the sample model and native PNG export. No personal model files are required.
