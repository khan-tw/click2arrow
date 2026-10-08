# Click2Arrow product review

Method: dual-agent review. Assessment A independently inspected interaction design and operated the generated panel. Assessment B independently gathered browser and detector evidence. The findings were combined before verification of the improved panel.

Scope: the complete arrow and range-annotation workflows in the actual generated plugin panel, connected to synthetic scene nodes. This is browser panel evidence, not native Figma canvas verification. No private design screenshots, account configuration, or editor URLs are included here.

## Findings and changes

| Priority | Reproduced issue in v0.3 | v0.4 response |
| --- | --- | --- |
| P1 | Deselecting an arrow left its edit/delete target active; Delete removed the old arrow. | Clear stale targets and revalidate the current selection before mutations and after asynchronous work. |
| P1 | Selecting another object silently discarded an unsaved note. | Session-only drafts per page/tool/object; success acknowledgements before clearing them. |
| P2 | Invalid colors and dimensions disabled Save while the status told users to save. | Inline field errors with required ranges, accessible error descriptions and matching footer guidance. |
| P2 | Large header and permanently disabled edit controls pushed primary content below the fold. | Compact header, contextual footer, visible content fields and expandable secondary settings. |
| P2 | Source identity and composed appearance were absent. | Source/target names, source side, live arrow preview and explicit task state. |
| P2 | After creating a note, the next-create path required implicit deselection. | A visible New annotation action and continuous page numbering. |

The restrained accent, native Figma theme, semantic controls, explicit rectangle conversion and preservation of original objects remain product foundations.

## Baseline heuristic assessment

Scores describe the pre-change panel: 0 = poor, 4 = strong. They are qualitative design judgments, not measured usability results.

| Heuristic | Score / 4 | Baseline concern |
| --- | --- | --- |
| Visibility of status | 1 | Stale selection and conflicting status |
| Match with real-world tasks | 2 | Mixed action terminology |
| User control | 1 | Unsaved content lost on selection change |
| Consistency | 2 | Inconsistent primary-action language |
| Error prevention | 1 | Destructive stale target |
| Recognition | 2 | Missing source/target context |
| Efficiency | 2 | Important inputs below the fold |
| Visual hierarchy | 2 | Repeated chrome and tiny text |
| Error recovery | 1 | Invalid inputs lacked a correction path |
| Help | 3 | Useful help existed but was buried |
| Total | 17 / 40 | Functional and hierarchy issues took priority |

The earlier browser measured some muted text at approximately 4.2:1 on white. The new standalone panel uses a darker secondary color and larger functional labels. Figma-supplied theme values still require native verification. The mechanical scan's generic type-ratio warning is not a reason to add oversized headings to a compact utility; parser fallback also means the scan is not a complete accessibility audit.

## Verification outcome

The revised panel passed 57 browser checks; 30 controller regression scenarios passed. This includes the three initially failing preview checks after their fix. Type checking, packaging and dependency audit passed. Screenshot review covered light/dark and compact panels using synthetic content and simulated theme tokens. At this review checkpoint, native testing was pending because the desktop session was locked. A subsequent native pass and anchor hit-area fix are recorded in [validation](validation.md).

## Flow acceptance

1. Open / reconnect: clear readiness, one primary action, usable help.
2. Connect: source and target context, side choice, preview, cancellation and continuous drawing.
3. Edit: only the current selected arrow is editable; drafts survive selection changes.
4. Annotate: explicit selection/rectangle mode, note validation, number, side and save state.
5. Continue: New annotation starts the next range without deleting the earlier one.
6. Delete / recover: inline confirmation, selection revalidation, original screens preserved.

Native canvas behavior, native fonts, real Figma Undo and the host message bridge must be checked in the Figma desktop runtime. Browser tests cannot establish those claims. True canvas hover remains unimplemented.

Questions skipped: the user already authorized reviewing and improving the full plugin. No additional design approval was needed for these fixes.
