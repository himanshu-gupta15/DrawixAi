/** Runs the node:test suites and saves a summary to docs/evaluation/unit-tests.json. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const r = spawnSync("npx", ["tsx", "--test", "--test-reporter=spec", "--test-concurrency=1", "tests/**/*.test.ts"], { encoding: "utf8" });
const out = (r.stdout || "") + (r.stderr || "");
process.stdout.write(out.split("\n").filter((l) => !/Warning|dtype/.test(l)).join("\n"));
const num = (k: string) => Number(new RegExp(`ℹ ${k} (\\d+)`).exec(out)?.[1] ?? NaN);
const summary = { ranAt: new Date().toISOString(), tests: num("tests"), passed: num("pass"), failed: num("fail"), durationMs: num("duration_ms") };
fs.writeFileSync("docs/evaluation/unit-tests.json", JSON.stringify(summary, null, 2));
console.log(summary);
process.exit(r.status ?? 1);
