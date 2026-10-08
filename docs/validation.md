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

## Native Figma desktop verification (2026-10-08)

The v0.4.1 canvas test reproduced missed clicks beside the visible anchor. Its nearly transparent frame interior did not reliably participate in native selection. Controller selection mocks had not caught this behavior. v0.4.2 adds a nearly transparent rectangle shape inside each hit frame; the rectangle, dot and parent all resolve to the same endpoint. Geometry and cleanup tests cover both child shapes.

Actual mouse and keyboard input in a dedicated synthetic Figma Design document verified:

- At 123% canvas zoom, clicking approximately 16 screen pixels to the right of a component's right-anchor center selected that source.
- After zooming to 30%, clicking approximately 16 screen pixels to the left of a frame's left-anchor center completed the arrow. The panel reported creation and its connection count increased from 6 to 7; the new native arrow was visible on the canvas.
- Ending Draw removed the temporary anchors. Closing and reopening the plugin retained all 7 arrows.
- Clicking `框選範圍`, focusing the canvas, pressing R and dragging captured a 435 x 556 document-pixel range. The note form then became available.
- Typing a title and multiline note and clicking `建立註記` produced annotation #02 with an unfilled dashed border, number badge and side note. The panel reported it saved.
- Changing the note to the left side and clicking Save updated its placement. After closing and reopening, selecting the note restored #02, its title, multiline content and saved state.

The note creation pass used v0.4.1; reopening was checked again with the v0.4.2 anchor fix. Native host message exchange worked during these completed flows. Raw screenshots and input logs remain private; no account details, design URLs or unrelated editor tabs are published.

This is scoped native evidence, not full editor coverage. Dark theme, Undo/Redo, direct editing of note text, border resizing, range cancellation/redraw and every zoom level still need native regression passes. Existing automated cases for those behaviors remain test-double evidence. True hover and one-click rectangle-tool activation remain unavailable in this implementation.

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
