import { WhisperModelManager } from "../audio/WhisperModelManager";
import { OllamaProvider, isLikelyVisionModelName } from "../llm/providers/OllamaProvider";
import { CredentialsManager } from "../services/CredentialsManager";

export type FullPrivacyStatusError =
  | "missing_whisper_runtime"
  | "missing_whisper_model"
  | "ollama_unreachable"
  | "missing_local_text_model"
  | "missing_local_vision_model";

export interface FullPrivacyStatus {
  enabled: boolean;
  localWhisperReady: boolean;
  localWhisperModelReady: boolean;
  ollamaReachable: boolean;
  localTextModelReady: boolean;
  localVisionModelReady: boolean;
  activeOllamaModel: string;
  errors: FullPrivacyStatusError[];
}

export function hasLocalTextModel(models: string[]): boolean {
  return models.some((model) => !isLikelyVisionModelName(model));
}

export function hasLocalVisionModel(models: string[]): boolean {
  return models.some((model) => isLikelyVisionModelName(model));
}

export function buildFullPrivacyBlockingMessage(
  status: FullPrivacyStatus,
  options: { requiresVision?: boolean; requiresWhisper?: boolean } = {}
): string | null {
  if (options.requiresWhisper && !status.localWhisperReady) {
    return "Full Privacy Mode is enabled, but the Local Whisper runtime is not ready. Install or repair the Local Whisper bundle before continuing.";
  }

  if (options.requiresWhisper && !status.localWhisperModelReady) {
    return "Full Privacy Mode is enabled, but the selected Local Whisper model is missing. Download or point Ghost Writer to a local Whisper model before continuing.";
  }

  if (!status.ollamaReachable) {
    return "Full Privacy Mode is enabled, but Ollama is not running. Start Ollama locally before continuing.";
  }

  if (!status.localTextModelReady) {
    return "Full Privacy Mode is enabled, but no local Ollama text model is installed. Install one with `ollama pull llama3.2` or another local text model.";
  }

  if (options.requiresVision && !status.localVisionModelReady) {
    return "Full Privacy Mode requires a vision-capable local Ollama model for screenshot analysis. Install one with `ollama pull llava:7b` or `ollama pull qwen2.5-vl:7b`.";
  }

  return null;
}

export async function getFullPrivacyStatus(): Promise<FullPrivacyStatus> {
  const creds = CredentialsManager.getInstance();
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  const whisperManager = WhisperModelManager.getInstance();
  const whisperStatus = whisperManager.getStatus();
  const whisperValidation = whisperStatus.hasBinary
    ? whisperManager.validateBinaryBundle(false)
    : { ok: false };

  const ollamaProvider = new OllamaProvider(ollamaUrl, creds.getOllamaModel() || "");
  const ollamaReachable = await ollamaProvider.checkAvailable();
  const installedOllamaModels = ollamaReachable ? await ollamaProvider.getModels() : [];
  const textModels = installedOllamaModels.filter((model) => !isLikelyVisionModelName(model));
  const visionModels = installedOllamaModels.filter((model) => isLikelyVisionModelName(model));

  const storedOllamaModel = creds.getOllamaModel() || "";
  const activeOllamaModel =
    (storedOllamaModel && installedOllamaModels.includes(storedOllamaModel) && storedOllamaModel) ||
    textModels[0] ||
    installedOllamaModels[0] ||
    "";

  const status: FullPrivacyStatus = {
    enabled: creds.getAirGapMode(),
    localWhisperReady: whisperStatus.hasBinary && whisperValidation.ok,
    localWhisperModelReady: whisperStatus.hasModel,
    ollamaReachable,
    localTextModelReady: textModels.length > 0,
    localVisionModelReady: visionModels.length > 0,
    activeOllamaModel,
    errors: [],
  };

  if (!status.localWhisperReady) {
    status.errors.push("missing_whisper_runtime");
  }
  if (!status.localWhisperModelReady) {
    status.errors.push("missing_whisper_model");
  }
  if (!status.ollamaReachable) {
    status.errors.push("ollama_unreachable");
  }
  if (status.ollamaReachable && !status.localTextModelReady) {
    status.errors.push("missing_local_text_model");
  }
  if (status.ollamaReachable && !status.localVisionModelReady) {
    status.errors.push("missing_local_vision_model");
  }

  return status;
}
