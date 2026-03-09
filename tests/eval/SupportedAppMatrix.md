# Ghost Writer Supported-App Matrix

This file is a validation template, not a certified result set.

Use it only after manual testing on a specific OS, app version, and sharing mode. Do not convert any row to "supported" until the behavior has been reproduced and logged with the exact test date.

## Scope

- Validate Windows and macOS separately.
- Validate window share and full-screen share separately.
- Validate screenshots/recordings separately from live conferencing capture.
- Record the exact Ghost Writer build, conferencing app version, and OS version for each run.

## Status Meanings

- `Pending`: not tested yet.
- `Partial`: works only in some capture modes or some app versions.
- `Unsupported`: confirmed not to work reliably.
- `Verified`: manually reproduced and documented for this exact setup.

## Matrix Template

| Platform | OS | App Version | Window Share | Full Screen Share | Screenshot / Recording | Notes | Tested On |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Zoom | Pending | Pending | Pending | Pending | Pending | Fill after manual validation. | Pending |
| Microsoft Teams | Pending | Pending | Pending | Pending | Pending | Fill after manual validation. | Pending |
| Google Meet | Pending | Pending | Pending | Pending | Pending | Fill after manual validation. | Pending |
| Slack Huddles | Pending | Pending | Pending | Pending | Pending | Fill after manual validation. | Pending |
| WebEx | Pending | Pending | Pending | Pending | Pending | Fill after manual validation. | Pending |
| Browser interview platforms | Pending | Pending | Pending | Pending | Pending | Test by browser and site separately. | Pending |

## Required Evidence Per Row

- OS version and exact app version.
- Whether Ghost Writer overlay was shared as a window or only present on the desktop.
- Whether content protection was enabled.
- Whether disguise mode was enabled.
- Whether the overlay was visible, blacked out, partially visible, or fully hidden.
- Any caveats such as focus changes, taskbar/dock visibility, or capture glitches.
