"""Fresh transaction/preparation factory. Imports have no runtime side effects."""
from dataclasses import dataclass
import hashlib
import json
import re
import subprocess

OWNER = '10000000-0000-0000-0000-000000000001'
PURPOSE = 'qualified_validation_shared_evidence'
RETRYABLE = frozenset(('40001', '40P01'))
KINDS = frozenset(('withdraw', 'restore', 'consent', 'pause', 'cancel_experiment',
                   'relevance', 'cancel_session', 'insert', 'classify_ai', 'classify_human', 'classify_mixed',
                   'promote', 'canonical', 'alias', 'alias_conflict', 'indirect_fk', 'nested'))


class ContractFailure(RuntimeError):
    pass


def require(ok, label):
    if not ok:
        raise ContractFailure(label)


def uid(prefix, n):
    require(prefix in '123456789abcdef' and type(n) is int and 0 < n < 1000000, 'fixture_identity')
    return f'{prefix}0000000-0000-0000-0000-{n:012d}'


@dataclass(frozen=True)
class Intent:
    kind: str
    n: int

    def __post_init__(self):
        require(self.kind in KINDS, 'unsupported_composition')
        uid('b', self.n)


@dataclass(frozen=True)
class Command:
    sql: str
    params: tuple = ()


@dataclass(frozen=True)
class Outcome:
    code: str | None
    phase: str
    disposition: str = 'executed'
    value: object = None  # Internal only: never serialize row values into artifacts.


def execute(c, sql, params=()):
    with c.cursor() as cur:
        # Fixture batches contain multiple fixed statements. Preserve psycopg's
        # parameterless execution path instead of supplying an empty bind tuple.
        if params:
            cur.execute(sql, params)
        else:
            cur.execute(sql)
        return cur.fetchall() if cur.description else []


def scalar(c, sql, params=()):
    return execute(c, sql, params)[0][0]


def sql_outcome(c, command, phase):
    try:
        return Outcome('00000', phase, value=execute(c, command.sql, command.params))
    except Exception as error:
        code = getattr(error, 'sqlstate', None)
        require(isinstance(code, str) and re.fullmatch('[A-Z0-9]{5}', code), 'unclassified_driver_failure')
        return Outcome(code, phase)


def restriction_query(predecessor, owner=OWNER):
    return Command('''select count(*) from public.validation_evidence_source_restrictions
      where purpose_id=%s and reason_code=%s and scope_kind=%s and scope_id=%s::uuid
        and owner_id=%s::uuid and contribution_observation_id is null''',
                   (PURPOSE, 'classification_superseded', 'classification', predecessor, owner))


def restriction_matches(row, predecessor, owner=OWNER):
    """Offline identity negative controls mirror the six SQL identity predicates."""
    return (row.get('purpose_id') == PURPOSE and row.get('reason_code') == 'classification_superseded'
            and row.get('scope_kind') == 'classification' and row.get('scope_id') == predecessor
            and row.get('owner_id') == owner and 'contribution_observation_id' in row
            and row['contribution_observation_id'] is None)


TABLES = {'observations': 'validation_evidence_observations', 'classifications': 'validation_evidence_classifications',
          'subjects': 'validation_subjects', 'hypotheses': 'validation_hypothesis_versions',
          'experiments': 'validation_experiment_versions', 'participants': 'validation_participants',
          'sessions': 'validation_interview_sessions', 'canonicalProblems': 'canonical_problems', 'aliases': 'problem_aliases'}


def promotion_command(c, n):
    rows = {}
    for key, table in TABLES.items():
        owner_filter = '' if key in ('canonicalProblems', 'aliases') else ' where t.owner_id=%s::uuid'
        # Synthetic disposable corpus only, bounded without silently truncating.
        items = scalar(c, f'select coalesce(jsonb_agg(to_jsonb(t)),\'[]\'::jsonb) from public.{table} t' + owner_filter,
                       () if not owner_filter else (OWNER,))
        require(isinstance(items, list) and len(items) <= 5000, 'preparation_row_bound')
        rows[key] = items
    child = subprocess.run(['node', 'scripts/validation-b43-f4-preparation.ts'],
                           input=json.dumps({'rows': rows, 'observationId': uid('b', n)}),
                           capture_output=True, text=True, timeout=15)
    require(child.returncode == 0, 'preparation_failed')
    try:
        prepared = json.loads(child.stdout)
    except (ValueError, TypeError):
        raise ContractFailure('preparation_protocol') from None
    require(prepared.get('disposition') in ('prepared', 'qualification_deferred'), 'preparation_protocol')
    if prepared['disposition'] == 'qualification_deferred':
        return None
    contract = prepared['contract']
    require(contract['observationId'] == uid('b', n), 'preparation_identity')
    require(prepared['fingerprint'] == hashlib.sha256(json.dumps(contract, separators=(',', ':')).encode()).hexdigest(), 'preparation_fingerprint')
    representative = scalar(c, 'select public.validation_b31_representative_state(%s::uuid,%s::uuid)',
                            (OWNER, prepared['participantId']))
    authority = scalar(c, 'select public.validation_b31_authority_snapshot(%s::uuid,%s::uuid)',
                       (prepared['subjectId'], prepared['hypothesisVersionId']))
    return Command('''select public.validation_promote_customer_interview_evidence(
      %s::uuid,%s::uuid,%s::uuid,%s::uuid,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,%s,%s,%s)''',
                   (OWNER, contract['observationId'], contract['classificationId'], contract['canonicalProblemId'],
                    contract['polarity'], prepared['groupKey'], prepared['fingerprint'], json.dumps(representative),
                    json.dumps(authority), prepared['canonicalTitle'], prepared['normalizedTitle'],
                    contract['policyVersion'], contract['resolverVersion'], contract['projectionVersion']))


def factory(c, intent):
    """Called AFTER each new transaction's entry; never accepts prepared SQL."""
    require(isinstance(intent, Intent), 'intent_required')
    n, kind = intent.n, intent.kind
    participant, session, experiment = uid('9', n), uid('a', n), uid('7', n)
    if kind == 'promote':
        return promotion_command(c, n)
    if kind in ('withdraw', 'restore'):
        current = scalar(c, 'select status from public.validation_participants where id=%s::uuid and owner_id=%s::uuid', (participant, OWNER))
        return Command('select public.validation_update_participant_status(%s::uuid,%s::uuid,%s,%s)',
                       (OWNER, participant, current, 'active' if kind == 'restore' else 'withdrawn'))
    if kind == 'consent':
        return Command('update public.validation_participants set consent_purpose=%s where id=%s::uuid and owner_id=%s::uuid', ('F4 synthetic consent', participant, OWNER))
    if kind in ('pause', 'cancel_experiment'):
        current = scalar(c, 'select lifecycle from public.validation_experiment_versions where id=%s::uuid and owner_id=%s::uuid', (experiment, OWNER))
        return Command('select public.validation_transition_experiment_version(%s::uuid,%s::uuid,%s,%s)',
                       (OWNER, experiment, current, 'paused' if kind == 'pause' else 'cancelled'))
    if kind == 'relevance':
        current = scalar(c, 'select participant_relevance from public.validation_interview_sessions where id=%s::uuid and owner_id=%s::uuid', (session, OWNER))
        return Command('select public.validation_update_interview_relevance(%s::uuid,%s::uuid,%s,%s)', (OWNER, session, current, 'adjacent_segment'))
    if kind == 'cancel_session':
        current = scalar(c, 'select status from public.validation_interview_sessions where id=%s::uuid and owner_id=%s::uuid', (session, OWNER))
        return Command('select public.validation_update_interview_session(%s::uuid,%s::uuid,%s,%s,null)', (OWNER, session, current, 'cancelled'))
    if kind == 'insert':
        return Command('select public.validation_record_interview_observation_v2(%s::uuid,%s::uuid,now(),%s::jsonb,%s,null,false)',
                       (OWNER, session, json.dumps({'content': 'Synthetic follow-up', 'statementKind': 'summary'}), f'f4-{n}'))
    if kind in ('classify_ai', 'classify_human', 'classify_mixed'):
        terminals = execute(c, '''select id from public.validation_evidence_classifications c
          where owner_id=%s::uuid and observation_id=%s::uuid and not exists(
            select 1 from public.validation_evidence_classifications s where s.owner_id=c.owner_id and s.supersedes_classification_id=c.id) order by id''', (OWNER, uid('b', n)))
        require(len(terminals) == 1, 'classification_selection_ambiguous')
        return Command('select public.validation_insert_classification(%s::uuid,%s::uuid,%s,%s,%s,null,%s::uuid)',
                       (OWNER, uid('b', n), 'inconclusive' if kind == 'classify_ai' else 'mixed' if kind == 'classify_mixed' else 'contradicting',
                        'ai_model_suggested' if kind == 'classify_ai' else 'user_supplied',
                        'suggested' if kind == 'classify_ai' else 'authoritative', str(terminals[0][0])))
    if kind == 'canonical':
        return Command("update public.canonical_problems set status='deprecated' where id=%s::uuid", (uid('2', n),))
    if kind in ('alias', 'alias_conflict'):
        return Command('insert into public.problem_aliases(canonical_problem_id,alias_text,normalized_alias,alias_type) values(%s::uuid,%s,%s,\'title\')',
                       (uid('f', n) if kind == 'alias_conflict' else uid('2', n), f'F4 alias {n}',
                        f'f4 reports {n}' if kind == 'alias_conflict' else f'f4 alias {n}'))
    if kind == 'indirect_fk':
        return Command("insert into public.problem_feedback_events(canonical_problem_id,event_type,event_text) values(%s::uuid,'qualitative_feedback','synthetic')", (uid('2', n),))
    if kind == 'nested':
        return Command('''select public.validation_update_participant_status(%s::uuid,
          (public.validation_create_participant(%s::uuid,null,'anonymous',null,null,null,null,null)->>'id')::uuid,'active','withdrawn')''', (OWNER, OWNER))
    raise ContractFailure('unsupported_composition')


def fresh_attempt(c, isolation, intent, *, prime=None):
    require(isolation in ('READ COMMITTED', 'REPEATABLE READ'), 'isolation')
    require(isinstance(intent, Intent), 'intent_required')
    require(c.info.transaction_status == 0, 'fresh_transaction_required')
    execute(c, 'begin isolation level ' + isolation)
    try:
        if prime:
            prime(c)  # Deliberate first-attempt stale snapshot probe, never a retry.
        outcome = sql_outcome(c, Command('select saasscout_private.b43_enter()'), 'entry')
        if outcome.code != '00000':
            execute(c, 'rollback')
            return outcome
        command = factory(c, intent)
        if command is None:
            execute(c, 'rollback')
            return Outcome(None, 'preparation', 'qualification_deferred')
        outcome = sql_outcome(c, command, 'command')
        if outcome.code == '00000':
            final = sql_outcome(c, Command('commit'), 'commit')
            if final.code != '00000':
                outcome = final
            else:
                outcome = Outcome('00000', 'commit', value=outcome.value)
        if outcome.code != '00000':
            execute(c, 'rollback')
        return outcome
    except Exception:
        execute(c, 'rollback')
        raise


def retry_transaction(c, isolation, intent, *, maximum=3, record=None):
    require(type(maximum) is int and 1 <= maximum <= 3, 'retry_bound')
    for number in range(1, maximum + 1):
        outcome = fresh_attempt(c, isolation, intent)
        if record:
            record(number, outcome)
        if outcome.code not in RETRYABLE:
            return outcome
    raise ContractFailure('retry_exhausted')
