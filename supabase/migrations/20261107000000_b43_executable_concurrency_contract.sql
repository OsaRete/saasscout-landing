-- B4.3-F4-B2.2: proposed, unapplied. No historical evidence rewrite/activation.
-- PostgreSQL 17; application contract: one allowlisted PostgREST RPC/transaction.
-- Quiescent maintenance only. This does not sandbox arbitrary privileged SQL.
begin;
set local search_path = pg_catalog, pg_temp;

create temporary table b43_expected_functions(signature text primary key, body_md5 text not null) on commit drop;
insert into pg_temp.b43_expected_functions values
    ('public.validation_reject_change()','ab50ecd68406168df5365fc3a41dcd81'),
    ('public.validation_guard_experiment_version_update()','4acef2710abe342878314879094458b5'),
    ('public.validation_guard_evidence_participant_scope()','652660eb5afbc0ac8a963f6044a5aed0'),
    ('public.validation_guard_subject_update()','e6d326d7f79b1c705f7a079bbe0c7ffd'),
    ('public.validation_create_subject(uuid,text,text,jsonb,text,text,text,jsonb)','a3b8a7fb96dc8f621d81275ac4945155'),
    ('public.validation_create_hypothesis(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)','3e4c5ce15744af4351493a7223001724'),
    ('public.validation_append_hypothesis_version(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)','80fdb8e625b08f1fc99915049eefb062'),
    ('public.validation_create_experiment(uuid,uuid,uuid,text,jsonb,text,jsonb,jsonb,text,uuid)','b9f9742f57d5862f0fc7c31dc0da0eff'),
    ('public.validation_append_experiment_version(uuid,uuid,uuid,text,jsonb,text,jsonb,jsonb,text,uuid)','0c4129a0c84e9cb93f34051edbc73814'),
    ('public.validation_transition_experiment_version(uuid,uuid,text,text)','c9e8d7438970769e833fae94d1bc4d8a'),
    ('public.validation_record_observation(uuid,uuid,uuid,text,text,text,timestamptz,text,text,text,jsonb,text,text,text,text,boolean)','2652339c07c8f314908b11c0693d0e09'),
    ('public.validation_protect_interview_history()','a07ef3146b29b391ef611d476e85253e'),
    ('public.validation_create_interview_plan(uuid,uuid,jsonb,uuid)','ea47cff50273f9cd38382c9e45b9782b'),
    ('public.validation_create_interview_session(uuid,uuid,uuid,uuid,text)','b5d9d607bb0a94ba0f203b2a7d6efb01'),
    ('public.validation_update_interview_session(uuid,uuid,text,text,text)','5d43690462ed6343f30926e75a2b1936'),
    ('public.validation_record_interview_observation(uuid,uuid,timestamptz,jsonb,text)','421b9a3edcf433823087ddb215678f24'),
    ('public.validation_protect_survey_history()','d5e60302d5edac37064f68eaef845df1'),
    ('public.validation_guard_survey_publication()','a6b1a01ce40ca8d7365a8af4c635f0b6'),
    ('public.validation_create_survey_plan(uuid,uuid,text,text,jsonb,uuid)','41363c5e1aa2516c8dda6c908a4323f7'),
    ('public.validation_publish_survey(uuid,uuid,text)','0b8b42cd8f960f08f96d17095a3e74ca'),
    ('public.validation_revoke_survey(uuid,uuid)','fa50b2cb4ab2633a9d749a886fc7821d'),
    ('public.validation_submit_public_survey(text,text,text,jsonb)','3904cd34f16557964883484edf8a8329'),
    ('public.validation_protect_intelligence_history()','96cc6a05cb2247c6ff7ed9aebf710b99'),
    ('public.validation_claim_intelligence_run(uuid,uuid,uuid,uuid,jsonb,text,text,text)','d4fb737dde6e3c379ac26c69fbd35ec4'),
    ('public.validation_complete_intelligence_run(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)','86a50f61a01ad1ffdd2fdca017597125'),
    ('public.validation_fail_intelligence_run(uuid,uuid,text)','5ca9453c1df3e5604261cac73cbfb598'),
    ('public.apply_canonical_bootstrap_activation(text,jsonb)','39ca78fca291c5269cd33cf8bb09d60f'),
    ('public.validation_record_interview_observation_v2(uuid,uuid,timestamptz,jsonb,text,text,boolean)','ec9d7d3c8b3167f5b7175145d349514d'),
    ('public.validation_b31_lock(text,text)','dd56c9258dd35557b0d48f56ac0f0ed1'),
    ('public.validation_b31_lock_registry_statement()','17656c17e332d0c98439bb261bd63768'),
    ('public.validation_b31_authority_snapshot(uuid,uuid)','48451956b2b6dc828d03fd196da7ccef'),
    ('public.validation_b31_representative_state(uuid,uuid)','8a5e20fb69a2eb6dca6f37525a785140'),
    ('public.validation_promote_customer_interview_evidence(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,text,text,text,text)','97d2d35185a295b5035ddff7f2c8d0ab'),
    ('public.validation_update_interview_relevance(uuid,uuid,text,text)','bbf189f63f18d835ffee14f1a304332d'),
    ('public.validation_update_participant_status(uuid,uuid,text,text)','66dc7284b3fe0b46491bbaaa5f4a7428'),
    ('public.validation_insert_classification(uuid,uuid,text,text,text,text,uuid)','ffb7c2bfbbc1eab9dc5268c32fec78df'),
    ('public.validation_b31_coordinate_observation_insert()','fbfd716a5be5a128be81b9f05c56dedb'),
    ('public.validation_b31_coordinate_classification_insert()','31a389d590280a74239da97bc382b8f1'),
    ('public.validation_b42_guard_attested_observation()','0db2d419fa732476da7c1dd39b6498c9'),
    ('public.validation_b42_row_record(public.problem_observations)','8e16a9929f66429f2414dadd577629db'),
    ('public.validation_b42_protected_schema()','2042b5463dfd86cecc757d5bca112449'),
    ('public.validation_b42_snapshot_verified(public.validation_evidence_promotions)','76732dd1b40a2177c54b8af8d0d8563e'),
    ('public.validation_b43_reject_fact_change()','8d9feaa4fe7d40878fe6c0776ec788c6'),
    ('public.validation_b43_capture_new_promotion_authority()','589a2f5b5aef80ac4c7d3a3502dda93b'),
    ('public.validation_b43_insert_restriction(text,text,uuid,uuid,uuid)','ed73d662a70ef8413fa84afdd48b2c70'),
    ('public.validation_b43_lock_source_change()','8e9faeb36881ea209200ebc46106c20b'),
    ('public.validation_b43_capture_participant_restrictions()','8b3384c03016b9082e175239174ec46e'),
    ('public.validation_b43_restrict_observation_during_nonactive_participant()','4558e34d09ecb21deb95df2f68adb716'),
    ('public.validation_b43_capture_session_restrictions()','cafda7abba971c644f3ec75eb0c3e15d'),
    ('public.validation_b43_capture_experiment_restriction()','433a2093548248f2502444dc3e35ca40'),
    ('public.validation_b43_capture_classification_restriction()','46921e78d4ba759701c2741ea569fda5'),
    ('public.validation_b43_capture_canonical_restriction()','babea63e4ec9f3eab94534c1419bd14f'),
    ('public.validation_b43_read_current_evidence(uuid)','6603f0b3d11eb764ea06e8db27058b39');
create temporary table b43_expected_triggers(relation_name text, trigger_name text, event_bits smallint,
  function_name text, columns_csv text, primary key(relation_name,trigger_name)) on commit drop;
insert into pg_temp.b43_expected_triggers values
    ('validation_hypothesis_versions','validation_hypothesis_versions_append_only','27','public.validation_reject_change()',''),
    ('validation_subject_links','validation_subject_links_append_only','27','public.validation_reject_change()',''),
    ('validation_evidence_observations','validation_evidence_observations_append_only','27','public.validation_reject_change()',''),
    ('validation_evidence_observations','validation_evidence_participant_scope','23','public.validation_guard_evidence_participant_scope()',''),
    ('validation_evidence_classifications','validation_evidence_classifications_append_only','27','public.validation_reject_change()',''),
    ('validation_experiment_versions','validation_experiment_versions_guard','19','public.validation_guard_experiment_version_update()',''),
    ('validation_experiment_versions','validation_experiment_versions_no_delete','11','public.validation_reject_change()',''),
    ('validation_subjects','validation_subjects_guard','19','public.validation_guard_subject_update()',''),
    ('validation_subjects','validation_subjects_no_delete','11','public.validation_reject_change()',''),
    ('validation_hypotheses','validation_hypotheses_no_delete','11','public.validation_reject_change()',''),
    ('validation_experiments','validation_experiments_no_delete','11','public.validation_reject_change()',''),
    ('validation_participants','validation_participants_no_delete','11','public.validation_reject_change()',''),
    ('validation_interview_plan_versions','validation_interview_plans_immutable','27','public.validation_protect_interview_history()',''),
    ('validation_interview_sessions','validation_interview_sessions_guard','27','public.validation_protect_interview_history()',''),
    ('validation_survey_plan_versions','validation_survey_plans_immutable','27','public.validation_protect_survey_history()',''),
    ('validation_survey_submissions','validation_survey_submissions_immutable','27','public.validation_protect_survey_history()',''),
    ('validation_survey_answers','validation_survey_answers_immutable','27','public.validation_protect_survey_history()',''),
    ('validation_survey_publications','validation_survey_publication_guard','27','public.validation_guard_survey_publication()',''),
    ('validation_intelligence_runs','validation_intelligence_history_guard','27','public.validation_protect_intelligence_history()',''),
    ('validation_evidence_promotions','validation_evidence_promotions_append_only','27','public.validation_reject_change()',''),
    ('validation_customer_interview_shareable_evidence','validation_interview_shareable_append_only','27','public.validation_reject_change()',''),
    ('canonical_problems','canonical_problems_b31_coordination','30','public.validation_b31_lock_registry_statement()',''),
    ('problem_aliases','problem_aliases_b31_coordination','30','public.validation_b31_lock_registry_statement()',''),
    ('validation_evidence_observations','validation_observation_b31_coordination','7','public.validation_b31_coordinate_observation_insert()',''),
    ('validation_evidence_classifications','validation_classification_b31_coordination','7','public.validation_b31_coordinate_classification_insert()',''),
    ('validation_qualified_evidence_snapshots','validation_qualified_snapshots_immutable','27','public.validation_reject_change()',''),
    ('problem_observations','problem_observations_b42_integrity','27','public.validation_b42_guard_attested_observation()',''),
    ('validation_evidence_consumption_authority','validation_b43_authority_immutable','27','public.validation_b43_reject_fact_change()',''),
    ('validation_evidence_source_restrictions','validation_b43_restrictions_immutable','27','public.validation_b43_reject_fact_change()',''),
    ('validation_evidence_promotions','validation_b43_new_promotion_withheld_authority','5','public.validation_b43_capture_new_promotion_authority()',''),
    ('validation_participants','validation_b43_participant_change_lock','19','public.validation_b43_lock_source_change()','status,consent_mode,consent_purpose,consent_captured_at'),
    ('validation_participants','validation_b43_participant_restrictions','17','public.validation_b43_capture_participant_restrictions()','status,consent_mode,consent_purpose,consent_captured_at'),
    ('validation_evidence_observations','validation_b43_observation_participant_restriction','5','public.validation_b43_restrict_observation_during_nonactive_participant()',''),
    ('validation_evidence_observations','validation_b43_observation_source_lock','7','public.validation_b43_lock_source_change()',''),
    ('validation_interview_sessions','validation_b43_session_change_lock','19','public.validation_b43_lock_source_change()','status,participant_relevance'),
    ('validation_interview_sessions','validation_b43_session_restrictions','17','public.validation_b43_capture_session_restrictions()','status,participant_relevance'),
    ('validation_experiment_versions','validation_b43_experiment_change_lock','19','public.validation_b43_lock_source_change()','lifecycle'),
    ('validation_experiment_versions','validation_b43_experiment_restriction','17','public.validation_b43_capture_experiment_restriction()','lifecycle'),
    ('validation_evidence_classifications','validation_b43_classification_restriction','5','public.validation_b43_capture_classification_restriction()',''),
    ('canonical_problems','validation_b43_canonical_restriction','17','public.validation_b43_capture_canonical_restriction()','status,merged_into_problem_id');
create temporary table b43_tables(relation_name text primary key) on commit drop;
insert into pg_temp.b43_tables select unnest(array['canonical_problems','problem_aliases','problem_observations','canonical_bootstrap_activations','problem_evolution_snapshots','problem_feedback_events','validation_subjects','validation_subject_links','validation_hypotheses','validation_hypothesis_versions','validation_experiments','validation_experiment_versions','validation_participants','validation_interview_plan_versions','validation_interview_sessions','validation_evidence_observations','validation_evidence_classifications','validation_customer_interview_shareable_evidence','validation_survey_plan_versions','validation_survey_publications','validation_survey_submissions','validation_survey_answers','validation_intelligence_runs','validation_evidence_promotions','validation_qualified_evidence_snapshots','validation_evidence_consumption_authority','validation_evidence_source_restrictions']::text[]);

-- All source functions are checked, not only the converted subset. Do not take
-- ownership of unknown objects or install against an unexpected platform graph.
do $preflight$
begin
  if current_user <> 'postgres' or session_user <> 'postgres'
    or current_setting('server_version_num')::int / 10000 <> 17
    or not exists(select 1 from pg_roles where rolname='postgres' and rolbypassrls) then
    raise exception 'B43 migration principal/version mismatch' using errcode='42501';
  end if;
  if exists(select 1 from pg_temp.b43_expected_functions e left join pg_proc p
      on p.oid=to_regprocedure(e.signature)
      where p.oid is null or p.proowner<>'postgres'::regrole or md5(p.prosrc)<>e.body_md5)
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and (p.proname like 'validation_%' or p.proname='apply_canonical_bootstrap_activation')
      and not exists(select 1 from pg_temp.b43_expected_functions e where to_regprocedure(e.signature)=p.oid)) then
    raise exception 'B43 function baseline drift' using errcode='55000';
  end if;
  if exists(select 1 from pg_temp.b43_tables e left join pg_class c on c.oid=to_regclass('public.'||e.relation_name)
      where c.oid is null or c.relkind<>'r' or c.relowner<>'postgres'::regrole)
    or exists(select 1 from pg_rewrite r join pg_temp.b43_tables e on r.ev_class=to_regclass('public.'||e.relation_name)) then
    raise exception 'B43 relation baseline drift' using errcode='55000';
  end if;
  if exists(select 1 from pg_temp.b43_expected_triggers e left join pg_trigger t
      on t.tgrelid=to_regclass('public.'||e.relation_name) and t.tgname=e.trigger_name and not t.tgisinternal
      where t.oid is null or t.tgtype<>e.event_bits::smallint or t.tgfoid<>to_regprocedure(e.function_name)
        or t.tgenabled<>'O' or t.tgnargs<>0 or t.tgqual is not null
        or coalesce((select string_agg(a.attname,',' order by x.ordinality)
          from unnest(t.tgattr::smallint[]) with ordinality x(attnum,ordinality)
          join pg_attribute a on a.attrelid=t.tgrelid and a.attnum=x.attnum),'')<>e.columns_csv)
    or exists(select 1 from pg_trigger t join pg_temp.b43_tables e on t.tgrelid=to_regclass('public.'||e.relation_name)
      where not t.tgisinternal and not exists(select 1 from pg_temp.b43_expected_triggers x
        where x.relation_name=e.relation_name and x.trigger_name=t.tgname)) then
    raise exception 'B43 trigger baseline drift' using errcode='55000';
  end if;
  -- Incoming FK closure: an unguarded child could acquire a protected parent lock.
  if exists(select 1 from pg_constraint c join pg_temp.b43_tables e on c.confrelid=to_regclass('public.'||e.relation_name)
      where c.contype='f' and not exists(select 1 from pg_temp.b43_tables child
        where c.conrelid=to_regclass('public.'||child.relation_name))) then
    raise exception 'B43 unguarded FK dependency' using errcode='55000';
  end if;
end
$preflight$;

create temporary table b43_original_functions on commit drop as
select p.oid,p.proowner,p.prosecdef,p.provolatile,p.proconfig,p.proacl,md5(p.prosrc) as body_md5
from pg_proc p join pg_temp.b43_expected_functions e on p.oid=to_regprocedure(e.signature);

-- Expected baseline attributes and explicit ACL declarations, including
-- unchanged reader/proof/trigger functions. Platform defaults are not invented.
create temporary table b43_baseline_attributes(signature text primary key, is_definer boolean,
  volatility "char", is_strict boolean, language_name text, config jsonb, explicit_acl jsonb) on commit drop;
insert into pg_temp.b43_baseline_attributes values
  ('public.validation_reject_change()',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_guard_experiment_version_update()',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_guard_evidence_participant_scope()',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_guard_subject_update()',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_create_subject(uuid,text,text,jsonb,text,text,text,jsonb)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_create_hypothesis(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_append_hypothesis_version(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_create_experiment(uuid,uuid,uuid,text,jsonb,text,jsonb,jsonb,text,uuid)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_append_experiment_version(uuid,uuid,uuid,text,jsonb,text,jsonb,jsonb,text,uuid)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_transition_experiment_version(uuid,uuid,text,text)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_record_observation(uuid,uuid,uuid,text,text,text,timestamptz,text,text,text,jsonb,text,text,text,text,boolean)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_protect_interview_history()',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_create_interview_plan(uuid,uuid,jsonb,uuid)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_create_interview_session(uuid,uuid,uuid,uuid,text)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_update_interview_session(uuid,uuid,text,text,text)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_record_interview_observation(uuid,uuid,timestamptz,jsonb,text)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_protect_survey_history()',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_guard_survey_publication()',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_create_survey_plan(uuid,uuid,text,text,jsonb,uuid)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_publish_survey(uuid,uuid,text)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_revoke_survey(uuid,uuid)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_submit_public_survey(text,text,text,jsonb)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_protect_intelligence_history()',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{}'::jsonb),
  ('public.validation_claim_intelligence_run(uuid,uuid,uuid,uuid,jsonb,text,text,text)',true,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_complete_intelligence_run(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',true,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_fail_intelligence_run(uuid,uuid,text)',true,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.apply_canonical_bootstrap_activation(text,jsonb)',true,'v',false,'plpgsql','{"search_path": "pg_catalog, public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_record_interview_observation_v2(uuid,uuid,timestamptz,jsonb,text,text,boolean)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_b31_lock(text,text)',false,'v',false,'sql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_b31_lock_registry_statement()',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke"}'::jsonb),
  ('public.validation_b31_authority_snapshot(uuid,uuid)',false,'s',false,'sql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_b31_representative_state(uuid,uuid)',false,'s',false,'sql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_promote_customer_interview_evidence(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,text,text,text,text)',true,'v',false,'plpgsql','{"search_path": "public, extensions"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_update_interview_relevance(uuid,uuid,text,text)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_update_participant_status(uuid,uuid,text,text)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_insert_classification(uuid,uuid,text,text,text,text,uuid)',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_b31_coordinate_observation_insert()',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke"}'::jsonb),
  ('public.validation_b31_coordinate_classification_insert()',false,'v',false,'plpgsql','{"search_path": "public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke"}'::jsonb),
  ('public.validation_b42_guard_attested_observation()',true,'v',false,'plpgsql','{"search_path": "pg_catalog, public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "revoke"}'::jsonb),
  ('public.validation_b42_row_record(public.problem_observations)',false,'s',true,'sql','{"search_path": "pg_catalog, public", "timezone": "UTC", "datestyle": "ISO, YMD"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_b42_protected_schema()',false,'s',false,'sql','{"search_path": "pg_catalog, public"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_b42_snapshot_verified(public.validation_evidence_promotions)',false,'s',false,'plpgsql','{"search_path": "pg_catalog, public", "timezone": "UTC", "datestyle": "ISO, YMD"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "grant"}'::jsonb),
  ('public.validation_b43_reject_fact_change()',false,'v',false,'plpgsql','{"search_path": "pg_catalog, pg_temp"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "revoke", "authenticator": "revoke"}'::jsonb),
  ('public.validation_b43_capture_new_promotion_authority()',true,'v',false,'plpgsql','{"search_path": "pg_catalog, pg_temp"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "revoke", "authenticator": "revoke"}'::jsonb),
  ('public.validation_b43_insert_restriction(text,text,uuid,uuid,uuid)',true,'v',false,'plpgsql','{"search_path": "pg_catalog, pg_temp"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "revoke", "authenticator": "revoke"}'::jsonb),
  ('public.validation_b43_lock_source_change()',true,'v',false,'plpgsql','{"search_path": "pg_catalog, pg_temp"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "revoke", "authenticator": "revoke"}'::jsonb),
  ('public.validation_b43_capture_participant_restrictions()',true,'v',false,'plpgsql','{"search_path": "pg_catalog, pg_temp"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "revoke", "authenticator": "revoke"}'::jsonb),
  ('public.validation_b43_restrict_observation_during_nonactive_participant()',true,'v',false,'plpgsql','{"search_path": "pg_catalog, pg_temp"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "revoke", "authenticator": "revoke"}'::jsonb),
  ('public.validation_b43_capture_session_restrictions()',true,'v',false,'plpgsql','{"search_path": "pg_catalog, pg_temp"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "revoke", "authenticator": "revoke"}'::jsonb),
  ('public.validation_b43_capture_experiment_restriction()',true,'v',false,'plpgsql','{"search_path": "pg_catalog, pg_temp"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "revoke", "authenticator": "revoke"}'::jsonb),
  ('public.validation_b43_capture_classification_restriction()',true,'v',false,'plpgsql','{"search_path": "pg_catalog, pg_temp"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "revoke", "authenticator": "revoke"}'::jsonb),
  ('public.validation_b43_capture_canonical_restriction()',true,'v',false,'plpgsql','{"search_path": "pg_catalog, pg_temp"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "revoke", "authenticator": "revoke"}'::jsonb),
  ('public.validation_b43_read_current_evidence(uuid)',true,'s',false,'plpgsql','{"search_path": "pg_catalog, pg_temp"}'::jsonb,'{"public": "revoke", "anon": "revoke", "authenticated": "revoke", "service_role": "revoke", "authenticator": "revoke"}'::jsonb);

do $baseline_attributes$
declare item record; fn pg_proc; acl record;
begin
  for item in select * from pg_temp.b43_baseline_attributes loop
    select * into strict fn from pg_proc where oid=to_regprocedure(item.signature);
    if fn.prosecdef<>item.is_definer or fn.provolatile<>item.volatility or fn.proisstrict<>item.is_strict
      or fn.proleakproof or fn.proparallel<>'u'
      or (select lanname from pg_language where oid=fn.prolang)<>item.language_name
      or (select coalesce(jsonb_object_agg(lower(split_part(v,'=',1)),substr(v,strpos(v,'=')+1)),'{}'::jsonb)
        from unnest(fn.proconfig) v) is distinct from item.config then
      raise exception 'B43 baseline function attributes changed' using errcode='55000';
    end if;
    for acl in select key,value from jsonb_each_text(item.explicit_acl) loop
      if acl.key='public' then
        if exists(select 1 from aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) a
          where a.grantee=0 and a.privilege_type='EXECUTE') is distinct from (acl.value='grant') then
          raise exception 'B43 baseline PUBLIC execute changed' using errcode='42501';
        end if;
      elsif has_function_privilege(acl.key,fn.oid,'EXECUTE') is distinct from (acl.value='grant') then
        raise exception 'B43 baseline application execute changed' using errcode='42501';
      end if;
    end loop;
  end loop;
end
$baseline_attributes$;

-- Keep an exact effective SELECT/RLS snapshot; mutation reductions must not
-- alter existing reads, policies or immutable/source-integrity attachments.
create temporary table b43_reads on commit drop as
select e.relation_name,r.rolname,has_table_privilege(r.oid,c.oid,'SELECT') as allowed,
  array(select a.attnum from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    and has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') order by a.attnum) as readable_columns,
  c.relrowsecurity,c.relforcerowsecurity,
  (select coalesce(jsonb_agg(to_jsonb(p) order by p.oid),'[]'::jsonb) from pg_policy p where p.polrelid=c.oid) as policies
from pg_temp.b43_tables e join pg_class c on c.oid=to_regclass('public.'||e.relation_name)
cross join pg_roles r where r.rolname in ('anon','authenticated','service_role','authenticator');

create schema saasscout_private authorization postgres;
revoke all on schema saasscout_private from public,anon,authenticated,service_role,authenticator;
create table saasscout_private.b43_coordination (
  singleton boolean primary key check (singleton),
  version bigint not null check (version>=0)
);
alter table saasscout_private.b43_coordination owner to postgres;
alter table saasscout_private.b43_coordination enable row level security;
alter table saasscout_private.b43_coordination force row level security;
revoke all on saasscout_private.b43_coordination from public,anon,authenticated,service_role,authenticator;
insert into saasscout_private.b43_coordination values (true,0);

create function saasscout_private.b43_enter() returns void
language plpgsql volatile security invoker set search_path=pg_catalog,pg_temp as $$
declare affected bigint;
begin
  if current_user<>'postgres' then raise exception 'B43 private entry denied' using errcode='42501'; end if;
  if current_setting('transaction_isolation') not in ('read committed','repeatable read') then
    raise exception 'B43 unsupported isolation' using errcode='0A000';
  end if;
  -- A real new tuple version is essential: stale RR snapshots must conflict.
  update saasscout_private.b43_coordination set version=version+1 where singleton;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'B43 fence unavailable' using errcode='55000'; end if;
end $$;
alter function saasscout_private.b43_enter() owner to postgres;
revoke all on function saasscout_private.b43_enter() from public,anon,authenticated,service_role,authenticator;

create function saasscout_private.b43_guard_statement() returns trigger
language plpgsql volatile security invoker set search_path=pg_catalog,pg_temp as $$
begin
  if current_user<>'postgres' then raise exception 'B43 RPC mutation required' using errcode='42501'; end if;
  if tg_op='TRUNCATE' then raise exception 'B43 truncate unsupported' using errcode='55000'; end if;
  perform saasscout_private.b43_enter();
  return null;
end $$;
alter function saasscout_private.b43_guard_statement() owner to postgres;
revoke all on function saasscout_private.b43_guard_statement() from public,anon,authenticated,service_role,authenticator;


-- Audited replacement: supabase/migrations/20260829000000_validation_server_commands.sql:2
create or replace function public.validation_create_subject(p_owner_id uuid,p_creation_origin text,p_label text,p_context_snapshot jsonb,p_source_type text default null,p_source_row_id text default null,p_source_version text default null,p_link_context_snapshot jsonb default '{}'::jsonb)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$ declare s public.validation_subjects; begin
  perform saasscout_private.b43_enter();

 if p_creation_origin = 'user_entered' then
   if p_source_type is not null or p_source_row_id is not null or p_source_version is not null then raise exception 'user-entered subjects cannot have upstream provenance' using errcode='23514'; end if;
 elsif p_creation_origin in ('discover','scan','weekly','saved_idea','opportunity') then
   if p_source_type is distinct from p_creation_origin or p_source_row_id is null or length(btrim(p_source_row_id)) = 0 then raise exception 'upstream subjects require matching, complete origin provenance' using errcode='23514'; end if;
 else
   raise exception 'invalid creation origin' using errcode='23514';
 end if;
 insert into public.validation_subjects(owner_id,creation_origin,label,context_snapshot) values(p_owner_id,p_creation_origin,p_label,p_context_snapshot) returning * into s;
 if p_source_type is not null then insert into public.validation_subject_links(owner_id,subject_id,source_type,source_row_id,source_version,context_snapshot) values(p_owner_id,s.id,p_source_type,p_source_row_id,p_source_version,p_link_context_snapshot); end if;
 return to_jsonb(s)-'owner_id'; end $$;
alter function public.validation_create_subject(uuid,text,text,jsonb,text,text,text,jsonb) owner to postgres;


-- Audited replacement: supabase/migrations/20260829000000_validation_server_commands.sql:14
create or replace function public.validation_create_hypothesis(p_owner_id uuid,p_subject_id uuid,p_target_segment text,p_problem_claim text,p_expected_observable_behavior text,p_commercial_assumption text,p_support_criteria jsonb,p_contradiction_criteria jsonb,p_inconclusive_criteria jsonb,p_scope_included jsonb,p_scope_excluded jsonb,p_supersedes_version_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$ declare h public.validation_hypotheses; v public.validation_hypothesis_versions; begin
  perform saasscout_private.b43_enter();

 if p_supersedes_version_id is not null then raise exception 'initial version cannot supersede' using errcode='23514'; end if;
 insert into public.validation_hypotheses(owner_id,subject_id) values(p_owner_id,p_subject_id) returning * into h;
 insert into public.validation_hypothesis_versions(owner_id,subject_id,hypothesis_id,version_number,target_segment,problem_claim,expected_observable_behavior,commercial_assumption,support_criteria,contradiction_criteria,inconclusive_criteria,scope_included,scope_excluded) values(p_owner_id,p_subject_id,h.id,1,p_target_segment,p_problem_claim,p_expected_observable_behavior,p_commercial_assumption,p_support_criteria,p_contradiction_criteria,p_inconclusive_criteria,p_scope_included,p_scope_excluded) returning * into v;
 return jsonb_build_object('hypothesis',to_jsonb(h)-'owner_id','version',to_jsonb(v)-'owner_id'); end $$;
alter function public.validation_create_hypothesis(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid) owner to postgres;


-- Audited replacement: supabase/migrations/20260829000000_validation_server_commands.sql:20
create or replace function public.validation_append_hypothesis_version(p_owner_id uuid,p_hypothesis_id uuid,p_target_segment text,p_problem_claim text,p_expected_observable_behavior text,p_commercial_assumption text,p_support_criteria jsonb,p_contradiction_criteria jsonb,p_inconclusive_criteria jsonb,p_scope_included jsonb,p_scope_excluded jsonb,p_supersedes_version_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$ declare h public.validation_hypotheses; v public.validation_hypothesis_versions; n integer; begin
  perform saasscout_private.b43_enter();

 select * into h from public.validation_hypotheses where id=p_hypothesis_id and owner_id=p_owner_id for update; if not found then raise exception 'not found' using errcode='P0002'; end if;
 if p_supersedes_version_id is not null and not exists(select 1 from public.validation_hypothesis_versions where id=p_supersedes_version_id and hypothesis_id=h.id and subject_id=h.subject_id and owner_id=p_owner_id) then raise exception 'invalid predecessor' using errcode='23503'; end if;
 select coalesce(max(version_number),0)+1 into n from public.validation_hypothesis_versions where hypothesis_id=h.id;
 insert into public.validation_hypothesis_versions(owner_id,subject_id,hypothesis_id,version_number,target_segment,problem_claim,expected_observable_behavior,commercial_assumption,support_criteria,contradiction_criteria,inconclusive_criteria,scope_included,scope_excluded,supersedes_version_id) values(p_owner_id,h.subject_id,h.id,n,p_target_segment,p_problem_claim,p_expected_observable_behavior,p_commercial_assumption,p_support_criteria,p_contradiction_criteria,p_inconclusive_criteria,p_scope_included,p_scope_excluded,p_supersedes_version_id) returning * into v; return to_jsonb(v)-'owner_id'; end $$;
alter function public.validation_append_hypothesis_version(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid) owner to postgres;


-- Audited replacement: supabase/migrations/20260829000000_validation_server_commands.sql:26
create or replace function public.validation_create_experiment(p_owner_id uuid,p_subject_id uuid,p_hypothesis_version_id uuid,p_family text,p_target_audience jsonb,p_collection_method text,p_design_snapshot jsonb,p_screening_criteria jsonb,p_consent_privacy_mode text,p_supersedes_version_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$ declare e public.validation_experiments; h public.validation_hypothesis_versions; v public.validation_experiment_versions; begin
  perform saasscout_private.b43_enter();

 if p_supersedes_version_id is not null then raise exception 'initial version cannot supersede' using errcode='23514'; end if; select * into h from public.validation_hypothesis_versions where id=p_hypothesis_version_id and subject_id=p_subject_id and owner_id=p_owner_id; if not found then raise exception 'not found' using errcode='P0002'; end if;
 insert into public.validation_experiments(owner_id,subject_id) values(p_owner_id,p_subject_id) returning * into e;
 insert into public.validation_experiment_versions(owner_id,subject_id,experiment_id,hypothesis_id,hypothesis_version_id,version_number,family,target_audience,collection_method,design_snapshot,screening_criteria,consent_privacy_mode) values(p_owner_id,p_subject_id,e.id,h.hypothesis_id,h.id,1,p_family,p_target_audience,p_collection_method,p_design_snapshot,p_screening_criteria,p_consent_privacy_mode) returning * into v; return jsonb_build_object('experiment',to_jsonb(e)-'owner_id','version',to_jsonb(v)-'owner_id'); end $$;
alter function public.validation_create_experiment(uuid,uuid,uuid,text,jsonb,text,jsonb,jsonb,text,uuid) owner to postgres;


-- Audited replacement: supabase/migrations/20260829000000_validation_server_commands.sql:31
create or replace function public.validation_append_experiment_version(p_owner_id uuid,p_experiment_id uuid,p_hypothesis_version_id uuid,p_family text,p_target_audience jsonb,p_collection_method text,p_design_snapshot jsonb,p_screening_criteria jsonb,p_consent_privacy_mode text,p_supersedes_version_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$ declare e public.validation_experiments; h public.validation_hypothesis_versions; v public.validation_experiment_versions; n integer; begin
  perform saasscout_private.b43_enter();

 select * into e from public.validation_experiments where id=p_experiment_id and owner_id=p_owner_id for update; if not found then raise exception 'not found' using errcode='P0002'; end if; select * into h from public.validation_hypothesis_versions where id=p_hypothesis_version_id and subject_id=e.subject_id and owner_id=p_owner_id; if not found then raise exception 'not found' using errcode='P0002'; end if;
 if p_supersedes_version_id is not null and not exists(select 1 from public.validation_experiment_versions where id=p_supersedes_version_id and experiment_id=e.id and subject_id=e.subject_id and owner_id=p_owner_id) then raise exception 'invalid predecessor' using errcode='23503'; end if;
 select coalesce(max(version_number),0)+1 into n from public.validation_experiment_versions where experiment_id=e.id;
 insert into public.validation_experiment_versions(owner_id,subject_id,experiment_id,hypothesis_id,hypothesis_version_id,version_number,family,target_audience,collection_method,design_snapshot,screening_criteria,consent_privacy_mode,supersedes_version_id) values(p_owner_id,e.subject_id,e.id,h.hypothesis_id,h.id,n,p_family,p_target_audience,p_collection_method,p_design_snapshot,p_screening_criteria,p_consent_privacy_mode,p_supersedes_version_id) returning * into v; return to_jsonb(v)-'owner_id'; end $$;
alter function public.validation_append_experiment_version(uuid,uuid,uuid,text,jsonb,text,jsonb,jsonb,text,uuid) owner to postgres;


-- Audited replacement: supabase/migrations/20260926000000_controlled_customer_interview_promotion.sql:966
create or replace function public.validation_transition_experiment_version(
  p_owner_id uuid,
  p_version_id uuid,
  p_expected_lifecycle text,
  p_target_lifecycle text
)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare
  v public.validation_experiment_versions;
  t timestamptz;
begin
  perform saasscout_private.b43_enter();
  t := clock_timestamp();
  perform public.validation_b31_lock(
    'experiment',
    p_version_id::text
  );

  update public.validation_experiment_versions
  set
    lifecycle = p_target_lifecycle,
    started_at = case
      when p_target_lifecycle = 'running'
        then coalesce(started_at, t)
      else started_at
    end,
    completed_at = case
      when p_target_lifecycle = 'completed'
        then t
      else completed_at
    end,
    cancelled_at = case
      when p_target_lifecycle = 'cancelled'
        then t
      else cancelled_at
    end
  where
    id = p_version_id
    and owner_id = p_owner_id
    and lifecycle = p_expected_lifecycle
  returning *
  into v;

  if not found then
    raise exception 'stale lifecycle'
      using errcode='40001';
  end if;

  return to_jsonb(v) - 'owner_id';
end
$$;
alter function public.validation_transition_experiment_version(uuid,uuid,text,text) owner to postgres;


-- Audited replacement: supabase/migrations/20260829000000_validation_server_commands.sql:41
create or replace function public.validation_record_observation(p_owner_id uuid,p_experiment_version_id uuid,p_participant_id uuid,p_origin text,p_modality text,p_behavioral_event_type text,p_observed_at timestamptz,p_source_type text,p_source_reference text,p_collected_by text,p_observation_content jsonb,p_content_fingerprint text,p_ingestion_key text,p_participant_independence_key text,p_independence_relationship text,p_anonymous_independence_uncertain boolean)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$ declare e public.validation_experiment_versions; o public.validation_evidence_observations; inserted boolean := false; begin
  perform saasscout_private.b43_enter();

 select * into e from public.validation_experiment_versions where id=p_experiment_version_id and owner_id=p_owner_id; if not found then raise exception 'not found' using errcode='P0002'; end if;
 insert into public.validation_evidence_observations(owner_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,participant_id,origin,modality,behavioral_event_type,observed_at,source_type,source_reference,collected_by,observation_content,content_fingerprint,ingestion_key,participant_independence_key,independence_relationship,anonymous_independence_uncertain)
 values(p_owner_id,e.subject_id,e.hypothesis_id,e.hypothesis_version_id,e.experiment_id,e.id,p_participant_id,p_origin,p_modality,p_behavioral_event_type,p_observed_at,p_source_type,p_source_reference,p_collected_by,p_observation_content,p_content_fingerprint,p_ingestion_key,p_participant_independence_key,p_independence_relationship,p_anonymous_independence_uncertain)
 on conflict (owner_id,ingestion_key) where ingestion_key is not null do nothing returning * into o;
 inserted := found;
 if inserted then return (to_jsonb(o)-'owner_id')||jsonb_build_object('duplicate',false); end if;
 -- ON CONFLICT waits for a concurrent winner. This subsequent statement then observes its committed row.
 select * into o from public.validation_evidence_observations where owner_id=p_owner_id and ingestion_key=p_ingestion_key;
 if not found or
    o.experiment_version_id is distinct from p_experiment_version_id or o.participant_id is distinct from p_participant_id or
    o.origin is distinct from p_origin or o.modality is distinct from p_modality or o.behavioral_event_type is distinct from p_behavioral_event_type or
    o.observed_at is distinct from p_observed_at or o.source_type is distinct from p_source_type or o.source_reference is distinct from p_source_reference or
    o.collected_by is distinct from p_collected_by or o.observation_content is distinct from p_observation_content or
    o.content_fingerprint is distinct from p_content_fingerprint or o.participant_independence_key is distinct from p_participant_independence_key or
    o.independence_relationship is distinct from p_independence_relationship or o.anonymous_independence_uncertain is distinct from p_anonymous_independence_uncertain
 then raise exception 'idempotency conflict' using errcode='23505'; end if;
 return (to_jsonb(o)-'owner_id')||jsonb_build_object('duplicate',true); end $$;
alter function public.validation_record_observation(uuid,uuid,uuid,text,text,text,timestamptz,text,text,text,jsonb,text,text,text,text,boolean) owner to postgres;


-- Audited replacement: supabase/migrations/20260830000000_validation_customer_interviews.sql:63
create or replace function public.validation_create_interview_plan(p_owner_id uuid,p_experiment_version_id uuid,p_questions jsonb,p_supersedes_plan_version_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$ declare e public.validation_experiment_versions; root public.validation_experiments; p public.validation_interview_plan_versions; n integer; begin
  perform saasscout_private.b43_enter();

 select * into e from public.validation_experiment_versions where id=p_experiment_version_id and owner_id=p_owner_id and family='customer_interview'; if not found then raise exception 'not found' using errcode='P0002'; end if;
 -- Plan version_number is scoped by logical experiment_id, so serialize on that same owned root.
 select * into root from public.validation_experiments where id=e.experiment_id and owner_id=p_owner_id for update; if not found then raise exception 'not found' using errcode='P0002'; end if;
 -- Refresh and lock the exact design row only after the namespace root lock; lifecycle authority stays current.
 select * into e from public.validation_experiment_versions where id=p_experiment_version_id and experiment_id=root.id and owner_id=p_owner_id and family='customer_interview' for update; if not found then raise exception 'not found' using errcode='P0002'; end if;
 if e.lifecycle in ('completed','cancelled') then raise exception 'terminal experiment' using errcode='23514'; end if;
 if p_supersedes_plan_version_id is not null and not exists(select 1 from public.validation_interview_plan_versions where id=p_supersedes_plan_version_id and experiment_id=e.experiment_id and owner_id=p_owner_id) then raise exception 'invalid predecessor' using errcode='23503'; end if;
 select coalesce(max(version_number),0)+1 into n from public.validation_interview_plan_versions where experiment_id=e.experiment_id;
 insert into public.validation_interview_plan_versions(owner_id,subject_id,experiment_id,experiment_version_id,version_number,questions,supersedes_plan_version_id) values(p_owner_id,e.subject_id,e.experiment_id,e.id,n,p_questions,p_supersedes_plan_version_id) returning * into p; return to_jsonb(p)-'owner_id'; end $$;
alter function public.validation_create_interview_plan(uuid,uuid,jsonb,uuid) owner to postgres;


-- Audited replacement: supabase/migrations/20260830000000_validation_customer_interviews.sql:74
create or replace function public.validation_create_interview_session(p_owner_id uuid,p_experiment_version_id uuid,p_participant_id uuid,p_interview_plan_version_id uuid,p_participant_relevance text)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$ declare e public.validation_experiment_versions; p public.validation_participants; s public.validation_interview_sessions; begin
  perform saasscout_private.b43_enter();

 select * into e from public.validation_experiment_versions where id=p_experiment_version_id and owner_id=p_owner_id and family='customer_interview' and lifecycle in ('running','paused'); if not found then raise exception 'experiment unavailable' using errcode='P0002'; end if;
 select * into p from public.validation_participants where id=p_participant_id and owner_id=p_owner_id and status='active'; if not found or (p.experiment_id is not null and p.experiment_id<>e.experiment_id) then raise exception 'participant unavailable' using errcode='P0002'; end if;
 insert into public.validation_interview_sessions(owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,participant_id,interview_plan_version_id,participant_relevance) values(p_owner_id,e.subject_id,e.experiment_id,e.id,e.hypothesis_id,e.hypothesis_version_id,p.id,p_interview_plan_version_id,p_participant_relevance) returning * into s; return to_jsonb(s)-'owner_id'-'notes'; end $$;
alter function public.validation_create_interview_session(uuid,uuid,uuid,uuid,text) owner to postgres;


-- Audited replacement: supabase/migrations/20260926000000_controlled_customer_interview_promotion.sql:1020
create or replace function public.validation_update_interview_session(
  p_owner_id uuid,
  p_session_id uuid,
  p_expected_status text,
  p_target_status text,
  p_notes text
)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare
  current_session public.validation_interview_sessions;
  parent public.validation_experiment_versions;
  s public.validation_interview_sessions;
  t timestamptz;
begin
  perform saasscout_private.b43_enter();
  t := clock_timestamp();
  select *
  into current_session
  from public.validation_interview_sessions
  where
    id = p_session_id
    and owner_id = p_owner_id;

  if not found then
    raise exception 'stale interview'
      using errcode='40001';
  end if;

  perform public.validation_b31_lock(
    'experiment',
    current_session.experiment_version_id::text
  );

  perform public.validation_b31_lock(
    'participant',
    current_session.participant_id::text
  );

  if
    p_expected_status = 'draft'
    and p_target_status = 'in_progress'
  then
    select *
    into parent
    from public.validation_experiment_versions
    where
      id = current_session.experiment_version_id
      and owner_id = p_owner_id
      and family = 'customer_interview';

    if
      not found
      or parent.lifecycle <> 'running'
    then
      raise exception
        'parent experiment is not running'
        using errcode='40001';
    end if;
  end if;

  update public.validation_interview_sessions
  set
    notes = p_notes,
    status = p_target_status,
    started_at = case
      when p_target_status = 'in_progress'
        then coalesce(started_at, t)
      else started_at
    end,
    completed_at = case
      when p_target_status = 'completed'
        then t
      else completed_at
    end,
    cancelled_at = case
      when p_target_status = 'cancelled'
        then t
      else cancelled_at
    end
  where
    id = p_session_id
    and owner_id = p_owner_id
    and status = p_expected_status
  returning *
  into s;

  if not found then
    raise exception 'stale interview'
      using errcode='40001';
  end if;

  return to_jsonb(s) - 'owner_id';
end
$$;
alter function public.validation_update_interview_session(uuid,uuid,text,text,text) owner to postgres;


-- Audited replacement: supabase/migrations/20260926000000_controlled_customer_interview_promotion.sql:1117
create or replace function public.validation_update_interview_relevance(
  p_owner_id uuid,
  p_session_id uuid,
  p_expected_relevance text,
  p_target_relevance text
)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare
  s public.validation_interview_sessions;
begin
  perform saasscout_private.b43_enter();

  select *
  into s
  from public.validation_interview_sessions
  where
    id = p_session_id
    and owner_id = p_owner_id;

  if not found then
    raise exception 'stale interview'
      using errcode='40001';
  end if;

  perform public.validation_b31_lock(
    'experiment',
    s.experiment_version_id::text
  );

  perform public.validation_b31_lock(
    'participant',
    s.participant_id::text
  );

  update public.validation_interview_sessions
  set participant_relevance = p_target_relevance
  where
    id = p_session_id
    and owner_id = p_owner_id
    and participant_relevance = p_expected_relevance
  returning *
  into s;

  if not found then
    raise exception 'stale interview'
      using errcode='40001';
  end if;

  return
    to_jsonb(s)
    - 'owner_id'
    - 'notes';
end
$$;
alter function public.validation_update_interview_relevance(uuid,uuid,text,text) owner to postgres;


-- Audited replacement: supabase/migrations/20260830000000_validation_customer_interviews.sql:96
create or replace function public.validation_record_interview_observation(p_owner_id uuid,p_interview_session_id uuid,p_observed_at timestamptz,p_observation_content jsonb,p_ingestion_key text)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$ declare s public.validation_interview_sessions; o public.validation_evidence_observations; begin
  perform saasscout_private.b43_enter();

 select * into s from public.validation_interview_sessions where id=p_interview_session_id and owner_id=p_owner_id and status in ('in_progress','completed'); if not found then raise exception 'interview unavailable' using errcode='P0002'; end if;
 insert into public.validation_evidence_observations(owner_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,participant_id,interview_session_id,origin,modality,observed_at,source_type,source_reference,collected_by,observation_content,ingestion_key,participant_independence_key,independence_relationship,anonymous_independence_uncertain)
 select p_owner_id,e.subject_id,e.hypothesis_id,e.hypothesis_version_id,e.experiment_id,e.id,s.participant_id,s.id,'human_interview','interview_observation',p_observed_at,'customer_interview',s.id::text,'manual',p_observation_content,p_ingestion_key,p.independence_key,
   case when exists(select 1 from public.validation_evidence_observations prior where prior.owner_id=p_owner_id and prior.participant_id=s.participant_id) then 'repeat_participant' else 'unknown' end,
   p.identity_mode='anonymous'
 from public.validation_experiment_versions e join public.validation_participants p on p.id=s.participant_id and p.owner_id=p_owner_id where e.id=s.experiment_version_id and e.owner_id=p_owner_id
 on conflict(owner_id,ingestion_key) where ingestion_key is not null do nothing returning * into o;
 if found then return (to_jsonb(o)-'owner_id')||jsonb_build_object('duplicate',false); end if;
 select * into o from public.validation_evidence_observations where owner_id=p_owner_id and ingestion_key=p_ingestion_key;
 if not found or o.interview_session_id is distinct from s.id or o.observed_at is distinct from p_observed_at or o.observation_content is distinct from p_observation_content then raise exception 'idempotency conflict' using errcode='23505'; end if;
 return (to_jsonb(o)-'owner_id')||jsonb_build_object('duplicate',true); end $$;
alter function public.validation_record_interview_observation(uuid,uuid,timestamptz,jsonb,text) owner to postgres;


-- Audited replacement: supabase/migrations/20260919010000_customer_interview_shareable_evidence_hardening.sql:6
create or replace function public.validation_record_interview_observation_v2(
  p_owner_id uuid,
  p_interview_session_id uuid,
  p_observed_at timestamptz,
  p_observation_content jsonb,
  p_ingestion_key text,
  p_shareable_statement text default null,
  p_shareable_reviewed boolean default false
)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare
  s public.validation_interview_sessions;
  o public.validation_evidence_observations;
  shared public.validation_customer_interview_shareable_evidence;
  inserted boolean;
  normalized_statement text;
begin
  perform saasscout_private.b43_enter();
  normalized_statement := nullif(btrim(p_shareable_statement), '');
  if (normalized_statement is null and p_shareable_reviewed) or
     (normalized_statement is not null and not p_shareable_reviewed) then
    raise exception 'shareable statement and human review confirmation must be supplied together' using errcode='23514';
  end if;
  if normalized_statement is not null and length(normalized_statement) > 500 then
    raise exception 'shareable statement exceeds 500 characters' using errcode='22001';
  end if;

  select session.* into s
  from public.validation_interview_sessions session
  join public.validation_experiment_versions version
    on version.id=session.experiment_version_id and version.owner_id=p_owner_id
  where session.id=p_interview_session_id and session.owner_id=p_owner_id
    and session.status in ('in_progress','completed') and version.family='customer_interview';
  if not found then raise exception 'interview unavailable' using errcode='P0002'; end if;

  insert into public.validation_evidence_observations(
    owner_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,
    participant_id,interview_session_id,origin,modality,observed_at,source_type,source_reference,
    collected_by,observation_content,ingestion_key,participant_independence_key,
    independence_relationship,anonymous_independence_uncertain)
  select p_owner_id,e.subject_id,e.hypothesis_id,e.hypothesis_version_id,e.experiment_id,e.id,
    s.participant_id,s.id,'human_interview','interview_observation',p_observed_at,'customer_interview',
    s.id::text,'manual',p_observation_content,p_ingestion_key,p.independence_key,
    case when exists(select 1 from public.validation_evidence_observations prior where prior.owner_id=p_owner_id and prior.participant_id=s.participant_id) then 'repeat_participant' else 'unknown' end,
    p.identity_mode='anonymous'
  from public.validation_experiment_versions e
  join public.validation_participants p on p.id=s.participant_id and p.owner_id=p_owner_id
  where e.id=s.experiment_version_id and e.owner_id=p_owner_id and e.family='customer_interview'
  on conflict(owner_id,ingestion_key) where ingestion_key is not null do nothing returning * into o;
  inserted := found;

  if not inserted then
    select * into o from public.validation_evidence_observations
    where owner_id=p_owner_id and ingestion_key=p_ingestion_key;
    if not found or o.interview_session_id is distinct from s.id or o.observed_at is distinct from p_observed_at or o.observation_content is distinct from p_observation_content then
      raise exception 'idempotency conflict' using errcode='23505';
    end if;
    select * into shared from public.validation_customer_interview_shareable_evidence
    where source_observation_id=o.id and owner_id=p_owner_id;
    if normalized_statement is null then
      if found then
        raise exception 'idempotency conflict' using errcode='23505';
      end if;
    elsif not found or shared.statement is distinct from normalized_statement or
       shared.statement_sha256 is distinct from encode(extensions.digest(convert_to(normalized_statement,'UTF8'),'sha256'),'hex') then
      raise exception 'idempotency conflict' using errcode='23505';
    end if;
  elsif normalized_statement is not null then
    insert into public.validation_customer_interview_shareable_evidence(
      owner_id,source_observation_id,statement,statement_sha256,contract_version,review_confirmation)
    values (
      p_owner_id,o.id,normalized_statement,encode(extensions.digest(convert_to(normalized_statement,'UTF8'),'sha256'),'hex'),
      'customer_interview_shareable_evidence_v1','human_reviewed_for_shared_evidence_use');
  end if;

  return (to_jsonb(o)-'owner_id') || jsonb_build_object(
    'duplicate', not inserted,
    'shareableEvidenceCreated', inserted and normalized_statement is not null
  );
end $$;
alter function public.validation_record_interview_observation_v2(uuid,uuid,timestamptz,jsonb,text,text,boolean) owner to postgres;


-- Audited replacement: supabase/migrations/20260926000000_controlled_customer_interview_promotion.sql:1174
create or replace function public.validation_update_participant_status(
  p_owner_id uuid,
  p_participant_id uuid,
  p_expected_status text,
  p_target_status text
)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare
  p public.validation_participants;
begin
  perform saasscout_private.b43_enter();

  perform public.validation_b31_lock(
    'participant',
    p_participant_id::text
  );

  update public.validation_participants
  set status = p_target_status
  where
    id = p_participant_id
    and owner_id = p_owner_id
    and status = p_expected_status
  returning *
  into p;

  if not found then
    raise exception 'stale participant'
      using errcode='40001';
  end if;

  return to_jsonb(p) - 'owner_id';
end
$$;
alter function public.validation_update_participant_status(uuid,uuid,text,text) owner to postgres;


-- Audited replacement: supabase/migrations/20260926000000_controlled_customer_interview_promotion.sql:1211
create or replace function public.validation_insert_classification(
  p_owner_id uuid,
  p_observation_id uuid,
  p_polarity text,
  p_classification_source text,
  p_authority_status text,
  p_rationale text,
  p_supersedes_classification_id uuid
)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare
  o public.validation_evidence_observations;
  c public.validation_evidence_classifications;
begin
  perform saasscout_private.b43_enter();

  select *
  into o
  from public.validation_evidence_observations
  where
    id = p_observation_id
    and owner_id = p_owner_id;

  if not found then
    raise exception 'not found'
      using errcode='P0002';
  end if;

  perform public.validation_b31_lock(
    'experiment',
    o.experiment_version_id::text
  );

  if o.participant_id is not null then
    perform public.validation_b31_lock(
      'participant',
      o.participant_id::text
    );
  end if;

  insert into public.validation_evidence_classifications(
    owner_id,
    observation_id,
    polarity,
    classification_source,
    authority_status,
    rationale,
    supersedes_classification_id
  )
  values(
    p_owner_id,
    p_observation_id,
    p_polarity,
    p_classification_source,
    p_authority_status,
    p_rationale,
    p_supersedes_classification_id
  )
  returning *
  into c;

  return to_jsonb(c) - 'owner_id';
end
$$;
alter function public.validation_insert_classification(uuid,uuid,text,text,text,text,uuid) owner to postgres;


-- Audited replacement: supabase/migrations/20260901000000_validation_surveys.sql:61
create or replace function public.validation_create_survey_plan(p_owner_id uuid,p_experiment_version_id uuid,p_title text,p_purpose text,p_questions jsonb,p_supersedes_survey_plan_version_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare e public.validation_experiment_versions;root public.validation_experiments;p public.validation_survey_plan_versions;latest public.validation_survey_plan_versions;n integer;
begin
  perform saasscout_private.b43_enter();

 select * into e from public.validation_experiment_versions where id=p_experiment_version_id and owner_id=p_owner_id and family='survey';
 if not found then raise exception 'not found' using errcode='P0002';end if;
 -- Serialize version allocation and predecessor selection on the owned logical experiment root.
 select * into root from public.validation_experiments where id=e.experiment_id and owner_id=p_owner_id for update;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 select * into e from public.validation_experiment_versions where id=p_experiment_version_id and experiment_id=root.id and owner_id=p_owner_id and family='survey' for update;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 if e.lifecycle in('completed','cancelled') then raise exception 'terminal experiment' using errcode='23514';end if;
 select * into latest from public.validation_survey_plan_versions where experiment_id=e.experiment_id and owner_id=p_owner_id order by version_number desc limit 1;
 if latest.id is null and p_supersedes_survey_plan_version_id is not null then raise exception 'first survey plan cannot have a predecessor' using errcode='23503';end if;
 if latest.id is not null and p_supersedes_survey_plan_version_id is distinct from latest.id then raise exception 'stale survey plan predecessor' using errcode='40001';end if;
 n:=coalesce(latest.version_number,0)+1;
 insert into public.validation_survey_plan_versions(owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,version_number,title,purpose,questions,supersedes_survey_plan_version_id)
 values(p_owner_id,e.subject_id,e.experiment_id,e.id,e.hypothesis_id,e.hypothesis_version_id,n,p_title,p_purpose,p_questions,p_supersedes_survey_plan_version_id) returning * into p;
 return to_jsonb(p)-'owner_id';
end $$;
alter function public.validation_create_survey_plan(uuid,uuid,text,text,jsonb,uuid) owner to postgres;


-- Audited replacement: supabase/migrations/20260901000000_validation_surveys.sql:81
create or replace function public.validation_publish_survey(p_owner_id uuid,p_survey_plan_version_id uuid,p_token_hash text)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare candidate public.validation_survey_plan_versions;latest public.validation_survey_plan_versions;root public.validation_experiments;pub public.validation_survey_publications;
begin
  perform saasscout_private.b43_enter();

 select * into candidate from public.validation_survey_plan_versions where id=p_survey_plan_version_id and owner_id=p_owner_id;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 -- Serialize revoke-and-replace publication on the same logical root used for plan allocation.
 select * into root from public.validation_experiments where id=candidate.experiment_id and owner_id=p_owner_id for update;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 select * into candidate from public.validation_survey_plan_versions where id=p_survey_plan_version_id and experiment_id=root.id and owner_id=p_owner_id;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 select * into latest from public.validation_survey_plan_versions where experiment_id=root.id and owner_id=p_owner_id order by version_number desc limit 1;
 if latest.id is null or candidate.id is distinct from latest.id then raise exception 'stale survey plan cannot be published' using errcode='40001';end if;
 -- Creating a newer plan does not revoke this row; only this explicit publish command replaces it.
 update public.validation_survey_publications set state='revoked',revoked_at=clock_timestamp() where experiment_id=root.id and owner_id=p_owner_id and state='published';
 insert into public.validation_survey_publications(owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,survey_plan_version_id,token_hash)
 values(candidate.owner_id,candidate.subject_id,candidate.experiment_id,candidate.experiment_version_id,candidate.hypothesis_id,candidate.hypothesis_version_id,candidate.id,p_token_hash) returning * into pub;
 return to_jsonb(pub)-'owner_id'-'token_hash';
end $$;
alter function public.validation_publish_survey(uuid,uuid,text) owner to postgres;


-- Audited replacement: supabase/migrations/20260901000000_validation_surveys.sql:100
create or replace function public.validation_revoke_survey(p_owner_id uuid,p_publication_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare pub public.validation_survey_publications;
begin
  perform saasscout_private.b43_enter();

 -- UPDATE takes a row-exclusive lock. It waits behind an in-flight submission's FOR SHARE lock.
 update public.validation_survey_publications set state='revoked',revoked_at=clock_timestamp() where id=p_publication_id and owner_id=p_owner_id and state='published' returning * into pub;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 return to_jsonb(pub)-'owner_id'-'token_hash';
end $$;
alter function public.validation_revoke_survey(uuid,uuid) owner to postgres;


-- Audited replacement: supabase/migrations/20261024000000_survey_required_answer_integrity.sql:2
create or replace function public.validation_submit_public_survey(p_token_hash text,p_idempotency_key text,p_payload_hash text,p_answers jsonb)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare pub public.validation_survey_publications;experiment public.validation_experiment_versions;plan public.validation_survey_plan_versions;s public.validation_survey_submissions;existing public.validation_survey_submissions;a jsonb;q jsonb;answer_count integer;distinct_question_count integer;selected_count integer;distinct_selected_count integer;
begin
  perform saasscout_private.b43_enter();

 select * into pub from public.validation_survey_publications where token_hash=p_token_hash and state='published' for share;
 if not found then raise exception 'survey unavailable' using errcode='P0002';end if;
 select * into experiment from public.validation_experiment_versions
 where id=pub.experiment_version_id and experiment_id=pub.experiment_id and hypothesis_version_id=pub.hypothesis_version_id and
       hypothesis_id=pub.hypothesis_id and subject_id=pub.subject_id and owner_id=pub.owner_id and family='survey' and lifecycle='running'
 for share;
 if not found then raise exception 'survey unavailable' using errcode='P0002';end if;
 select * into plan from public.validation_survey_plan_versions where id=pub.survey_plan_version_id;
 if not found then raise exception 'survey plan unavailable' using errcode='P0002';end if;

 if jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'answers must be an array' using errcode='23514';end if;
 answer_count:=jsonb_array_length(p_answers);
 if answer_count>15 or pg_column_size(p_answers)>65536 then raise exception 'answers exceed bounds' using errcode='23514';end if;
 if exists(select 1 from jsonb_array_elements(p_answers) answer where jsonb_typeof(answer) is distinct from 'object' or jsonb_typeof(answer->'questionRef') is distinct from 'string' or not (answer ? 'value')) then raise exception 'malformed answer' using errcode='23514';end if;
 select count(distinct answer->>'questionRef') into distinct_question_count from jsonb_array_elements(p_answers) answer;
 if distinct_question_count<>answer_count then raise exception 'duplicate question reference' using errcode='23514';end if;
 if exists(select 1 from jsonb_array_elements(p_answers) answer where not exists(select 1 from jsonb_array_elements(plan.questions) question where question->>'questionRef'=answer->>'questionRef')) then raise exception 'unknown question' using errcode='23514';end if;
 if exists(select 1 from jsonb_array_elements(plan.questions) question where coalesce((question->>'required')::boolean,false) and not exists(select 1 from jsonb_array_elements(p_answers) answer where answer->>'questionRef'=question->>'questionRef')) then raise exception 'required question missing' using errcode='23514';end if;

 for a in select value from jsonb_array_elements(p_answers) loop
  select value into q from jsonb_array_elements(plan.questions) where value->>'questionRef'=a->>'questionRef';
  if q->>'type'='single_choice' then
   if jsonb_typeof(a->'value') is distinct from 'string' or not exists(select 1 from jsonb_array_elements_text(q->'options') option where option=a->>'value') then raise exception 'invalid single choice answer' using errcode='23514';end if;
  elsif q->>'type'='multiple_choice' then
   if jsonb_typeof(a->'value') is distinct from 'array' then raise exception 'invalid multiple choice answer type' using errcode='23514';end if;
   selected_count:=jsonb_array_length(a->'value');
   if selected_count>12 then raise exception 'multiple choice answer exceeds bounds' using errcode='23514';end if;
   if coalesce((q->>'required')::boolean,false) and selected_count=0 then raise exception 'required question was not answered' using errcode='23514';end if;
   if exists(select 1 from jsonb_array_elements(a->'value') selected where jsonb_typeof(selected) is distinct from 'string' or not exists(select 1 from jsonb_array_elements_text(q->'options') option where option=selected#>>'{}')) then raise exception 'invalid multiple choice option' using errcode='23514';end if;
   select count(distinct selected#>>'{}') into distinct_selected_count from jsonb_array_elements(a->'value') selected;
   if distinct_selected_count<>selected_count then raise exception 'duplicate multiple choice option' using errcode='23514';end if;
  elsif q->>'type'='short_text' then
   if jsonb_typeof(a->'value') is distinct from 'string' or length(a->>'value')>500 then raise exception 'invalid short text answer' using errcode='23514';end if;
   if coalesce((q->>'required')::boolean,false) and btrim(a->>'value',U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' then raise exception 'required question was not answered' using errcode='23514';end if;
  elsif q->>'type'='long_text' then
   if jsonb_typeof(a->'value') is distinct from 'string' or length(a->>'value')>4000 then raise exception 'invalid long text answer' using errcode='23514';end if;
   if coalesce((q->>'required')::boolean,false) and btrim(a->>'value',U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' then raise exception 'required question was not answered' using errcode='23514';end if;
  elsif q->>'type'='number' then
   if jsonb_typeof(a->'value') is distinct from 'number' or (q?'min' and (a->>'value')::numeric<(q->>'min')::numeric) or (q?'max' and (a->>'value')::numeric>(q->>'max')::numeric) then raise exception 'invalid number answer' using errcode='23514';end if;
  else
   raise exception 'unsupported survey question type' using errcode='23514';
  end if;
 end loop;

 -- Validation precedes writes; PostgreSQL function execution is atomic, so any later exception rolls back all inserts.
 insert into public.validation_survey_submissions(owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,survey_plan_version_id,publication_id,idempotency_key,payload_hash)
 values(pub.owner_id,pub.subject_id,pub.experiment_id,pub.experiment_version_id,pub.hypothesis_id,pub.hypothesis_version_id,pub.survey_plan_version_id,pub.id,p_idempotency_key,p_payload_hash)
 on conflict(publication_id,idempotency_key)do nothing returning * into s;
 if not found then
  select * into existing from public.validation_survey_submissions where publication_id=pub.id and idempotency_key=p_idempotency_key;
  if existing.payload_hash<>p_payload_hash then raise exception 'idempotency conflict' using errcode='23505';end if;
  return jsonb_build_object('submissionId',existing.id,'duplicate',true);
 end if;
 for a in select value from jsonb_array_elements(p_answers) loop
  select value into q from jsonb_array_elements(plan.questions) where value->>'questionRef'=a->>'questionRef';
  insert into public.validation_survey_answers(owner_id,submission_id,survey_plan_version_id,question_id,question_type,raw_answer)
  values(pub.owner_id,s.id,plan.id,a->>'questionRef',q->>'type',a->'value');
 end loop;
 return jsonb_build_object('submissionId',s.id,'duplicate',false);
end $$;
alter function public.validation_submit_public_survey(text,text,text,jsonb) owner to postgres;


-- Audited replacement: supabase/migrations/20260902000000_validation_intelligence.sql:29
create or replace function public.validation_claim_intelligence_run(p_owner_id uuid,p_subject_id uuid,p_hypothesis_id uuid,p_hypothesis_version_id uuid,p_evidence_snapshot jsonb,p_evidence_snapshot_hash text,p_provider text,p_model text)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$ declare root public.validation_subjects; prior public.validation_intelligence_runs; created public.validation_intelligence_runs;n integer;begin
  perform saasscout_private.b43_enter();

 select * into root from public.validation_subjects where id=p_subject_id and owner_id=p_owner_id for update;if not found then raise exception 'not found' using errcode='P0002';end if;
 perform 1 from public.validation_hypothesis_versions where id=p_hypothesis_version_id and hypothesis_id=p_hypothesis_id and subject_id=p_subject_id and owner_id=p_owner_id;if not found then raise exception 'not found' using errcode='P0002';end if;
 select * into prior from public.validation_intelligence_runs where owner_id=p_owner_id and subject_id=p_subject_id and hypothesis_version_id=p_hypothesis_version_id and evidence_snapshot_hash=p_evidence_snapshot_hash and status in('running','completed') order by analysis_version_number desc limit 1;
 if prior.status='completed' then return jsonb_build_object('disposition','completed','run_id',prior.id);end if;
 if prior.status='running' and prior.lease_expires_at>clock_timestamp() then return jsonb_build_object('disposition','in_progress','run_id',prior.id);end if;
 if prior.status='running' then update public.validation_intelligence_runs set status='failed',failure_code='running_lease_expired',lease_expires_at=null,failed_at=clock_timestamp() where id=prior.id and status='running';end if;
 select coalesce(max(analysis_version_number),0)+1 into n from public.validation_intelligence_runs where subject_id=p_subject_id;
 insert into public.validation_intelligence_runs(owner_id,subject_id,hypothesis_id,hypothesis_version_id,analysis_version_number,evidence_snapshot,evidence_snapshot_hash,provider,model,status,lease_expires_at) values(p_owner_id,p_subject_id,p_hypothesis_id,p_hypothesis_version_id,n,p_evidence_snapshot,p_evidence_snapshot_hash,p_provider,p_model,'running',clock_timestamp()+interval '10 minutes') returning * into created;
 return jsonb_build_object('disposition','claimed','run_id',created.id,'analysis_version_number',created.analysis_version_number);end $$;
alter function public.validation_claim_intelligence_run(uuid,uuid,uuid,uuid,jsonb,text,text,text) owner to postgres;


-- Audited replacement: supabase/migrations/20260902000000_validation_intelligence.sql:39
create or replace function public.validation_complete_intelligence_run(p_owner_id uuid,p_run_id uuid,p_dimension_assessments jsonb,p_supporting_synthesis jsonb,p_contradicting_synthesis jsonb,p_uncertainty_synthesis jsonb,p_overall_assessment jsonb,p_next_experiment_recommendation jsonb)
returns boolean
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$ declare claimed public.validation_intelligence_runs;begin
  perform saasscout_private.b43_enter();

 select * into claimed from public.validation_intelligence_runs where id=p_run_id and owner_id=p_owner_id;if not found then return false;end if;
 perform 1 from public.validation_subjects where id=claimed.subject_id and owner_id=p_owner_id for update;
 update public.validation_intelligence_runs set status='completed',lease_expires_at=null,dimension_assessments=p_dimension_assessments,supporting_synthesis=p_supporting_synthesis,contradicting_synthesis=p_contradicting_synthesis,uncertainty_synthesis=p_uncertainty_synthesis,overall_assessment=p_overall_assessment,next_experiment_recommendation=p_next_experiment_recommendation,completed_at=clock_timestamp() where id=p_run_id and owner_id=p_owner_id and status='running';return found;end $$;
alter function public.validation_complete_intelligence_run(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) owner to postgres;


-- Audited replacement: supabase/migrations/20260902000000_validation_intelligence.sql:43
create or replace function public.validation_fail_intelligence_run(p_owner_id uuid,p_run_id uuid,p_failure_code text)
returns boolean
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$ declare claimed public.validation_intelligence_runs;begin
  perform saasscout_private.b43_enter();

 select * into claimed from public.validation_intelligence_runs where id=p_run_id and owner_id=p_owner_id;if not found then return false;end if;
 perform 1 from public.validation_subjects where id=claimed.subject_id and owner_id=p_owner_id for update;
 update public.validation_intelligence_runs set status='failed',lease_expires_at=null,failure_code=left(p_failure_code,80),failed_at=clock_timestamp() where id=p_run_id and owner_id=p_owner_id and status='running';return found;end $$;
alter function public.validation_fail_intelligence_run(uuid,uuid,text) owner to postgres;


-- Audited replacement: supabase/migrations/20260912030000_fix_canonical_bootstrap_key_construction.sql:2
create or replace function public.apply_canonical_bootstrap_activation(p_plan_hash text, p_candidates jsonb)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
-- The trusted operator CLI establishes analyzer/plan legitimacy. This privileged RPC
-- is deliberately the transactional structural/ownership integrity boundary only.
declare
  candidate jsonb;
  alias jsonb;
  mapped public.canonical_bootstrap_activations%rowtype;
  canonical_id uuid;
  created_candidates integer := 0;
  reused_candidates integer := 0;
  created_aliases integer := 0;
  reused_aliases integer := 0;
  linked_observations integer := 0;
  already_linked integer := 0;
  expected integer;
  affected integer;
  verified integer;
  already_owned integer;
  has_mapping boolean;
  failure_stage text := 'preflight';
  diagnostic_sqlstate text;
  diagnostic_constraint text;
  diagnostic_table text;
  diagnostic_column text;
  safe_diagnostic text;
begin
  perform saasscout_private.b43_enter();

  if p_plan_hash is null or p_plan_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_candidates) <> 'array' then
    raise exception using errcode = '22023', message = 'canonical_bootstrap_preflight_failed';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('canonical_bootstrap_activation_v1', 0));

  if exists (select 1 from jsonb_array_elements(p_candidates) c group by c->>'candidateId' having count(*) > 1) then
    raise exception using errcode = 'P0001', message = 'canonical_bootstrap_preflight_failed';
  end if;
  if exists (select 1 from jsonb_array_elements(p_candidates) c group by c->>'candidateNormalizedTitle' having count(*) > 1) then
    raise exception using errcode = 'P0001', message = 'canonical_bootstrap_identity_collision';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_candidates) c cross join lateral jsonb_array_elements(c->'aliases') a
    group by a->>'normalizedAlias' having count(distinct c->>'candidateId') > 1
  ) then raise exception using errcode = 'P0001', message = 'canonical_bootstrap_alias_collision'; end if;
  -- Membership is globally one-to-one. This also rejects a duplicate ID inside one candidate.
  if exists (
    select 1 from jsonb_array_elements(p_candidates) c
      cross join lateral jsonb_array_elements_text(c->'observationIds') observation_id
    group by observation_id having count(*) > 1
  ) then raise exception using errcode = 'P0001', message = 'canonical_bootstrap_observation_conflict'; end if;

  -- Global preflight occurs under the single lock, before the first mutation.
  for candidate in select value from jsonb_array_elements(p_candidates) order by value->>'candidateId' loop
    if candidate->>'candidateId' !~ '^cb1_[0-9a-f]{24}$'
       or candidate->>'baseActivationDisposition' <> 'auto_activatable'
       or candidate->>'crossCandidateAuditDisposition' <> 'clearly_unique'
       or candidate->>'finalActivationDisposition' <> 'auto_activatable'
       or jsonb_array_length(candidate->'observationIds') < 2
       or candidate->>'candidateSnapshotHash' !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023', message = 'canonical_bootstrap_preflight_failed';
    end if;
    select * into mapped from public.canonical_bootstrap_activations a
      where a.candidate_id = candidate->>'candidateId'
        and a.bootstrap_rule_version = candidate->>'bootstrapRuleVersion'
        and a.activation_eligibility_rule_version = candidate->>'activationEligibilityRuleVersion'
        and a.cross_candidate_audit_rule_version = candidate->>'crossCandidateAuditRuleVersion';
    has_mapping := found;
    if has_mapping and mapped.candidate_snapshot_hash <> candidate->>'candidateSnapshotHash' then
      raise exception using errcode = 'P0001', message = 'canonical_bootstrap_candidate_snapshot_mismatch';
    end if;
    if exists (select 1 from public.canonical_problems c where c.normalized_title = candidate->>'candidateNormalizedTitle' and (not has_mapping or c.id <> mapped.canonical_problem_id)) then
      raise exception using errcode = 'P0001', message = 'canonical_bootstrap_identity_collision';
    end if;
    for alias in select value from jsonb_array_elements(candidate->'aliases') loop
      if exists (select 1 from public.problem_aliases pa where pa.normalized_alias = alias->>'normalizedAlias' and (not has_mapping or pa.canonical_problem_id <> mapped.canonical_problem_id)) then
        raise exception using errcode = 'P0001', message = 'canonical_bootstrap_alias_collision';
      end if;
    end loop;
    if exists (
      select 1 from public.problem_observations po
      where po.id in (select value::uuid from jsonb_array_elements_text(candidate->'observationIds'))
        and po.canonical_problem_id is not null and (not has_mapping or po.canonical_problem_id <> mapped.canonical_problem_id)
    ) or (select count(*) from public.problem_observations po where po.id in (select value::uuid from jsonb_array_elements_text(candidate->'observationIds'))) <> jsonb_array_length(candidate->'observationIds') then
      raise exception using errcode = 'P0001', message = 'canonical_bootstrap_observation_conflict';
    end if;
  end loop;

  for candidate in select value from jsonb_array_elements(p_candidates) order by value->>'candidateId' loop
    select * into mapped from public.canonical_bootstrap_activations a where a.candidate_id = candidate->>'candidateId'
      and a.bootstrap_rule_version = candidate->>'bootstrapRuleVersion' and a.activation_eligibility_rule_version = candidate->>'activationEligibilityRuleVersion'
      and a.cross_candidate_audit_rule_version = candidate->>'crossCandidateAuditRuleVersion';
    if found then canonical_id := mapped.canonical_problem_id; reused_candidates := reused_candidates + 1;
    else
      failure_stage := 'canonical_insert';
      begin
        insert into public.canonical_problems (canonical_key, canonical_title, normalized_title, status)
          values (pg_catalog.concat(
            'bootstrap:',
            candidate->>'bootstrapRuleVersion',
            ':',
            candidate->>'candidateId'
          ), candidate->>'candidateCanonicalTitle', candidate->>'candidateNormalizedTitle', 'active') returning id into canonical_id;
      exception when serialization_failure or deadlock_detected then raise;
when others then
        get stacked diagnostics
          diagnostic_sqlstate = returned_sqlstate,
          diagnostic_constraint = constraint_name,
          diagnostic_table = table_name,
          diagnostic_column = column_name;

        -- Only fixed taxonomy tokens and conservatively shaped PostgreSQL identifiers
        -- may cross the operator boundary. Exception text and extended diagnostics do not.
        safe_diagnostic := 'canonical_bootstrap_canonical_insert_failed:stage=canonical_insert';
        if diagnostic_sqlstate ~ '^[0-9A-Z]{5}$' then
          safe_diagnostic := safe_diagnostic || ':sqlstate=' || diagnostic_sqlstate;
        else
          safe_diagnostic := safe_diagnostic || ':sqlstate=XXXXX';
        end if;
        if diagnostic_constraint ~ '^[a-z_][a-z0-9_]{0,62}$' then
          safe_diagnostic := safe_diagnostic || ':constraint=' || diagnostic_constraint;
        end if;
        if diagnostic_table ~ '^[a-z_][a-z0-9_]{0,62}$' then
          safe_diagnostic := safe_diagnostic || ':table=' || diagnostic_table;
        end if;
        if diagnostic_column ~ '^[a-z_][a-z0-9_]{0,62}$' then
          safe_diagnostic := safe_diagnostic || ':column=' || diagnostic_column;
        end if;
        raise exception using errcode = 'P0001', message = safe_diagnostic;
      end;
      failure_stage := 'ledger_insert';
      insert into public.canonical_bootstrap_activations (bootstrap_rule_version, activation_eligibility_rule_version, cross_candidate_audit_rule_version, candidate_id, candidate_snapshot_hash, canonical_problem_id, candidate_title, candidate_normalized_title, observation_ids, observation_count)
        values (candidate->>'bootstrapRuleVersion', candidate->>'activationEligibilityRuleVersion', candidate->>'crossCandidateAuditRuleVersion', candidate->>'candidateId', candidate->>'candidateSnapshotHash', canonical_id, candidate->>'candidateCanonicalTitle', candidate->>'candidateNormalizedTitle', array(select value::uuid from jsonb_array_elements_text(candidate->'observationIds')), jsonb_array_length(candidate->'observationIds'));
      created_candidates := created_candidates + 1;
    end if;
    for alias in select value from jsonb_array_elements(candidate->'aliases') loop
      failure_stage := 'alias_insert';
      insert into public.problem_aliases (canonical_problem_id, alias_text, normalized_alias, alias_type)
        values (canonical_id, alias->>'text', alias->>'normalizedAlias', 'title') on conflict (normalized_alias) do nothing;
      if found then created_aliases := created_aliases + 1; else reused_aliases := reused_aliases + 1; end if;
    end loop;
    expected := jsonb_array_length(candidate->'observationIds');
    select count(*) into already_owned from public.problem_observations
      where id in (select value::uuid from jsonb_array_elements_text(candidate->'observationIds'))
        and canonical_problem_id = canonical_id;
    failure_stage := 'observation_link';
    update public.problem_observations set canonical_problem_id = canonical_id, updated_at = now()
      where id in (select value::uuid from jsonb_array_elements_text(candidate->'observationIds')) and canonical_problem_id is null;
    get diagnostics affected = row_count;
    failure_stage := 'post_link_verification';
    select count(*) into verified from public.problem_observations
      where id in (select value::uuid from jsonb_array_elements_text(candidate->'observationIds'))
        and canonical_problem_id = canonical_id;
    if verified <> expected then
      raise exception using errcode = 'P0001', message = 'canonical_bootstrap_observation_conflict';
    end if;
    linked_observations := linked_observations + affected;
    already_linked := already_linked + already_owned;
  end loop;
  failure_stage := 'internal_integrity';
  return jsonb_build_object('activationPlanHash', p_plan_hash, 'candidatesCreated', created_candidates, 'candidatesReused', reused_candidates,
    'aliasesCreated', created_aliases, 'aliasesReused', reused_aliases, 'observationsLinked', linked_observations,
    'observationsAlreadyLinked', already_linked, 'status', case when created_candidates = 0 then 'already_applied' else 'applied' end);
exception when serialization_failure or deadlock_detected then raise;
when others then
  if sqlerrm in (
    'canonical_bootstrap_preflight_failed',
    'canonical_bootstrap_identity_collision',
    'canonical_bootstrap_alias_collision',
    'canonical_bootstrap_observation_conflict',
    'canonical_bootstrap_candidate_snapshot_mismatch'
  ) then raise; end if;
  if sqlerrm ~ '^canonical_bootstrap_canonical_insert_failed:stage=canonical_insert:sqlstate=[0-9A-Z]{5}(:constraint=[a-z_][a-z0-9_]{0,62})?(:table=[a-z_][a-z0-9_]{0,62})?(:column=[a-z_][a-z0-9_]{0,62})?$' then
    raise;
  end if;

  raise exception using errcode = 'P0001', message = case failure_stage
    when 'canonical_insert' then 'canonical_bootstrap_canonical_insert_failed'
    when 'ledger_insert' then 'canonical_bootstrap_ledger_insert_failed'
    when 'alias_insert' then 'canonical_bootstrap_alias_insert_failed'
    when 'observation_link' then 'canonical_bootstrap_observation_link_failed'
    when 'post_link_verification' then 'canonical_bootstrap_post_link_verification_failed'
    when 'preflight' then 'canonical_bootstrap_preflight_failed'
    else 'canonical_bootstrap_internal_integrity_failed'
  end;
end;
$$;
alter function public.apply_canonical_bootstrap_activation(text,jsonb) owner to postgres;


-- Audited replacement: supabase/migrations/20261008010000_qualified_evidence_snapshot_v2.sql:85
create or replace function public.validation_promote_customer_interview_evidence(
  p_owner_id uuid,
  p_observation_id uuid,
  p_classification_id uuid,
  p_canonical_problem_id uuid,
  p_polarity text,
  p_representative_group_key text,
  p_promotion_fingerprint text,
  p_representative_state jsonb,
  p_authority_snapshot jsonb,
  p_canonical_title text,
  p_normalized_title text,
  p_policy_version text,
  p_resolver_version text,
  p_projection_version text
)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare
  o public.validation_evidence_observations;
  e public.validation_experiment_versions;
  p public.validation_participants;
  s public.validation_interview_sessions;
  c public.validation_evidence_classifications;
  share public.validation_customer_interview_shareable_evidence;
  canonical public.canonical_problems;
  prior public.validation_evidence_promotions;

  experiment_lock record;

  current_representative_state jsonb;

  shared_id uuid;
  ledger_id uuid;
  terminals integer;
begin
  perform saasscout_private.b43_enter();

  if
    p_policy_version <> 'v8-b1.2'
    or p_resolver_version <> 'v8-b3.0.2-exact.1'
    or p_projection_version <> 'v8-b3.1-projection.1'
    or p_polarity not in (
      'supporting',
      'contradicting',
      'mixed'
    )
    or p_promotion_fingerprint !~ '^[0-9a-f]{64}$'
    or p_representative_state is null
    or jsonb_typeof(p_representative_state) <> 'object'
  then
    raise exception 'unsupported promotion contract'
      using errcode='23514';
  end if;


  -- Source finality can be checked before coordination as a fast path.
  -- It is checked again after coordination before any write.
  select *
  into prior
  from public.validation_evidence_promotions
  where
    owner_id = p_owner_id
    and observation_id = p_observation_id
    and policy_version = p_policy_version
    and problem_observation_id is not null;

  if found then
    if
      prior.promotion_fingerprint = p_promotion_fingerprint
      and prior.classification_id = p_classification_id
      and prior.canonical_problem_id = p_canonical_problem_id
      and prior.polarity = p_polarity
    then
      return jsonb_build_object(
        'promotionId', prior.id,
        'problemObservationId',
          prior.problem_observation_id,
        'duplicate', true
      );
    end if;

    raise exception
      'promotion correction required: source observation is final'
      using errcode='P0001';
  end if;


  -- Initial source lookup is used only to discover the authoritative
  -- participant identity required for coordination.
  select *
  into o
  from public.validation_evidence_observations
  where
    id = p_observation_id
    and owner_id = p_owner_id;

  if
    not found
    or o.participant_id is null
    or o.interview_session_id is null
  then
    raise exception 'ineligible observation'
      using errcode='23514';
  end if;


  -- ---------------------------------------------------------------
  -- Global lock order
  -- ---------------------------------------------------------------

  perform public.validation_b31_lock(
    'canonical-registry',
    'v1'
  );


  -- A participant may have persisted observations associated with more
  -- than one experiment version. Lock every currently represented
  -- experiment deterministically before taking the participant lock.
  --
  -- Concurrent insertion of a new observation also acquires its
  -- experiment lock before the participant lock. Therefore the
  -- participant lock becomes the serialization point for candidate-set
  -- membership.

  for experiment_lock in
    select distinct
      candidate.experiment_version_id
    from public.validation_evidence_observations candidate
    where
      candidate.owner_id = p_owner_id
      and candidate.participant_id = o.participant_id
      and candidate.experiment_version_id is not null
    order by candidate.experiment_version_id
  loop
    perform public.validation_b31_lock(
      'experiment',
      experiment_lock.experiment_version_id::text
    );
  end loop;


  -- Ensure the requested observation's experiment is coordinated even
  -- if the candidate query above becomes unexpectedly incomplete.
  perform public.validation_b31_lock(
    'experiment',
    o.experiment_version_id::text
  );


  perform public.validation_b31_lock(
    'participant',
    o.participant_id::text
  );


  perform public.validation_b31_lock(
    'representative-group',
    p_owner_id::text
      || ':'
      || o.participant_id::text
      || ':'
      || p_canonical_problem_id::text
      || ':'
      || p_polarity
      || ':'
      || p_policy_version
  );


  -- ---------------------------------------------------------------
  -- Revalidate after coordination
  -- ---------------------------------------------------------------

  -- A concurrent exact retry or peer may have finalized while this
  -- transaction waited.
  select *
  into prior
  from public.validation_evidence_promotions
  where
    owner_id = p_owner_id
    and observation_id = p_observation_id
    and policy_version = p_policy_version
    and problem_observation_id is not null;

  if found then
    if
      prior.promotion_fingerprint = p_promotion_fingerprint
      and prior.classification_id = p_classification_id
      and prior.canonical_problem_id = p_canonical_problem_id
      and prior.polarity = p_polarity
    then
      return jsonb_build_object(
        'promotionId', prior.id,
        'problemObservationId',
          prior.problem_observation_id,
        'duplicate', true
      );
    end if;

    raise exception
      'promotion correction required: source observation is final'
      using errcode='P0001';
  end if;


  -- Re-read the source after locks.
  select *
  into o
  from public.validation_evidence_observations
  where
    id = p_observation_id
    and owner_id = p_owner_id;

  if
    not found
    or o.participant_id is null
    or o.interview_session_id is null
  then
    raise exception
      'promotion eligibility changed'
      using errcode='40001';
  end if;


  -- ---------------------------------------------------------------
  -- P1 representative freshness proof
  -- ---------------------------------------------------------------
  --
  -- PostgreSQL does not rank observations here.
  --
  -- TypeScript already selected the representative. PostgreSQL merely
  -- proves that the persisted participant state used for that decision
  -- has not changed since preparation.

  current_representative_state :=
    public.validation_b31_representative_state(
      p_owner_id,
      o.participant_id
    );

  if
    current_representative_state
      is distinct from p_representative_state
  then
    raise exception
      'representative authority state changed'
      using errcode='40001';
  end if;


  -- ---------------------------------------------------------------
  -- Existing B3.1 authoritative revalidation
  -- ---------------------------------------------------------------

  select *
  into e
  from public.validation_experiment_versions
  where
    id = o.experiment_version_id
    and owner_id = p_owner_id;

  select *
  into p
  from public.validation_participants
  where
    id = o.participant_id
    and owner_id = p_owner_id;

  select *
  into s
  from public.validation_interview_sessions
  where
    id = o.interview_session_id
    and owner_id = p_owner_id;

  select *
  into c
  from public.validation_evidence_classifications
  where
    id = p_classification_id
    and observation_id = o.id
    and owner_id = p_owner_id;

  select *
  into share
  from public.validation_customer_interview_shareable_evidence
  where
    source_observation_id = o.id
    and owner_id = p_owner_id;

  select *
  into canonical
  from public.canonical_problems
  where
    id = p_canonical_problem_id
    and status = 'active';


  if
    public.validation_b31_authority_snapshot(
      o.subject_id,
      o.hypothesis_version_id
    )
    is distinct from p_authority_snapshot
  then
    raise exception
      'canonical authority snapshot changed'
      using errcode='40001';
  end if;


  if
    canonical.id is null
    or canonical.canonical_title <> p_canonical_title
    or canonical.normalized_title <> p_normalized_title
  then
    raise exception
      'canonical authority snapshot changed'
      using errcode='40001';
  end if;


  if
    o.origin <> 'human_interview'
    or o.modality <> 'interview_observation'
    or o.source_type <> 'customer_interview'
    or jsonb_typeof(o.observation_content) <> 'object'
    or o.observation_content = '{}'::jsonb

    or e.family <> 'customer_interview'
    or e.lifecycle not in (
      'running',
      'paused',
      'completed'
    )

    or p.status <> 'active'

    or s.status not in (
      'in_progress',
      'completed'
    )

    or s.participant_relevance
      <> 'target_segment_match'

    or s.participant_id <> o.participant_id
    or s.experiment_version_id
      <> o.experiment_version_id

    or c.id is null
    or c.authority_status <> 'authoritative'
    or c.classification_source = 'ai_model_suggested'
    or c.polarity <> p_polarity
  then
    raise exception
      'promotion eligibility changed'
      using errcode='23514';
  end if;


  select count(*)
  into terminals
  from public.validation_evidence_classifications x
  where
    x.owner_id = p_owner_id
    and x.observation_id = o.id
    and x.authority_status = 'authoritative'
    and x.classification_source <> 'ai_model_suggested'
    and not exists (
      select 1
      from public.validation_evidence_classifications successor
      where
        successor.owner_id = x.owner_id
        and successor.supersedes_classification_id = x.id
    );


  if
    terminals <> 1
    or exists (
      select 1
      from public.validation_evidence_classifications successor
      where
        successor.owner_id = p_owner_id
        and successor.supersedes_classification_id = c.id
    )
  then
    raise exception
      'authoritative classification changed'
      using errcode='40001';
  end if;


  if
    share.id is null
    or share.contract_version
      <> 'customer_interview_shareable_evidence_v1'
    or share.review_confirmation
      <> 'human_reviewed_for_shared_evidence_use'
    or share.statement_sha256
      <> encode(
        extensions.digest(
          convert_to(
            share.statement,
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
  then
    raise exception
      'approved shareable evidence required'
      using errcode='23514';
  end if;


  -- Exact sorted-key JSON contract from promotion-service.ts, with no
  -- whitespace normalization inside values. Selection stays in B3.1 TypeScript.
  if p_representative_group_key is distinct from
      ('participant:'||o.participant_id::text||'|'||canonical.id::text||'|'||c.polarity)
    or p_promotion_fingerprint is distinct from encode(extensions.digest(convert_to(
      '{"canonicalProblemId":'||to_json(canonical.id)::text||
      ',"classificationId":'||to_json(c.id)::text||
      ',"observationId":'||to_json(o.id)::text||
      ',"polarity":'||to_json(c.polarity)::text||
      ',"policyVersion":'||to_json(p_policy_version)::text||
      ',"projectionVersion":'||to_json(p_projection_version)::text||
      ',"resolverVersion":'||to_json(p_resolver_version)::text||'}','UTF8'),'sha256'),'hex') then
    raise exception 'promotion identity changed' using errcode='40001';
  end if;

  -- ---------------------------------------------------------------
  -- Atomic shared projection + private ledger
  -- ---------------------------------------------------------------

  insert into public.problem_observations(
    canonical_problem_id,
    observation_fingerprint,
    problem_title,
    normalized_problem_title,
    source_type,
    source_evidence,
    evidence_polarity,
    observed_at,
    metadata
  )
  values(
    canonical.id,
    'validation-promotion:' || p_promotion_fingerprint,
    canonical.canonical_title,
    canonical.normalized_title,
    'customer_interview_human_reviewed',
    share.statement,
    p_polarity,
    o.observed_at,
    jsonb_build_object(
      'projectionVersion',
      p_projection_version
    )
  )
  returning id
  into shared_id;


  insert into public.validation_evidence_promotions(
    owner_id,
    observation_id,
    classification_id,
    subject_id,
    hypothesis_id,
    hypothesis_version_id,
    experiment_id,
    experiment_version_id,
    participant_id,
    interview_session_id,
    policy_version,
    eligible,
    eligibility_reasons,
    independence_kind,
    independence_private_id,
    polarity,
    representative_group_key,
    representative_selected,
    canonical_problem_id,
    resolution_status,
    resolution_reason,
    resolver_version,
    problem_observation_id,
    promotion_fingerprint,
    projection_version
  )
  values(
    p_owner_id,
    o.id,
    c.id,
    o.subject_id,
    o.hypothesis_id,
    o.hypothesis_version_id,
    o.experiment_id,
    o.experiment_version_id,
    o.participant_id,
    o.interview_session_id,
    p_policy_version,
    true,
    array['eligible'],
    'participant',
    o.participant_id,
    p_polarity,
    p_representative_group_key,
    true,
    canonical.id,
    'resolved',
    'server_exact_authority_snapshot',
    p_resolver_version,
    shared_id,
    p_promotion_fingerprint,
    p_projection_version
  )
  returning id
  into ledger_id;


  -- B4.2-B1: only a NEW controlled promotion creates an attestation.
  -- Both duplicate exits above deliberately leave historical rows unattested.
  -- Capture the actual persisted row AFTER shared triggers/defaults, atomically.
  insert into public.validation_qualified_evidence_snapshots(
    promotion_id, problem_observation_id, canonical_problem_id,
    problem_title, source_evidence, source_type, evidence_polarity,
    observed_at, observation_fingerprint, promotion_fingerprint,
    projection_version, attestation_version, protected_record, protected_schema
  ) select
    ledger_id, po.id, po.canonical_problem_id,
    po.problem_title, po.source_evidence, po.source_type, po.evidence_polarity,
    po.observed_at, po.observation_fingerprint, p_promotion_fingerprint,
    p_projection_version, 'v8-b4.2-b1-full-row.2',
    public.validation_b42_row_record(po), public.validation_b42_protected_schema()
  from public.problem_observations po where po.id=shared_id;
  if not found then raise exception 'persisted projection required' using errcode='23514'; end if;


  return jsonb_build_object(
    'promotionId',
    ledger_id,
    'problemObservationId',
    shared_id,
    'duplicate',
    false
  );
end
$$;
alter function public.validation_promote_customer_interview_evidence(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,text,text,text,text) owner to postgres;


-- Audited replacement: supabase/migrations/20260926000000_controlled_customer_interview_promotion.sql:105
create or replace function public.validation_b31_lock_registry_statement()
returns trigger
language plpgsql volatile security invoker set search_path=pg_catalog,pg_temp as $$
begin
  perform saasscout_private.b43_enter();

  perform public.validation_b31_lock(
    'canonical-registry',
    'v1'
  );

  return null;
end
$$;
alter function public.validation_b31_lock_registry_statement() owner to postgres;

-- Typed replacements for the only three application direct-DML operations.
create function public.validation_add_subject_link(
  p_owner_id uuid,p_subject_id uuid,p_source_type text,p_source_row_id text,
  p_source_version text,p_link_role text,p_context_snapshot jsonb
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare linked public.validation_subject_links; upstream_owned boolean; upstream_id uuid;
begin
  perform saasscout_private.b43_enter();
  perform 1 from public.validation_subjects where id=p_subject_id and owner_id=p_owner_id;
  if not found then raise exception 'not found' using errcode='P0002'; end if;
  begin
    upstream_id:=p_source_row_id::uuid;
  exception when invalid_text_representation then
    raise exception 'not found' using errcode='P0002';
  end;
  -- Fixed dependencies only. Never concatenate an input into a SQL identifier.
  case p_source_type
    when 'discover' then select exists(select 1 from public.discovered_problems where id=upstream_id and user_id=p_owner_id) into upstream_owned;
    when 'scan' then select exists(select 1 from public.scan where id=upstream_id and user_id=p_owner_id) into upstream_owned;
    when 'weekly' then select exists(select 1 from public.weekly_intelligence_runs where id=upstream_id and user_id=p_owner_id) into upstream_owned;
    when 'saved_idea' then select exists(select 1 from public.saved_ideas where id=upstream_id and user_id=p_owner_id) into upstream_owned;
    when 'opportunity' then select exists(select 1 from public.opportunities where id=upstream_id and user_id=p_owner_id) into upstream_owned;
    else raise exception 'unsupported provenance' using errcode='23514';
  end case;
  if not upstream_owned then raise exception 'not found' using errcode='P0002'; end if;
  insert into public.validation_subject_links(owner_id,subject_id,source_type,source_row_id,source_version,link_role,context_snapshot)
    values(p_owner_id,p_subject_id,p_source_type,p_source_row_id,p_source_version,p_link_role,p_context_snapshot)
    on conflict(owner_id,subject_id,source_type,source_row_id,link_role) do nothing returning * into linked;
  -- Existing ignoreDuplicates().single() returns no row on duplicate: preserve
  -- the repository's generic 409 rather than silently making this a success.
  if not found then return null; end if;
  return to_jsonb(linked)-'owner_id';
end $$;
alter function public.validation_add_subject_link(uuid,uuid,text,text,text,text,jsonb) owner to postgres;
revoke all on function public.validation_add_subject_link(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.validation_add_subject_link(uuid,uuid,text,text,text,text,jsonb) to service_role;

create function public.validation_create_participant(
  p_owner_id uuid,p_experiment_id uuid,p_identity_mode text,p_pseudonymous_reference text,
  p_independence_key text,p_consent_mode text,p_consent_purpose text,p_consent_captured_at timestamptz
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare participant public.validation_participants;
begin
  perform saasscout_private.b43_enter();
  if p_experiment_id is not null then
    perform 1 from public.validation_experiments where id=p_experiment_id and owner_id=p_owner_id;
    if not found then raise exception 'not found' using errcode='P0002'; end if;
  end if;
  insert into public.validation_participants(owner_id,experiment_id,identity_mode,pseudonymous_reference,
    independence_key,consent_mode,consent_purpose,consent_captured_at)
  values(p_owner_id,p_experiment_id,p_identity_mode,p_pseudonymous_reference,
    p_independence_key,p_consent_mode,p_consent_purpose,p_consent_captured_at) returning * into participant;
  return jsonb_build_object('id',participant.id,'experiment_id',participant.experiment_id,
    'identity_mode',participant.identity_mode,'pseudonymous_reference',participant.pseudonymous_reference,
    'status',participant.status,'consent_mode',participant.consent_mode,'consent_purpose',participant.consent_purpose,
    'consent_captured_at',participant.consent_captured_at,'created_at',participant.created_at);
end $$;
alter function public.validation_create_participant(uuid,uuid,text,text,text,text,text,timestamptz) owner to postgres;
revoke all on function public.validation_create_participant(uuid,uuid,text,text,text,text,text,timestamptz) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.validation_create_participant(uuid,uuid,text,text,text,text,text,timestamptz) to service_role;

-- Deliberately not the full problem_observations row type: no id/canonical ID,
-- qualification/polarity, authority or internal timestamps can be supplied.
create type public.b43_market_observation_input as (
  observation_fingerprint text,problem_title text,normalized_problem_title text,
  problem_summary text,source_table text,source_row_id text,source_url text,source_type text,
  source_evidence text,source_author_id text,source_metrics jsonb,affected_niches text[],
  problem_cluster text,pain_score numeric,revenue_score numeric,urgency_score numeric,
  trend_score numeric,buying_signal_score numeric,frequency_score numeric,source_quality_score numeric,
  opportunity_score numeric,confidence_score numeric,evidence_quality text,observed_at timestamptz,metadata jsonb
);
alter type public.b43_market_observation_input owner to postgres;
revoke all on type public.b43_market_observation_input from public,anon,authenticated,service_role,authenticator;
grant usage on type public.b43_market_observation_input to service_role;

create function public.knowledge_insert_problem_observations(p_rows public.b43_market_observation_input[])
returns table(observation_fingerprint text)
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
#variable_conflict use_column
begin
  perform saasscout_private.b43_enter();
  return query
    insert into public.problem_observations as target(
      observation_fingerprint,problem_title,normalized_problem_title,problem_summary,source_table,source_row_id,
      source_url,source_type,source_evidence,source_author_id,source_metrics,affected_niches,problem_cluster,
      pain_score,revenue_score,urgency_score,trend_score,buying_signal_score,frequency_score,source_quality_score,
      opportunity_score,confidence_score,evidence_quality,observed_at,metadata)
    select r.observation_fingerprint,r.problem_title,r.normalized_problem_title,r.problem_summary,r.source_table,r.source_row_id,
      r.source_url,r.source_type,r.source_evidence,r.source_author_id,r.source_metrics,r.affected_niches,r.problem_cluster,
      r.pain_score,r.revenue_score,r.urgency_score,r.trend_score,r.buying_signal_score,r.frequency_score,r.source_quality_score,
      r.opportunity_score,r.confidence_score,r.evidence_quality,r.observed_at,r.metadata
    from unnest(p_rows) r
    on conflict(observation_fingerprint) do nothing returning target.observation_fingerprint;
end $$;
alter function public.knowledge_insert_problem_observations(public.b43_market_observation_input[]) owner to postgres;
revoke all on function public.knowledge_insert_problem_observations(public.b43_market_observation_input[]) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.knowledge_insert_problem_observations(public.b43_market_observation_input[]) to service_role;

-- Install guards without dropping any source-integrity/history/capture trigger.
-- Application direct SQL is denied by ACLs; this guard is defense in depth for
-- indirect writes. It is NOT SECURITY DEFINER and is NOT a snapshot refresh.
do $guards$
declare item record;
begin
  for item in select relation_name from pg_temp.b43_tables order by relation_name loop
    execute format('create trigger b43_00_entry before insert or update or delete or truncate on public.%I for each statement execute function saasscout_private.b43_guard_statement()',item.relation_name);
  end loop;
end
$guards$;

-- Reduce both relation and column privileges. An inherited UPDATE on even one
-- column can authorize locking SELECT, so final *effective* privilege assertions
-- are mandatory. Do not revoke SELECT, existing policies or grants on other tables.
do $acl$
declare item record; col record; app text;
begin
  for item in select relation_name from pg_temp.b43_tables loop
    execute format('revoke insert,update,delete,truncate,references,trigger,maintain on public.%I from public,anon,authenticated,service_role,authenticator restrict',item.relation_name);
    for col in select attname from pg_attribute where attrelid=to_regclass('public.'||item.relation_name)
      and attnum>0 and not attisdropped loop
      execute format('revoke insert(%I),update(%I),references(%I) on public.%I from public,anon,authenticated,service_role,authenticator restrict',col.attname,col.attname,col.attname,item.relation_name);
    end loop;
  end loop;
end
$acl$;
revoke all on function public.validation_b31_lock(text,text) from public,anon,authenticated,service_role,authenticator;

-- Exact implemented definitions. These assertions also cover new helpers/RPCs.
create temporary table b43_implemented(signature text primary key, body_md5 text, is_definer boolean) on commit drop;
insert into pg_temp.b43_implemented values
  ('saasscout_private.b43_enter()','4e3736f9f8fe0523d4b25eb559e63a76',false),
  ('saasscout_private.b43_guard_statement()','4a54767a7b37e4c9a16f0826011e9178',false),
  ('public.validation_create_subject(uuid,text,text,jsonb,text,text,text,jsonb)','f003de4ab5b04c65874af297bfcc4850',true),
  ('public.validation_create_hypothesis(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)','db6e8e19f7b1396b27c41ec718c991e1',true),
  ('public.validation_append_hypothesis_version(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)','ee9bcd1c2b5f8ea6a5eedb427407256e',true),
  ('public.validation_create_experiment(uuid,uuid,uuid,text,jsonb,text,jsonb,jsonb,text,uuid)','f52e35ad9c0f92e423747311222301c9',true),
  ('public.validation_append_experiment_version(uuid,uuid,uuid,text,jsonb,text,jsonb,jsonb,text,uuid)','b4e5fe137372625c35752b81a6939599',true),
  ('public.validation_transition_experiment_version(uuid,uuid,text,text)','90efe4c2ad7db8c6fd097616dcd69d44',true),
  ('public.validation_record_observation(uuid,uuid,uuid,text,text,text,timestamptz,text,text,text,jsonb,text,text,text,text,boolean)','6edabb5bcb8d4f78095a725523f6cc8a',true),
  ('public.validation_create_interview_plan(uuid,uuid,jsonb,uuid)','a0530061562302e3feb11ec7aa9540a0',true),
  ('public.validation_create_interview_session(uuid,uuid,uuid,uuid,text)','5018159696fc1ba0db249f41607be4ca',true),
  ('public.validation_update_interview_session(uuid,uuid,text,text,text)','fcd81d08e222ede3bef67b1c01eb7685',true),
  ('public.validation_update_interview_relevance(uuid,uuid,text,text)','f6d7608be74c1f431dfb79cba30e9fe8',true),
  ('public.validation_record_interview_observation(uuid,uuid,timestamptz,jsonb,text)','48fe89cc424fe53d85d489fa68927a79',true),
  ('public.validation_record_interview_observation_v2(uuid,uuid,timestamptz,jsonb,text,text,boolean)','6f4f840fa5ae87819ea7e6a3e5a19d7a',true),
  ('public.validation_update_participant_status(uuid,uuid,text,text)','84dba5abf535ba30f2c81e2f97b14f2e',true),
  ('public.validation_insert_classification(uuid,uuid,text,text,text,text,uuid)','e4b9b53434d8f44b3d84cf4fe169c6d1',true),
  ('public.validation_create_survey_plan(uuid,uuid,text,text,jsonb,uuid)','a9e8fbc41d3d0ccc11359886550a0ed4',true),
  ('public.validation_publish_survey(uuid,uuid,text)','8aac60851b798456aba99e03158b77bb',true),
  ('public.validation_revoke_survey(uuid,uuid)','ecb144dc2a007ba9e34b73ab8db331a8',true),
  ('public.validation_submit_public_survey(text,text,text,jsonb)','9554ab642d2f07672dc7609d18a1517b',true),
  ('public.validation_claim_intelligence_run(uuid,uuid,uuid,uuid,jsonb,text,text,text)','9ba3b224223db272d31d7d2f0928a0ed',true),
  ('public.validation_complete_intelligence_run(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)','089a32d62f4fe321fb3122bd493cbc4b',true),
  ('public.validation_fail_intelligence_run(uuid,uuid,text)','82bd9129e7707ee25b92659592644f80',true),
  ('public.apply_canonical_bootstrap_activation(text,jsonb)','9d396c400cd2f94babd7b3f28509e4d4',true),
  ('public.validation_promote_customer_interview_evidence(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,text,text,text,text)','024b3647e916e2449020866248fd6a80',true),
  ('public.validation_b31_lock_registry_statement()','e5d3e81716798e2bae37bf1769b81f21',false),
  ('public.validation_add_subject_link(uuid,uuid,text,text,text,text,jsonb)','3640cd24118424dba6d6c753d6b92cc9',true),
  ('public.validation_create_participant(uuid,uuid,text,text,text,text,text,timestamptz)','4a940d67ac592106fc433414aa13dd2e',true),
  ('public.knowledge_insert_problem_observations(public.b43_market_observation_input[])','f776e856f7d9cbaaa02248e528e29284',true);

do $assertions$
declare item record; app text; rel oid; fn oid;
begin
  -- Same role-boundary detector as B4.3, expanded to all relevant owners.
  if not (with sources as (select * from pg_roles where rolname in ('anon','authenticated','service_role','authenticator')),
    targets as (select oid from pg_roles where rolname='postgres' or rolsuper or rolcreaterole
      or (rolbypassrls and rolname not in ('anon','authenticated','service_role','authenticator'))
      or oid in (select proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('public','saasscout_private')
        union select nspowner from pg_namespace where nspname in ('public','auth','saasscout_private')
        union select relowner from pg_class c join pg_temp.b43_tables e on c.oid=to_regclass('public.'||e.relation_name)))
    select (select count(*) from sources)=4
      and not exists(select 1 from sources where rolsuper or rolcreaterole or (rolbypassrls and rolname<>'service_role'))
      and not exists(select 1 from sources a cross join targets t where pg_has_role(a.oid,t.oid,'SET')
        or pg_has_role(a.oid,t.oid,'USAGE') or pg_has_role(a.oid,t.oid,'MEMBER'))
      and not exists(select 1 from sources a cross join targets t cross join pg_auth_members g
        where g.admin_option and pg_has_role(a.oid,g.member,'MEMBER') and pg_has_role(g.roleid,t.oid,'MEMBER')))
  then raise exception 'B43 unsafe role boundary' using errcode='42501'; end if;

  if exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated')
    and (pg_has_role(r.oid,'service_role'::regrole,'SET')
      or pg_has_role(r.oid,'service_role'::regrole,'USAGE')
      or pg_has_role(r.oid,'service_role'::regrole,'MEMBER'))) then
    raise exception 'B43 browser can reach service role' using errcode='42501';
  end if;

  if (select count(*) from saasscout_private.b43_coordination)<>1
    or not exists(select 1 from saasscout_private.b43_coordination where singleton and version=0) then
    raise exception 'B43 invalid initial fence' using errcode='55000';
  end if;
  for item in select * from pg_temp.b43_implemented loop
    fn:=to_regprocedure(item.signature);
    if not exists(select 1 from pg_proc where oid=fn and proowner='postgres'::regrole
      and prosecdef=item.is_definer and provolatile='v' and proconfig=array['search_path=pg_catalog, pg_temp']
      and md5(prosrc)=item.body_md5) then
      raise exception 'B43 implementation attribute mismatch' using errcode='55000';
    end if;
    foreach app in array array['anon','authenticated','authenticator'] loop
      if has_function_privilege(app,fn,'EXECUTE') then
        raise exception 'B43 unexpected application execute' using errcode='42501';
      end if;
    end loop;
    if item.signature<>'public.validation_b31_lock_registry_statement()'
      and has_function_privilege('service_role',fn,'EXECUTE') is distinct from item.is_definer then
      raise exception 'B43 service entry boundary mismatch' using errcode='42501';
    end if;
  end loop;
  -- Registry trigger retains its original ACL (including platform defaults);
  -- it is an invoker and cannot grant a service caller access to private entry.
  -- Check original read/proof/private functions byte-for-byte and every retained ACL.
  if exists(select 1 from pg_temp.b43_original_functions b join pg_proc p on p.oid=b.oid
    where p.proowner<>b.proowner
      or (p.proname<>'validation_b31_lock' and p.proacl is distinct from b.proacl)
      or (not exists(select 1 from pg_temp.b43_implemented i where to_regprocedure(i.signature)=p.oid)
        and (p.prosrc is null or md5(p.prosrc)<>b.body_md5 or p.prosecdef<>b.prosecdef
          or p.provolatile<>b.provolatile or p.proconfig is distinct from b.proconfig))) then
    raise exception 'B43 retained function contract changed' using errcode='55000';
  end if;
  for item in select relation_name from pg_temp.b43_tables loop
    rel:=to_regclass('public.'||item.relation_name);
    if not exists(select 1 from pg_trigger t where t.tgrelid=rel and t.tgname='b43_00_entry'
      and not t.tgisinternal and t.tgtype=62 and t.tgenabled='O' and t.tgnargs=0 and t.tgqual is null
      and t.tgfoid='saasscout_private.b43_guard_statement()'::regprocedure)
      or exists(select 1 from pg_trigger t where t.tgrelid=rel and not t.tgisinternal
        and (t.tgtype & 3)=2 and t.tgname<'b43_00_entry') then
      raise exception 'B43 guard coverage/order mismatch' using errcode='55000';
    end if;
    foreach app in array array['anon','authenticated','service_role','authenticator'] loop
      if has_table_privilege(app,rel,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        or has_any_column_privilege(app,rel,'INSERT,UPDATE,REFERENCES') then
        raise exception 'B43 effective direct mutation/row-lock privilege remains' using errcode='42501';
      end if;
    end loop;
  end loop;
  if exists(select 1 from pg_temp.b43_reads b join pg_class c on c.oid=to_regclass('public.'||b.relation_name)
      where has_table_privilege(b.rolname,c.oid,'SELECT') is distinct from b.allowed
      or array(select a.attnum from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
        and has_column_privilege(b.rolname,c.oid,a.attnum,'SELECT') order by a.attnum) is distinct from b.readable_columns
      or c.relrowsecurity<>b.relrowsecurity or c.relforcerowsecurity<>b.relforcerowsecurity
      or (select coalesce(jsonb_agg(to_jsonb(p) order by p.oid),'[]'::jsonb) from pg_policy p where p.polrelid=c.oid) is distinct from b.policies) then
    raise exception 'B43 SELECT/RLS changed' using errcode='55000';
  end if;
  if exists(select 1 from pg_temp.b43_expected_triggers e left join pg_trigger t
    on t.tgrelid=to_regclass('public.'||e.relation_name) and t.tgname=e.trigger_name
    where t.oid is null or t.tgtype<>e.event_bits or t.tgfoid<>to_regprocedure(e.function_name) or t.tgenabled<>'O') then
    raise exception 'B43 existing trigger changed' using errcode='55000';
  end if;
  foreach app in array array['anon','authenticated','service_role','authenticator'] loop
    if has_schema_privilege(app,'saasscout_private','USAGE,CREATE')
      or has_schema_privilege(app,'public','CREATE')
      or has_table_privilege(app,'saasscout_private.b43_coordination','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      or has_any_column_privilege(app,'saasscout_private.b43_coordination','SELECT,INSERT,UPDATE,REFERENCES')
      or has_function_privilege(app,'public.validation_b31_lock(text,text)','EXECUTE')
      or has_function_privilege(app,'public.validation_b43_read_current_evidence(uuid)','EXECUTE') then
      raise exception 'B43 private boundary exposed' using errcode='42501';
    end if;
  end loop;
end
$assertions$;
commit;
