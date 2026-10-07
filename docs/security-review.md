# Pre-publication review

Review date: 2026-10-07. Scope: the initial public source tree and its new Git history.

## Publication boundaries

The publication tree excludes historical archives, screenshots, generated packages, private design links, account metadata, local configuration, logs, dependency directories and operating-system metadata. Only an explicit list of source, tests, build configuration and documentation is eligible for the initial commit.

The shared manifest contains a placeholder plugin ID. Each developer supplies their own ID through ignored local configuration. Relaunch uses a generic command. The initial commit uses a public project identity and a GitHub noreply address.

## Checks

- Review the full source, documentation, dependency lockfile and intended staged diff.
- Scan the exact staged bytes for sensitive patterns and unexpected file types.
- Scan the exported publication tree and initial Git history with Gitleaks, with findings redacted.
- Compare the staged tree against private markers retained only outside the repository.
- Run the dependency audit, type check, controller tests and package build.
- Verify that the runtime manifest denies external network access and generated files are not tracked.

Initial results: the exact publication tree passed the sensitive-content policy and private-marker review; the dependency audit reported zero known vulnerabilities; the type check, build and 15 controller tests passed, including in a clean exported tree. Gitleaks v8.30.1 is used for the source and history scans. A generic-key finding was reviewed as a metadata namespace, and its constant was renamed for clarity without changing stored data. Repository CI repeats the index policy, dependency audit, type check, tests, build and operation-count benchmark on changes.

## Limits

Automated scans detect known patterns and known dependency advisories; they are not a guarantee against every vulnerability or every form of confidential content. The runtime retains annotation text and endpoint IDs inside the user's Figma document by design. Native interaction verification for the v0.2 workflow and the public packaging changes is still pending.
