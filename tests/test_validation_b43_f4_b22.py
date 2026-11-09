"""Offline source checks only: no PostgreSQL connections or SQL execution.

The complete effective inventory is reconciled against B2.1, which is retained
as the baseline. These checks do not prove catalog, parser or schedule behavior.
"""
import copy
import hashlib
import json
from pathlib import Path
import re
import unittest

from test_validation_b43_f4_b21 import FIELDS, validate_parent_scope

ROOT = Path(__file__).resolve().parents[1]
BASE = json.loads((ROOT / "docs/V8_B43_F4_B21_SOURCE_MANIFEST.json").read_text())
EFFECTIVE = json.loads((ROOT / "docs/V8_B43_F4_B22_EFFECTIVE_MANIFEST.json").read_text())
SQL = (ROOT / EFFECTIVE["migration"]).read_text()
FUNCTION = re.compile(r"create\s+(?:or replace\s+)?function\s+(public|saasscout_private)"
                      r"\.(\w+)\s*\((.*?)\)\s*returns\s+(.*?)\bas\s+(\$\w*\$)", re.I | re.S)


def definitions(sql):
    found = {}
    for match in FUNCTION.finditer(sql):
        body = sql[match.end():sql.index(match[5], match.end())]
        name = match[1] + "." + match[2]
        args = ",".join(a.strip().split(" default ")[0].split(None, 1)[1]
                        for a in match[3].split(",") if a.strip())
        found[name] = {"signature": name + "(" + args + ")", "arguments": " ".join(match[3].split()),
                       "attributes": " ".join(match[4].split()), "body": body}
    return found


NEW = definitions(SQL)


def effective_definitions():
    found = {}
    for source in sorted(BASE["sources"]):
        for name, definition in definitions((ROOT / source).read_text()).items():
            if name.startswith("public.validation_") or name == "public.apply_canonical_bootstrap_activation":
                found[name] = definition
    found.update(NEW)
    return found


def validate_effective(manifest):
    found = effective_definitions()
    recorded = {f["name"]: f for f in manifest["functions"]}
    assert len(recorded) == len(manifest["functions"]), "duplicate effective function"
    assert recorded.keys() == found.keys(), "incomplete effective inventory"
    for name, definition in found.items():
        row = recorded[name]
        assert row["signature"] == definition["signature"], name
        assert row["arguments"] == definition["arguments"], name
        assert row["attributes"] == definition["attributes"], name
        if name in NEW:
            assert row["body_sha256"] == hashlib.sha256(definition["body"].encode()).hexdigest(), name
            assert row["body_md5"] == hashlib.md5(definition["body"].encode()).hexdigest(), name


def normalized(sql):
    return re.sub(r"\s+", "", re.sub(r"--[^\n]*", "", sql))


class FenceContractTests(unittest.TestCase):
    def test_complete_effective_inventory_and_tamper_controls(self):
        validate_effective(EFFECTIVE)
        self.assertEqual(len(EFFECTIVE["functions"]), 58)
        for field, value in (("arguments", "p_sql text"), ("attributes", "jsonb language plpgsql")):
            altered = copy.deepcopy(EFFECTIVE)
            altered["functions"][0][field] = value
            with self.assertRaises(AssertionError):
                validate_effective(altered)
        altered = copy.deepcopy(EFFECTIVE)
        altered["functions"].pop()
        with self.assertRaises(AssertionError):
            validate_effective(altered)

    def test_migration_digest_and_all_implemented_runtime_hashes(self):
        self.assertEqual(hashlib.sha256(SQL.encode()).hexdigest(), EFFECTIVE["migration_sha256"])
        expected = {d["signature"]: hashlib.md5(d["body"].encode()).hexdigest() for d in NEW.values()}
        section = SQL.split("insert into pg_temp.b43_implemented values\n", 1)[1].split(";", 1)[0]
        self.assertEqual(dict(re.findall(r"\('([^']+)','([a-f0-9]{32})',(?:true|false)\)", section)), expected)
        self.assertEqual(len(expected), 30)

    def test_every_entry_precedes_reads_locks_and_fast_paths(self):
        entries = ["public." + n for n in BASE["entry_writers"]] + [
            "public.validation_b31_lock_registry_statement", "public.validation_add_subject_link",
            "public.validation_create_participant", "public.knowledge_insert_problem_observations"]
        for name in entries:
            definition = NEW[name]
            self.assertRegex(re.sub(r"--[^\n]*", "", definition["body"]),
                             r"(?is)\bbegin\s+perform saasscout_private\.b43_enter\(\);")
            declaration = definition["body"].split("begin", 1)[0]
            self.assertNotRegex(declaration.lower(), r"\b(select|perform|pg_advisory|clock_timestamp)\b")
            expected_security = "invoker" if name.endswith("lock_registry_statement") else "definer"
            self.assertIn("volatile security " + expected_security, definition["attributes"])
            self.assertIn("search_path=pg_catalog,pg_temp", definition["attributes"])

    def test_each_existing_writer_retains_domain_body_and_signature(self):
        # Reverse only the individually reviewed edits; any removed owner check,
        # lineage condition, return, idempotency clause or proof write fails here.
        for row in BASE["functions"]:
            name = "public." + row["name"]
            if name not in NEW:
                continue
            old = definitions((ROOT / row["source"]).read_text())[name]
            new = NEW[name]
            self.assertEqual(new["arguments"], old["arguments"])
            body = new["body"].replace("perform saasscout_private.b43_enter();", "", 1)
            for variable, typ, expr in (("t", "timestamptz", "clock_timestamp()"),
                                       ("normalized_statement", "text", "nullif(btrim(p_shareable_statement), '')")):
                assignment = f"{variable} := {expr};"
                if assignment in body:
                    body = body.replace(assignment, "", 1).replace(f"{variable} {typ};", f"{variable} {typ} := {expr};", 1)
            if name.endswith("apply_canonical_bootstrap_activation"):
                body = body.replace("exception when serialization_failure or deadlock_detected then raise;\nwhen others then", "exception when others then")
            if name.endswith("validation_promote_customer_interview_evidence"):
                start = body.index("  -- Exact sorted-key JSON contract")
                end = body.index("  -- ---------------------------------------------------------------\n  -- Atomic shared projection", start)
                body = body[:start] + body[end:]
            self.assertEqual(normalized(body), normalized(old["body"]), name)

    def test_private_fence_is_a_real_write_without_application_entry(self):
        entry = NEW["saasscout_private.b43_enter"]
        self.assertIn("security invoker", entry["attributes"])
        self.assertIn("update saasscout_private.b43_coordination set version=version+1 where singleton;", entry["body"])
        for token in ("current_user<>'postgres'", "'read committed','repeatable read'", "affected<>1", "'0A000'"):
            self.assertIn(token, entry["body"])
        self.assertNotRegex(entry["body"], r"(?i)\b(exception\s+when|set_config|advisory|for update)\b")
        guard = NEW["saasscout_private.b43_guard_statement"]
        self.assertIn("security invoker", guard["attributes"])
        self.assertLess(guard["body"].index("current_user"), guard["body"].index("b43_enter"))
        self.assertIn("tg_op='TRUNCATE'", guard["body"])
        self.assertIn("force row level security", SQL)

    def test_all_existing_triggers_and_fk_closure_are_preserved(self):
        self.assertEqual(EFFECTIVE["existing_triggers"], BASE["triggers"])
        self.assertEqual(len(EFFECTIVE["existing_triggers"]), 40)
        self.assertEqual({r["relation"] for r in EFFECTIVE["new_statement_guards"]},
                         {"public." + t for t in BASE["guarded_tables"]})
        self.assertEqual(len(EFFECTIVE["new_statement_guards"]), 27)
        validate_parent_scope(BASE["guarded_tables"])
        self.assertIn("before insert or update or delete or truncate", SQL)
        self.assertIn("t.tgtype=62", SQL)
        self.assertNotRegex(SQL.lower(), r"\bdrop\s+(trigger|table|policy|function)\b")

    def test_acl_assertions_cover_columns_roles_select_rls_and_private_denials(self):
        acl = EFFECTIVE["acl_contract"]
        self.assertEqual(acl["revoke_effective_mutation_and_column_update"], BASE["guarded_tables"])
        for token in ("has_any_column_privilege", "has_table_privilege", "pg_auth_members", "g.admin_option",
                      "'SET'", "'USAGE'", "'MEMBER'", "readable_columns", "b.policies", "p.proacl is distinct from b.proacl"):
            self.assertIn(token, SQL)
        self.assertIn("revoke insert(%I),update(%I),references(%I)", SQL)
        for name in acl["new_service_rpc_only"]:
            self.assertIn("revoke all on function " + name + " from public,anon,authenticated,service_role,authenticator;", SQL)
            self.assertIn("grant execute on function " + name + " to service_role;", SQL)
        for name in acl["private_helper_denials"]:
            self.assertIn("revoke all on function " + name + " from public,anon,authenticated,service_role,authenticator;", SQL)
        self.assertNotRegex(SQL.lower(), r"\bgrant\s+.*?\bto\s+(?:anon|authenticated|authenticator|public)\b")

    def test_all_baseline_attributes_and_explicit_acls_are_preflighted(self):
        section = SQL.split("insert into pg_temp.b43_baseline_attributes values\n", 1)[1].split(";", 1)[0]
        signatures = re.findall(r"\('([^']+)'", section)
        self.assertEqual(set(signatures), {
            "public." + row["name"] + "(" + ",".join(
                a.strip().split(" default ")[0].split(None, 1)[1]
                for a in row["arguments"].split(",") if a.strip()) + ")"
            for row in BASE["functions"]
        })
        self.assertEqual(len(signatures), 53)
        for token in ("fn.prosecdef<>item.is_definer", "fn.provolatile<>item.volatility",
                      "fn.proisstrict<>item.is_strict", "jsonb_each_text(item.explicit_acl)",
                      "B43 baseline application execute changed", "B43 browser can reach service role"):
            self.assertIn(token, SQL)

    def test_fresh_source_checks_and_canonical_fingerprint_remain_post_entry(self):
        body = NEW["public.validation_promote_customer_interview_evidence"]["body"]
        tokens = ["b43_enter()", "into prior", "validation_b31_representative_state", "validation_b31_authority_snapshot",
                  "current_representative_state", "terminals <> 1", "promotion identity changed", "insert into public.problem_observations"]
        for token in tokens:
            self.assertIn(token, body)
        self.assertLess(body.index("b43_enter()"), body.index("into prior"))
        identity = body.split("-- Exact sorted-key JSON contract", 1)[1].split("-- Atomic shared projection", 1)[0]
        keys = re.findall(r'"(\w+)":', identity)
        self.assertEqual(keys, sorted(["canonicalProblemId", "classificationId", "observationId", "polarity", "policyVersion", "projectionVersion", "resolverVersion"]))
        self.assertNotIn("regexp_replace", identity)  # Do not strip whitespace inside JSON values.

    def test_bootstrap_preserves_retry_sqlstates_in_both_handlers(self):
        body = NEW["public.apply_canonical_bootstrap_activation"]["body"]
        self.assertEqual(body.count("exception when serialization_failure or deadlock_detected then raise;"), 2)

    def test_typed_market_input_excludes_qualification_and_internal_identity(self):
        row = SQL.split("create type public.b43_market_observation_input as (", 1)[1].split(");", 1)[0]
        self.assertEqual({part.strip().split()[0] for part in row.split(",")}, FIELDS)
        body = NEW["public.knowledge_insert_problem_observations"]["body"]
        self.assertIn("on conflict(observation_fingerprint) do nothing", body)
        self.assertNotRegex(body, r"(?i)\b(update|delete|truncate)\b")
        self.assertNotIn("insert into public.validation_", body)

    def test_atomic_unapplied_migration_and_no_authority_activation(self):
        self.assertRegex(SQL, r"(?s)^--.*?\nbegin;")
        self.assertTrue(SQL.rstrip().endswith("commit;"))
        self.assertIn("B43 function baseline drift", SQL)
        self.assertIn("B43 unguarded FK dependency", SQL)
        self.assertNotRegex(SQL, r"(?i)\b(create|alter)\s+role\b")
        # Only the existing promotion body can create a ledger/snapshot; private
        # WITHHELD capture and the denied reader are unchanged in the baseline.
        names = set(NEW)
        self.assertNotIn("public.validation_b43_read_current_evidence", names)
        self.assertNotIn("public.validation_b43_capture_new_promotion_authority", names)


if __name__ == "__main__":
    unittest.main()
