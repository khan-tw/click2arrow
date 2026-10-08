# Validation

## Automated coverage

The controller suite has 38 scenarios covering:

- Four side anchors, connection creation and preservation of source objects.
- Same-object rejection, cancellation, stopping and close cleanup.
- Labels, diagram edits, branching and stable diagram identity.
- Absolute geometry for nested/rotated objects.
- Geometry synchronization when editor change notifications are missed.
- Page changes and closing during asynchronous work.
- Missing/hidden endpoints, bounds validation and scoped deletion.
- Elbow routing around the two connected objects.
- Draw defaults to no ports until one object is selected; only that object has ports.
- Direct port clicks without first selecting source/target objects.
- Viewport/visibility filtering and the 40-object port limit.
- Stable layer IDs with zero new scene nodes over 100 geometry updates.
- Continuous-event throttling, direction reversal and unhide recovery.
- Numbered dashed range borders, side notes and unchanged source objects.
- Exact rectangle conversion, rotated/nested bounds and unsafe conversion rejection.
- Stable annotation child IDs, rotated edit geometry and direct native text readback.
- Number continuity after deletion, reopening and imported higher numbers.
- Annotation cancellation across page changes, plugin close and font failure.
- Workflow switching and annotation exclusion from arrow endpoints.

Build and type checking are separate checks. `npm run benchmark` writes operation counts to `docs/performance.json` using synthetic fixtures. It measures allocation and lookup counts in a test double, not native Figma FPS, latency or memory use.

The generated native panel also passed browser interaction checks for creating a multiline note, invalid-color validation, changing note side and color, scoped deletion, and exact rectangle conversion with continuing numbering. The checks drove the real panel controls and its controller messages against synthetic scene nodes; no runtime console errors remained.

## v0.4 regression coverage

- Empty/multiple selection and messages sent before selection notifications cannot mutate a stale arrow.
- Changing selection during asynchronous font loading cancels the pending arrow edit.
- Per-panel channels and action acknowledgements preserve success/failure identity; errors survive no-message geometry updates.
- Starting another annotation leaves existing annotations intact and keeps numbering continuous.
- Changing selection during annotation font loading cancels the edit and clears stale delete targets.
- Busy operations report rejection, never successful completion.
- Cold endpoint lookup cannot resume an arrow edit after the selected target has changed.

The v0.4 generated panel passed 57 browser checks, including source/target flow, previews, edit/delete confirmation, draft restoration, reverting a draft, annotation conversion, failed-save recovery, null-source host messages and foreign-channel rejection. Console output contained no errors or warnings. Light/dark and compact screenshots were inspected; dark mode used simulated Figma theme tokens. The three initially failing SVG visibility checks passed after switching to explicit hidden attributes.

## v0.4.1 regression coverage

- 40 x 40 screen-pixel hit areas retain 14px dots and 2px strokes at 10%, 25%, 50%, 100%, 200%, 400% and 800% zoom; resizing retains IDs and allocates no nodes.
- Selecting either a hit frame or its visible dot resolves the same endpoint. Removing one dot replaces only that handle; stop/workflow changes clean up both layers.
- Draw-range starts explicitly, ignores existing rectangles and remembers the new rectangle across unrelated selections. Clicking the active annotation tab preserves the range.
- Redraw, cancel, workflow changes, page changes and closing clean only owned range drafts. Invalid or unsafe containers are rejected; font failures preserve the draft and asynchronous saving revalidates it.

The actual generated panel passed 22 focused browser checks against synthetic scene nodes: default range action, R guidance, form sequencing, pinned dimensions, note preservation, creation, redraw, cancel, alternate range sources and both anchor target layers. Browser console output contained no errors or warnings. Initial and ready-range panel screenshots were inspected. These checks do not establish native Figma hit testing or mouse-drag behavior.

## Native status

Earlier native smoke testing covered plugin import, the panel, selection-mode anchors, Frame/Component connection, labels, Decision shapes, reopening and movement synchronization.

The v0.4.1 expanded anchor hit areas and draw-range capture still require a native interaction pass. The latest attempt could not activate the dedicated test document; input was stopped without operating on another document. An earlier native smoke found the v0.3 panel did not reflect workflow changes. The v0.4 channel-based bridge removes the parent-WindowProxy assumption; confirmation in the native host is pending. Native testing was interrupted by the Mac lock screen. Browser testing uses the actual generated panel connected to the scene-graph test double; it verifies controls and message wiring, not Figma canvas drag behavior or native font rendering. Screenshots of private editor sessions are not distributed as test evidence.

## Manual smoke checklist

```text
Configure your own plugin ID -> build -> import native-plugin/manifest.json
Open a synthetic design containing two frames
Start connection -> direct source port -> direct target port -> arrow appears
Move a frame -> arrow follows
Edit label / diagram / color -> Save changes
Reverse -> endpoints exchange
Compact -> panel resizes; Expand -> controls return
Selection mode -> only the selected object's ports appear
Stop / close -> temporary ports disappear
Reopen -> saved connection remains editable
Range annotation -> 框選範圍 -> focus canvas -> R -> drag range
Return to panel -> type note -> Create annotation
Redraw / Cancel -> only the owned draft disappears
Existing-object mode -> marquee-select objects -> type note -> Create annotation
R -> draw rectangle -> Convert range rectangle -> Create annotation
Selected rectangle is replaced; other screen layers remain unchanged
Select annotation child -> edit text / note side -> Save annotation
Resize border -> Save annotation -> note aligns with new range
Directly edit native note text -> reopen -> text is retained
Delete annotation -> original screen remains -> next number continues
```

Native canvas hover is not implemented; the public Figma Design event API does not expose it.
