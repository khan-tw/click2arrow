# Validation

## Automated coverage

The controller suite has 23 scenarios covering:

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

## Native status

Earlier native smoke testing covered plugin import, the panel, selection-mode anchors, Frame/Component connection, labels, Decision shapes, reopening and movement synchronization.

The v0.2 direct-port workflow, v0.3 range annotations and the open-source packaging changes still require a native interaction pass. Browser testing uses the actual generated panel connected to the scene-graph test double; it verifies controls and message wiring, not Figma canvas drag behavior or native font rendering. Screenshots of private editor sessions are not distributed as test evidence.

## Manual smoke checklist

```text
Configure your own plugin ID -> build -> import native-plugin/manifest.json
Open a synthetic design containing two frames
Draw -> direct source port -> direct target port -> arrow appears
Move a frame -> arrow follows
Edit label / diagram / color -> Apply changes
Reverse -> endpoints exchange
Compact -> panel resizes; Expand -> controls return
Selection mode -> only the selected object's ports appear
Stop / close -> temporary ports disappear
Reopen -> saved connection remains editable
Range annotation -> marquee-select objects -> type note -> Create annotation
R -> draw rectangle -> Convert range rectangle -> Create annotation
Selected rectangle is replaced; other screen layers remain unchanged
Select annotation child -> edit text / note side -> Save annotation
Resize border -> Save annotation -> note aligns with new range
Directly edit native note text -> reopen -> text is retained
Delete annotation -> original screen remains -> next number continues
```

Native canvas hover is not implemented; the public Figma Design event API does not expose it.
