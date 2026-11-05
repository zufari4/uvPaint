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
2. Use **+** in the Layers bottom toolbar for an empty layer. The adjacent image button or drag-and-drop opens the image import dialog. Choose Rectangle, Lasso, Polygon, Magic wand, or Whole image, then a destination layer (New layer by default). Click **Add** to import the selected area immediately without a UV link, or **Next** to open a 3D island picker when a model is loaded: hover highlights an island, click chooses it, and Import linked image creates the UV binding and centers the image on that island at native resolution. New layers may use another material; an existing target layer restricts picking to its material. Import without link skips the binding. Back returns to the selected image area; Cancel leaves the document unchanged. Existing-layer imports preserve previous pixels outside the added image. Irregular selections retain their alpha shape.
3. Place images with Free transform. Click Transform or press V to open the frame immediately; clicking an island with this tool selects its linked layer and opens the frame. A blank click clears the selection and frame. Drag inside the frame to move, corners to scale, side handles to stretch, and outside the frame to rotate. Hold Ctrl for rotation snapping to 5 degrees and movement in 10-texture-pixel increments. Shift unlocks proportions or snaps rotation to 15 degrees; Alt transforms around the center. Ctrl-drag a corner distorts it. Perspective and mesh Warp are also available.
4. Enter or double-click applies; Escape cancels. Applying a whole-layer placement retains its source for later transforms, including off-canvas pixels. UV masking hides pixels without deleting them. Outside-island pixels appear at 40% opacity during placement only. Painting and other pixel edits rasterize the placement.
5. Use the region-and-cursor button in the Layers bottom toolbar to bind the active layer by clicking an island on the 2D canvas or 3D model. The island number remains visible in the layer row. Escape cancels picking. Each layer keeps its own binding: pixels outside the linked island are hidden, and painting and transformation use that mask regardless of the current island selection. The binding can be changed by picking another island or undone without deleting source pixels. Unlinked layers use the global UV clipping setting, enabled by default. Delete clears selected pixels even outside islands.
6. Save the workspace as a **.uvpaint project** with Ctrl+S; Ctrl+Alt+S saves a separate copy, Ctrl+Shift+O opens a project. Each file embeds the original model, all edited material textures, layers, UV bindings, selection, aliases and preview visibility. Full image sources remain available for later transforms, including hidden and off-canvas pixels. Projects work without the original GLB or image files. Opening starts a fresh undo history. Export the active texture separately as RGBA PNG; guides, handles and the placement ghost are excluded.

Copy, cut and extract use the selection independently of UV clipping, including pixels hidden outside islands. Pasted pixels remain intact and can be moved onto an island later. Transform drags reuse render buffers and coalesce pointer events per frame. Only the 3D preview temporarily uses a texture up to 512 pixels while dragging; releasing the mouse restores full resolution. Layer pixels, the 2D texture and PNG exports always keep their native dimensions.

Layers support names, visibility, opacity, duplication, reordering, merge down and six blend modes. Merge down is in the Layers bottom toolbar and is disabled for the bottom layer. Merging flattens the pair against transparency, so backdrop-dependent blends can change.

Selecting a layer linked to a UV island isolates its pixels and UV outlines in the 2D view only. The 3D model stays visible, and manual hiding is preserved. Selecting an unbound layer removes the automatic 2D isolation. The binding's face links remain valid even when another UV map is displayed. This view state does not change pixels, exports or undo history. Show all in the context menu clears both manual hiding and automatic 2D isolation until another layer is selected.

Clicking blank canvas clears selection, closes the transform frame and removes temporary layer focus, while preserving the layer's UV binding and manual hiding. Opening or confirming an untouched transform does not modify pixels, transparency masks or history. Actual transforms retain the layer's existing mask; temporary island selection never becomes a mask for the whole texture.

A click outside an active transform frame clears it even over another island or opaque image pixels; dragging outside still rotates. With no frame active, clicking a linked island selects its layer and isolates that island only in 2D, including when the layer was already active. The 3D model's visibility is unchanged.

While islands are hidden, the 2D preview clips the image and placement preview to the union of visible UV faces, including during rotation. Texture padding and fragments outside those faces stay hidden. Show all removes this display mask; source pixels and PNG export are unaffected by hiding.

The import picker always displays the complete model, including manually hidden islands and objects, without changing the main viewport. Import selections have resize/move handles; polygon vertices can be moved before or after closing the polygon, and freehand lasso marks its starting point. Press Ctrl after starting a corner scale drag to snap the resulting size in 10-pixel steps while retaining proportions; Ctrl held before grabbing a corner still distorts. Side handles support Ctrl snapping directly.

Layers default to the top-right corner; saved docking positions are retained. Drag the thin strip at the top of the panel to any corner. Zoom controls stay bottom-left, moving to bottom-right when Layers occupy bottom-left.

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
| Save project / save project as / open project | Ctrl+S / Ctrl+Alt+S / Ctrl+Shift+O |
| Pan / zoom 2D | Space-drag, H or middle-drag / wheel |
| Orbit / pan / zoom 3D | Middle-drag / Shift+middle-drag / Ctrl+middle-drag or wheel |

Shortcuts use physical keys and work with a Russian keyboard layout. In the viewport, numpad 1/3/7 chooses front/right/top, Ctrl reverses, 5 changes projection, 2/4/6/8 orbits, 9 reverses, and +/- zooms. Home or numpad decimal frames the model. The viewport uses glTF Y-up coordinates.

Brush, eraser and clone tools show their diameter under the pointer, scaled with the canvas zoom. Ctrl+Z / Ctrl+Shift+Z use the document history; repeated Delete on an already empty area adds no undo steps.

Rectangle, lasso, polygon and wand selections have eight handles for resizing their bounds and a center handle for moving the selection. These handles change only the selection mask, preserving irregular shapes and leaving layer pixels intact. Release commits one undo step; Escape during a drag cancels it.

On UV-mapped textures, Fill (G) fills the entire island under the pointer, across existing color boundaries. It leaves other islands and empty UV space unchanged, even when global clipping is off. A layer's binding and pixel selection still limit the fill. Standalone textures without UVs retain color-based bucket fill.

## Settings and materials

The hamburger menu contains Open project, Open GLB, Save project, Save project as, Export PNG, Settings, Help and About. Text size (80–220%, default 140%), UV display mode, guide color and opacity persist between launches. Existing custom settings are preserved. Canvas dimensions are in Settings. Material settings, texture resolution/sRGB badges and channel labels have been removed from the workspace.

UV display starts in Outline mode (including hole boundaries). Settings also offers Off, Triangles and approximate Quads. Quad guides pair compatible adjacent triangles with continuous UVs, convex contours and normals within 15 degrees, preferring contours with right angles. This only changes guides, never editing masks or PNG pixels.

Selecting an island with the UV tool highlights its original faces in 3D; Shift adds or removes islands. Right-click the canvas or model to hide other islands, show all, or show all except the selection. Hidden islands remain available in the layer dropdown. Face visibility persists across material and UV switches and resets on model load. It affects the entire model's preview and UV lines, independently of object visibility, without changing texture pixels, layer bindings or pixel undo history.

A normal click on a model face selects its material, UV island and linked layer. When multiple layers share that island, the active matching layer stays selected; otherwise the top visible matching layer is chosen. Clicking empty space keeps the selection. Middle-button navigation and the island-binding pipette remain separate actions.

In the 2D Move tool (V), a click selects the island and its linked layer; dragging still transforms the image. Hiding islands hides their image in the 2D view as well as their geometry in 3D. This display mask leaves layer pixels, PNG exports and history untouched; Show all restores the image. Shared pixels remain visible while any overlapping UV face is still visible. Layer thumbnails fill the preview area with a centered crop.

The UV map selector is beside the material selector. UV map aliases and global clipping are in Settings. There is no separate UV Guides panel. A layer binding retains its original UV channel when another map is displayed. Duplicate and extracted layers retain the binding; pasted and imported images inherit the active layer's binding. New empty layers start unlinked. Merge down keeps the lower layer's name, UV island binding and editable mask. The upper layer is composited with its own mask, and the result is displayed through the lower layer's mask. Undo restores both original layers.

The view cube follows the camera. Click a face for one of six orthographic views, use Persp/Ortho to change projection, or Iso to return to an isometric perspective. These controls share navigation with Numpad and preserve the orbit center and viewing scale.

The window starts maximized, with a compact draggable header and native window controls. Drag the Layers heading to dock the panel flush against any of the four canvas corners. A dashed preview marks the destination; Escape cancels the drag. Arrow keys on the focused heading move the dock, and its position persists between launches. Zoom controls sit on the left without a background, moving above Layers when it is docked bottom-left. Each view has an upper-right expand/restore button. Expanding uses only the work area, keeping the title, tools and shared tool options visible; restoring retains the split and camera. The divider between 2D and 3D still resizes the views.

UV names may be absent from GLB; labels then show channel numbers and texture roles. Aliases are saved in projects. The original material transparency remains preserved on import. Primary and secondary color swatches appear below the tools; click to edit either color, X to swap, D to reset black/white. Hovering a 3D island highlights its faces without changing the selection or pixels. Hidden islands have no geometry, hover highlight or outlines in either viewport or in the import picker.

Studio lighting and edge overlays help inspect shape. Program settings provide saved exposure, main light, fill light and environment light controls, with defaults of 80%, 135%, 45% and 55%, respectively, and a reset button. 3D always uses studio lighting; exported pixels are unchanged. Edges starts enabled in 3D; opening a saved project restores its own view state. The viewport previews the active image; it does not reconstruct a Blender node graph or combine all PBR textures into a complete material.

## Scope

Supports standard uncompressed GLB geometry and embedded browser-decodable images. Draco/Meshopt and KTX2/Basis decoders, UDIM editing, 3D painting, layer groups and GLB export are not included.

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
npm run test:selection
npm run test:project
npm run test:docking-import
npm run test:packaged    # After npm run dist
```

Browser tests generate their own fixtures and write disposable screenshots/results to `test-results/`. Packaged smoke testing verifies offline startup, the sample model, native PNG export and project save/open. No personal model files are required.

Brush, eraser and clone stamp reuse stroke buffers and update only the changed pixel region. Preview updates are batched per animation frame; the 3D texture preview temporarily uses 512px during a stroke and returns to full resolution when it finishes. Document pixels and undo remain full resolution.

The application menu's Recent submenu remembers the ten most recently opened or saved projects across restarts, without duplicate paths. Entries show their file paths and open directly. Missing or invalid files report an error without replacing the current workspace.

Opening or dropping a GLB displays its file name and current loading phase, including material/object counts during preparation. Editing is blocked until the model and preview are ready. Canceling file selection or encountering an import error clears the indicator and preserves the existing workspace.

Reload GLB rereads the original source file while preserving painted layer pixels, properties, active document/layer, view settings, camera and undo history. Compatible geometry and UV changes refresh island bindings and masks. The source path is stored in the project; older projects can locate it once. Missing, invalid or incompatible replacements leave the current workspace unchanged. Mesh topology or linked-island membership changes that cannot be matched safely are rejected instead of discarding edits.
