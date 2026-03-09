# Competitive Scorecard Template

This document must be generated from actual benchmark runs and manual validation. It is intentionally blank until `tests/eval/run_eval.js` has produced real results and the stealth matrix has been filled with test evidence.

## How To Use

1. Run `npm run test:eval` with valid evaluation credentials.
2. Save the generated JSON artifact from `tests/eval/results/`.
3. Summarize the measured results here.
4. Link the exact result file and test date.
5. Do not write comparative claims that are not backed by the generated result artifact.

## Scorecard Template

| Dimension | Ghost Writer | Comparator | Evidence Source | Notes |
| :--- | :--- | :--- | :--- | :--- |
| Response quality | Pending | Pending | Pending | Fill from generated eval results. |
| Multimodal quality | Pending | Pending | Pending | Fill from generated eval results. |
| Context grounding | Pending | Pending | Pending | Fill from generated eval results. |
| Latency | Pending | Pending | Pending | Measure separately per provider. |
| Flexibility | Pending | Pending | Pending | Document supported providers and local-only mode. |
| Stealth behavior | Pending | Pending | Pending | Use the supported-app matrix, not assumptions. |

## Minimum Evidence Standard

- Link the generated eval result file.
- Record the model/provider used for Ghost Writer.
- Record the benchmark fixture set version.
- Record the test date.
- If comparing against another product, record how that product was tested and under what conditions.
