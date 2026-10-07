# Security and privacy

## Runtime boundaries

- The generated manifest sets `networkAccess.allowedDomains` to `["none"]`.
- The plugin contains no telemetry, credentials, remote assets, external scripts, authentication flow or backend.
- The UI accepts state messages only from its parent Figma window. Dynamic text is displayed through `textContent` or control values, not interpreted as HTML.
- The controller validates style choices, color formats, text lengths, stroke widths, endpoint existence and current-page membership.
- Document mutation is scoped to temporary anchors and generated output. Existing source objects are not reparented or restyled.
- Connection metadata and annotations live in the Figma document. They are not encrypted by this plugin and are subject to the document's access controls.

Figma itself can synchronize a document using its own services. The plugin's network restriction does not disable Figma's document synchronization.

## Before publishing changes

1. Review the actual staged diff and file list, including test data and documentation.
2. Keep local configuration, credentials, screenshots, logs and design-file links out of Git.
3. Run `npm run verify:public` after staging. It checks the Git index, not only the working tree.
4. Run a dedicated secret scanner such as Gitleaks against both the staged tree and complete Git history.
5. Run `npm audit`, the type check, tests and build.
6. Use an appropriate public commit identity and a GitHub noreply address.

The public-file allowlist intentionally excludes generated bundles and ZIPs. Build them from reviewed source. A secret scan cannot prove the absence of all confidential information; source review and data minimization are also required. Never add a real secret as a test fixture.

## Reporting a vulnerability

Use the repository's **Security > Report a vulnerability** feature when available. Do not include credentials, private Figma files, personal information or confidential screenshots in a public issue. General bugs can be reported with synthetic examples and reproduction steps.
