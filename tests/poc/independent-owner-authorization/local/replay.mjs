// Disposable test database only; no production schema or application imports.
import { DatabaseSync } from "node:sqlite";
export function openReplay(path) {
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS consumed (id TEXT PRIMARY KEY NOT NULL)",
  );
  const insert = db.prepare(
    "INSERT INTO consumed(id) VALUES (?) ON CONFLICT(id) DO NOTHING",
  );
  return {
    consume: (id) => insert.run(id).changes === 1,
    close: () => db.close(),
  };
}
