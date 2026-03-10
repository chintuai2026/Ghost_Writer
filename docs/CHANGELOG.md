# Changelog

All notable changes to Ghost Writer are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [1.0.0] - 2026-03-09

### First Official Release

#### Included
- Real-time interview and meeting assistance with local and cloud model routing
- Screenshot-aware answering and multimodal context handling
- Local Whisper transcription with GPU-aware processing and cloud STT provider support
- Guided onboarding, demo meeting seeding, and persistent meeting history
- Packaged Windows installer and Apple Silicon macOS `.dmg` release flow

#### Hardened
- Packaged app data now uses the correct `Ghost Writer` user-data directory with legacy migration support
- Release builds now produce a clean `artifacts/` folder for final installer outputs
- Demo meeting seeding and onboarding recovery actions were aligned for packaged builds
- Versioning and release download paths were normalized for the first official `1.0.0` release
