import { appendFileSync } from "node:fs";

const fetchLocal = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin !== "http://127.0.0.1:56321" && url.origin !== "http://127.0.0.1:3100") {
    appendFileSync(process.env.BETA_ACCEPTANCE_EGRESS_LOG, `${url.origin}\n`);
    throw new Error("Unexpected external fetch in disposable acceptance");
  }
  return fetchLocal(input, { ...init, redirect: "error" });
};
