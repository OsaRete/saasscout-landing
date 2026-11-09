-- Run ONLY through validation-b43-db.ts after its disposable identity checks
-- and B3.1 fixture setup. All mutations and test helpers roll back.
begin;
set local statement_timeout='8s';
create function pg_temp.b43_assert(ok boolean, label text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then
    raise exception 'B43 invariant failed' using errcode=case label
      when 'participant no-op response' then 'ZC001'
      when 'session notes persisted through status no-op' then 'ZC002'
      when 'no-op created restriction' then 'ZC003'
      when 'withdrawal response and persisted state' then 'ZC004'
      when 'withdrawal contribution restriction' then 'ZC005'
      when 'INSERT while withdrawn' then 'ZC006'
      when 'restoration persisted' then 'ZC007'
      when 'repeated transition idempotency' then 'ZC008'
      when 'archive and both contributions' then 'ZC009'
      when 'individual consent capture' then 'ZC010'
      when 'consent rollback' then 'ZC011'
      when 'relevance loss' then 'ZC012'
      when 'relevance restoration retains restriction' then 'ZC013'
      when 'session cancellation' then 'ZC014'
      when 'pause persisted' then 'ZC015'
      when 'resume persisted' then 'ZC016'
      when 'completion without restriction' then 'ZC017'
      when 'experiment cancellation' then 'ZC018'
      else 'ZC999' end;
  end if;
end $$;

do $$
declare
  own uuid := '10000000-0000-0000-0000-000000000001';
  pid uuid := '90000000-0000-0000-0000-000000000001';
  sid uuid := 'a0000000-0000-0000-0000-000000000001';
  eid uuid := '70000000-0000-0000-0000-000000000001';
  result jsonb;
  n bigint;
  mutation text;
begin
  select count(*) into n from public.validation_evidence_source_restrictions;
  result := public.validation_update_participant_status(own,pid,'active','active');
  perform pg_temp.b43_assert(result->>'status'='active','participant no-op response');
  update public.validation_participants set consent_mode=consent_mode,
    consent_purpose=consent_purpose,consent_captured_at=consent_captured_at where id=pid;
  result := public.validation_update_interview_relevance(own,sid,'target_segment_match','target_segment_match');
  result := public.validation_update_interview_session(own,sid,'in_progress','in_progress','C1 notes');
  perform pg_temp.b43_assert(result->>'notes'='C1 notes','session notes persisted through status no-op');
  result := public.validation_transition_experiment_version(own,eid,'running','running');
  perform pg_temp.b43_assert((select count(*)=n from public.validation_evidence_source_restrictions),'no-op created restriction');

  result := public.validation_update_participant_status(own,pid,'active','withdrawn');
  perform pg_temp.b43_assert(result->>'status'='withdrawn' and
    (select status='withdrawn' from public.validation_participants where id=pid),'withdrawal response and persisted state');
  perform pg_temp.b43_assert(exists(select 1 from public.validation_evidence_source_restrictions
    where reason_code='participant_withdrawn' and scope_id=pid and owner_id=own
      and contribution_observation_id='b0000000-0000-0000-0000-000000000001'),'withdrawal contribution restriction');
  -- INSERT must retain NEW, including identity and ingestion key, and capture
  -- the new contribution while the participant remains withdrawn.
  insert into public.validation_evidence_observations
    select (jsonb_populate_record(null::public.validation_evidence_observations,
      to_jsonb(o)||jsonb_build_object('id','b4300000-0000-0000-0000-000000000001',
        'ingestion_key','b43-c1-during-withdrawal'))).*
    from public.validation_evidence_observations o where o.id='b0000000-0000-0000-0000-000000000001';
  perform pg_temp.b43_assert(exists(select 1 from public.validation_evidence_source_restrictions
    where scope_id=pid and contribution_observation_id='b4300000-0000-0000-0000-000000000001'
      and reason_code='participant_withdrawn'),'INSERT while withdrawn');
  result := public.validation_update_participant_status(own,pid,'withdrawn','active');
  perform pg_temp.b43_assert(result->>'status'='active','restoration persisted');
  select count(*) into n from public.validation_evidence_source_restrictions;
  result := public.validation_update_participant_status(own,pid,'active','withdrawn');
  perform pg_temp.b43_assert((select count(*)=n from public.validation_evidence_source_restrictions),'repeated transition idempotency');
  result := public.validation_update_participant_status(own,pid,'withdrawn','archived');
  perform pg_temp.b43_assert(result->>'status'='archived' and
    (select count(*)=2 from public.validation_evidence_source_restrictions
      where reason_code='participant_archived' and scope_id=pid and owner_id=own),'archive and both contributions');
  result := public.validation_update_participant_status(own,pid,'archived','active');

  -- Each consent column independently fires the restriction capture. A nested
  -- subtransaction rolls back each case so deduplication cannot mask a miss.
  foreach mutation in array array[
    'consent_mode=''explicit''', 'consent_purpose=''C1 changed purpose''',
    'consent_captured_at=clock_timestamp()'] loop
    begin
      execute 'update public.validation_participants set '||mutation||' where id=$1' using pid;
      perform pg_temp.b43_assert((select count(*)=2 from public.validation_evidence_source_restrictions
        where reason_code='consent_metadata_changed' and scope_id=pid and owner_id=own),'individual consent capture');
      raise exception using errcode='ZX001';
    exception when sqlstate 'ZX001' then null;
    end;
    perform pg_temp.b43_assert(not exists(select 1 from public.validation_evidence_source_restrictions
      where reason_code='consent_metadata_changed' and scope_id=pid),'consent rollback');
  end loop;

  result := public.validation_update_interview_relevance(own,sid,'target_segment_match','adjacent_segment');
  perform pg_temp.b43_assert(result->>'participant_relevance'='adjacent_segment' and
    exists(select 1 from public.validation_evidence_source_restrictions where reason_code='session_relevance_lost' and scope_id=sid),'relevance loss');
  result := public.validation_update_interview_relevance(own,sid,'adjacent_segment','target_segment_match');
  perform pg_temp.b43_assert(exists(select 1 from public.validation_evidence_source_restrictions
    where reason_code='session_relevance_lost' and scope_id=sid),'relevance restoration retains restriction');
  result := public.validation_update_interview_session(own,sid,'in_progress','cancelled',null);
  perform pg_temp.b43_assert(result->>'status'='cancelled' and result->>'cancelled_at' is not null and
    (select status='cancelled' from public.validation_interview_sessions where id=sid) and
    exists(select 1 from public.validation_evidence_source_restrictions where reason_code='session_cancelled' and scope_id=sid),'session cancellation');
  begin
    perform public.validation_update_interview_session(own,sid,'cancelled','in_progress',null);
    raise exception 'B43 invariant failed' using errcode='ZC019';
  exception when check_violation then null;
  end;

  result := public.validation_transition_experiment_version(own,eid,'running','paused');
  perform pg_temp.b43_assert(result->>'lifecycle'='paused','pause persisted');
  result := public.validation_transition_experiment_version(own,eid,'paused','running');
  perform pg_temp.b43_assert(result->>'lifecycle'='running','resume persisted');
  begin
    result := public.validation_transition_experiment_version(own,eid,'running','completed');
    perform pg_temp.b43_assert(result->>'lifecycle'='completed' and result->>'completed_at' is not null and
      not exists(select 1 from public.validation_evidence_source_restrictions where reason_code='experiment_cancelled' and scope_id=eid),'completion without restriction');
    raise exception using errcode='ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  result := public.validation_transition_experiment_version(own,eid,'running','cancelled');
  perform pg_temp.b43_assert(result->>'lifecycle'='cancelled' and result->>'cancelled_at' is not null and
    (select lifecycle='cancelled' from public.validation_experiment_versions where id=eid) and
    exists(select 1 from public.validation_evidence_source_restrictions where reason_code='experiment_cancelled' and scope_id=eid),'experiment cancellation');
  begin
    perform public.validation_transition_experiment_version(own,eid,'cancelled','running');
    raise exception 'B43 invariant failed' using errcode='ZC020';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    perform public.validation_update_participant_status(own,pid,'withdrawn','active');
    raise exception 'B43 invariant failed' using errcode='ZC021';
  exception when serialization_failure then null;
  end;
end $$;
rollback;

-- Fault injection proves restriction failure rolls back the source mutation,
-- including values otherwise returned by the lifecycle command.
begin;
create function pg_temp.b43_fail_restriction() returns trigger language plpgsql as $$
begin raise exception 'C1 injected restriction failure' using errcode='23514'; end $$;
create trigger b43_c1_fail_restriction before insert on public.validation_evidence_source_restrictions
for each row execute function pg_temp.b43_fail_restriction();
do $$
declare
  command text;
  before_rows jsonb;
  after_rows jsonb;
  before_count bigint;
begin
  select jsonb_build_array(
    (select to_jsonb(p) from public.validation_participants p where id='90000000-0000-0000-0000-000000000001'),
    (select to_jsonb(s) from public.validation_interview_sessions s where id='a0000000-0000-0000-0000-000000000001'),
    (select to_jsonb(e) from public.validation_experiment_versions e where id='70000000-0000-0000-0000-000000000001')) into before_rows;
  select count(*) into before_count from public.validation_evidence_source_restrictions;
  foreach command in array array[
    'update public.validation_participants set status=''withdrawn'' where id=''90000000-0000-0000-0000-000000000001''',
    'update public.validation_participants set status=''archived'' where id=''90000000-0000-0000-0000-000000000001''',
    'update public.validation_participants set consent_purpose=''C1 failure'' where id=''90000000-0000-0000-0000-000000000001''',
    'update public.validation_interview_sessions set status=''cancelled'',cancelled_at=clock_timestamp() where id=''a0000000-0000-0000-0000-000000000001''',
    'update public.validation_interview_sessions set participant_relevance=''adjacent_segment'' where id=''a0000000-0000-0000-0000-000000000001''',
    'update public.validation_experiment_versions set lifecycle=''cancelled'',cancelled_at=clock_timestamp() where id=''70000000-0000-0000-0000-000000000001'''
  ] loop
    begin
      execute command;
      raise exception 'B43 invariant failed' using errcode='ZC022';
    exception when check_violation then
      if sqlerrm <> 'C1 injected restriction failure' then raise; end if;
    end;
    select jsonb_build_array(
      (select to_jsonb(p) from public.validation_participants p where id='90000000-0000-0000-0000-000000000001'),
      (select to_jsonb(s) from public.validation_interview_sessions s where id='a0000000-0000-0000-0000-000000000001'),
      (select to_jsonb(e) from public.validation_experiment_versions e where id='70000000-0000-0000-0000-000000000001')) into after_rows;
    if before_rows is distinct from after_rows or
      (select count(*) from public.validation_evidence_source_restrictions) <> before_count then
      raise exception 'B43 invariant failed' using errcode='ZC023';
    end if;
  end loop;
end $$;
rollback;
