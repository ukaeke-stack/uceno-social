# UCENO autonomous development worker

## What this deploys

A persistent container runs one Codex CLI engineering session at a time. It restarts after host/container restarts, keeps cycle state and the repository workspace on named volumes, and pushes source changes to a dedicated Git branch. It is designed to work while the owner is offline.

This is **not yet a deployed 24/7 service**. A cloud VM and two runtime secrets are still required. The worker cannot merge pull requests, deploy production, apply production migrations, publish Unity Addressables, build APKs, enable scheduled hunts, or activate escrow/payments.

## Required prerequisites

- A Linux cloud VM with Docker Engine and Compose plugin, separate from production app/database.
- An OpenAI API key with API billing enabled. ChatGPT subscription access does not automatically provide API credits.
- A GitHub fine-grained token restricted to this repository with Contents: Read and write. Do not grant administration, Actions secrets, deployments, or production environment permissions.
- Persistent disk for the two Docker volumes.
- Provider budget limits and usage alerts configured before starting.

## Start

1. Provision the VM and install Docker Engine + Compose.
2. From the repository root, create an untracked .env file (chmod 600):
   OPENAI_API_KEY=your_api_key
   GITHUB_TOKEN=your_fine_grained_token
   MAX_CYCLES_PER_DAY=24
   IDLE_MS=300000
   CYCLE_TIMEOUT_MS=2700000
3. Run: docker compose -f autonomy/docker-compose.yml up -d --build
4. Inspect: docker compose -f autonomy/docker-compose.yml logs -f
5. Review commits and CI in GitHub. Merge changes manually.

## Safety model

- One sequential worker; no overlapping cycles; persistent lock and state.
- Daily cycle cap and per-cycle timeout; configure provider-side spend limits too.
- All work remains on infra/uceno-autonomous-development-agent.
- Least-privilege GitHub token; credentials are not written to Git.
- Every task must run relevant tests and update the requirement ledger with evidence.
- Do not supply production database, Render, Paystack, Cloudinary, Unity Build Automation or deployment credentials.
- Human review remains required for PR merge, production migrations, deployment, Unity Editor/device validation, payments and releases.

## Limitations

This is continuous sequential development, not guaranteed uninterrupted progress. API outages, rate limits, failed tests, missing decisions, CI failures and Unity/device dependencies can pause progress. A completed task does not imply the project is complete. Continue until every ledger requirement has evidence and release gates are signed off. Costs depend on model usage and task size.
