insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');

insert into public.validation_subjects(id, owner_id, creation_origin, label) values
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','user_entered','Subject A');
insert into public.validation_hypotheses(id, owner_id, subject_id) values
  ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
insert into public.validation_hypothesis_versions(id, owner_id, subject_id, hypothesis_id, version_number, target_segment, problem_claim, expected_observable_behavior, support_criteria, contradiction_criteria, inconclusive_criteria)
values ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'Segment','Problem claim','Observable behavior','["yes"]','["no"]','["unknown"]');
insert into public.validation_experiments(id, owner_id, subject_id) values
  ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
insert into public.validation_experiment_versions(id, owner_id, subject_id, experiment_id, hypothesis_id, hypothesis_version_id, version_number, family, target_audience, collection_method, design_snapshot, consent_privacy_mode)
values
  ('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1,'customer_interview','["audience"]','manual','{}','anonymous_notes'),
  ('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1,'customer_interview','["audience"]','manual','{}','anonymous_notes');

-- The referenced unique tuple exists because this supersession FK was created successfully.
select conname from pg_constraint where conname = 'validation_experiment_versions_supersedes_fk';

do $$ begin
  begin
    insert into public.validation_participants(owner_id, identity_mode) values ('00000000-0000-0000-0000-000000000001','experiment_pseudonymous');
    raise exception 'experiment_pseudonymous without experiment was accepted';
  exception when check_violation then null; end;
end $$;
insert into public.validation_participants(id, owner_id, experiment_id, identity_mode) values
  ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','experiment_pseudonymous'),
  ('60000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','identified_interview'),
  ('60000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','manual_imported'),
  ('60000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001',null,'owner_pseudonymous');

do $$ begin
  begin
    insert into public.validation_evidence_observations(owner_id, subject_id, hypothesis_id, hypothesis_version_id, experiment_id, experiment_version_id, participant_id, origin, modality, observed_at, source_type, collected_by, observation_content)
    values ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001','human_interview','interview_observation',now(),'manual','manual','{}');
    raise exception 'cross-experiment participant evidence was accepted';
  exception when check_violation then null; end;
end $$;

insert into public.validation_evidence_observations(id, owner_id, subject_id, hypothesis_id, hypothesis_version_id, experiment_id, experiment_version_id, participant_id, origin, modality, observed_at, source_type, collected_by, observation_content)
values ('70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','human_interview','interview_observation',now(),'manual','manual','{}');
insert into public.validation_evidence_classifications(id, owner_id, observation_id, polarity, classification_source, authority_status)
values ('80000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','inconclusive','user_supplied','authoritative');
insert into public.validation_evidence_classifications(owner_id, observation_id, polarity, classification_source, authority_status, supersedes_classification_id)
values ('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','supporting','user_supplied','authoritative','80000000-0000-0000-0000-000000000001');

do $$ begin
  begin
    update public.validation_evidence_classifications set polarity = 'neutral' where id = '80000000-0000-0000-0000-000000000001';
    raise exception 'classification update was accepted';
  exception when sqlstate '55000' then null; end;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='validation_hypothesis_versions' and column_name='status') then
    raise exception 'immutable hypothesis version has stale status column';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='validation_evidence_classifications' and column_name='superseded_at') then
    raise exception 'ambiguous superseded_at column remains';
  end if;
end $$;
