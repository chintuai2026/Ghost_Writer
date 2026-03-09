const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const projectRoot = path.resolve(__dirname, "..");
const providerPath = path.join(projectRoot, "dist-electron", "llm", "providers", "OllamaProvider.js");
const imageFixturePath = path.join(projectRoot, "assets", "tests", "code_sample_1.png");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function readStream(generator) {
    let output = "";
    for await (const chunk of generator) {
        output += chunk;
    }
    return output;
}

function createStreamingBody() {
    return (async function* () {
        yield Buffer.from(`${JSON.stringify({ message: { content: "stream-ok" } })}\n`);
        yield Buffer.from(`${JSON.stringify({ done: true })}\n`);
    })();
}

async function main() {
    try {
        assert(fs.existsSync(providerPath), "dist-electron OllamaProvider.js not found.");
        assert(fs.existsSync(imageFixturePath), "Gemini vision fixture image not found.");

        const { OllamaProvider } = require(providerPath);
        const provider = new OllamaProvider("http://127.0.0.1:11434", "gemini-3-flash-preview:latest");

        provider.getModels = async () => {
            throw new Error("getModels should not be called when the selected Gemini model is already vision-capable.");
        };

        const calls = [];
        global.fetch = async (_url, options = {}) => {
            const body = options.body ? JSON.parse(options.body) : {};
            calls.push(body);

            if (body.stream) {
                return {
                    body: createStreamingBody()
                };
            }

            return {
                json: async () => ({
                    message: { content: "chat-ok" }
                })
            };
        };

        const imageResponse = await provider.callWithModel(
            "gemini-3-flash-preview:latest",
            "Describe this screenshot briefly.",
            imageFixturePath
        );

        assert(imageResponse === "chat-ok", `Unexpected non-stream Gemini vision response: ${imageResponse}`);
        assert(calls[0]?.model === "gemini-3-flash-preview:latest", `Expected Gemini model for image chat, received: ${calls[0]?.model || "unknown"}`);
        assert(Array.isArray(calls[0]?.messages?.[1]?.images) && calls[0].messages[1].images.length === 1, "Expected Gemini image chat payload to contain one image.");

        const streamResponse = await readStream(provider.stream({
            message: "What is shown in this screenshot?",
            imagePath: imageFixturePath
        }));

        assert(streamResponse.includes("stream-ok"), `Unexpected stream response: ${streamResponse}`);
        assert(calls[1]?.model === "gemini-3-flash-preview:latest", `Expected Gemini model for image stream, received: ${calls[1]?.model || "unknown"}`);
        assert(Array.isArray(calls[1]?.messages?.[1]?.images) && calls[1].messages[1].images.length === 1, "Expected Gemini image stream payload to contain one image.");

        console.log("[ollama-gemini-vision] Gemini image chat and streaming both stayed on the selected Gemini model.");
        app.exit(0);
    } catch (error) {
        console.error(`[ollama-gemini-vision] ${error.message || error}`);
        app.exit(1);
    }
}

app.whenReady().then(main);
