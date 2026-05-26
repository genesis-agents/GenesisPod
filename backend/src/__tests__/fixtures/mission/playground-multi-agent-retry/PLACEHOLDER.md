# playground-multi-agent-retry fixture (placeholder — combined-state §6.8.1.b)

To materialize:

- inside a single stage (e.g. s3-researcher-collect or s8-writer-draft), multiple agents have `retryCount > 0`
- at least one agent ended `completed` after retries
- at least one agent ended `failed` after exhausted retries
- stage-level `attempts` reflects backend rule (not derived from agent retries)
- proves `agent.phase` (§6.4.3) is auxiliary to retry count — phase enum stable under retry pressure
