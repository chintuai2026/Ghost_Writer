# Ghost Writer

Ghost Writer is an open-source desktop copilot for interviews and meetings.
It combines local or cloud LLMs, local Whisper transcription, screenshot-aware answering, and a stealth-oriented overlay for fast in-session assistance.

## Version

Current official release: `v1.0.0`

## What It Does

- Real-time transcription from microphone and system audio
- Fast answer generation for live interviews and meetings
- Screenshot attach and image-aware responses
- Local-first operation with Ollama and local Whisper
- Cloud LLM support for Gemini, OpenAI, Claude, Groq, DeepSeek, and custom OpenAI-compatible providers
- Meeting history, summaries, and local RAG grounding
- Guided onboarding, demo meeting seeding, and settings-based recovery actions

## Platforms

- Windows: supported
- macOS: Apple Silicon `arm64` `.dmg` build supported

## Downloads

Official releases are published here:

- [GitHub Releases](https://github.com/chintuai2026/Ghost_Writer/releases)

Expected asset names for `v1.0.0`:

- Windows: `Ghost.Writer.Setup.1.0.0.exe`
- macOS: `Ghost.Writer.1.0.0-arm64.dmg`

## Quick Start

1. Download the latest installer from GitHub Releases.
2. Install and launch Ghost Writer.
3. Complete the Setup Wizard.
4. Pick your model provider:
   - local: Ollama
   - cloud: Gemini, OpenAI, Claude, Groq, DeepSeek, custom provider
5. Start a meeting session and use quick actions like `What to Answer`, `Recap`, or `Follow Up`.

## Demo Setup

Ghost Writer includes a built-in demo path for first-time testing.

If the demo meeting is missing:

1. Open `Settings`
2. Go to `General`
3. Use `Restore Demo Meeting`

If you want to replay onboarding:

1. Open `Settings`
2. Go to `General`
3. Use `Replay Onboarding`

These recovery actions were added specifically so packaged installs behave the same as development runs.

## Recommended Setup

### Fastest text-first setup

- STT: local Whisper or Deepgram
- LLM: Gemini Flash or Groq for low latency

### Best local-first setup

- STT: local Whisper
- LLM: Ollama

### Best multimodal interview setup

- Use a vision-capable model for screenshot answering
- Attach screenshots with `Ctrl/Cmd+H`

## Keyboard Shortcuts

- `Ctrl/Cmd+B` or `Alt+G`: toggle visibility
- `Ctrl/Cmd+Shift+Space`: show and center window
- `Ctrl/Cmd+R` or `Alt+C`: reset current state
- `F9`: start or end meeting session
- `F8` or `Ctrl/Cmd+J`: quick "what should I answer"
- `Ctrl/Cmd+Enter`: process current context
- `Ctrl/Cmd+H`: attach screenshot
- `Ctrl/Cmd+Shift+H`: contextual selection capture

## Architecture

Main parts of the app:

- `electron/`: Electron main process, IPC, services, audio, LLM orchestration
- `src/`: React renderer UI
- `native-module/`: Rust native audio capture module
- `tests/`: validation, smoke tests, fallback tests, e2e checks
- `docs/`: project docs and landing page assets

Key runtime pieces:

- local Whisper transcription via `whisper.cpp`
- local embeddings and RAG-backed context retrieval
- provider routing with fallback support
- multimodal screenshot preprocessing and OCR-assisted image prompts

## Development

### Requirements

- Node.js `20` or `22+`
- npm `10+`
- Rust stable toolchain

The repo includes:

- [.nvmrc](.nvmrc)
- `package.json` engines for the supported Node versions

### Install

```bash
git clone https://github.com/chintuai2026/Ghost_Writer.git
cd Ghost_Writer
npm install
```

### Run in development

```bash
npm run build:native
npm run app:dev
```

### Run checks

```bash
npm run lint
npx tsc -p electron/tsconfig.json --noEmit
npm test
```

### Build production artifacts

```bash
npm run app:build -- --win --x64
```

This produces clean deliverables in `artifacts/`.

## Release Notes For Maintainers

The packaged app can download an external runtime bundle from the GitHub release for the current app version.

Important:

- the release should include `ai-runtime.zip`
- the app looks for that asset at:
  - `https://github.com/chintuai2026/Ghost_Writer/releases/download/v<appVersion>/ai-runtime.zip`

If `ai-runtime.zip` is not uploaded to the release, runtime installation will fail for users who need that bundle.

## Environment Variables

Typical optional variables:

```bash
GEMINI_API_KEY=
OPENAI_API_KEY=
CLAUDE_API_KEY=
GROQ_API_KEY=
DEEPSEEK_API_KEY=
LOG_LEVEL=info
NODE_ENV=development
```

See [.env.example](.env.example) for the full example template.

## Notes About Stealth

Ghost Writer includes stealth-oriented behavior such as content protection, disguise options, and overlay-first usage.
Do not describe it as universally undetectable without validating the exact target app, OS, and screen-sharing mode.

## Current State

`v1.0.0` is the first official release baseline.

It includes:

- packaged Windows and macOS release flow
- cleaned release artifact naming
- corrected packaged app user-data handling
- onboarding replay and demo restoration
- fixed model-selection propagation
- improved screenshot-aware chat flow
- CI aligned with supported Node versions

## License

Ghost Writer is licensed under the [AGPL-3.0 License](docs/LICENSE).

## Contributing

- open an issue for bugs or feature requests
- open a pull request for fixes and improvements
- keep changes aligned with the current Node and Electron toolchain

Useful docs:

- [Architecture](docs/ARCHITECTURE.md)
- [Changelog](docs/CHANGELOG.md)
- [Contributing](docs/CONTRIBUTING.md)
- [Security](docs/SECURITY.md)
