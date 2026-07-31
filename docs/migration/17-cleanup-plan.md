# Cleanup Plan

| Item | Why It Exists | Remove When | Status |
|---|---|---|---|
| Python baseline evidence | comparable old-system truth | keep as long as Experiment 1.1 is maintained | retained |
| Migration documents | durable decisions and queue history | archive after repository-wide migration governance exists | retained |

## Deferred Governance

- Consider extracting the provider registry to a shared workspace package only after a second chapter needs it.
- Do not generalize the tool framework until another package demonstrates the same boundary.
- No temporary runtime adapter or Python dependency remains in the target package.
