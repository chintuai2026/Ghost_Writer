import { EventEmitter } from 'events';
import { GoogleGenAI } from "@google/genai";
import { Anthropic } from "@anthropic-ai/sdk";
import OpenAI from "openai";
import Groq from "groq-sdk";
import fs from "fs";
import path from "path";

import { GeminiProvider } from "./llm/providers/GeminiProvider";
import { OllamaProvider } from "./llm/providers/OllamaProvider";
import { OpenAICompatProvider } from "./llm/providers/OpenAICompatProvider";
import { ClaudeProvider } from "./llm/providers/ClaudeProvider";
import { GroqProvider } from "./llm/providers/GroqProvider";
import { CustomCurlProvider } from "./llm/providers/CustomCurlProvider";
import { ILLMProvider, ChatPayload } from "./llm/providers/ILLMProvider";

import { extractFromCommonFormats } from "./llm/providers/CustomCurlProvider";

import { CustomProvider } from "./types/customProviders";
import { GPUHelper, GPUInfo } from "./utils/GPUHelper";
import { CostTracker } from "./utils/costTracker";
import { MultimodalHelper } from "./utils/MultimodalHelper";

import {
  UNIVERSAL_SYSTEM_PROMPT,
  HARD_SYSTEM_PROMPT,
  GROQ_SYSTEM_PROMPT,
  OPENAI_SYSTEM_PROMPT,
  CLAUDE_SYSTEM_PROMPT,
  IMAGE_ANALYSIS_PROMPT,
  GEMINI_PRO_MODEL,
  GEMINI_FLASH_MODEL
} from "./llm/prompts";

export const OPENAI_MODEL = "gpt-4o";
export const CLAUDE_MODEL = "claude-3-5-sonnet-latest";
export const DEEPSEEK_MODEL = "deepseek-reasoner";
export const RUNPOD_MODEL = "openai/runpod-model";
export const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// Let the provider handle its own config, orchestrator shouldn't hardcode if possible
// We keep it for the OpenAI/Claude instances for now
const MAX_OUTPUT_TOKENS = 8192;

type PreparedChatPayload = {
  payload: ChatPayload;
  cleanupPaths: string[];
};

export class LLMHelper extends EventEmitter {
  private apiKey: string = ""
  private client: GoogleGenAI | null = null
  private geminiModel: string = GEMINI_FLASH_MODEL
  private currentModelId: string = GEMINI_FLASH_MODEL

  private useOllama: boolean = false
  private ollamaUrl: string = "http://localhost:11434"
  private ollamaModel: string = ""

  private groqApiKey: string = ""
  private groqClient: Groq | null = null

  private openaiApiKey: string = ""
  private openaiClient: OpenAI | null = null

  private claudeApiKey: string = ""
  private claudeClient: Anthropic | null = null

  private nvidiaApiKey: string = ""
  private nvidiaClient: OpenAI | null = null

  private deepseekApiKey: string = ""
  private deepseekClient: OpenAI | null = null

  private gpuInfo: GPUInfo | null = null
  private isInitializing: boolean = false
  private initPromise: Promise<void> | null = null

  private customProvider: CustomProvider | null = null;
  private airGapMode: boolean = false;

  constructor(apiKey: string = "") {
    super()
    if (apiKey) {
      this.setApiKey(apiKey)
    }

    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      this.airGapMode = CredentialsManager.getInstance().getAirGapMode();
    } catch (e) {
      this.airGapMode = false;
    }

    this.initializeGPUAndOllama()
  }

  // ─── INITIALIZATION ───────────────────────────────────────────────

  private async initializeGPUAndOllama() {
    if (this.isInitializing) return this.initPromise
    this.isInitializing = true

    this.initPromise = (async () => {
      try {
        this.gpuInfo = await GPUHelper.detectGPU()
        const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel)
        await provider.initializeModel()
        this.ollamaModel = provider.getModel() || this.ollamaModel
      } catch (error) {
        console.warn("[LLMHelper] Non-critical error initializing GPU/Ollama:", error)
      } finally {
        this.isInitializing = false
      }
    })()

    return this.initPromise
  }

  // ─── GETTERS & SETTERS ────────────────────────────────────────────

  public setApiKey(apiKey: string): void {
    if (!apiKey) return
    this.apiKey = apiKey
    this.client = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: { apiVersion: "v1alpha" }
    })
  }

  public setGroqApiKey(apiKey: string): void {
    if (!apiKey) return;
    this.groqApiKey = apiKey;
    this.groqClient = new Groq({ apiKey, dangerouslyAllowBrowser: true });
    GroqProvider.resolveModel(apiKey);
  }

  public setOpenaiApiKey(apiKey: string): void {
    if (!apiKey) return;
    this.openaiApiKey = apiKey;
    this.openaiClient = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  }

  public setClaudeApiKey(apiKey: string): void {
    if (!apiKey) return;
    this.claudeApiKey = apiKey;
    this.claudeClient = new Anthropic({ apiKey });
  }

  public setNvidiaApiKey(apiKey: string): void {
    if (!apiKey) return;
    this.nvidiaApiKey = apiKey;
    this.nvidiaClient = new OpenAI({ apiKey, baseURL: 'https://integrate.api.nvidia.com/v1', dangerouslyAllowBrowser: true });
  }

  public setDeepseekApiKey(apiKey: string): void {
    if (!apiKey) return;
    this.deepseekApiKey = apiKey;
    this.deepseekClient = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', dangerouslyAllowBrowser: true });
  }

  public getGroqApiKey(): string { return this.groqApiKey; }
  public getClient(): GoogleGenAI | null { return this.client }
  public getGroqClient(): Groq | null { return this.groqClient }
  public getOpenaiClient(): OpenAI | null { return this.openaiClient }
  public getClaudeClient(): Anthropic | null { return this.claudeClient }
  public getNvidiaClient(): OpenAI | null { return this.nvidiaClient }
  public getDeepseekClient(): OpenAI | null { return this.deepseekClient }

  public getModel(): string { return this.useOllama ? `ollama-${this.ollamaModel}` : this.geminiModel }
  public getOllamaUrl(): string { return this.ollamaUrl }

  public getCurrentProvider(): string {
    if (this.useOllama) return 'ollama';
    if (this.customProvider) return 'custom';
    if (this.currentModelId === GEMINI_PRO_MODEL || this.currentModelId === GEMINI_FLASH_MODEL) return 'gemini';
    if (this.currentModelId === GROQ_MODEL) return 'groq';
    if (this.currentModelId === OPENAI_MODEL) return 'openai';
    if (this.currentModelId === CLAUDE_MODEL) return 'claude';
    if (this.currentModelId === NVIDIA_MODEL) return 'nvidia';
    if (this.currentModelId === DEEPSEEK_MODEL) return 'deepseek';
    return 'unknown';
  }

  public getCurrentModel(): string {
    if (this.useOllama) return this.ollamaModel;
    if (this.customProvider) return this.customProvider.name;
    return this.currentModelId;
  }

  public setAirGapMode(enabled: boolean): void {
    this.airGapMode = enabled;
    if (enabled && !this.useOllama) {
      this.useOllama = true;
      console.log("[LLMHelper] Air-Gap enabled: Switched to Ollama automatically");
    }
  }

  public setModel(modelId: string, customProviders: CustomProvider[] = []): void {
    const isLocalOllama = modelId.startsWith("ollama:") || modelId.startsWith("ollama-");

    // Strict Air-Gap Enforcement
    if (this.airGapMode && !isLocalOllama) {
      console.warn(`[LLMHelper] Blocked non-Ollama model switch due to Air-Gap Mode: ${modelId}`);
      this.useOllama = true;
      return;
    }

    let targetModelId = modelId;
    if (modelId === 'gemini') targetModelId = GEMINI_FLASH_MODEL;
    if (modelId === 'gemini-pro') targetModelId = GEMINI_PRO_MODEL;
    if (modelId === 'gpt-4o') targetModelId = OPENAI_MODEL;
    if (modelId === 'claude') targetModelId = CLAUDE_MODEL;
    if (modelId === 'llama') targetModelId = GROQ_MODEL;
    if (modelId === 'nvidia') targetModelId = NVIDIA_MODEL;
    if (modelId === 'deepseek') targetModelId = DEEPSEEK_MODEL;

    if (targetModelId.startsWith('ollama-')) {
      this.useOllama = true;
      this.ollamaModel = targetModelId.replace('ollama-', '');
      this.customProvider = null;
      console.log(`[LLMHelper] Switched to Ollama: ${this.ollamaModel}`);
      this.preloadModel(this.ollamaModel);
      return;
    }

    const custom = customProviders.find(p => p.id === targetModelId);
    if (custom) {
      this.useOllama = false;
      this.customProvider = custom;
      console.log(`[LLMHelper] Switched to Custom Provider: ${custom.name}`);
      return;
    }

    this.useOllama = false;
    this.customProvider = null;
    this.currentModelId = targetModelId;

    if (targetModelId === GEMINI_PRO_MODEL) this.geminiModel = GEMINI_PRO_MODEL;
    if (targetModelId === GEMINI_FLASH_MODEL) this.geminiModel = GEMINI_FLASH_MODEL;

    console.log(`[LLMHelper] Switched to Cloud Model: ${targetModelId}`);
  }

  // ─── MODEL MANAGEMENT ─────────────────────────────────────────────

  public async preloadModel(modelId: string): Promise<void> {
    const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
    return provider.preloadModel(modelId);
  }

  public getBestAvailableModel(): string {
    let airGapMode = false;
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      airGapMode = CredentialsManager.getInstance().getAirGapMode();
    } catch (e) { }

    if (airGapMode) return `ollama-${this.ollamaModel}`;
    if (this.apiKey) return GEMINI_FLASH_MODEL;
    if (this.groqApiKey) return GROQ_MODEL;
    if (this.deepseekApiKey) return DEEPSEEK_MODEL;
    if (this.openaiApiKey) return OPENAI_MODEL;
    if (this.claudeApiKey) return CLAUDE_MODEL;
    if (this.nvidiaApiKey) return NVIDIA_MODEL;
    if (this.useOllama) return `ollama-${this.ollamaModel}`;

    if (!this.apiKey && !this.groqApiKey && !this.deepseekApiKey && !this.openaiApiKey && !this.claudeApiKey && !this.nvidiaApiKey) {
      return `ollama-${this.ollamaModel}`;
    }

    return GEMINI_FLASH_MODEL;
  }

  // ─── UTILITY METHODS ──────────────────────────────────────────────

  public cleanJsonResponse(text: string): string {
    let cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }
    return cleaned;
  }

  public processResponse(text: string): string {
    if (!text) return "";
    let processed = text.replace(/\*\*(.+?)\*\*/g, '$1');
    const thinkStart = processed.indexOf('<think>');
    if (thinkStart !== -1) {
      const thinkEnd = processed.indexOf('</think>');
      if (thinkEnd !== -1) {
        processed = processed.substring(0, thinkStart) + processed.substring(thinkEnd + 8);
      }
    }
    processed = processed.replace(/<think>[\s\S]*?<\/think>/g, '');
    processed = processed.replace(/^[\s*#-]+/, '').trim();
    processed = processed.replace(/\n{3,}/g, '\n\n');
    return processed.trim();
  }

  public async withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        if (i === retries - 1) throw error;
        if (error.message?.includes("503") || error.message?.includes("overloaded")) {
          await this.delay(1000 * (i + 1));
        } else {
          throw error;
        }
      }
    }
    throw new Error("All retries exhausted");
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([
      promise.then((result) => { clearTimeout(timeoutHandle); return result; }),
      timeoutPromise
    ]);
  }

  private buildProviderPayload(
    payload: ChatPayload,
    defaultSystemPrompt?: string,
    overrides: Partial<ChatPayload> = {}
  ): ChatPayload {
    const merged: ChatPayload = {
      ...payload,
      ...overrides,
    };

    merged.systemPrompt = payload.options?.skipSystemPrompt
      ? undefined
      : (overrides.systemPrompt ?? payload.systemPrompt ?? defaultSystemPrompt);

    return merged;
  }

  private buildCustomPayload(payload: ChatPayload): ChatPayload {
    const basePayload = this.buildProviderPayload(payload, HARD_SYSTEM_PROMPT);
    return {
      ...basePayload,
      systemPrompt: basePayload.systemPrompt
        ? this.mapToCustomPrompt(basePayload.systemPrompt)
        : undefined,
    };
  }

  private appendContextNote(context: string | undefined, note: string): string {
    return context ? `${context}\n\n${note}` : note;
  }

  private buildMessageWithOCR(message: string, ocrText?: string): string {
    const normalizedOCR = ocrText?.trim();
    if (!normalizedOCR) {
      return message;
    }

    return `${message}\n\nSCREENSHOT OCR:\n${normalizedOCR}`;
  }

  private async preparePayload(payload: ChatPayload): Promise<PreparedChatPayload> {
    const normalizedPayload: ChatPayload = {
      ...payload,
      message: payload.message,
      context: payload.context,
      systemPrompt: payload.systemPrompt,
    };

    if (!payload.imagePath) {
      return { payload: normalizedPayload, cleanupPaths: [] };
    }

    if (!fs.existsSync(payload.imagePath)) {
      console.warn(`[LLMHelper] Attached image not found: ${payload.imagePath}`);
      return {
        payload: {
          ...normalizedPayload,
          imagePath: undefined,
          context: this.appendContextNote(
            payload.context,
            `Image attachment unavailable: ${path.basename(payload.imagePath)} was not found on disk.`
          ),
        },
        cleanupPaths: [],
      };
    }

    try {
      const multimodal = MultimodalHelper.getInstance();
      const processed = await multimodal.prepareImage(payload.imagePath, { runOCR: true });
      const cleanupPaths =
        processed.metadata.temporary && processed.processedPath !== payload.imagePath
          ? [processed.processedPath]
          : [];

      console.log(
        `[LLMHelper] Prepared image ${path.basename(payload.imagePath)} -> ${path.basename(processed.processedPath)} (ocr=${processed.metadata.usedOCR}, size=${processed.metadata.processedSize})`
      );

      return {
        payload: {
          ...normalizedPayload,
          imagePath: processed.processedPath,
          message: this.buildMessageWithOCR(payload.message, processed.ocrText),
        },
        cleanupPaths,
      };
    } catch (error) {
      console.warn("[LLMHelper] Image preprocessing failed, using original image:", error);
      return { payload: normalizedPayload, cleanupPaths: [] };
    }
  }

  private async cleanupPreparedPayload(cleanupPaths: string[]): Promise<void> {
    if (cleanupPaths.length === 0) {
      return;
    }

    const multimodal = MultimodalHelper.getInstance();
    await Promise.all(cleanupPaths.map((filePath) => multimodal.cleanupFile(filePath)));
  }

  // ─── OLLAMA PROVIDER DELEGATIONS ──────────────────────────────────

  private async callOllamaWithModel(modelId: string, prompt: string, imagePath?: string): Promise<string> {
    const provider = new OllamaProvider(this.ollamaUrl, modelId);
    return provider.callWithModel(modelId, prompt, imagePath);
  }

  public async callOllama(prompt: string, imagePath?: string): Promise<string> {
    return this.callOllamaWithModel(this.ollamaModel, prompt, imagePath);
  }

  public async checkOllamaAvailable(): Promise<boolean> {
    const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
    return provider.checkAvailable();
  }

  private async initializeOllamaModel(): Promise<void> {
    const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
    await provider.initializeModel();
    const resolvedModel = provider.getModel();
    if (resolvedModel) this.ollamaModel = resolvedModel;
  }

  public isUsingOllama(): boolean {
    return this.useOllama;
  }

  public async getOllamaModels(): Promise<string[]> {
    const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
    return provider.getModels();
  }

  public async forceRestartOllama(): Promise<boolean> {
    const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
    return provider.forceRestart();
  }

  private async * streamWithOllama(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
    yield* provider.stream(payload);
  }

  // ─── GEMINI PROVIDER DELEGATIONS ──────────────────────────────────

  public async generateWithPro(contents: any[]): Promise<string> {
    const provider = new GeminiProvider(this.client!);
    return provider.generateWithPro(contents);
  }

  public async generateWithFlash(contents: any[]): Promise<string> {
    const provider = new GeminiProvider(this.client!);
    return provider.generateWithFlash(contents);
  }

  public async generateContent(contents: any[]): Promise<string> {
    const provider = new GeminiProvider(this.client!);
    return provider.generateContent(contents, this.geminiModel);
  }

  // ─── GEMINI LLMHELPER METHODS (previously missed) ─────────────────

  public async extractProblemFromImages(imagePaths: string[]) {
    const parts: any[] = [];
    for (const imagePath of imagePaths) {
      const imageData = await fs.promises.readFile(imagePath);
      parts.push({
        inlineData: { data: imageData.toString("base64"), mimeType: "image/png" }
      });
    }
    const prompt = `${IMAGE_ANALYSIS_PROMPT}\n\nYou are a wingman. Please analyze these images and extract the following information in JSON format:\n{\n  "problem_statement": "...",\n  "context": "...",\n  "suggested_responses": ["..."],\n  "reasoning": "..."\n}\nImportant: Return ONLY the JSON object.`;
    parts.push({ text: prompt });
    const text = await this.generateWithFlash(parts);
    return JSON.parse(this.cleanJsonResponse(text));
  }

  public async generateSolution(problemInfo: any) {
    const prompt = `${IMAGE_ANALYSIS_PROMPT}\n\nGiven this problem or situation:\n${JSON.stringify(problemInfo, null, 2)}\n\nPlease provide your response in the following JSON format:\n{\n  "solution": {\n    "code": "...",\n    "problem_statement": "...",\n    "context": "...",\n    "suggested_responses": ["..."],\n    "reasoning": "..."\n  }\n}\nImportant: Return ONLY the JSON object.`;
    const text = await this.generateWithFlash([{ text: prompt }]);
    return JSON.parse(this.cleanJsonResponse(text));
  }

  public async debugSolutionWithImages(problemInfo: any, currentCode: string, debugImagePaths: string[]) {
    const parts: any[] = [];
    for (const imagePath of debugImagePaths) {
      const imageData = await fs.promises.readFile(imagePath);
      parts.push({
        inlineData: { data: imageData.toString("base64"), mimeType: "image/png" }
      });
    }
    const prompt = `${IMAGE_ANALYSIS_PROMPT}\n\nYou are a wingman. Given:\n1. The original problem or situation: ${JSON.stringify(problemInfo, null, 2)}\n2. The current response or approach: ${currentCode}\n3. The debug information in the provided images\n\nPlease analyze the debug information and provide feedback in this JSON format:\n{\n  "solution": {\n    "code": "...",\n    "problem_statement": "...",\n    "context": "...",\n    "suggested_responses": ["..."],\n    "reasoning": "..."\n  }\n}\nImportant: Return ONLY the JSON object.`;
    parts.push({ text: prompt });
    const text = await this.generateWithFlash(parts);
    return JSON.parse(this.cleanJsonResponse(text));
  }

  public async analyzeImageFile(imagePath: string) {
    const prompt = `${HARD_SYSTEM_PROMPT}\n\nDescribe the content of this image in a short, concise answer. If it contains code or a problem, solve it. \n\n${IMAGE_ANALYSIS_PROMPT}`;

    // Use the standardized, provider-agnostic chat logic
    const text = await this.chat({
      message: "Please describe this image.",
      imagePath: imagePath,
      systemPrompt: prompt
    });

    return { text, timestamp: Date.now() };
  }

  public async generateSuggestion(context: string, lastQuestion: string): Promise<string> {
    const systemPrompt = `You are an expert interview coach...\nCONVERSATION:\n${context}\nQUESTION:\n${lastQuestion}\nANSWER DIRECTLY:`;
    if (this.useOllama) {
      return await this.callOllama(systemPrompt);
    } else if (this.client) {
      const text = await this.generateWithFlash([{ text: systemPrompt }]);
      return this.processResponse(text);
    } else {
      throw new Error("No LLM provider configured");
    }
  }

  // ─── MORE GEMINI STREAMS ──────────────────────────────────────────

  private async * streamWithGeminiMultimodal(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    const provider = new GeminiProvider(this.client!);
    yield* provider.stream(payload);
  }

  private async * streamWithGeminiModel(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    const provider = new GeminiProvider(this.client!);
    yield* provider.stream(payload);
  }

  private async * streamWithGeminiParallelRace(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    const provider = new GeminiProvider(this.client!);
    yield* provider.streamParallelRace(payload);
  }

  private async collectStreamResponse(fullMessage: string, model: string): Promise<string> {
    const provider = new GeminiProvider(this.client!);
    return provider.collectResponse(fullMessage, model);
  }

  public createRobustClient(realClient: GoogleGenAI): GoogleGenAI {
    const provider = new GeminiProvider(realClient);
    return provider.createRobustClient(realClient);
  }

  private async generateWithFallback(client: GoogleGenAI, args: any): Promise<any> {
    const provider = new GeminiProvider(client);
    return provider.generateWithFallback(client, args);
  }

  // ─── GROQ PROVIDER DELEGATIONS ────────────────────────────────────

  private async generateWithGroq(payload: ChatPayload): Promise<string> {
    const provider = new GroqProvider(this.groqClient!);
    return provider.generate(payload);
  }

  private async generateWithGemini(payload: ChatPayload): Promise<string> {
    const provider = new GeminiProvider(this.client!);
    return provider.generate(payload);
  }

  private async * streamWithGroq(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    const provider = new GroqProvider(this.groqClient!);
    yield* provider.stream(payload);
  }

  public async * streamWithGroqOrGemini(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    const provider = new GroqProvider(this.groqClient!);
    yield* provider.streamWithGeminiFallback(
      payload,
      (p) => this.streamWithGeminiModel(p)
    );
  }

  // ─── OPENAI-COMPAT PROVIDER DELEGATIONS ───────────────────────────

  private async generateWithOpenai(payload: ChatPayload): Promise<string> {
    const provider = new OpenAICompatProvider(this.openaiClient!, OPENAI_MODEL, "OpenAI");
    return provider.generate(payload);
  }

  private async generateWithNvidia(payload: ChatPayload): Promise<string> {
    const provider = new OpenAICompatProvider(this.nvidiaClient!, NVIDIA_MODEL, "NVIDIA");
    return provider.generate(payload);
  }

  private async generateWithDeepseek(payload: ChatPayload): Promise<string> {
    const provider = new OpenAICompatProvider(this.deepseekClient!, DEEPSEEK_MODEL, "DeepSeek");
    return provider.generate(payload);
  }

  private async * streamWithOpenai(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    const provider = new OpenAICompatProvider(this.openaiClient!, OPENAI_MODEL, "OpenAI");
    yield* provider.stream(payload);
  }

  private async * streamWithNvidia(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    const provider = new OpenAICompatProvider(this.nvidiaClient!, NVIDIA_MODEL, "NVIDIA");
    yield* provider.stream(payload);
  }

  private async * streamWithDeepseek(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    const provider = new OpenAICompatProvider(this.deepseekClient!, DEEPSEEK_MODEL, "DeepSeek");
    yield* provider.stream(payload);
  }

  private async * streamWithOpenaiMultimodal(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    const provider = new OpenAICompatProvider(this.openaiClient!, OPENAI_MODEL, "OpenAI");
    yield* provider.stream(payload);
  }

  // ─── CLAUDE PROVIDER DELEGATIONS ──────────────────────────────────

  private async generateWithClaude(payload: ChatPayload): Promise<string> {
    const provider = new ClaudeProvider(this.claudeClient!);
    return provider.generate(payload);
  }

  private async * streamWithClaude(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    const provider = new ClaudeProvider(this.claudeClient!);
    yield* provider.stream(payload);
  }

  private async * streamWithClaudeMultimodal(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    const provider = new ClaudeProvider(this.claudeClient!);
    yield* provider.stream(payload);
  }

  // ─── CUSTOM CURL PROVIDER DELEGATIONS ─────────────────────────────

  private async executeCustomProvider(payload: ChatPayload): Promise<string> {
    const provider = new CustomCurlProvider(this.customProvider!);
    return provider.generate(payload);
  }

  private mapToCustomPrompt(prompt: string): string {
    if (!this.customProvider) return prompt;
    return CustomCurlProvider.mapToCustomPrompt(prompt);
  }

  private async * streamWithCustom(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    if (!this.customProvider) throw new Error("No custom provider configured");
    const provider = new CustomCurlProvider(this.customProvider!);
    yield* provider.stream(payload);
  }

  // ─── CONNECTION TESTING ───────────────────────────────────────────

  public async testSpecificConnection(provider: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      switch (provider) {
        case 'gemini': {
          const client = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });
          const response = await client.models.generateContent({ model: GEMINI_FLASH_MODEL, contents: [{ role: 'user', parts: [{ text: 'Say "Hello"' }] }] });
          return response?.text ? { success: true } : { success: false, error: "Empty response" };
        }
        case 'groq': {
          const client = new Groq({ apiKey, dangerouslyAllowBrowser: true });
          const response = await client.chat.completions.create({ model: GROQ_MODEL, messages: [{ role: "user", content: "Say hello" }], max_tokens: 10 });
          return response?.choices?.[0]?.message?.content ? { success: true } : { success: false, error: "Empty response" };
        }
        case 'openai': {
          const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
          const response = await client.chat.completions.create({ model: OPENAI_MODEL, messages: [{ role: "user", content: "Say hello" }], max_tokens: 10 });
          return response?.choices?.[0]?.message?.content ? { success: true } : { success: false, error: "Empty response" };
        }
        case 'claude': {
          const client = new Anthropic({ apiKey });
          const response = await client.messages.create({ model: CLAUDE_MODEL, max_tokens: 10, messages: [{ role: "user", content: "Say hello" }] });
          const block = response?.content?.[0];
          return (block && 'text' in block && block.text) ? { success: true } : { success: false, error: "Empty response" };
        }
        case 'nvidia': {
          const client = new OpenAI({ apiKey, baseURL: 'https://integrate.api.nvidia.com/v1', dangerouslyAllowBrowser: true });
          const response = await client.chat.completions.create({ model: NVIDIA_MODEL, messages: [{ role: "user", content: "Say hello" }], max_tokens: 10 });
          return response?.choices?.[0]?.message?.content ? { success: true } : { success: false, error: "Empty response" };
        }
        case 'deepseek': {
          const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', dangerouslyAllowBrowser: true });
          const response = await client.chat.completions.create({ model: DEEPSEEK_MODEL, messages: [{ role: "user", content: "Say hello" }], max_tokens: 10 });
          return response?.choices?.[0]?.message?.content ? { success: true } : { success: false, error: "Empty response" };
        }
        case 'ollama': {
          const resp = await fetch(`${this.ollamaUrl}/api/tags`);
          return resp.ok ? { success: true } : { success: false, error: `HTTP ${resp.status}` };
        }
        case 'custom': {
          // In this case, apiKey is actually the curlCommand (reused parameter)
          return await this.testCustomProvider(apiKey);
        }
        default:
          return { success: false, error: `Unknown provider: ${provider}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  public async testCustomProvider(curlCommand: string): Promise<{ success: boolean; error?: string }> {
    try {
      const provider = new CustomCurlProvider({
        id: 'test',
        name: 'Test',
        curlCommand
      });
      const response = await provider.generate({
        message: "Hello",
        systemPrompt: "You are a helpful assistant. Reply only with 'Hello' if you hear me."
      });
      if (response && response.trim().length > 0) {
        return { success: true };
      }
      return { success: false, error: "Empty response from custom provider" };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.useOllama) {
        const available = await this.checkOllamaAvailable();
        if (!available) {
          return { success: false, error: `Ollama not available at ${this.ollamaUrl}` };
        }
        await this.callOllama("Hello");
        return { success: true };
      } else {
        if (!this.client) {
          return { success: false, error: "No Gemini client configured" };
        }
        const text = await this.generateContent([{ text: "Hello" }]);
        if (text) {
          return { success: true };
        } else {
          return { success: false, error: "Empty response from Gemini" };
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ─── SWItCHERS ────────────────────────────────────────────────────

  public async switchToOllama(model?: string, url?: string): Promise<void> {
    this.useOllama = true;
    if (url) this.ollamaUrl = url;

    if (model) {
      this.ollamaModel = model;
    } else {
      if (this.initPromise) {
        await this.initPromise;
        if (this.ollamaModel) {
          return;
        }
      }
      await this.initializeOllamaModel();
    }
  }

  public async switchToGemini(apiKey?: string, modelId?: string): Promise<void> {
    if (modelId) {
      this.geminiModel = modelId;
    }

    if (apiKey) {
      this.apiKey = apiKey;
      this.client = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: { apiVersion: "v1alpha" }
      });
    } else if (!this.client) {
      throw new Error("No Gemini API key provided and no existing client");
    }

    this.useOllama = false;
    this.customProvider = null;
  }

  public async switchToCustom(provider: CustomProvider): Promise<void> {
    this.customProvider = provider;
    this.useOllama = false;
    this.client = null;
    this.groqClient = null;
    this.openaiClient = null;
    this.claudeClient = null;
    console.log(`[LLMHelper] Switched to Custom Provider: ${provider.name}`);
  }

  // ─── GEMINI GENERATION HELPERS ────────────────────────────────────

  private async tryGenerateResponse(payload: ChatPayload): Promise<string> {
    let rawResponse: string;

    if (payload.imagePath) {
      const imageData = await fs.promises.readFile(payload.imagePath);
      const contents = [
        { text: payload.message },
        { inlineData: { mimeType: "image/png", data: imageData.toString("base64") } }
      ];
      if (this.client) {
        rawResponse = await this.generateContent(contents);
      } else {
        throw new Error("No LLM provider configured");
      }
    } else {
      if (this.useOllama) {
        rawResponse = await this.callOllama(payload.message);
      } else if (this.client) {
        rawResponse = await this.generateContent([{ text: payload.message }]);
      } else {
        throw new Error("No LLM provider configured");
      }
    }

    return rawResponse || "";
  }

  // ─── CHAT ROUTING (NON-STREAMING) ─────────────────────────────────

  public async chatWithGemini(payload: ChatPayload): Promise<string> {
    const { payload: preparedPayload, cleanupPaths } = await this.preparePayload(payload);
    const isMultimodal = !!preparedPayload.imagePath;

    const geminiPayload = this.buildProviderPayload(preparedPayload, HARD_SYSTEM_PROMPT);
    const groqPayload = this.buildProviderPayload(preparedPayload, GROQ_SYSTEM_PROMPT, {
      message: preparedPayload.options?.alternateGroqMessage || preparedPayload.message
    });
    const openaiPayload = this.buildProviderPayload(preparedPayload, OPENAI_SYSTEM_PROMPT);
    const claudePayload = this.buildProviderPayload(preparedPayload, CLAUDE_SYSTEM_PROMPT);
    const customPayload = this.buildCustomPayload(preparedPayload);

    const processProviderResponse = async (request: Promise<string>): Promise<string> => {
      const response = await request;
      return this.processResponse(response);
    };

    try {
      if (this.useOllama) {
        const ollamaProvider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
        return await processProviderResponse(ollamaProvider.generate(geminiPayload));
      }

      if (this.customProvider) {
        const provider = new CustomCurlProvider(this.customProvider);
        return await processProviderResponse(provider.generate(customPayload));
      }

      if (this.currentModelId === OPENAI_MODEL && this.openaiClient) {
        const provider = new OpenAICompatProvider(this.openaiClient, OPENAI_MODEL, "OpenAI");
        return await processProviderResponse(provider.generate(openaiPayload));
      }

      if (this.currentModelId === CLAUDE_MODEL && this.claudeClient) {
        const provider = new ClaudeProvider(this.claudeClient);
        return await processProviderResponse(provider.generate(claudePayload));
      }

      if (this.currentModelId === GROQ_MODEL && this.groqClient && !isMultimodal) {
        const provider = new GroqProvider(this.groqClient);
        return await processProviderResponse(provider.generate(groqPayload));
      }

      if (this.currentModelId === NVIDIA_MODEL && this.nvidiaClient && !isMultimodal) {
        const provider = new OpenAICompatProvider(this.nvidiaClient, NVIDIA_MODEL, "NVIDIA");
        return await processProviderResponse(provider.generate(openaiPayload));
      }

      if (this.currentModelId === DEEPSEEK_MODEL && this.deepseekClient && !isMultimodal) {
        const provider = new OpenAICompatProvider(this.deepseekClient, DEEPSEEK_MODEL, "DeepSeek");
        return await processProviderResponse(provider.generate(openaiPayload));
      }

      type ProviderAttempt = { name: string; execute: () => Promise<string> };
      const providers: ProviderAttempt[] = [];

      if (isMultimodal) {
        if (this.client) {
          const provider = new GeminiProvider(this.client);
          providers.push({ name: "Gemini Flash", execute: () => provider.generate(geminiPayload) });
        }
        if (this.openaiClient) {
          const provider = new OpenAICompatProvider(this.openaiClient, OPENAI_MODEL, "OpenAI");
          providers.push({ name: "OpenAI", execute: () => provider.generate(openaiPayload) });
        }
        if (this.claudeClient) {
          const provider = new ClaudeProvider(this.claudeClient);
          providers.push({ name: "Claude", execute: () => provider.generate(claudePayload) });
        }
        if (!this.useOllama) {
          const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
          providers.push({ name: "Ollama", execute: () => provider.generate(geminiPayload) });
        }
      } else {
        if (this.claudeClient) {
          const provider = new ClaudeProvider(this.claudeClient);
          providers.push({ name: "Claude", execute: () => provider.generate(claudePayload) });
        }
        if (this.client) {
          const provider = new GeminiProvider(this.client);
          providers.push({ name: "Gemini Flash", execute: () => provider.generate(geminiPayload) });
        }
        if (this.nvidiaClient) {
          const provider = new OpenAICompatProvider(this.nvidiaClient, NVIDIA_MODEL, "NVIDIA");
          providers.push({ name: "NVIDIA", execute: () => provider.generate(openaiPayload) });
        }
        if (this.deepseekClient) {
          const provider = new OpenAICompatProvider(this.deepseekClient, DEEPSEEK_MODEL, "DeepSeek");
          providers.push({ name: "DeepSeek", execute: () => provider.generate(openaiPayload) });
        }
        if (this.groqClient) {
          const provider = new GroqProvider(this.groqClient);
          providers.push({ name: "Groq", execute: () => provider.generate(groqPayload) });
        }
        if (this.openaiClient) {
          const provider = new OpenAICompatProvider(this.openaiClient, OPENAI_MODEL, "OpenAI");
          providers.push({ name: "OpenAI", execute: () => provider.generate(openaiPayload) });
        }
        if (!this.useOllama) {
          const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
          providers.push({ name: "Ollama", execute: () => provider.generate(geminiPayload) });
        }
      }

      if (providers.length === 0) {
        return "No AI providers configured. Please add at least one API key in Settings.";
      }

      for (let rotation = 0; rotation < 3; rotation++) {
        if (rotation > 0) {
          await this.delay(1000 * rotation);
        }

        for (const provider of providers) {
          try {
            const rawResponse = await provider.execute();
            if (rawResponse && rawResponse.trim().length > 0) {
              return this.processResponse(rawResponse);
            }
          } catch {
            // Try the next provider in the rotation.
          }
        }
      }

      return "I apologize, but I couldn't generate a response. Please try again.";
    } catch (error: any) {
      if (error.message.includes("503") || error.message.includes("overloaded")) {
        return "The AI service is currently overloaded. Please try again in a moment.";
      }
      if (error.message.includes("API key")) {
        return "Authentication failed. Please check your API key in settings.";
      }
      return `I encountered an error: ${error.message || "Unknown error"}. Please try again.`;
    } finally {
      await this.cleanupPreparedPayload(cleanupPaths);
    }
  }

  // ─── CHAT ROUTING (STREAMING W/ GEMINI FOCUS) ─────────────────────

  public async * streamChatWithGemini(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    const { payload: preparedPayload, cleanupPaths } = await this.preparePayload(payload);
    const isMultimodal = !!preparedPayload.imagePath;

    const geminiPayload = this.buildProviderPayload(preparedPayload, UNIVERSAL_SYSTEM_PROMPT);
    const groqPayload = this.buildProviderPayload(preparedPayload, UNIVERSAL_SYSTEM_PROMPT, {
      message: preparedPayload.options?.alternateGroqMessage || preparedPayload.message
    });
    const openaiPayload = this.buildProviderPayload(preparedPayload, OPENAI_SYSTEM_PROMPT);
    const claudePayload = this.buildProviderPayload(preparedPayload, CLAUDE_SYSTEM_PROMPT);
    const customPayload = this.buildCustomPayload(preparedPayload);

    type StreamAttempt = {
      name: string;
      create: () => AsyncGenerator<string, void, unknown>;
    };

    const attempts: StreamAttempt[] = [];
    const addAttempt = (name: string, enabled: boolean, create: () => AsyncGenerator<string, void, unknown>) => {
      if (!enabled || attempts.some((attempt) => attempt.name === name)) {
        return;
      }
      attempts.push({ name, create });
    };

    try {
      if (this.useOllama) {
        addAttempt("Ollama", true, () => this.streamWithOllama(geminiPayload));
      } else if (this.customProvider) {
        addAttempt("Custom", true, () => this.streamWithCustom(customPayload));
      } else if (isMultimodal) {
        addAttempt("OpenAI", !!this.openaiClient && this.currentModelId === OPENAI_MODEL, () => this.streamWithOpenai(openaiPayload));
        addAttempt("Claude", !!this.claudeClient && this.currentModelId === CLAUDE_MODEL, () => this.streamWithClaude(claudePayload));
        addAttempt("Gemini", !!this.client && (this.currentModelId === GEMINI_FLASH_MODEL || this.currentModelId === GEMINI_PRO_MODEL), () => this.streamWithGeminiModel(geminiPayload));
        addAttempt("Gemini", !!this.client, () => this.streamWithGeminiModel(geminiPayload));
        addAttempt("OpenAI", !!this.openaiClient, () => this.streamWithOpenai(openaiPayload));
        addAttempt("Claude", !!this.claudeClient, () => this.streamWithClaude(claudePayload));
        addAttempt("Ollama", !this.useOllama, () => this.streamWithOllama(geminiPayload));
      } else {
        addAttempt("Claude", !!this.claudeClient && this.currentModelId === CLAUDE_MODEL, () => this.streamWithClaude(claudePayload));
        addAttempt("OpenAI", !!this.openaiClient && this.currentModelId === OPENAI_MODEL, () => this.streamWithOpenai(openaiPayload));
        addAttempt("Groq", !!this.groqClient && this.currentModelId === GROQ_MODEL, () => this.streamWithGroq(groqPayload));
        addAttempt("NVIDIA", !!this.nvidiaClient && this.currentModelId === NVIDIA_MODEL, () => this.streamWithNvidia(openaiPayload));
        addAttempt("DeepSeek", !!this.deepseekClient && this.currentModelId === DEEPSEEK_MODEL, () => this.streamWithDeepseek(openaiPayload));
        addAttempt("Gemini", !!this.client && (this.currentModelId === GEMINI_FLASH_MODEL || this.currentModelId === GEMINI_PRO_MODEL), () => this.streamWithGeminiModel(geminiPayload));
        addAttempt("Claude", !!this.claudeClient, () => this.streamWithClaude(claudePayload));
        addAttempt("Gemini", !!this.client, () => this.streamWithGeminiModel(geminiPayload));
        addAttempt("NVIDIA", !!this.nvidiaClient, () => this.streamWithNvidia(openaiPayload));
        addAttempt("DeepSeek", !!this.deepseekClient, () => this.streamWithDeepseek(openaiPayload));
        addAttempt("Groq", !!this.groqClient, () => this.streamWithGroq(groqPayload));
        addAttempt("OpenAI", !!this.openaiClient, () => this.streamWithOpenai(openaiPayload));
        addAttempt("Ollama", !this.useOllama, () => this.streamWithOllama(geminiPayload));
      }

      if (attempts.length === 0) {
        yield "No AI providers configured. Please add at least one API key in Settings.";
        return;
      }

      for (const attempt of attempts) {
        try {
          let hasContent = false;
          for await (const chunk of attempt.create()) {
            if (chunk) {
              hasContent = true;
              yield chunk;
            }
          }

          if (hasContent) {
            return;
          }
        } catch (error: any) {
          console.warn(`[LLMHelper] Stream attempt failed for ${attempt.name}: ${error.message}`);
        }
      }

      if (isMultimodal) {
        yield "Image analysis requires a configured multimodal provider. Please add Gemini, OpenAI, Claude, or a vision-capable Ollama model.";
        return;
      }

      yield "All AI providers failed to generate a response. Please try again.";
    } finally {
      await this.cleanupPreparedPayload(cleanupPaths);
    }
  }

  // ─── UNIVERSAL STREAM ROUTING ─────────────────────────────────────

  public async * streamChat(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
    // ─── AIR-GAP PROTECTION ─────────────────────────────────────────
    if (this.airGapMode && !this.useOllama) {
      console.error("[LLMHelper] Air-Gap Mode Block: Attempted cloud chat while air-gap is ON");
      yield "Error: Air-Gap Mode is active. Cloud providers are disabled. Please switch to Ollama or a local provider.";
      return;
    }

    yield* this.streamChatWithGemini(payload);
    return;

    const { imagePath } = payload;
    let finalPayload = payload;

    // ─── IMAGE PRE-PROCESSING (PHASE 2) ─────────────────────────────
    if (imagePath && fs.existsSync(imagePath)) {
      try {
        const multimodal = MultimodalHelper.getInstance();
        const processed = await multimodal.prepareImage(imagePath, { runOCR: true });

        // Enrich the payload with processed image and OCR ground truth
        finalPayload = {
          ...payload,
          imagePath: processed.processedPath,
          message: processed.ocrText
            ? `[OCR TEXT FROM SCREENSHOT]:\n${processed.ocrText}\n\n[USER MESSAGE]:\n${payload.message}`
            : payload.message
        };
        console.log(`[LLMHelper] Image pre-processed. OCR: ${!!processed.ocrText}, Size: ${processed.metadata.processedSize} bytes`);
      } catch (err) {
        console.warn("[LLMHelper] Image pre-processing failed, using original:", err);
      }
    }

    if (this.useOllama) {
      yield* this.streamWithOllama(finalPayload);
      return;
    }

    if (this.customProvider) {
      yield* this.streamWithCustom(finalPayload);
      return;
    }

    if (this.currentModelId === GROQ_MODEL && this.groqClient && !imagePath) {
      const provider = new GroqProvider(this.groqClient);
      yield* provider.stream(finalPayload);
      return;
    }

    if ((this.currentModelId === NVIDIA_MODEL && this.nvidiaClient && !imagePath) ||
      (this.currentModelId === DEEPSEEK_MODEL && this.deepseekClient && !imagePath)) {
      const provider = new OpenAICompatProvider(
        this.currentModelId === NVIDIA_MODEL ? this.nvidiaClient! : this.deepseekClient!,
        this.currentModelId,
        this.currentModelId === NVIDIA_MODEL ? "NVIDIA" : "DeepSeek"
      );
      yield* provider.stream({ ...finalPayload, systemPrompt: OPENAI_SYSTEM_PROMPT });
      return;
    }

    if (this.currentModelId === CLAUDE_MODEL && this.claudeClient) {
      const provider = new ClaudeProvider(this.claudeClient);
      yield* provider.stream({ ...finalPayload, systemPrompt: CLAUDE_SYSTEM_PROMPT });
      return;
    }

    if (this.currentModelId === OPENAI_MODEL && this.openaiClient) {
      const provider = new OpenAICompatProvider(this.openaiClient, OPENAI_MODEL, "OpenAI");
      yield* provider.stream({ ...finalPayload, systemPrompt: OPENAI_SYSTEM_PROMPT });
      return;
    }

    yield* this.streamChatWithGemini(finalPayload);
  }

  // ─── MEETING SUMMARY LOGIC ────────────────────────────────────────

  public async generateMeetingSummary(params: {
    systemPrompt: string;
    context: string;
    groqSystemPrompt?: string
  }): Promise<string> {
    const { systemPrompt, context, groqSystemPrompt } = params;
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);
    const tokenCount = estimateTokens(context);

    // 1: Groq (if text-only and within limits)
    if (this.groqClient && tokenCount < 100000) {
      try {
        const response = await this.withTimeout(
          this.groqClient.chat.completions.create({
            model: GROQ_MODEL,
            messages: [
              { role: "system", content: groqSystemPrompt || systemPrompt },
              { role: "user", content: `Context:\n${context}` }
            ],
            temperature: 0.3,
            max_tokens: 8192,
            stream: false
          }),
          45000,
          "Groq Summary"
        );
        const text = response.choices[0]?.message?.content || "";
        if (text.trim().length > 0) return this.processResponse(text);
      } catch (e: any) { }
    }

    // 2: Gemini Flash
    const contents = [{ text: `${systemPrompt}\n\nCONTEXT:\n${context}` }];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const text = await this.withTimeout(
          this.generateWithFlash(contents),
          45000,
          `Gemini Flash Summary (Attempt ${attempt})`
        );
        if (text.trim().length > 0) return this.processResponse(text);
      } catch (e: any) {
        if (attempt < 3) await this.delay(1000 * attempt);
      }
    }

    // 3: Ollama local summarization fallback
    try {
      const response = await this.withTimeout(
        this.callOllamaWithModel(this.ollamaModel, `${systemPrompt}\n\nCONTEXT:\n${context}`),
        300000,
        "Ollama Summary"
      );
      if (response && response.trim().length > 0) return this.processResponse(response);
    } catch (e: any) { }

    throw new Error("Failed to generate summary after all fallback attempts.");
  }

  // ─── UNIVERSAL CHAT (NON-STREAMING) ───────────────────────────────

  public async chat(payload: ChatPayload): Promise<string> {
    // ─── AIR-GAP PROTECTION ─────────────────────────────────────────
    if (this.airGapMode && !this.useOllama) {
      return "Error: Air-Gap Mode is active. Cloud providers are disabled.";
    }

    let fullResponse = "";
    try {
      const stream = this.streamChat(payload);
      for await (const chunk of stream) {
        fullResponse += chunk;
      }
      if (fullResponse.trim().length > 0) return this.processResponse(fullResponse);
      return await this.chatWithGemini(payload);
    } catch (error: any) {
      return this.chatWithGemini(payload);
    }
  }
}
