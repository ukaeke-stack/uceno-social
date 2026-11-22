FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates bash && rm -rf /var/lib/apt/lists/*
RUN npm install --global @openai/codex
WORKDIR /opt/uceno-worker
COPY autonomy/worker.mjs ./worker.mjs
COPY autonomy/worker-policy.mjs ./worker-policy.mjs
RUN node --input-type=module -e "import('./worker-policy.mjs').then(() => process.stdout.write('worker policy module load passed\\n'))"
ENV WORKDIR=/workspace/uceno-social
ENV STATE_DIR=/state
ENV HOME=/tmp/home
ENV XDG_CONFIG_HOME=/tmp/xdg
CMD ["node", "/opt/uceno-worker/worker.mjs"]
