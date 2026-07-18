from __future__ import annotations

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parent.parent

SOURCE = ROOT / "remote-public-schema.sql"

DESTINATION = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260628000000_create_historical_application_schema.sql"
)

HISTORICAL_TABLES = {
    "beta-signups",
    "discovered_problems",
    "discovery_actions",
    "evidence_analysis",
    "founder_matches",
    "founder_problem_matches",
    "founder_profiles",
    "opportunities",
    "opportunity_discoveries",
    "opportunity_intelligence",
    "problem_intelligence",
    "saved_ideas",
    "scan",
    "scan_sources",
    "user_profiles",
    "weekly_detected_problems",
    "weekly_intelligence_runs",
    "weekly_niches",
    "weekly_reports",
    "weekly_sources",
}

RECENT_TABLES = {
    "canonical_problems",
    "problem_aliases",
    "problem_evolution_snapshots",
    "problem_feedback_events",
    "problem_observations",
    "snapshot_engine_attribution",
    "snapshot_evidence",
    "snapshot_evidence_lineage",
    "snapshot_evidence_supports",
    "snapshot_identities",
    "snapshot_processing_history",
    "snapshot_provenance_sources",
    "snapshot_sections",
    "snapshot_validations",
    "scan_intelligence_artifacts",
}


def split_sql_statements(sql: str) -> list[str]:
    """
    Divide SQL into statements while respecting:

    - single-quoted strings
    - double-quoted identifiers
    - PostgreSQL dollar-quoted function bodies
    - line comments
    - block comments

    This is safer than simply splitting on semicolons.
    """

    statements: list[str] = []
    current: list[str] = []

    index = 0
    length = len(sql)

    in_single_quote = False
    in_double_quote = False
    in_line_comment = False
    in_block_comment = False
    dollar_tag: str | None = None

    while index < length:
        char = sql[index]
        next_char = sql[index + 1] if index + 1 < length else ""

        if in_line_comment:
            current.append(char)

            if char == "\n":
                in_line_comment = False

            index += 1
            continue

        if in_block_comment:
            current.append(char)

            if char == "*" and next_char == "/":
                current.append(next_char)
                in_block_comment = False
                index += 2
            else:
                index += 1

            continue

        if dollar_tag is not None:
            if sql.startswith(dollar_tag, index):
                current.append(dollar_tag)
                index += len(dollar_tag)
                dollar_tag = None
            else:
                current.append(char)
                index += 1

            continue

        if in_single_quote:
            current.append(char)

            if char == "'" and next_char == "'":
                current.append(next_char)
                index += 2
                continue

            if char == "'":
                in_single_quote = False

            index += 1
            continue

        if in_double_quote:
            current.append(char)

            if char == '"' and next_char == '"':
                current.append(next_char)
                index += 2
                continue

            if char == '"':
                in_double_quote = False

            index += 1
            continue

        if char == "-" and next_char == "-":
            current.extend([char, next_char])
            in_line_comment = True
            index += 2
            continue

        if char == "/" and next_char == "*":
            current.extend([char, next_char])
            in_block_comment = True
            index += 2
            continue

        if char == "'":
            current.append(char)
            in_single_quote = True
            index += 1
            continue

        if char == '"':
            current.append(char)
            in_double_quote = True
            index += 1
            continue

        if char == "$":
            match = re.match(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$", sql[index:])

            if match:
                dollar_tag = match.group(0)
                current.append(dollar_tag)
                index += len(dollar_tag)
                continue

        current.append(char)

        if char == ";":
            statement = "".join(current).strip()

            if statement:
                statements.append(statement)

            current = []

        index += 1

    remainder = "".join(current).strip()

    if remainder:
        statements.append(remainder)

    return statements


def normalize_identifier(identifier: str) -> str:
    return identifier.replace('""', '"').strip()


def referenced_public_tables(statement: str) -> set[str]:
    """
    Obtiene referencias como:

        "public"."user_profiles"
        public.user_profiles
    """

    quoted = re.findall(
        r'"public"\."([^"]+)"',
        statement,
        flags=re.IGNORECASE,
    )

    unquoted = re.findall(
        r"(?<![\w\"])\bpublic\.([A-Za-z_][A-Za-z0-9_-]*)",
        statement,
        flags=re.IGNORECASE,
    )

    return {
        normalize_identifier(name).lower()
        for name in [*quoted, *unquoted]
    }


def created_function_name(statement: str) -> str | None:
    match = re.search(
        r"""
        CREATE\s+(?:OR\s+REPLACE\s+)?
        FUNCTION\s+
        (?:
            "public"\."([^"]+)"
            |
            public\.([A-Za-z_][A-Za-z0-9_]*)
        )
        \s*\(
        """,
        statement,
        flags=re.IGNORECASE | re.VERBOSE,
    )

    if not match:
        return None

    return (match.group(1) or match.group(2)).lower()


def trigger_function_name(statement: str) -> str | None:
    match = re.search(
        r"""
        EXECUTE\s+FUNCTION\s+
        (?:
            "public"\."([^"]+)"
            |
            public\.([A-Za-z_][A-Za-z0-9_]*)
        )
        \s*\(
        """,
        statement,
        flags=re.IGNORECASE | re.VERBOSE,
    )

    if not match:
        return None

    return (match.group(1) or match.group(2)).lower()


def statement_mentions_function(
    statement: str,
    function_name: str,
) -> bool:
    quoted_pattern = rf'"public"\."{re.escape(function_name)}"'
    unquoted_pattern = rf"\bpublic\.{re.escape(function_name)}\b"

    return bool(
        re.search(quoted_pattern, statement, flags=re.IGNORECASE)
        or re.search(unquoted_pattern, statement, flags=re.IGNORECASE)
    )


def is_ignored_dump_statement(statement: str) -> bool:
    normalized = statement.lstrip().upper()

    ignored_prefixes = (
        "SET ",
        "SELECT PG_CATALOG.SET_CONFIG",
        "CREATE SCHEMA ",
        "ALTER SCHEMA ",
        "COMMENT ON SCHEMA ",
        "REVOKE ALL ON SCHEMA ",
        "GRANT ALL ON SCHEMA ",
        "ALTER DEFAULT PRIVILEGES ",
    )

    return normalized.startswith(ignored_prefixes)


def is_table_owned_statement(statement: str) -> bool:
    references = referenced_public_tables(statement)

    return bool(references & HISTORICAL_TABLES)


def is_recent_only_statement(statement: str) -> bool:
    references = referenced_public_tables(statement)

    return bool(references) and references.issubset(RECENT_TABLES)


def collect_required_trigger_functions(
    statements: list[str],
) -> set[str]:
    required_functions: set[str] = set()

    for statement in statements:
        if not is_table_owned_statement(statement):
            continue

        function_name = trigger_function_name(statement)

        if function_name:
            required_functions.add(function_name)

    return required_functions


def collect_historical_function_definitions(
    statements: list[str],
    required_trigger_functions: set[str],
) -> set[str]:
    historical_functions: set[str] = set(required_trigger_functions)

    for statement in statements:
        function_name = created_function_name(statement)

        if not function_name:
            continue

        references = referenced_public_tables(statement)

        if references & HISTORICAL_TABLES:
            historical_functions.add(function_name)

    return historical_functions


def should_include_statement(
    statement: str,
    historical_functions: set[str],
) -> bool:
    if is_ignored_dump_statement(statement):
        return False

    if is_recent_only_statement(statement):
        return False

    if is_table_owned_statement(statement):
        return True

    function_name = created_function_name(statement)

    if function_name and function_name in historical_functions:
        return True

    for historical_function in historical_functions:
        if statement_mentions_function(statement, historical_function):
            return True

    return False


def validate_output(
    selected_statements: list[str],
    historical_functions: set[str],
) -> None:
    output = "\n\n".join(selected_statements)

    missing_tables = sorted(
        table
        for table in HISTORICAL_TABLES
        if not re.search(
            rf"""
            CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?
            (?:
                "public"\."{re.escape(table)}"
                |
                public\.{re.escape(table)}
            )
            """,
            output,
            flags=re.IGNORECASE | re.VERBOSE,
        )
    )

    leaked_recent_tables = sorted(
        table
        for table in RECENT_TABLES
        if re.search(
            rf'"public"\."{re.escape(table)}"',
            output,
            flags=re.IGNORECASE,
        )
    )

    missing_functions = sorted(
        function_name
        for function_name in historical_functions
        if not any(
            created_function_name(statement) == function_name
            for statement in selected_statements
        )
    )

    errors: list[str] = []

    if missing_tables:
        errors.append(
            "Historical CREATE TABLE statements missing:\n  - "
            + "\n  - ".join(missing_tables)
        )

    if leaked_recent_tables:
        errors.append(
            "Recent tables leaked into historical migration:\n  - "
            + "\n  - ".join(leaked_recent_tables)
        )

    if missing_functions:
        errors.append(
            "Required function definitions missing:\n  - "
            + "\n  - ".join(missing_functions)
        )

    if errors:
        print("\nVALIDATION FAILED\n", file=sys.stderr)

        for error in errors:
            print(error, file=sys.stderr)
            print(file=sys.stderr)

        raise SystemExit(1)


def classify_statement(statement: str) -> str:
    normalized = statement.lstrip().upper()

    categories = (
        ("CREATE TABLE", "TABLE"),
        ("CREATE OR REPLACE FUNCTION", "FUNCTION"),
        ("CREATE FUNCTION", "FUNCTION"),
        ("CREATE UNIQUE INDEX", "INDEX"),
        ("CREATE INDEX", "INDEX"),
        ("CREATE OR REPLACE TRIGGER", "TRIGGER"),
        ("CREATE TRIGGER", "TRIGGER"),
        ("CREATE POLICY", "POLICY"),
        ("ALTER TABLE", "ALTER TABLE"),
        ("ALTER FUNCTION", "ALTER FUNCTION"),
        ("COMMENT ON", "COMMENT"),
        ("GRANT ", "GRANT"),
        ("REVOKE ", "REVOKE"),
    )

    for prefix, category in categories:
        if normalized.startswith(prefix):
            return category

    return "OTHER"


def main() -> None:
    if not SOURCE.exists():
        print(
            f"Source dump not found: {SOURCE}",
            file=sys.stderr,
        )
        raise SystemExit(1)

    sql = SOURCE.read_text(encoding="utf-8")
    statements = split_sql_statements(sql)

    required_trigger_functions = collect_required_trigger_functions(
        statements
    )

    historical_functions = collect_historical_function_definitions(
        statements,
        required_trigger_functions,
    )

    selected_statements = [
        statement
        for statement in statements
        if should_include_statement(
            statement,
            historical_functions,
        )
    ]

    validate_output(
        selected_statements,
        historical_functions,
    )

    header = """-- ============================================================================
-- SaaSScout historical application schema baseline
-- ============================================================================
--
-- Generated from remote-public-schema.sql.
--
-- This migration contains only the historical application objects that existed
-- before the Knowledge Evolution and Snapshot Persistence migrations.
--
-- Do not edit this file manually without comparing it with the remote schema.
-- ============================================================================

"""

    destination_content = (
        header
        + "\n\n".join(selected_statements)
        + "\n"
    )

    DESTINATION.write_text(
        destination_content,
        encoding="utf-8",
    )

    counts: dict[str, int] = {}

    for statement in selected_statements:
        category = classify_statement(statement)
        counts[category] = counts.get(category, 0) + 1

    print("=" * 68)
    print("HISTORICAL MIGRATION GENERATED")
    print("=" * 68)
    print(f"Source statements:       {len(statements)}")
    print(f"Selected statements:     {len(selected_statements)}")
    print(f"Historical tables:       {len(HISTORICAL_TABLES)}")
    print(f"Required functions:      {len(historical_functions)}")
    print()

    for category in sorted(counts):
        print(f"{category:<22} {counts[category]}")

    if historical_functions:
        print()
        print("Included functions:")

        for function_name in sorted(historical_functions):
            print(f"  - public.{function_name}()")

    print()
    print(f"Output: {DESTINATION}")
    print(f"Size:   {DESTINATION.stat().st_size} bytes")
    print("=" * 68)


if __name__ == "__main__":
    main()