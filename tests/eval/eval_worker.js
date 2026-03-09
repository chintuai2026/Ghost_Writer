const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const projectRoot = path.resolve(__dirname, "..", "..");
const distLLMHelperPath = path.join(projectRoot, "dist-electron", "LLMHelper.js");

function buildJudgePrompt(fixture, answer) {
    const rubricKeys = Object.keys(fixture.rubric);
    return `You are grading Ghost Writer responses with a strict rubric.

FIXTURE NAME: ${fixture.name}
CATEGORY: ${fixture.category}
PROMPT OR TRANSCRIPT:
${fixture.transcript}

EXPECTED THEMES:
${fixture.expected_themes.join(", ")}

ACTUAL RESPONSE:
${answer}

RUBRIC DIMENSIONS:
${rubricKeys.join(", ")}

Return JSON only in this shape:
{
  "scores": {
    "${rubricKeys.join('": 0, "')}": 0
  },
  "judgment": "one concise paragraph"
}`;
}

function parseJudgment(raw) {
    try {
        const clean = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        return {
            scores: parsed.scores || {},
            judgment: parsed.judgment || "No judgment returned."
        };
    } catch {
        return {
            scores: {},
            judgment: `Judge output was not valid JSON: ${raw.substring(0, 200)}`
        };
    }
}

function averageScore(scores) {
    const values = Object.values(scores);
    if (values.length === 0) {
        return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function main() {
    try {
        const candidateApiKey = process.env.GHOST_WRITER_EVAL_API_KEY;
        const judgeApiKey = process.env.GHOST_WRITER_EVAL_JUDGE_API_KEY;
        const judgeModel = process.env.GHOST_WRITER_EVAL_JUDGE_MODEL || "gemini-1.5-pro";
        const fixturesPath = process.env.GHOST_WRITER_EVAL_FIXTURES || path.join(__dirname, "fixtures.json");

        if (!candidateApiKey) {
            throw new Error("Missing GHOST_WRITER_EVAL_API_KEY.");
        }
        if (!judgeApiKey) {
            throw new Error("Missing GHOST_WRITER_EVAL_JUDGE_API_KEY.");
        }

        if (!fs.existsSync(distLLMHelperPath)) {
            throw new Error("dist-electron/LLMHelper.js not found. Compile electron sources before running eval.");
        }

        const { LLMHelper } = require(distLLMHelperPath);
        const candidate = new LLMHelper(candidateApiKey);
        const judge = new LLMHelper(judgeApiKey);
        judge.setModel(judgeModel);

        const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
        const results = [];

        for (const fixture of fixtures) {
            const imagePath = fixture.image ? path.join(projectRoot, fixture.image) : undefined;
            if (imagePath && !fs.existsSync(imagePath)) {
                throw new Error(`Missing fixture image: ${fixture.image}`);
            }

            const answer = await candidate.chat({
                message: fixture.transcript,
                imagePath,
                context: fixture.context ? JSON.stringify(fixture.context) : undefined
            });

            const judgmentRaw = await judge.chat({
                message: buildJudgePrompt(fixture, answer),
                systemPrompt: "You are a strict, professional rubric-based evaluator. Output valid JSON only."
            });
            const judgment = parseJudgment(judgmentRaw);

            results.push({
                fixtureId: fixture.id,
                fixtureName: fixture.name,
                category: fixture.category,
                model: candidate.getCurrentModel(),
                answer,
                scores: judgment.scores,
                averageScore: averageScore(judgment.scores),
                judgment: judgment.judgment
            });
        }

        const resultsDir = path.join(projectRoot, "tests", "eval", "results");
        fs.mkdirSync(resultsDir, { recursive: true });
        const outputPath = path.join(
            resultsDir,
            `eval-results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
        );
        fs.writeFileSync(outputPath, JSON.stringify({
            generatedAt: new Date().toISOString(),
            targetModel: candidate.getCurrentModel(),
            judgeModel,
            results
        }, null, 2));

        const totalAverage = results.length > 0
            ? results.reduce((sum, item) => sum + item.averageScore, 0) / results.length
            : 0;

        console.log(`[eval] Saved results to ${outputPath}`);
        console.log(`[eval] Average score: ${totalAverage.toFixed(2)}/10`);
        app.exit(0);
    } catch (error) {
        console.error(`[eval] ${error.message || error}`);
        app.exit(1);
    }
}

app.whenReady().then(main);
