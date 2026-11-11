-- Runs inside the disposable runner's transaction with B3.1 relational fixtures.
create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'repair assertion: %',label; end if; end $$;
create function pg_temp.denied(command text, expected text default '42501') returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if sqlstate=expected then return; end if;
    raise exception 'unexpected SQLSTATE %, expected %',sqlstate,expected;
  end;
  raise exception 'unauthorized command succeeded';
end $$;

-- Real runtime-role calls, never a SECURITY DEFINER test wrapper.
set local role service_role;
select pg_temp.denied('select * from public.validation_customer_interview_shareable_evidence');
select pg_temp.denied('select * from public.validation_evidence_promotions');
select pg_temp.denied('select * from public.validation_qualified_evidence_snapshots');
select pg_temp.denied('select public.validation_b31_authority_snapshot(null,null)');
select pg_temp.denied('select public.validation_b31_representative_state(null,null)');
select pg_temp.denied('select public.validation_b42_protected_schema()');
select pg_temp.denied('select public.validation_b43_read_current_evidence(null)');
select pg_temp.denied('select public.validation_promote_customer_interview_evidence(null,null,null,null,null,null,null,null,null,null,null,null,null,null)');
select pg_temp.denied($q$select public.validation_record_interview_observation_v2(null,null,now(),'{}',null,'shared',true)$q$);
select pg_temp.denied($q$select public.validation_record_interview_observation_v2(null,null,now(),'{}',null,'',false)$q$);
select pg_temp.denied($q$select public.validation_record_interview_observation_v2(null,null,now(),'{}',null,null,null)$q$);

-- Private capture and exact retry work despite revoked shared-table SELECT.
select public.validation_record_interview_observation_v2(
 '10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
 '2026-11-01T00:00:00Z','{"private":"capture"}','pr2-private');
select pg_temp.check_true((public.validation_record_interview_observation_v2(
 '10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
 '2026-11-01T00:00:00Z','{"private":"capture"}','pr2-private')->>'duplicate')::boolean,'private retry');
select pg_temp.denied($q$select public.validation_record_interview_observation_v2(
 '10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001',now(),'{}',null)$q$,'P0002');
select pg_temp.denied($q$select public.validation_record_interview_observation_v2(
 '10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
 '2026-11-01T00:00:00Z','{"private":"changed"}','pr2-private')$q$,'23505');

select public.validation_update_participant_status(
 '10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','active','withdrawn');
select pg_temp.check_true((select status='withdrawn' from public.validation_participants where id='90000000-0000-0000-0000-000000000001'),'withdraw persisted');
select public.validation_update_participant_status(
 '10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','withdrawn','active');
update public.validation_participants set consent_mode='explicit',consent_purpose='private study',consent_captured_at='2026-11-01'
 where id='90000000-0000-0000-0000-000000000001';
select pg_temp.check_true((select (status,consent_mode,consent_purpose,consent_captured_at)=('active','explicit','private study','2026-11-01'::timestamptz) from public.validation_participants where id='90000000-0000-0000-0000-000000000001'),'restore and complete consent tuple persisted');
select pg_temp.denied($q$select public.validation_update_participant_status(
 '10000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000001','active','archived')$q$,'40001');
select public.validation_update_interview_relevance(
 '10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','target_segment_match','adjacent_segment');
select pg_temp.check_true((select participant_relevance='adjacent_segment' from public.validation_interview_sessions where id='a0000000-0000-0000-0000-000000000002'),'relevance persisted');
select public.validation_update_interview_session(
 '10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','in_progress','cancelled','private notes');
select pg_temp.check_true((select status='cancelled' and cancelled_at is not null and notes='private notes' from public.validation_interview_sessions where id='a0000000-0000-0000-0000-000000000002'),'session tuple persisted');
select pg_temp.denied($q$update public.validation_interview_sessions set status='in_progress' where id='a0000000-0000-0000-0000-000000000002'$q$,'23514');
select public.validation_transition_experiment_version(
 '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','running','paused');
select pg_temp.check_true((select lifecycle='paused' and started_at is not null from public.validation_experiment_versions where id='70000000-0000-0000-0000-000000000001'),'pause persisted');
select public.validation_transition_experiment_version(
 '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','paused','completed');
select pg_temp.check_true((select lifecycle='completed' and completed_at is not null from public.validation_experiment_versions where id='70000000-0000-0000-0000-000000000001'),'completion tuple persisted');
select pg_temp.denied($q$update public.validation_experiment_versions set lifecycle='running' where id='70000000-0000-0000-0000-000000000001'$q$,'55000');
select pg_temp.denied($q$update public.validation_evidence_observations set observation_content='{}' where id='b0000000-0000-0000-0000-000000000001'$q$,'55000');
select pg_temp.denied($q$update public.validation_evidence_classifications set polarity='mixed' where id='c0000000-0000-0000-0000-000000000001'$q$,'55000');
select pg_temp.denied($q$update public.problem_observations set source_evidence='changed' where id in (select problem_observation_id from public.validation_evidence_promotions)$q$);
reset role;
select pg_temp.denied($q$update public.problem_observations set source_evidence='changed' where id in (select problem_observation_id from public.validation_evidence_promotions)$q$,'55000');
select pg_temp.denied($q$update public.validation_qualified_evidence_snapshots set problem_title='changed'$q$,'55000');

-- Exact safety facts remain permanent after source restoration.
select pg_temp.check_true((select count(*)=2 from public.validation_evidence_source_restrictions
 where scope_id='90000000-0000-0000-0000-000000000001' and reason_code='participant_withdrawn'),'withdraw restrictions bind both preexisting observations');
select pg_temp.check_true((select count(*)=2 from public.validation_evidence_source_restrictions
 where scope_id='90000000-0000-0000-0000-000000000001' and reason_code='consent_metadata_changed'),'consent restrictions persisted');
select pg_temp.check_true((select count(*)=2 from public.validation_evidence_source_restrictions
 where scope_id='a0000000-0000-0000-0000-000000000002' and reason_code in ('session_cancelled','session_relevance_lost')),'session restrictions persisted');
select pg_temp.check_true(not exists(select 1 from public.validation_evidence_source_restrictions where reason_code='experiment_cancelled'),'completion alone creates no restriction');

-- Private Survey DML and experiment cancellation use the same persisted guard.
set local role service_role;
insert into public.validation_experiments(id,owner_id,subject_id) values
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
insert into public.validation_experiment_versions(id,owner_id,subject_id,experiment_id,hypothesis_id,hypothesis_version_id,
 version_number,family,target_audience,collection_method,design_snapshot,consent_privacy_mode,lifecycle,started_at)
 select '70000000-0000-0000-0000-000000000002',owner_id,subject_id,'60000000-0000-0000-0000-000000000002',hypothesis_id,hypothesis_version_id,
 1,'survey',target_audience,'survey',design_snapshot,consent_privacy_mode,'running',started_at
 from public.validation_experiment_versions where id='70000000-0000-0000-0000-000000000001';
select public.validation_transition_experiment_version(
 '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','running','cancelled');
select pg_temp.check_true((select lifecycle='cancelled' and cancelled_at is not null from public.validation_experiment_versions
 where id='70000000-0000-0000-0000-000000000002'),'private survey cancellation persisted');
reset role;
select pg_temp.check_true((select count(*)=1 from public.validation_evidence_source_restrictions where reason_code='experiment_cancelled'
 and scope_id='70000000-0000-0000-0000-000000000002'),'cancellation restriction persisted');

-- Failure to persist a restriction must roll back its initiating source update.
create function pg_temp.fail_restriction() returns trigger language plpgsql as $$ begin raise exception 'injected' using errcode='23514'; end $$;
create trigger pr2_fault before insert on public.validation_evidence_source_restrictions for each row execute function pg_temp.fail_restriction();
set local role service_role;
select pg_temp.denied($q$update public.validation_participants set status='archived' where id='90000000-0000-0000-0000-000000000003'$q$,'23514');
reset role;
select pg_temp.check_true((select status='active' from public.validation_participants where id='90000000-0000-0000-0000-000000000003'),'restriction failure rolls back source');
drop trigger pr2_fault on public.validation_evidence_source_restrictions;

-- All inherited/direct function and table access, including write/truncate, denied.
do $$ declare r text; t text; p record; priv text; begin
 foreach r in array array['anon','authenticated','service_role','authenticator'] loop
  foreach t in array array['validation_customer_interview_shareable_evidence','validation_evidence_promotions','validation_qualified_evidence_snapshots','validation_evidence_consumption_authority','validation_evidence_source_restrictions'] loop
   foreach priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    perform pg_temp.check_true(not has_table_privilege(r,'public.'||t,priv),r||' '||t||' '||priv);
   end loop;
  end loop;
  for p in select oid,proname from pg_proc where pronamespace='public'::regnamespace and
   (proname in ('validation_promote_customer_interview_evidence','validation_b31_authority_snapshot','validation_b31_representative_state') or proname like 'validation_b42_%' or proname like 'validation_b43_%') loop
   perform pg_temp.check_true(not has_function_privilege(r,p.oid,'EXECUTE'),r||' function '||p.proname);
  end loop;
 end loop;
end $$;
set local role authenticated;
select pg_temp.denied('select * from public.validation_evidence_promotions');
select pg_temp.denied('update public.validation_participants set status=''archived''');
select pg_temp.denied('select public.validation_record_interview_observation_v2(null,null,now(),''{}'',null)');
select pg_temp.check_true((select count(*)=0 from public.validation_subjects),'cross-owner RLS hides roots');
reset role;
select pg_temp.check_true((select bool_and(public.validation_b42_snapshot_verified(p)) from public.validation_evidence_promotions p),'historical native proofs still intact');
