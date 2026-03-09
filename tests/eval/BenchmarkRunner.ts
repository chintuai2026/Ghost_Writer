import fs from "fs";
import path from "path";
import { LLMHelper } from "../../electron/LLMHelper";

interface Fixture {
    id: string;
    category: string;
    name: string;
    transcript: string;
    image?: string;
    context?: unknown;
    expected_themes: string[];
    rubric: Record<string, number>;
}

export interface ScoreResult {
    fixtureId: string;
    fixtureName: string;
    category: string;
    model: string;
    answer: string;
    scores: Record<string, number>;
    averageScore: number;
    judgment: string;
}

export interface BenchmarkRunnerOptions {
    apiKey: string;
    judgeApiKey?: string;
    judgeModel?: string;
    resultsDir?: string;
}

export class BenchmarkRunner {
    private llmHelper: LLMHelper;
    private judgeHelper: LLMHelper | null;
    private judgeModel: string;
    private resultsDir: string;

    constructor(options: BenchmarkRunnerOptions) {
        this.llmHelper = new LLMHelper(options.apiKey);
        this.judgeHelper = options.judgeApiKey ? new LLMHelper(options.judgeApiKey) : null;
        this.judgeModel = options.judgeModel || "gemini-1.5-pro";
        this.resultsDir = options.resultsDir || path.join(process.cwd(), "tests", "eval", "results");

        if (this.judgeHelper && this.judgeModel) {
            this.judgeHelper.setModel(this.judgeModel);
        }
    }

    private resolveFixtureImage(imagePath?: string): string | undefined {
        if (!imagePath) {
            return undefined;
        }

        const fullPath = path.join(process.cwd(), imagePath);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`Missing fixture image: ${imagePath}`);
        }

        return fullPath;
    }

    private ensureJudge(): LLMHelper {
        if (!this.judgeHelper) {
            throw new Error("Benchmark judge is not configured. Set a judge API key before running evals.");
        }

        return this.judgeHelper;
    }

    private async getJudgment(
        fixture: Fixture,
        answer: string
    ): Promise<{ scores: Record<string, number>; commentary: string }> {
        const judge = this.ensureJudge();
        const rubricKeys = Object.keys(fixture.rubric);
        const prompt = `You are grading Ghost Writer responses with a strict rubric.

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

        const result = await judge.chat({
            message: prompt,
            systemPrompt: "You are a strict, professional rubric-based evaluator. Output valid JSON only."
        });

        try {
            const clean = result.replace(/```json|```/g, "").trim();
            const parsed = JSON.parse(clean);
            return {
                scores: parsed.scores || {},
                commentary: parsed.judgment || "No judgment returned."
            };
        } catch {
            return {
                scores: {},
                commentary: `Judge output was not valid JSON: ${result.substring(0, 200)}`
            };
        }
    }

    private saveResults(results: ScoreResult[]): string {
        fs.mkdirSync(this.resultsDir, { recursive: true });
        const outputPath = path.join(
            this.resultsDir,
            `eval-results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
        );

        fs.writeFileSync(
            outputPath,
            JSON.stringify(
                {
                    generatedAt: new Date().toISOString(),
                    targetModel: this.llmHelper.getCurrentModel(),
                    judgeModel: this.judgeHelper ? this.judgeModel : null,
                    results
                },
                null,
                2
            )
        );

        return outputPath;
    }

    public async run(fixturesPath: string): Promise<ScoreResult[]> {
        const fixtures: Fixture[] = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
        const results: ScoreResult[] = [];

        for (const fixture of fixtures) {
            const answer = await this.llmHelper.chat({
                message: fixture.transcript,
                imagePath: this.resolveFixtureImage(fixture.image),
                context: fixture.context ? JSON.stringify(fixture.context) : undefined
            });

            const { scores, commentary } = await this.getJudgment(fixture, answer);
            const scoreValues = Object.values(scores);
            const averageScore = scoreValues.length > 0
                ? scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length
                : 0;

            results.push({
                fixtureId: fixture.id,
                fixtureName: fixture.name,
                category: fixture.category,
                model: this.llmHelper.getCurrentModel(),
                answer,
                scores,
                averageScore,
                judgment: commentary
            });
        }

        const outputPath = this.saveResults(results);
        console.log(`[BenchmarkRunner] Saved results to ${outputPath}`);
        return results;
    }
}
