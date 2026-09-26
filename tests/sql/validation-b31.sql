set statement_timeout='8s'; set deadlock_timeout='100ms';
insert into auth.users(id) values('10000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into public.canonical_problems(id,canonical_key,canonical_title,normalized_title,status) values('20000000-0000-0000-0000-000000000001','slow-reports','Slow reports','slow reports','active');
insert into public.validation_subjects(id,owner_id,creation_origin,label) values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','user_entered','Slow reports');
insert into public.validation_hypotheses(id,owner_id,subject_id,status) values('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','active');
insert into public.validation_hypothesis_versions(id,owner_id,subject_id,hypothesis_id,version_number,target_segment,problem_claim,expected_observable_behavior,support_criteria,contradiction_criteria,inconclusive_criteria)
values('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,'operators','Slow reports','describe delays','["yes"]','["no"]','["unknown"]');
insert into public.validation_experiments(id,owner_id,subject_id) values('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
insert into public.validation_experiment_versions(id,owner_id,subject_id,experiment_id,hypothesis_id,hypothesis_version_id,version_number,family,target_audience,collection_method,design_snapshot,consent_privacy_mode,lifecycle,started_at)
values('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',1,'customer_interview','["operators"]','interview','{}','pseudonymous_notes','running',now());
insert into public.validation_interview_plan_versions(id,owner_id,subject_id,experiment_id,experiment_version_id,version_number,questions)
values('80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',1,'[{"prompt":"Tell me"}]');
insert into public.validation_participants(id,owner_id,experiment_id,identity_mode,status)
select ('90000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','experiment_pseudonymous','active' from generate_series(1,14)i;
insert into public.validation_interview_sessions(id,owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,participant_id,interview_plan_version_id,status,participant_relevance,started_at)
select ('a0000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',('90000000-0000-0000-0000-'||lpad(least(i,14)::text,12,'0'))::uuid,'80000000-0000-0000-0000-000000000001','in_progress','target_segment_match',now() from generate_series(1,15)i;
insert into public.validation_evidence_observations(id,owner_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,participant_id,interview_session_id,origin,modality,observed_at,source_type,collected_by,observation_content,independence_relationship)
select ('b0000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',('90000000-0000-0000-0000-'||lpad(least(i,14)::text,12,'0'))::uuid,('a0000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'human_interview','interview_observation',now(),'customer_interview','manual',jsonb_build_object('content','PRIVATE RAW '||i,'statementKind','summary'),'independent' from generate_series(1,15)i;
insert into public.validation_evidence_classifications(id,owner_id,observation_id,polarity,classification_source,authority_status)
select ('c0000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001',('b0000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,case i when 2 then 'contradicting' when 3 then 'mixed' else 'supporting' end,'user_supplied','authoritative' from generate_series(1,15)i;
insert into public.validation_customer_interview_shareable_evidence(owner_id,source_observation_id,statement,statement_sha256,contract_version,review_confirmation)
select '10000000-0000-0000-0000-000000000001',('b0000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'Approved statement '||i,encode(extensions.digest(convert_to('Approved statement '||i,'UTF8'),'sha256'),'hex'),'customer_interview_shareable_evidence_v1','human_reviewed_for_shared_evidence_use' from generate_series(1,15)i where i<>4;
create function public.b31_test_promote(i integer,pol text,fp text) returns jsonb language sql as $$
 select public.validation_promote_customer_interview_evidence('10000000-0000-0000-0000-000000000001',('b0000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,('c0000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'20000000-0000-0000-0000-000000000001',pol,'participant:test:'||i,fp,public.validation_b31_authority_snapshot('30000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'),'Slow reports','slow reports','v8-b1.2','v8-b3.0.2-exact.1','v8-b3.1-projection.1'); $$;
-- B31_FIXTURE_SETUP_END (machine-readable boundary consumed by the DB concurrency runner)

-- Static integration assertions: grants, supported polarities, privacy, idempotency, rollback and boundaries.
do $$begin
 if has_function_privilege('anon','public.validation_promote_customer_interview_evidence(uuid,uuid,uuid,uuid,text,text,text,jsonb,text,text,text,text,text)','execute') or has_function_privilege('authenticated','public.validation_promote_customer_interview_evidence(uuid,uuid,uuid,uuid,text,text,text,jsonb,text,text,text,text,text)','execute') then raise exception 'browser promotion grant';end if;
 if not has_function_privilege('service_role','public.validation_promote_customer_interview_evidence(uuid,uuid,uuid,uuid,text,text,text,jsonb,text,text,text,text,text)','execute') then raise exception 'service role missing promotion grant';end if;
end$$;
select public.b31_test_promote(5,'supporting',repeat('5',64));
select public.validation_insert_classification('10000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000005','supporting','user_supplied','authoritative',null,'c0000000-0000-0000-0000-000000000005');
do $$begin begin perform public.validation_promote_customer_interview_evidence('10000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000005',(select id from public.validation_evidence_classifications where supersedes_classification_id='c0000000-0000-0000-0000-000000000005'),'20000000-0000-0000-0000-000000000001','supporting','changed-classification',repeat('a',64),public.validation_b31_authority_snapshot('30000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'),'Slow reports','slow reports','v8-b1.2','v8-b3.0.2-exact.1','v8-b3.1-projection.1');raise exception 'supersession duplicated source';exception when raise_exception then if sqlerrm not like 'promotion correction required%' then raise;end if;end;end$$;
select public.b31_test_promote(6,'supporting',repeat('6',64));
select public.validation_insert_classification('10000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000006','contradicting','user_supplied','authoritative',null,'c0000000-0000-0000-0000-000000000006');
do $$begin if (select count(*) from public.validation_evidence_promotions where observation_id in ('b0000000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000006'))<>2 then raise exception 'classification finality failed';end if;end$$;
select public.b31_test_promote(1,'supporting',repeat('1',64));select public.b31_test_promote(2,'contradicting',repeat('2',64));select public.b31_test_promote(3,'mixed',repeat('3',64));
do $$declare before_count int;begin
 if (select count(*) from public.problem_observations where source_type='customer_interview_human_reviewed')<>5 then raise exception 'polarity promotions missing';end if;
 if exists(select 1 from public.problem_observations where source_evidence like '%PRIVATE RAW%' or source_author_id is not null or source_row_id is not null) then raise exception 'private projection leak';end if;
 if (select count(*) from public.validation_evidence_promotions where problem_observation_id is not null)<>5 then raise exception 'private ledger mismatch';end if;
 select count(*) into before_count from public.problem_observations;begin perform public.b31_test_promote(4,'supporting',repeat('4',64));raise exception 'missing shareable accepted';exception when check_violation then null;end;if (select count(*) from public.problem_observations)<>before_count then raise exception 'atomic rollback failed';end if;
 if (select public.b31_test_promote(1,'supporting',repeat('1',64))->>'duplicate')<>'true' then raise exception 'exact retry not reused';end if;
end$$;
-- No promotion may create canonical or downstream records.
do $$begin
 if (select count(*) from public.canonical_problems)<>1 or (select count(*) from public.problem_aliases)<>0 then raise exception 'canonical mutation';end if;
 if (select count(*) from public.problem_evolution_snapshots)<>0 or (select count(*) from public.opportunities)<>0 then raise exception 'downstream mutation';end if;
end$$;
