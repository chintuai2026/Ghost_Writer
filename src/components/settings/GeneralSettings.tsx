import React, { useState, useEffect } from 'react';
import { Globe, RotateCcw, Sparkles } from 'lucide-react';

interface GeneralSettingsProps {
    embedded?: boolean;
    hideGoogleServiceAccount?: boolean;
}
interface FullPrivacyStatus {
    enabled: boolean;
    localWhisperReady: boolean;
    localWhisperModelReady: boolean;
    ollamaReachable: boolean;
    localTextModelReady: boolean;
    localVisionModelReady: boolean;
    activeOllamaModel: string;
    errors: string[];
}

const DEFAULT_FULL_PRIVACY_STATUS: FullPrivacyStatus = {
    enabled: false,
    localWhisperReady: false,
    localWhisperModelReady: false,
    ollamaReachable: false,
    localTextModelReady: false,
    localVisionModelReady: false,
    activeOllamaModel: '',
    errors: [],
};

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
    embedded = false,
    hideGoogleServiceAccount = false,
}) => {
    // Recognition Language
    const [recognitionLanguage, setRecognitionLanguage] = useState('');
    const [availableLanguages, setAvailableLanguages] = useState<Record<string, any>>({});
    const [languageOptions, setLanguageOptions] = useState<any[]>([]);

    // Google Service Account
    const [serviceAccountPath, setServiceAccountPath] = useState('');

    // Security
    const [airGapMode, setAirGapMode] = useState(false);
    const [fullPrivacyStatus, setFullPrivacyStatus] = useState<FullPrivacyStatus>(DEFAULT_FULL_PRIVACY_STATUS);
    const [isApplyingFullPrivacy, setIsApplyingFullPrivacy] = useState(false);

    const loadFullPrivacyStatus = async () => {
        try {
            const status = await window.electronAPI?.getFullPrivacyStatus?.();
            if (status) {
                setFullPrivacyStatus(status);
            }
        } catch (error) {
            console.error("Failed to load full privacy status:", error);
        }
    };

    useEffect(() => {
        const loadInitialData = async () => {
            // Load Credentials
            try {
                // @ts-ignore  
                const creds = await window.electronAPI?.getStoredCredentials?.();
                if (creds && creds.googleServiceAccountPath) {
                    setServiceAccountPath(creds.googleServiceAccountPath);
                }
                if (creds && creds.airGapMode !== undefined) {
                    setAirGapMode(creds.airGapMode);
                }
            } catch (e) {
                console.error("Failed to load stored credentials:", e);
            }

            await loadFullPrivacyStatus();

            // Load Languages
            if (window.electronAPI?.getRecognitionLanguages) {
                const langs = await window.electronAPI.getRecognitionLanguages();
                setAvailableLanguages(langs);

                const desiredOrder = [
                    { key: 'english-india', label: 'English (India)' },
                    { key: 'english-us', label: 'English (United States)' },
                    { key: 'english-uk', label: 'English (United Kingdom)' },
                    { key: 'english-au', label: 'English (Australia)' },
                    { key: 'english-ca', label: 'English (Canada)' },
                ];

                const options = [
                    { value: 'auto', label: 'Auto (Recommended)' }
                ];

                desiredOrder.forEach(({ key, label }) => {
                    if (langs[key]) {
                        options.push({ value: key, label: label });
                    }
                });

                setLanguageOptions(options);

                const stored = localStorage.getItem('ghost_writer_recognition_language');
                if (!stored || stored === 'auto') {
                    setRecognitionLanguage('auto');
                    applyAutoLanguage(langs);
                } else if (langs[stored]) {
                    setRecognitionLanguage(stored);
                } else {
                    setRecognitionLanguage('auto');
                    applyAutoLanguage(langs);
                }
            }
        };
        loadInitialData();

        let removeAirGapListener: (() => void) | undefined;
        if (window.electronAPI?.onAirGapChanged) {
            removeAirGapListener = window.electronAPI.onAirGapChanged((enabled) => {
                setAirGapMode(enabled);
                loadFullPrivacyStatus();
            });
        }

        return () => {
            if (removeAirGapListener) {
                removeAirGapListener();
            }
        };
    }, []);

    const applyAutoLanguage = (langs: any) => {
        const systemLocale = navigator.language;
        let match = 'english-us';
        for (const [key, config] of Object.entries(langs)) {
            if ((config as any).primary === systemLocale || (config as any).alternates.includes(systemLocale)) {
                match = key;
                break;
            }
        }
        if (systemLocale === 'en-IN') match = 'english-india';

        if (window.electronAPI?.setRecognitionLanguage) {
            window.electronAPI.setRecognitionLanguage(match);
        }
    };

    const handleLanguageChange = (key: string) => {
        setRecognitionLanguage(key);
        localStorage.setItem('ghost_writer_recognition_language', key);

        if (key === 'auto') {
            applyAutoLanguage(availableLanguages);
        } else {
            if (window.electronAPI?.setRecognitionLanguage) {
                window.electronAPI.setRecognitionLanguage(key);
            }
        }
    };

    const handleSelectServiceAccount = async () => {
        try {
            const result = await window.electronAPI.selectServiceAccount();
            if (result.success && result.path) {
                setServiceAccountPath(result.path);
            }
        } catch (error) {
            console.error("Failed to select service account:", error);
        }
    };

    const handleAirGapToggle = async () => {
        const newMode = !airGapMode;
        setIsApplyingFullPrivacy(true);
        setAirGapMode(newMode);
        try {
            if (window.electronAPI?.setAirGapMode) {
                const result = await window.electronAPI.setAirGapMode(newMode);
                if (!result?.success) {
                    setAirGapMode(!newMode);
                }
                if (result?.status) {
                    setFullPrivacyStatus(result.status);
                } else {
                    await loadFullPrivacyStatus();
                }
            }
        } catch (error) {
            console.error("Failed to toggle Full Privacy Mode:", error);
            setAirGapMode(!newMode);
        } finally {
            setIsApplyingFullPrivacy(false);
        }
    };

    const handleReplayOnboarding = () => {
        localStorage.removeItem('setupComplete');
        window.dispatchEvent(new CustomEvent('ghost-writer:restart-onboarding'));
    };

    const handleReseedDemo = async () => {
        try {
            await window.electronAPI?.invoke?.('seed-demo', { force: true });
        } catch (error) {
            console.error('Failed to reseed demo meeting:', error);
        }
    };

    return (
        <div className={`space-y-8 ${embedded ? '' : 'animated fadeIn'}`}>
            <div>
                {!embedded && (
                    <>
                        <h3 className="text-lg font-bold text-text-primary mb-2">General Configuration</h3>
                        <p className="text-xs text-text-secondary mb-4">Core settings for Ghost Writer.</p>
                    </>
                )}

                <div className="space-y-4">
                    {!hideGoogleServiceAccount && (
                        <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-5 border border-border-subtle">
                            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Google Speech-to-Text Key (JSON)</label>
                            <div className="flex gap-3">
                                <div className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-4 py-2.5 text-xs text-text-secondary truncate flex items-center">
                                    {serviceAccountPath || "No file selected"}
                                </div>
                                <button
                                    onClick={handleSelectServiceAccount}
                                    className="bg-bg-input hover:bg-bg-secondary border border-border-subtle text-text-primary px-5 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                                >
                                    Select File
                                </button>
                            </div>
                            <p className="text-xs text-text-tertiary mt-2">Required for accurate speech recognition.</p>
                        </div>
                    )}

                    {/* Recognition Language */}
                    <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-5 border border-border-subtle">
                        <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Recognition Language</label>
                        <div className="relative">
                            <select
                                value={recognitionLanguage}
                                onChange={(e) => handleLanguageChange(e.target.value)}
                                className="w-full appearance-none bg-bg-input border border-border-subtle rounded-lg px-4 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary transition-colors cursor-pointer"
                            >
                                {languageOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            <Globe size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                        </div>
                        <p className="text-xs text-text-tertiary mt-2">Select your preferred accent for better recognition accuracy.</p>
                    </div>

                    {/* Air-Gap Mode */}
                    <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-5 border border-border-subtle relative overflow-hidden">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 to-orange-500 opacity-50"></div>
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <label className="block text-xs font-bold text-red-400 uppercase tracking-wide">Full Privacy Mode</label>
                                <p className="mt-1 text-[11px] text-text-tertiary">
                                    Forces Local Whisper and Ollama only. Cloud STT and cloud LLM providers are blocked until local dependencies are ready.
                                </p>
                            </div>
                            <button
                                onClick={handleAirGapToggle}
                                disabled={isApplyingFullPrivacy}
                                className={`relative inline-flex h-5 w-9 shrink-0 items-center justify-center rounded-full focus:outline-none transition-colors duration-200 ease-in-out ${airGapMode ? 'bg-red-500' : 'bg-bg-input'} ${isApplyingFullPrivacy ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
                                role="switch"
                                aria-checked={airGapMode}
                            >
                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${airGapMode ? 'translate-x-2' : '-translate-x-2'}`} />
                            </button>
                        </div>
                        <div className="rounded-lg border border-border-subtle bg-bg-input/60 p-3">
                            <div className="grid gap-2 text-xs text-text-secondary">
                                <div className="flex items-center justify-between">
                                    <span>Local Whisper runtime</span>
                                    <span className={fullPrivacyStatus.localWhisperReady ? 'text-emerald-400' : 'text-red-400'}>
                                        {fullPrivacyStatus.localWhisperReady ? 'Ready' : 'Missing'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Local Whisper model</span>
                                    <span className={fullPrivacyStatus.localWhisperModelReady ? 'text-emerald-400' : 'text-red-400'}>
                                        {fullPrivacyStatus.localWhisperModelReady ? 'Ready' : 'Missing'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Ollama service</span>
                                    <span className={fullPrivacyStatus.ollamaReachable ? 'text-emerald-400' : 'text-red-400'}>
                                        {fullPrivacyStatus.ollamaReachable ? 'Ready' : 'Offline'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Local text model</span>
                                    <span className={fullPrivacyStatus.localTextModelReady ? 'text-emerald-400' : 'text-red-400'}>
                                        {fullPrivacyStatus.localTextModelReady ? 'Ready' : 'Missing'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Local vision model</span>
                                    <span className={fullPrivacyStatus.localVisionModelReady ? 'text-emerald-400' : 'text-red-400'}>
                                        {fullPrivacyStatus.localVisionModelReady ? 'Ready' : 'Missing'}
                                    </span>
                                </div>
                            </div>
                            <p className="mt-3 text-[11px] text-text-tertiary">
                                Active local model: <span className="text-text-primary">{fullPrivacyStatus.activeOllamaModel || 'None detected'}</span>
                            </p>
                            {airGapMode && fullPrivacyStatus.errors.length > 0 && (
                                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-red-200">
                                    <div className="font-semibold text-red-300">Full Privacy Mode is enabled but blocked.</div>
                                    <ul className="mt-2 list-disc pl-4 space-y-1">
                                        {fullPrivacyStatus.errors.includes('missing_whisper_runtime') && <li>Install or repair the Local Whisper runtime.</li>}
                                        {fullPrivacyStatus.errors.includes('missing_whisper_model') && <li>Download or point Ghost Writer to a Local Whisper model.</li>}
                                        {fullPrivacyStatus.errors.includes('ollama_unreachable') && <li>Start Ollama locally before asking Ghost Writer to answer.</li>}
                                        {fullPrivacyStatus.errors.includes('missing_local_text_model') && <li>Install a local text model such as `ollama pull llama3.2`.</li>}
                                        {fullPrivacyStatus.errors.includes('missing_local_vision_model') && <li>Install a local vision model such as `ollama pull llava:7b` or `ollama pull qwen2.5-vl:7b` for screenshot analysis.</li>}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-5 border border-border-subtle">
                        <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">Guided Setup & Demo</label>
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={handleReplayOnboarding}
                                className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-input px-4 py-2.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-secondary"
                            >
                                <Sparkles size={14} />
                                Replay Onboarding
                            </button>
                            <button
                                onClick={handleReseedDemo}
                                className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-input px-4 py-2.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-secondary"
                            >
                                <RotateCcw size={14} />
                                Restore Demo Meeting
                            </button>
                        </div>
                        <p className="mt-2 text-xs text-text-tertiary">Use these if the setup guide or sample Ghost Writer meeting is missing in a packaged build.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
