// B4.2 supersedes the B4.1 mutable-content/incomplete-read contract.
// Retain the existing command as an alias to the mandatory upgraded suite.
if (process.env.VALIDATION_B41_DISPOSABLE === "1") {
  process.env.VALIDATION_B42_DISPOSABLE = "1";
}
await import("./validation-b42-db.ts");
export {};
