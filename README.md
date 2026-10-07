# Click2Arrow

An offline Figma Design plugin for connecting **existing frames, components and instances** with arrows, flowchart shapes and labels, and adding numbered range annotations.

```text
Frame A ------[ Process ]------> Frame B
Frame A --------< Decision >---> Frame B
                       |
                       +------> Frame C
```

## Features

- **Optional direct anchors:** press **開始連線** to show side-midpoint ports on visible objects. Click a source port, then a target port; no object selection is required.
- **Selection mode (default):** show four ports only on the selected object, useful for dense layouts and nested components.
- Elbow, straight and curved routes; single, double or no arrowhead; solid/dashed strokes; 1-8 px widths and custom HEX colors.
- Editable arrow labels and midpoint Process, Decision or Start/End shapes. Diagram frames can be branching endpoints.
- Contextual creation/edit actions, composed arrow preview, source/target names, compact panel and saved appearance preferences.
- Inline validation, session-only drafts that survive selection/tool changes, and explicit delete confirmation. Unsaved drafts last until the plugin closes.
- Reverse direction, cancellation, connection counts and Cmd/Ctrl+Enter to submit while the panel has focus.
- Connected geometry updates while the plugin is open. Existing arrow parts are updated in place during movement.
- **Range annotations:** marquee-select existing objects, or draw a rectangle with Figma's R tool and explicitly convert it. Create an unfilled dashed outline, an automatic per-page number, and an editable note on the left or right.
- Annotation titles, multiline notes, colors, note widths and selection padding. Select any annotation child to reopen the editor; deleting a note group leaves the original frames untouched.
- No accounts, analytics, remote services or network access are required by the plugin.

The panel uses Traditional Chinese action labels, Figma theme colors, and a compact 380px layout. Secondary appearance settings are expandable.

## Install for development

Requires Node.js 22 or newer, npm, and Figma Desktop.

```sh
git clone https://github.com/khan-tw/click2arrow.git
cd click2arrow
npm ci
```

1. In Figma, use **Plugins > Development > New Plugin** to obtain your own plugin ID. The exact wording can vary between Figma releases. Copy the `id` from the generated manifest.
2. Configure the ID locally, then build:

   ```sh
   npm run configure -- YOUR_FIGMA_PLUGIN_ID
   npm run build
   ```

3. Import **`native-plugin/manifest.json`** using **Plugins > Development > Import plugin from manifest**.
4. Open your existing Figma Design file, then run **Plugins > Development > Click2Arrow**.

The ID is kept in ignored `manifest.local.json`; do not commit it. Root `manifest.json` is a shareable template. The three generated files in `native-plugin/` form the standalone plugin package. Keep them together. No local web server is needed.

For a fresh checkout, `npm run build` can compile without a local ID, but the generated manifest retains the placeholder until you configure one. Configure your own ID before importing. If you already use this plugin, preserve that ID to retain access to its saved connection metadata.

## Use

```text
Direct mode:
開始連線 -> click source port -> click target port -> continue drawing

Selection mode:
開始連線 -> select object -> click source port
     -> select another object -> click target port

Edit:
Select a generated arrow -> change settings -> 儲存變更
```

**取消起點** clears the pending source. **結束連線** and closing the plugin remove temporary ports. Escape cancels when the plugin panel has keyboard focus; it is not a global Figma shortcut. **刪除** removes the selected generated arrow. Source objects retain their parents, appearance and children.

### Range annotations

Switch to **範圍註記**, choose a range source, and enter a note. After creation, **新增另一個** starts the next annotation. Unsaved edits are retained when selecting other objects or switching tools, and are cleared only after successful saving or when the plugin closes.



```text
Existing objects:
Marquee-select objects -> enter note -> Create annotation

Exact drawn range:
Click canvas -> R -> drag rectangle -> select it
            -> Convert range rectangle -> enter note -> Create annotation

Output:
+--[01]--------------------+     +---------------------+
| Existing screen content  |     | #01 Optional title  |
| (unfilled dashed border) |     | Explanatory note    |
+--------------------------+     +---------------------+

Edit:
Select annotation or a child -> change text / side / width -> Save annotation
```

Rectangle conversion **replaces only the selected rectangle**. It rejects locked rectangles, component/instance internals and auto-layout ancestors. Selection mode preserves every selected source object. Move the annotation group as a unit, or resize its border and save to reposition the note. Numbers increment per page and are retained when editing; deletion does not reuse numbers. Annotation ranges stay fixed rather than following source objects.

Labels, notes and geometry are saved in the Figma document using plugin data. Anyone with appropriate access to the document may be able to read that data; it is not a secret store. Appearance preferences omit label text and selected node IDs.

## Platform limits

- **This is not hover-only interaction.** Figma Design's public plugin API does not expose arbitrary canvas pointer/hover events. The default is selection mode, which displays ports on one selected object. Direct mode keeps visible ports on the canvas only when explicitly enabled. Neither mode fulfills the hover-only requirement. See the [Figma event API](https://developers.figma.com/docs/plugins/api/properties/figma-on/).
- Direct mode displays ports on up to 40 visible objects. Sections/groups are traversed with a 1,200-node examination budget; frames/components are treated as single objects. Explicit selection can target a nested object. Pan or zoom to change the visible set.
- Geometry synchronization covers up to 200 top-level connection outputs on the current page. The plugin must remain open; reopening or Refresh updates saved connections. Missing/hidden endpoints preserve existing arrow output.
- Elbow routing avoids the two endpoints, not every unrelated canvas object. Overlapping endpoints or tight layouts may need another route.
- Each arrow has one midpoint diagram and one label. Free placement of multiple intermediate steps is not implemented.
- For arrows, use the panel to edit content that should survive synchronization; manually editing generated children does not update saved metadata.
- Range annotations allow up to 100 selected objects, 200 annotation groups per page, 2,000 characters per note and 80 per title. Direct native annotation text edits are read back when selected/reopened. Keep annotation groups at the page's top level to edit them in the plugin.

## Develop and verify

```sh
npm run typecheck
npm test
npm run build
npm run benchmark
npm run verify:public
```

`verify:public` scans the **Git index**, including staged modifications. Stage the intended public files before running it. It enforces a file allowlist and checks for common credentials, personal paths, email addresses and private design URLs. See [SECURITY.md](SECURITY.md) for the scope and limitations.

- `code.ts`: native Figma document controller.
- `ui.html`: declarative plugin panel, compiled to standalone HTML controls.
- `scripts/build.cjs`: self-contained native package builder.
- `tests/`: scene-graph test double and controller regression tests.
- [Interaction design](docs/interaction-design.md), [validation](docs/validation.md), and [security review](docs/security-review.md).

The current controller suite covers 30 scenarios, including annotation creation, editing, conversion, numbering, source preservation and asynchronous cancellation. The operation-count benchmark checks 100 geometry updates; it is not a Figma FPS measurement. Native verification of the v0.4 panel and the direct-port/range-annotation workflows is still pending. See the [product review](docs/product-review.md) for verified browser findings and remaining native checks.

## License

[MIT](LICENSE). No private design files, screenshots, personal account configuration or historical project archives are included in this repository.
