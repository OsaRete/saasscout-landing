\set ON_ERROR_STOP on
begin;

insert into auth.users(id) values ('00000000-0000-4000-8000-00000000b311') on conflict do nothing;
insert into public.canonical_problems(id,canonical_key,canonical_title,normalized_title,status)
values ('10000000-0000-4000-8000-00000000b311','b31-invoice','Invoice Approval Bottleneck','invoice approval bottleneck','active'),
  ('10000000-0000-4000-8000-00000000b312','b31-other','Other Canonical Problem','other canonical problem','active');
insert into public.problem_aliases(canonical_problem_id,alias_text,normalized_alias,alias_type)
values ('10000000-0000-4000-8000-00000000b311','Invoice bottleneck','invoice bottleneck','title');
insert into public.validation_subjects(id,owner_id,creation_origin,label)
values ('20000000-0000-4000-8000-00000000b311','00000000-0000-4000-8000-00000000b311','user_entered','Invoice bottleneck');
insert into public.validation_hypotheses(id,owner_id,subject_id)
values ('30000000-0000-4000-8000-00000000b311','00000000-0000-4000-8000-00000000b311','20000000-0000-4000-8000-00000000b311');
insert into public.validation_hypothesis_versions(id,owner_id,subject_id,hypothesis_id,version_number,target_segment,problem_claim,expected_observable_behavior,support_criteria,contradiction_criteria,inconclusive_criteria)
values ('40000000-0000-4000-8000-00000000b311','00000000-0000-4000-8000-00000000b311','20000000-0000-4000-8000-00000000b311','30000000-0000-4000-8000-00000000b311',1,'Finance teams','Invoice Approval Bottleneck','Reports repeated delay','["delay"]','["no delay"]','["unknown"]');
insert into public.validation_experiments(id,owner_id,subject_id)
values ('50000000-0000-4000-8000-00000000b311','00000000-0000-4000-8000-00000000b311','20000000-0000-4000-8000-00000000b311');
insert into public.validation_experiment_versions(id,owner_id,subject_id,experiment_id,hypothesis_id,hypothesis_version_id,version_number,family,target_audience,collection_method,design_snapshot,consent_privacy_mode,lifecycle,started_at,completed_at)
values ('60000000-0000-4000-8000-00000000b311','00000000-0000-4000-8000-00000000b311','20000000-0000-4000-8000-00000000b311','50000000-0000-4000-8000-00000000b311','30000000-0000-4000-8000-00000000b311','40000000-0000-4000-8000-00000000b311',1,'customer_interview','["Finance teams"]','manual','{}','pseudonymous_notes','running',now()-interval '2 days',null);
insert into public.validation_participants(id,owner_id,experiment_id,identity_mode,status)
values ('70000000-0000-4000-8000-00000000b311','00000000-0000-4000-8000-00000000b311','50000000-0000-4000-8000-00000000b311','experiment_pseudonymous','active');
insert into public.validation_interview_plan_versions(id,owner_id,subject_id,experiment_id,experiment_version_id,version_number,questions)
values ('80000000-0000-4000-8000-00000000b311','00000000-0000-4000-8000-00000000b311','20000000-0000-4000-8000-00000000b311','50000000-0000-4000-8000-00000000b311','60000000-0000-4000-8000-00000000b311',1,'[{"prompt":"Tell me about invoice approvals"}]');
insert into public.validation_interview_sessions(id,owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,participant_id,interview_plan_version_id,status,participant_relevance,started_at,completed_at)
values ('90000000-0000-4000-8000-00000000b311','00000000-0000-4000-8000-00000000b311','20000000-0000-4000-8000-00000000b311','50000000-0000-4000-8000-00000000b311','60000000-0000-4000-8000-00000000b311','30000000-0000-4000-8000-00000000b311','40000000-0000-4000-8000-00000000b311','70000000-0000-4000-8000-00000000b311','80000000-0000-4000-8000-00000000b311','in_progress','target_segment_match',now()-interval '2 days',null);
insert into public.validation_evidence_observations(id,owner_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,participant_id,interview_session_id,origin,modality,observed_at,source_type,collected_by,observation_content)
values ('a0000000-0000-4000-8000-00000000b311','00000000-0000-4000-8000-00000000b311','20000000-0000-4000-8000-00000000b311','30000000-0000-4000-8000-00000000b311','40000000-0000-4000-8000-00000000b311','50000000-0000-4000-8000-00000000b311','60000000-0000-4000-8000-00000000b311','70000000-0000-4000-8000-00000000b311','90000000-0000-4000-8000-00000000b311','human_interview','interview_observation',now()-interval '1 day','customer_interview','manual','{"category":"problem_experienced","statementKind":"direct_quote","content":"PRIVATE RAW CONTENT"}');
insert into public.validation_evidence_classifications(id,owner_id,observation_id,polarity,classification_source,authority_status)
values ('b0000000-0000-4000-8000-00000000b311','00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b311','supporting','user_supplied','authoritative');
insert into public.validation_customer_interview_shareable_evidence(owner_id,source_observation_id,statement,statement_sha256,contract_version,review_confirmation)
values ('00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b311','Teams wait days for invoice approval.',encode(extensions.digest(convert_to('Teams wait days for invoice approval.','UTF8'),'sha256'),'hex'),'customer_interview_shareable_evidence_v1','human_reviewed_for_shared_evidence_use');

-- Historical observations remain nullable; invalid promoted polarity is rejected.
insert into public.problem_observations(observation_fingerprint,problem_title,normalized_problem_title) values ('b31:historical','Historical','historical');
do $$ begin
  if (select evidence_polarity from public.problem_observations where observation_fingerprint='b31:historical') is not null then raise exception 'historical polarity was not null'; end if;
  begin update public.problem_observations set evidence_polarity='neutral' where observation_fingerprint='b31:historical'; raise exception 'invalid polarity accepted'; exception when check_violation then null; end;
end $$;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='problem_observations_evidence_polarity_check') then raise exception 'polarity constraint missing'; end if;
  if not exists(select 1 from pg_constraint where conname='validation_promotions_result_canonical_fk') then raise exception 'composite canonical FK missing'; end if;
  if not exists(select 1 from pg_indexes where indexname='validation_promotions_one_result_uidx') then raise exception 'unique result index missing'; end if;
  if not exists(select 1 from pg_indexes where indexname='validation_promotions_one_final_group_uidx') then raise exception 'unique final group index missing'; end if;
end $$;
create temp table b31_boundary_counts(table_name text primary key,row_count bigint);
do $$ declare name text; amount bigint; begin
  foreach name in array array['canonical_problems','problem_aliases','canonical_bootstrap_activations','problem_intelligence','problem_evolution_snapshots','opportunities','recommendations','weekly_intelligence_runs'] loop
    if to_regclass('public.'||name) is not null then execute format('select count(*) from public.%I',name) into amount; insert into b31_boundary_counts values(name,amount); end if;
  end loop;
end $$;

-- Runtime privilege contract.
do $$ begin
  if has_function_privilege('public','public.validation_promote_customer_interview_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)','execute') then raise exception 'public can execute promotion'; end if;
  if has_function_privilege('anon','public.validation_promote_customer_interview_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)','execute') then raise exception 'anon can execute promotion'; end if;
  if has_function_privilege('authenticated','public.validation_promote_customer_interview_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)','execute') then raise exception 'authenticated can execute promotion'; end if;
  if not has_function_privilege('service_role','public.validation_promote_customer_interview_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)','execute') then raise exception 'service role cannot execute promotion'; end if;
end $$;

set local role service_role;
do $$ declare snapshot jsonb; first_result jsonb; retry_result jsonb; begin
  snapshot:=public.validation_promotion_authority_rows_v1('00000000-0000-4000-8000-00000000b311','70000000-0000-4000-8000-00000000b311');
  first_result:=public.validation_promote_customer_interview_v1('00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b311','b0000000-0000-4000-8000-00000000b311','10000000-0000-4000-8000-00000000b311','Invoice bottleneck','Invoice Approval Bottleneck','supporting',snapshot);
  retry_result:=public.validation_promote_customer_interview_v1('00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b311','b0000000-0000-4000-8000-00000000b311','10000000-0000-4000-8000-00000000b311','Invoice bottleneck','Invoice Approval Bottleneck','supporting',snapshot);
  if first_result->>'problemObservationId' is distinct from retry_result->>'problemObservationId' or retry_result->>'alreadyPromoted'<>'true' then raise exception 'retry was not idempotent'; end if;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.validation_evidence_promotions where observation_id='a0000000-0000-4000-8000-00000000b311')<>1 then raise exception 'ledger count mismatch'; end if;
  if (select count(*) from public.problem_observations where source_type='validation_customer_interview_promotion_v1')<>1 then raise exception 'shared count mismatch'; end if;
  if exists(select 1 from public.problem_observations where source_type='validation_customer_interview_promotion_v1' and
    (canonical_problem_id<>'10000000-0000-4000-8000-00000000b311' or evidence_polarity<>'supporting' or source_evidence<>'Teams wait days for invoice approval.' or problem_summary<>'Teams wait days for invoice approval.' or source_row_id is not null or source_author_id is not null or metadata<>'{}'::jsonb or source_evidence like '%PRIVATE%')) then raise exception 'projection mismatch or privacy leak'; end if;
end $$;

-- Failure injection proves either insert failure rolls the entire RPC back.
insert into public.validation_participants(id,owner_id,experiment_id,identity_mode,status)
values ('70000000-0000-4000-8000-00000000b312','00000000-0000-4000-8000-00000000b311','50000000-0000-4000-8000-00000000b311','experiment_pseudonymous','active');
insert into public.validation_interview_sessions(id,owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,participant_id,interview_plan_version_id,status,participant_relevance,started_at,completed_at)
values ('90000000-0000-4000-8000-00000000b312','00000000-0000-4000-8000-00000000b311','20000000-0000-4000-8000-00000000b311','50000000-0000-4000-8000-00000000b311','60000000-0000-4000-8000-00000000b311','30000000-0000-4000-8000-00000000b311','40000000-0000-4000-8000-00000000b311','70000000-0000-4000-8000-00000000b312','80000000-0000-4000-8000-00000000b311','in_progress','target_segment_match',now()-interval '2 days',null);
insert into public.validation_evidence_observations(id,owner_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,participant_id,interview_session_id,origin,modality,observed_at,source_type,collected_by,observation_content)
values ('a0000000-0000-4000-8000-00000000b312','00000000-0000-4000-8000-00000000b311','20000000-0000-4000-8000-00000000b311','30000000-0000-4000-8000-00000000b311','40000000-0000-4000-8000-00000000b311','50000000-0000-4000-8000-00000000b311','60000000-0000-4000-8000-00000000b311','70000000-0000-4000-8000-00000000b312','90000000-0000-4000-8000-00000000b312','human_interview','interview_observation',now()-interval '1 day','customer_interview','manual','{"category":"problem_experienced","statementKind":"direct_quote","content":"SECOND PRIVATE RAW CONTENT"}');
insert into public.validation_evidence_classifications(id,owner_id,observation_id,polarity,classification_source,authority_status)
values ('b0000000-0000-4000-8000-00000000b313','00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b312','supporting','user_supplied','authoritative');
insert into public.validation_customer_interview_shareable_evidence(owner_id,source_observation_id,statement,statement_sha256,contract_version,review_confirmation)
values ('00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b312','Second approved statement.',encode(extensions.digest(convert_to('Second approved statement.','UTF8'),'sha256'),'hex'),'customer_interview_shareable_evidence_v1','human_reviewed_for_shared_evidence_use');
create function pg_temp.reject_b31_ledger() returns trigger language plpgsql as $$ begin raise exception 'forced ledger failure' using errcode='P0001'; end $$;
create trigger b31_force_ledger_failure before insert on public.validation_evidence_promotions for each row execute function pg_temp.reject_b31_ledger();
do $$ declare snapshot jsonb; begin
  snapshot:=public.validation_promotion_authority_rows_v1('00000000-0000-4000-8000-00000000b311','70000000-0000-4000-8000-00000000b312');
  begin perform public.validation_promote_customer_interview_v1('00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b312','b0000000-0000-4000-8000-00000000b313','10000000-0000-4000-8000-00000000b311','Invoice bottleneck','Invoice Approval Bottleneck','supporting',snapshot); raise exception 'forced ledger failure was accepted'; exception when raise_exception then if sqlerrm<>'forced ledger failure' then raise; end if; end;
  if exists(select 1 from public.problem_observations where source_evidence='Second approved statement.') or exists(select 1 from public.validation_evidence_promotions where observation_id='a0000000-0000-4000-8000-00000000b312') then raise exception 'ledger failure left partial state'; end if;
end $$;
drop trigger b31_force_ledger_failure on public.validation_evidence_promotions;

create function pg_temp.reject_b31_observation() returns trigger language plpgsql as $$ begin raise exception 'forced observation failure' using errcode='P0001'; end $$;
create trigger b31_force_observation_failure before insert on public.problem_observations for each row execute function pg_temp.reject_b31_observation();
do $$ declare snapshot jsonb; begin
  snapshot:=public.validation_promotion_authority_rows_v1('00000000-0000-4000-8000-00000000b311','70000000-0000-4000-8000-00000000b312');
  begin perform public.validation_promote_customer_interview_v1('00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b312','b0000000-0000-4000-8000-00000000b313','10000000-0000-4000-8000-00000000b311','Invoice bottleneck','Invoice Approval Bottleneck','supporting',snapshot); raise exception 'forced observation failure was accepted'; exception when raise_exception then if sqlerrm<>'forced observation failure' then raise; end if; end;
  if exists(select 1 from public.validation_evidence_promotions where observation_id='a0000000-0000-4000-8000-00000000b312') then raise exception 'observation failure created ledger'; end if;
end $$;
drop trigger b31_force_observation_failure on public.problem_observations;

-- Changed classification (same or different polarity) and canonical authority are explicitly final.
insert into public.validation_evidence_classifications(id,owner_id,observation_id,polarity,classification_source,authority_status,supersedes_classification_id)
values ('b0000000-0000-4000-8000-00000000b312','00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b311','supporting','user_supplied','authoritative','b0000000-0000-4000-8000-00000000b311');
do $$ declare snapshot jsonb; begin
  snapshot:=public.validation_promotion_authority_rows_v1('00000000-0000-4000-8000-00000000b311','70000000-0000-4000-8000-00000000b311');
  begin perform public.validation_promote_customer_interview_v1('00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b311','b0000000-0000-4000-8000-00000000b312','10000000-0000-4000-8000-00000000b311','Invoice bottleneck','Invoice Approval Bottleneck','supporting',snapshot); raise exception 'same-polarity re-promotion accepted'; exception when raise_exception then if sqlerrm<>'promotion_correction_required' then raise; end if; end;
end $$;
insert into public.validation_evidence_classifications(id,owner_id,observation_id,polarity,classification_source,authority_status,supersedes_classification_id)
values ('b0000000-0000-4000-8000-00000000b314','00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b311','mixed','user_supplied','authoritative','b0000000-0000-4000-8000-00000000b312');
do $$ declare snapshot jsonb; begin
  snapshot:=public.validation_promotion_authority_rows_v1('00000000-0000-4000-8000-00000000b311','70000000-0000-4000-8000-00000000b311');
  begin perform public.validation_promote_customer_interview_v1('00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b311','b0000000-0000-4000-8000-00000000b314','10000000-0000-4000-8000-00000000b311','Invoice bottleneck','Invoice Approval Bottleneck','mixed',snapshot); raise exception 'different-polarity re-promotion accepted'; exception when raise_exception then if sqlerrm<>'promotion_correction_required' then raise; end if; end;
  begin perform public.validation_promote_customer_interview_v1('00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b311','b0000000-0000-4000-8000-00000000b314','10000000-0000-4000-8000-00000000b312','Invoice bottleneck','Invoice Approval Bottleneck','mixed',snapshot); raise exception 'canonical-change re-promotion accepted'; exception when raise_exception then if sqlerrm<>'promotion_correction_required' then raise; end if; end;
  if (select count(*) from public.validation_evidence_promotions where observation_id='a0000000-0000-4000-8000-00000000b311')<>1 or (select count(*) from public.problem_observations where source_type='validation_customer_interview_promotion_v1')<>1 then raise exception 're-promotion duplicated state'; end if;
end $$;
alter table public.validation_customer_interview_shareable_evidence disable trigger validation_interview_shareable_append_only;
update public.validation_customer_interview_shareable_evidence set statement='Changed approved projection.',statement_sha256=encode(extensions.digest(convert_to('Changed approved projection.','UTF8'),'sha256'),'hex') where source_observation_id='a0000000-0000-4000-8000-00000000b311';
alter table public.validation_customer_interview_shareable_evidence enable trigger validation_interview_shareable_append_only;
do $$ declare snapshot jsonb; begin
  snapshot:=public.validation_promotion_authority_rows_v1('00000000-0000-4000-8000-00000000b311','70000000-0000-4000-8000-00000000b311');
  begin perform public.validation_promote_customer_interview_v1('00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b311','b0000000-0000-4000-8000-00000000b314','10000000-0000-4000-8000-00000000b311','Invoice bottleneck','Invoice Approval Bottleneck','mixed',snapshot); raise exception 'changed projection accepted'; exception when raise_exception then if sqlerrm<>'promotion_correction_required' then raise; end if; end;
end $$;

do $$ declare item record; amount bigint; begin
  for item in select * from b31_boundary_counts loop execute format('select count(*) from public.%I',item.table_name) into amount; if amount<>item.row_count then raise exception 'downstream/canonical boundary changed: %',item.table_name; end if; end loop;
end $$;

rollback;
