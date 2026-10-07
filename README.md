# Click2Arrow

An offline Figma Design plugin for connecting **existing frames, components and instances** with arrows, flowchart shapes and labels.

```text
Frame A ------[ Process ]------> Frame B
Frame A --------< Decision >---> Frame B
                       |
                       +------> Frame C
```

## Features

- **Direct anchors:** press Draw to show side-midpoint ports on visible objects. Click a source port, then a target port; no object selection is required.
- **Selection mode:** show four ports only on the selected object, useful for dense layouts and nested components.
- Elbow, straight and curved routes; single, double or no arrowhead; solid/dashed strokes; 1-8 px widths and custom HEX colors.
- Editable arrow labels and midpoint Process, Decision or Start/End shapes. Diagram frames can be branching endpoints.
- Reverse direction, compact panel, cancellation, connection counts and saved appearance preferences.
- Connected geometry updates while the plugin is open. Existing arrow parts are updated in place during movement.
- No accounts, analytics, remote services or network access are required by the plugin.

The panel uses Traditional Chinese with English product terms.

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
Draw -> click source port -> click target port -> continue drawing

Selection mode:
Draw -> select object -> click source port
     -> select another object -> click target port

Edit:
Select a generated arrow -> change settings -> Apply changes
```

**Cancel** clears the pending source. **Stop drawing** and closing the plugin remove temporary ports. Escape cancels when the plugin panel has keyboard focus; it is not a global Figma shortcut. **Delete** removes the selected generated arrow. Source objects retain their parents, appearance and children.

Labels and geometry are saved in the Figma document using plugin data. Anyone with appropriate access to the document may be able to read that data; it is not a secret store. Appearance preferences omit label text and selected node IDs.

## Platform limits

- **This is not hover-only interaction.** Figma Design's public plugin API does not expose arbitrary canvas pointer/hover events. Direct mode keeps ports visible while Draw is active; selection mode displays them after selection. See the [Figma event API](https://developers.figma.com/docs/plugins/api/properties/figma-on/).
- Direct mode displays ports on up to 40 visible objects. Sections/groups are traversed with a 1,200-node examination budget; frames/components are treated as single objects. Explicit selection can target a nested object. Pan or zoom to change the visible set.
- Geometry synchronization covers up to 200 top-level connection outputs on the current page. The plugin must remain open; reopening or Refresh updates saved connections. Missing/hidden endpoints preserve existing arrow output.
- Elbow routing avoids the two endpoints, not every unrelated canvas object. Overlapping endpoints or tight layouts may need another route.
- Each arrow has one midpoint diagram and one label. Free placement of multiple intermediate steps is not implemented.
- Use the panel to edit content that should survive synchronization; manually editing generated children does not update saved metadata.

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

The current controller suite covers 15 scenarios. The operation-count benchmark checks 100 geometry updates; it is not a Figma FPS measurement. Native verification of the v0.2 direct-port workflow is still pending.

## License

[MIT](LICENSE). No private design files, screenshots, personal account configuration or historical project archives are included in this repository.
