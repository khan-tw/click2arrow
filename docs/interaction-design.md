# Click2Arrow interaction design

## Product intent

Reduce repeated manual line drawing, endpoint alignment and flow annotation between existing Figma frames and components. The document's existing objects remain the workflow's anchors.

## Requested interaction and platform decision

```text
Requested:
Draw -> hover object -> four side ports -> source click -> target click

Current default (v0.2.1):
Draw -> select object -> four side ports -> source click
     -> select target -> four side ports -> target click

Optional direct mode (explicit opt-in):
Draw -> show visible ports -> source click -> target click
```

The requested interaction is hover-only on existing frames/components. It remains unimplemented because the public Figma Design plugin API has no canvas pointer/hover event for these objects. The default no longer populates all visible ports. Selection mode is an existing fallback, not completion of the hover requirement. Widget hover styles apply only to a widget's own elements.

## State ownership

```text
Idle
  | Draw
  v
Waiting for object ---- select supported object ---> Picking source
  ^                                                  |
  | cancel                                           | click side
  |                                                  v
  +------------------------------------------ Waiting for target
                                                     |
                                                     | select another object
                                                     v
                                              Picking target
                                                     |
                                                     | click side
                                                     v
                                                 Creating
                                                     |
                                                     | success
                                                     v
                                              Waiting for object

Stop drawing / plugin close -> remove temporary anchors
Selected owned arrow        -> edit controls -> Apply changes
```

All document mutation, endpoint validation and saved connection data belong to `code.ts`. The iframe owns input controls and presentation. Messages carry explicit start, stop, cancel, port, style, apply, refresh and delete actions. Busy states prevent overlapping mutations. Input is revalidated in the document controller.

## Panel structure

```text
+---------------------------------+
| Click2Arrow                     |
| Direct / Selection    Compact
| Draw                  Cancel    |
| 1 Select > 2 Source > 3 Target   |
| [selected object / four sides]  |
|---------------------------------|
| Connection                      |
| [Elbow] [Straight] [Curve]       |
| Color            Stroke weight  |
| Dashed           Arrowheads     |
|---------------------------------|
| Flow content                    |
| Arrow label                     |
| [None] [Process] [Decision]      |
| [Start/End]                     |
| Diagram text                    |
|---------------------------------|
| Selected arrow                  |
| Reverse   Apply changes   Delete   |
| Status / validation feedback    |
+---------------------------------+
```

Primary action remains Draw. A connected arrow can be edited immediately after creation. Explicit Apply changes groups annotation and style edits instead of rebuilding the scene on each keystroke. The panel stays open for consecutive connections.

## Diagram behavior

Process uses a rectangle, Decision a diamond, Start/End a rounded rectangle. The diagram is placed at the arrow's path midpoint. Its frame ID is retained when geometry is refreshed so branch connections keep a stable endpoint. Arrow text is centered on the path, or sits above a midpoint diagram. The resulting vectors and text are native editable layers; plugin-driven refresh updates owned arrow parts in place from the saved style. Use the panel for content changes that should survive refresh.

Deleting or removing a diagram that other arrows reference leaves those branch annotations in place and reports missing endpoints. Explicitly reconnect or delete those branches as needed.

## Next design decisions

The current version deliberately has one intermediate diagram per arrow. Multiple movable intermediate steps, automatic avoidance of unrelated objects, editing outside the plugin without metadata drift, and global keyboard shortcuts require additional interaction design. Native hover requires a platform API change.

## v0.2 performance contract

- Reuse anchor IDs while the visible object set is unchanged.
- Reuse line, heads, diagram, label and text IDs during position updates.
- Cache endpoint references; validate page and visibility on every use.
- Throttle editor change events (32 ms) instead of waiting for movement to stop.
- Check missed changes on a 160 ms fallback while the plugin is open.
- Stop all timers and remove temporary ports on close.
- Do not claim native hover or a measured frame rate.
