const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..", "..");
const fixturesPath = path.join(__dirname, "fixtures.json");
const electronBinary = require("electron");

function resolveApiKey() {
    return process.env.GHOST_WRITER_EVAL_API_KEY || process.env.GEMINI_API_KEY || "";
}

function resolveJudgeApiKey(candidateApiKey) {
    return process.env.GHOST_WRITER_EVAL_JUDGE_API_KEY || candidateApiKey || "";
}

function assertFixturesExist() {
    const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
    for (const fixture of fixtures) {
        if (!fixture.image) {
            continue;
        }

        const imagePath = path.join(projectRoot, fixture.image);
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Missing fixture image: ${fixture.image}`);
        }
    }
}

function main() {
    const candidateApiKey = resolveApiKey();
    const judgeApiKey = resolveJudgeApiKey(candidateApiKey);
    const childEnv = {
        ...process.env,
        GHOST_WRITER_EVAL_API_KEY: candidateApiKey,
        GHOST_WRITER_EVAL_JUDGE_API_KEY: judgeApiKey,
        GHOST_WRITER_EVAL_JUDGE_MODEL: process.env.GHOST_WRITER_EVAL_JUDGE_MODEL || "gemini-1.5-pro",
        GHOST_WRITER_EVAL_FIXTURES: fixturesPath
    };

    delete childEnv.ELECTRON_RUN_AS_NODE;

    if (!candidateApiKey) {
        console.error("Eval aborted: set GHOST_WRITER_EVAL_API_KEY or GEMINI_API_KEY.");
        process.exit(1);
    }

    if (!judgeApiKey) {
        console.error("Eval aborted: set GHOST_WRITER_EVAL_JUDGE_API_KEY or reuse the candidate API key.");
        process.exit(1);
    }

    try {
        assertFixturesExist();
        execFileSync("npx", ["tsc", "-p", "electron/tsconfig.json"], {
            cwd: projectRoot,
            stdio: "inherit",
            shell: true
        });
    } catch (error) {
        console.error(error.message || error);
        process.exit(1);
    }

    const result = spawnSync(electronBinary, [path.join(__dirname, "eval_worker.js")], {
        cwd: projectRoot,
        stdio: "inherit",
        env: childEnv
    });

    process.exit(result.status ?? 1);
}

main();
