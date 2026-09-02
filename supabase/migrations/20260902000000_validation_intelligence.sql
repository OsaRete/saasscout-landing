-- PR V7: immutable, owner-scoped interpretations of deterministic human evidence snapshots.
create table public.validation_intelligence_runs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, subject_id uuid not null, hypothesis_id uuid not null, hypothesis_version_id uuid not null,
 analysis_version_number integer not null check(analysis_version_number>0), evidence_snapshot jsonb not null, evidence_snapshot_hash text not null check(evidence_snapshot_hash~'^[0-9a-f]{64}$'),
 provider text not null check(length(provider) between 1 and 80), model text not null check(length(model) between 1 and 160), status text not null check(status in('running','completed','failed')),
 dimension_assessments jsonb, supporting_synthesis jsonb, contradicting_synthesis jsonb, uncertainty_synthesis jsonb, overall_assessment jsonb, next_experiment_recommendation jsonb,
 failure_code text, lease_expires_at timestamptz, created_at timestamptz not null default now(), completed_at timestamptz, failed_at timestamptz,
 constraint validation_intelligence_snapshot_bounded check(jsonb_typeof(evidence_snapshot)='object' and pg_column_size(evidence_snapshot)<=262144),
 constraint validation_intelligence_results_bounded check(coalesce(pg_column_size(dimension_assessments),0)+coalesce(pg_column_size(supporting_synthesis),0)+coalesce(pg_column_size(contradicting_synthesis),0)+coalesce(pg_column_size(uncertainty_synthesis),0)+coalesce(pg_column_size(overall_assessment),0)+coalesce(pg_column_size(next_experiment_recommendation),0)<=131072),
 constraint validation_intelligence_state check(
  (status='running' and lease_expires_at is not null and completed_at is null and failed_at is null and failure_code is null and dimension_assessments is null and supporting_synthesis is null and contradicting_synthesis is null and uncertainty_synthesis is null and overall_assessment is null and next_experiment_recommendation is null)
  or
  (status='completed' and lease_expires_at is null and completed_at is not null and failed_at is null and failure_code is null and dimension_assessments is not null and supporting_synthesis is not null and contradicting_synthesis is not null and uncertainty_synthesis is not null and overall_assessment is not null and next_experiment_recommendation is not null)
  or
  (status='failed' and lease_expires_at is null and completed_at is null and failed_at is not null and failure_code is not null and dimension_assessments is null and supporting_synthesis is null and contradicting_synthesis is null and uncertainty_synthesis is null and overall_assessment is null and next_experiment_recommendation is null)
 ),
 constraint validation_intelligence_hypothesis_fk foreign key(hypothesis_version_id,hypothesis_id,subject_id,owner_id) references public.validation_hypothesis_versions(id,hypothesis_id,subject_id,owner_id) on delete restrict,
 unique(subject_id,analysis_version_number), unique(id,owner_id)
);
create unique index validation_intelligence_active_snapshot_uidx on public.validation_intelligence_runs(owner_id,subject_id,hypothesis_version_id,evidence_snapshot_hash) where status in('running','completed');
create index validation_intelligence_history_idx on public.validation_intelligence_runs(owner_id,subject_id,analysis_version_number desc);

create function public.validation_protect_intelligence_history() returns trigger language plpgsql set search_path=public as $$ begin
 if tg_op='DELETE' or old.status in('completed','failed') then raise exception 'intelligence history is immutable' using errcode='23514';end if;
 if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id or new.subject_id is distinct from old.subject_id or new.hypothesis_id is distinct from old.hypothesis_id or new.hypothesis_version_id is distinct from old.hypothesis_version_id or new.analysis_version_number is distinct from old.analysis_version_number or new.evidence_snapshot is distinct from old.evidence_snapshot or new.evidence_snapshot_hash is distinct from old.evidence_snapshot_hash or new.provider is distinct from old.provider or new.model is distinct from old.model or new.created_at is distinct from old.created_at then raise exception 'intelligence lineage is immutable' using errcode='23514';end if;
 if old.status<>'running' or new.status not in('completed','failed') then raise exception 'invalid intelligence transition' using errcode='23514';end if;return new;end $$;
create trigger validation_intelligence_history_guard before update or delete on public.validation_intelligence_runs for each row execute function public.validation_protect_intelligence_history();

create function public.validation_claim_intelligence_run(p_owner_id uuid,p_subject_id uuid,p_hypothesis_id uuid,p_hypothesis_version_id uuid,p_evidence_snapshot jsonb,p_evidence_snapshot_hash text,p_provider text,p_model text) returns jsonb language plpgsql security definer set search_path=public as $$ declare root public.validation_subjects; prior public.validation_intelligence_runs; created public.validation_intelligence_runs;n integer;begin
 select * into root from public.validation_subjects where id=p_subject_id and owner_id=p_owner_id for update;if not found then raise exception 'not found' using errcode='P0002';end if;
 perform 1 from public.validation_hypothesis_versions where id=p_hypothesis_version_id and hypothesis_id=p_hypothesis_id and subject_id=p_subject_id and owner_id=p_owner_id;if not found then raise exception 'not found' using errcode='P0002';end if;
 select * into prior from public.validation_intelligence_runs where owner_id=p_owner_id and subject_id=p_subject_id and hypothesis_version_id=p_hypothesis_version_id and evidence_snapshot_hash=p_evidence_snapshot_hash and status in('running','completed') order by analysis_version_number desc limit 1;
 if prior.status='completed' then return jsonb_build_object('disposition','completed','run_id',prior.id);end if;
 if prior.status='running' and prior.lease_expires_at>clock_timestamp() then return jsonb_build_object('disposition','in_progress','run_id',prior.id);end if;
 if prior.status='running' then update public.validation_intelligence_runs set status='failed',failure_code='running_lease_expired',lease_expires_at=null,failed_at=clock_timestamp() where id=prior.id and status='running';end if;
 select coalesce(max(analysis_version_number),0)+1 into n from public.validation_intelligence_runs where subject_id=p_subject_id;
 insert into public.validation_intelligence_runs(owner_id,subject_id,hypothesis_id,hypothesis_version_id,analysis_version_number,evidence_snapshot,evidence_snapshot_hash,provider,model,status,lease_expires_at) values(p_owner_id,p_subject_id,p_hypothesis_id,p_hypothesis_version_id,n,p_evidence_snapshot,p_evidence_snapshot_hash,p_provider,p_model,'running',clock_timestamp()+interval '10 minutes') returning * into created;
 return jsonb_build_object('disposition','claimed','run_id',created.id,'analysis_version_number',created.analysis_version_number);end $$;
create function public.validation_complete_intelligence_run(p_owner_id uuid,p_run_id uuid,p_dimension_assessments jsonb,p_supporting_synthesis jsonb,p_contradicting_synthesis jsonb,p_uncertainty_synthesis jsonb,p_overall_assessment jsonb,p_next_experiment_recommendation jsonb) returns boolean language plpgsql security definer set search_path=public as $$ declare claimed public.validation_intelligence_runs;begin
 select * into claimed from public.validation_intelligence_runs where id=p_run_id and owner_id=p_owner_id;if not found then return false;end if;
 perform 1 from public.validation_subjects where id=claimed.subject_id and owner_id=p_owner_id for update;
 update public.validation_intelligence_runs set status='completed',lease_expires_at=null,dimension_assessments=p_dimension_assessments,supporting_synthesis=p_supporting_synthesis,contradicting_synthesis=p_contradicting_synthesis,uncertainty_synthesis=p_uncertainty_synthesis,overall_assessment=p_overall_assessment,next_experiment_recommendation=p_next_experiment_recommendation,completed_at=clock_timestamp() where id=p_run_id and owner_id=p_owner_id and status='running';return found;end $$;
create function public.validation_fail_intelligence_run(p_owner_id uuid,p_run_id uuid,p_failure_code text) returns boolean language plpgsql security definer set search_path=public as $$ declare claimed public.validation_intelligence_runs;begin
 select * into claimed from public.validation_intelligence_runs where id=p_run_id and owner_id=p_owner_id;if not found then return false;end if;
 perform 1 from public.validation_subjects where id=claimed.subject_id and owner_id=p_owner_id for update;
 update public.validation_intelligence_runs set status='failed',lease_expires_at=null,failure_code=left(p_failure_code,80),failed_at=clock_timestamp() where id=p_run_id and owner_id=p_owner_id and status='running';return found;end $$;

alter table public.validation_intelligence_runs enable row level security;create policy validation_intelligence_owner_read on public.validation_intelligence_runs for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.validation_intelligence_runs from public,anon,authenticated;grant select on public.validation_intelligence_runs to authenticated;grant all on public.validation_intelligence_runs to service_role;
revoke all on function public.validation_claim_intelligence_run(uuid,uuid,uuid,uuid,jsonb,text,text,text),public.validation_complete_intelligence_run(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb),public.validation_fail_intelligence_run(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.validation_claim_intelligence_run(uuid,uuid,uuid,uuid,jsonb,text,text,text),public.validation_complete_intelligence_run(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb),public.validation_fail_intelligence_run(uuid,uuid,text) to service_role;
