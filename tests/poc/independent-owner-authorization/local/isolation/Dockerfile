# Disposable synthetic proof only. No dependencies, credentials or host mounts.
FROM node:24-bookworm-slim
WORKDIR /proof
COPY . /proof/
RUN chmod -R a=rX /proof
CMD ["node", "local/run.mjs", "--isolation"]
