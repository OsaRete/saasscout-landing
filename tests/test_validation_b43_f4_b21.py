"""Offline characterization of the reviewed B2.1 source boundary; never connects.

Not a PostgreSQL parser or a test of the proposed unimplemented migration.
Inventory changes must be reviewed rather than silently regenerating this baseline.
"""
import copy
import hashlib
import json
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs/V8_B43_F4_B21_SOURCE_MANIFEST.json"
IMPLEMENTATION = ROOT / "supabase/migrations/20261107000000_b43_executable_concurrency_contract.sql"
FUNCTION = re.compile(
    r"create\s+(?:or\s+replace\s+)?function\s+public\."
    r"(validation_\w+|apply_canonical_bootstrap_activation)\s*"
    r"\((.*?)\)\s*returns\s+(.*?)\bas\s+(\$\w*\$)", re.I | re.S)
FIELDS = {
    "observation_fingerprint", "problem_title", "normalized_problem_title",
    "problem_summary", "source_table", "source_row_id", "source_url",
    "source_type", "source_evidence", "source_author_id", "source_metrics",
    "affected_niches", "problem_cluster", "pain_score", "revenue_score",
    "urgency_score", "trend_score", "buying_signal_score", "frequency_score",
    "source_quality_score", "opportunity_score", "confidence_score",
    "evidence_quality", "observed_at", "metadata",
}


def source_functions():
    """Restricted extractor for this repository's dollar-quoted definitions."""
    found = {}
    for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
        # B2.1 remains the immutable reviewed baseline. B2.2's complete effective
        # inventory is tested separately, not regenerated into this manifest.
        if path == IMPLEMENTATION:
            continue
        sql = path.read_text()
        for match in FUNCTION.finditer(sql):
            end = sql.index(match[4], match.end()) + len(match[4])
            found[match[1]] = {
                "arguments": " ".join(match[2].split()),
                "attributes": " ".join(match[3].split()),
                "source": str(path.relative_to(ROOT)),
                "line": sql.count("\n", 0, match.start()) + 1,
                "definition_sha256": hashlib.sha256(
                    sql[match.start():end].encode()).hexdigest(),
            }
    return found


def validate_functions(manifest):
    found = source_functions()
    recorded = {row["name"]: row for row in manifest["functions"]}
    assert len(recorded) == len(manifest["functions"]), "duplicate signature"
    assert recorded.keys() == found.keys(), "missing or extra effective function"
    for name, source in found.items():
        for field, value in source.items():
            assert recorded[name][field] == value, (name, field)


def validate_parent_scope(tables):
    """Require every public FK child of a guarded parent, including adjacent tables."""
    for path in (ROOT / "supabase/migrations").glob("*.sql"):
        sql = re.sub(r"--[^\n]*", "", path.read_text())
        for match in re.finditer(
                r"create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)"
                r"\s*\((.*?)\n\);", sql, re.I | re.S):
            parents = set(re.findall(r"references\s+public\.(\w+)", match[2], re.I))
            if parents & set(tables):
                assert match[1] in tables, (match[1], parents & set(tables))
        for match in re.finditer(
                r"alter\s+table\s+(?:only\s+)?public\.(\w+)\s+([^;]+);", sql, re.I | re.S):
            parents = set(re.findall(r"references\s+public\.(\w+)", match[2], re.I))
            if parents & set(tables):
                assert match[1] in tables, (match[1], parents & set(tables))


class SourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads(MANIFEST.read_text())

    def test_baseline_and_source_hashes(self):
        self.assertEqual(self.manifest["baseline"],
                         "cdfa204ac1e911a5faf02ae0fc21025e149c0e45")
        for name, digest in self.manifest["sources"].items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), digest)
        relevant = {
            str(p.relative_to(ROOT))
            for p in (ROOT / "supabase/migrations").glob("*.sql")
            if p != IMPLEMENTATION and re.search(r"\b(?:validation_\w+|canonical_problems|problem_aliases|"
                         r"problem_observations|problem_evolution_snapshots|"
                         r"problem_feedback_events|canonical_bootstrap_activations)\b",
                         p.read_text())
        }
        self.assertEqual(set(self.manifest["sources"]), relevant)

    def test_latest_definitions_are_complete(self):
        validate_functions(self.manifest)
        self.assertEqual(len(self.manifest["functions"]), 53)

    def test_omitted_writer_and_changed_security_are_detected(self):
        for mutate in (
                lambda rows: rows.pop(),
                lambda rows: rows[0].update(attributes="trigger language plpgsql security definer"),
                lambda rows: rows[0].update(arguments="p_sql text")):
            altered = copy.deepcopy(self.manifest)
            mutate(altered["functions"])
            with self.assertRaises(AssertionError):
                validate_functions(altered)

    def test_entry_writers_have_existing_service_boundary(self):
        entries = self.manifest["entry_writers"]
        self.assertEqual(len(set(entries)), 24)
        functions = {row["name"]: row for row in self.manifest["functions"]}
        for name in entries:
            self.assertEqual(functions[name]["explicit_execute_acl"], {
                "public": "revoke", "anon": "revoke",
                "authenticated": "revoke", "service_role": "grant"})
            # This proposed conversion cannot be certified by renaming a generic executor.
            definition = (ROOT / functions[name]["source"]).read_text()
            match = next(m for m in FUNCTION.finditer(definition) if m[1] == name)
            body = definition[match.end():definition.index(match[4], match.end())]
            self.assertIsNone(re.search(r"\bexecute\s+(?!function\b)",
                                        re.sub(r"--[^\n]*", "", body), re.I))

    def test_trigger_manifest_matches_source_attachments(self):
        found = {}
        for name in self.manifest["sources"]:
            sql = (ROOT / name).read_text()
            for match in re.finditer(r"create\s+trigger\s+(\w+)\s+([^;]+);", sql, re.I | re.S):
                if re.search(r"\bon\s+(?:public\.)?(?:validation_\w+|canonical_problems|"
                             r"problem_aliases|problem_observations)\b", match[2], re.I):
                    found[match[1]] = " ".join(match[0].split())
        recorded = {row["name"]: row["sql"] for row in self.manifest["triggers"]}
        self.assertEqual(recorded, found)
        self.assertEqual(len(found), 40)

    def test_acl_statements_are_source_declarations_not_catalog_claims(self):
        found = []
        for name in sorted(self.manifest["sources"]):
            sql = (ROOT / name).read_text()
            for match in re.finditer(r"^\s*(?:grant|revoke)\s+[^;]+;", sql, re.I | re.M):
                if re.search(r"validation_|canonical_|problem_(?:aliases|observations|"
                             r"evolution_snapshots|feedback_events)", match[0]):
                    found.append({"source": name, "line": sql.count("\n", 0, match.start()) + 1,
                                  "sql": " ".join(match[0].split())})
        self.assertEqual(self.manifest["acl_statements"], found)
        for row in self.manifest["acl_statements"]:
            normalized = " ".join((ROOT / row["source"]).read_text().split())
            self.assertIn(row["sql"], normalized)
        self.assertIn("not a live catalog", self.manifest["scope"])
        reader = next(r for r in self.manifest["functions"]
                      if r["name"] == "validation_b43_read_current_evidence")
        for role in ("public", "anon", "authenticated", "service_role", "authenticator"):
            self.assertEqual(reader["explicit_execute_acl"][role], "revoke")

    def test_parent_fk_scope_and_missing_adjacent_negative(self):
        tables = self.manifest["guarded_tables"]
        validate_parent_scope(tables)
        self.assertEqual(len(set(tables)), 27)
        for omitted in ("problem_feedback_events", "problem_evolution_snapshots"):
            with self.assertRaises(AssertionError):
                validate_parent_scope([t for t in tables if t != omitted])

    def test_narrow_observation_input_matches_current_mapper(self):
        source = (ROOT / "lib/knowledge/observation-store.ts").read_text()
        body = source.split("export type ProblemObservationRow = {", 1)[1].split("\n};", 1)[0]
        self.assertEqual(set(re.findall(r"^  (\w+):", body, re.M)), FIELDS)
        self.assertEqual(len(FIELDS), 25)
        self.assertTrue(FIELDS.isdisjoint({"id", "owner_id", "canonical_problem_id",
                                          "authority_state", "created_at"}))

    def test_reviewed_direct_dml_callers_have_been_adapted(self):
        tables = "|".join(self.manifest["guarded_tables"])
        pattern = re.compile(r'\.from\("(' + tables + r')"\)\s*\.(insert|upsert|update|delete)\(')
        found = []
        for folder in ("lib", "app"):
            for path in (ROOT / folder).rglob("*.ts"):
                found.extend((str(path.relative_to(ROOT)), *match.groups())
                             for match in pattern.finditer(path.read_text()))
        self.assertEqual(found, [])
        # Limited literal-call scanner; raw SQL, dynamic table names and external clients
        # still require the documented manual/configuration gate.


if __name__ == "__main__":
    unittest.main()
