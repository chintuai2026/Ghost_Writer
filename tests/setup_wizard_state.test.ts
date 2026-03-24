const assert = require('node:assert/strict');

const {
    canProceedFromDiagnosis,
    getRecommendedWhisperModel,
    hasCompletedDiagnosis,
    isBlockedByFullPrivacy
} = require('../src/components/setupWizardState.ts');

const baseSystemInfo = {
    gpu: {
        success: true,
        info: { name: 'Integrated GPU', vramGB: 0 }
    },
    ollama: {
        success: true,
        running: false,
        models: []
    },
    whisper: {
        hasBinary: false,
        hasModel: false,
        hasOperationalServer: false,
        isDownloading: false,
        selectedModel: 'small-tdrz'
    },
    fullPrivacy: {
        enabled: false,
        localWhisperReady: false,
        localWhisperModelReady: false,
        ollamaReachable: false,
        localTextModelReady: false,
        localVisionModelReady: false,
        activeOllamaModel: '',
        errors: []
    }
};

assert.equal(getRecommendedWhisperModel(8, 'tiny'), 'medium');
assert.equal(getRecommendedWhisperModel(4, 'tiny'), 'small');
assert.equal(getRecommendedWhisperModel(2, 'tiny'), 'base');
assert.equal(getRecommendedWhisperModel(undefined, 'tiny'), 'tiny');

assert.equal(hasCompletedDiagnosis(baseSystemInfo), true);
assert.equal(hasCompletedDiagnosis({ ...baseSystemInfo, whisper: null }), false);

assert.equal(canProceedFromDiagnosis(baseSystemInfo), true);
assert.equal(isBlockedByFullPrivacy(baseSystemInfo), false);

const blockedFullPrivacy = {
    ...baseSystemInfo,
    fullPrivacy: {
        ...baseSystemInfo.fullPrivacy,
        enabled: true
    }
};

assert.equal(isBlockedByFullPrivacy(blockedFullPrivacy), true);
assert.equal(canProceedFromDiagnosis(blockedFullPrivacy), false);

const readyFullPrivacy = {
    ...baseSystemInfo,
    ollama: {
        success: true,
        running: true,
        models: [{ name: 'llama3.2' }]
    },
    whisper: {
        hasBinary: true,
        hasModel: true,
        hasOperationalServer: true,
        isDownloading: false,
        selectedModel: 'small'
    },
    fullPrivacy: {
        enabled: true,
        localWhisperReady: true,
        localWhisperModelReady: true,
        ollamaReachable: true,
        localTextModelReady: true,
        localVisionModelReady: false,
        activeOllamaModel: 'llama3.2',
        errors: ['missing_local_vision_model']
    }
};

assert.equal(isBlockedByFullPrivacy(readyFullPrivacy), false);
assert.equal(canProceedFromDiagnosis(readyFullPrivacy), true);

const downloadingFullPrivacy = {
    ...readyFullPrivacy,
    whisper: {
        ...readyFullPrivacy.whisper,
        isDownloading: true
    }
};

assert.equal(canProceedFromDiagnosis(downloadingFullPrivacy), false);

console.log('setup_wizard_state.test.ts: all assertions passed');
