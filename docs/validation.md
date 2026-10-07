# Validation

## Automated coverage

The controller suite has 16 scenarios covering:

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

Build and type checking are separate checks. `npm run benchmark` writes operation counts to `docs/performance.json` using synthetic fixtures. It measures allocation and lookup counts in a test double, not native Figma FPS, latency or memory use.

## Native status

Earlier native smoke testing covered plugin import, the panel, selection-mode anchors, Frame/Component connection, labels, Decision shapes, reopening and movement synchronization.

The v0.2 direct-port workflow and the open-source packaging changes still require a native interaction pass. Screenshots of private editor sessions are not distributed as test evidence.

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
```

Native canvas hover is not implemented; the public Figma Design event API does not expose it.
