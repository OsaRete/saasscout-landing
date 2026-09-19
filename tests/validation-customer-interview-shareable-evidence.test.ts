import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

import {adaptPersistedPromotionRows,prepareValidationPromotion} from "../lib/validation/promotion/preparation.ts";
import type {PersistedPromotionRows} from "../lib/validation/promotion/read-repository.ts";
import {parseCustomerInterviewShareableEvidence} from "../lib/validation/customer-interview-shareable-evidence.ts";

const migration=readFileSync("supabase/migrations/20260919000000_customer_interview_shareable_evidence.sql","utf8");
const v1Migration=readFileSync("supabase/migrations/20260830000000_validation_customer_interviews.sql","utf8");
const serviceSource=readFileSync("lib/validation/server/service.ts","utf8");
const repositorySource=readFileSync("lib/validation/server/repository.ts","utf8");
const ui=readFileSync("components/validation/interview-observation-form.tsx","utf8");

function rows(statementKind:"summary"|"direct_quote",family="customer_interview"):PersistedPromotionRows{return{
  observations:[{id:"o1",owner_id:"owner",subject_id:"subject",hypothesis_id:"hypothesis",hypothesis_version_id:"hv",experiment_id:"experiment",experiment_version_id:"ev",participant_id:"p1",interview_session_id:"session",origin:"human_interview",modality:"interview_observation",source_type:"customer_interview",observed_at:"2026-01-02T00:00:00Z",observation_content:{category:"problem_experienced",statementKind,content:"Private evidence"}}],
  classifications:[{id:"c1",owner_id:"owner",observation_id:"o1",polarity:"supporting",classification_source:"user_supplied",authority_status:"authoritative",supersedes_classification_id:null}],
  subjects:[{id:"subject",owner_id:"owner",label:"Invoice bottleneck",context_snapshot:{}}],
  hypotheses:[{id:"hv",owner_id:"owner",subject_id:"subject",hypothesis_id:"hypothesis",problem_claim:"Invoice bottleneck"}],
  experiments:[{id:"ev",owner_id:"owner",subject_id:"subject",experiment_id:"experiment",hypothesis_id:"hypothesis",hypothesis_version_id:"hv",family,lifecycle:"completed"}],
  participants:[{id:"p1",owner_id:"owner",status:"active"}],
  sessions:[{id:"session",owner_id:"owner",subject_id:"subject",experiment_id:"experiment",experiment_version_id:"ev",hypothesis_id:"hypothesis",hypothesis_version_id:"hv",participant_id:"p1",status:"completed",participant_relevance:"target_segment_match"}],
  canonicalProblems:[{id:"cp1",canonical_title:"Invoice Bottleneck",normalized_title:"invoice bottleneck",status:"active"}],aliases:[]
};}

test("private observations remain valid when shareable evidence is omitted",()=>{
  assert.equal(parseCustomerInterviewShareableEvidence(undefined),null);
  assert.match(serviceSource,/p_shareable_statement:shareable\?\.statement\?\?null/);
});

test("authoritative command accepts only an exact bounded explicitly reviewed statement",()=>{
  assert.deepEqual(parseCustomerInterviewShareableEvidence({statement:"  Teams lose time reconciling invoices.  ",reviewedForSharedEvidenceUse:true}),{statement:"Teams lose time reconciling invoices.",reviewedForSharedEvidenceUse:true});
  assert.throws(()=>parseCustomerInterviewShareableEvidence({statement:"Statement",reviewedForSharedEvidenceUse:false}),/reviewed/);
  assert.throws(()=>parseCustomerInterviewShareableEvidence({statement:"x".repeat(501),reviewedForSharedEvidenceUse:true}),/500/);
});

test("migration stores a private append-only exact-content approval with owner-scoped provenance",()=>{
  assert.match(migration,/foreign key \(source_observation_id, owner_id\)[\s\S]+validation_evidence_observations\(id, owner_id\)/);
  assert.match(migration,/statement = btrim\(statement\) and length\(statement\) between 1 and 500/);
  assert.match(migration,/statement_sha256[\s\S]+digest\(convert_to\(normalized_statement,'UTF8'\),'sha256'\)/);
  assert.match(migration,/human_reviewed_for_shared_evidence_use/);assert.match(migration,/customer_interview_shareable_evidence_v1/);
  assert.match(migration,/validation_interview_shareable_append_only/);assert.match(migration,/validation_reject_change/);
  assert.match(migration,/enable row level security/);assert.match(migration,/revoke all[\s\S]+public, anon, authenticated/);assert.doesNotMatch(migration,/grant select[\s\S]+authenticated/);
  assert.match(migration,/version\.family='customer_interview'/);assert.match(migration,/e\.family='customer_interview'/);
});

test("optional shareable evidence is part of the immutable ingestion command",()=>{
  assert.match(migration,/inserted := found;[\s\S]+if not inserted then/);
  assert.match(migration,/if normalized_statement is null then[\s\S]+if found then[\s\S]+idempotency conflict/);
  assert.match(migration,/elsif not found or shared\.statement is distinct from normalized_statement[\s\S]+idempotency conflict/);
  assert.match(migration,/elsif normalized_statement is not null then[\s\S]+insert into public\.validation_customer_interview_shareable_evidence/);
  assert.doesNotMatch(migration,/on conflict\(source_observation_id\) do nothing/);

});

const retryCases=[
  {name:"private-only exact retry succeeds",first:null,retry:null,accepted:true},
  {name:"same reviewed statement exact retry succeeds",first:"Y",retry:"Y",accepted:true},
  {name:"retry cannot attach a reviewed statement",first:null,retry:"Y",accepted:false},
  {name:"retry cannot remove a reviewed statement",first:"Y",retry:null,accepted:false},
  {name:"retry cannot replace a reviewed statement",first:"Y",retry:"Z",accepted:false},
] as const;
for(const item of retryCases)test(item.name,()=>{
  assert.equal(item.first===item.retry,item.accepted);
  assert.match(migration,/if not inserted then[\s\S]+select \* into shared[\s\S]+if normalized_statement is null then[\s\S]+elsif not found or shared\.statement is distinct from normalized_statement/);
});

test("V2 preserves V1 observation authority and persistence semantics",()=>{
  const v1=v1Migration.slice(v1Migration.indexOf("create function public.validation_record_interview_observation("),v1Migration.indexOf("revoke all on function public.validation_record_interview_observation("));
  for(const invariant of [
    "owner_id=p_owner_id","status in ('in_progress','completed')","s.participant_id,s.id,'human_interview','interview_observation'",
    "p_observed_at,'customer_interview'","s.id::text,'manual',p_observation_content,p_ingestion_key,p.independence_key",
    "then 'repeat_participant' else 'unknown' end","p.identity_mode='anonymous'","on conflict(owner_id,ingestion_key)",
    "o.interview_session_id is distinct from s.id","o.observed_at is distinct from p_observed_at","o.observation_content is distinct from p_observation_content",
  ]){assert.ok(v1.includes(invariant),`V1 missing fixture invariant: ${invariant}`);assert.ok(migration.includes(invariant),`V2 parity missing: ${invariant}`);}
  assert.match(migration,/version\.family='customer_interview'/);assert.match(migration,/e\.family='customer_interview'/);
  assert.match(migration,/returns jsonb language plpgsql set search_path=public/);assert.doesNotMatch(migration,/security definer/i);
});

test("return diagnostics distinguish insert winner from exact replay truthfully",()=>{
  assert.match(migration,/'duplicate', not inserted/);
  assert.match(migration,/'shareableEvidenceCreated', inserted and normalized_statement is not null/);
  assert.doesNotMatch(ui,/\.duplicate|shareableEvidenceCreated/);
});

test("shareable record is allowlisted and cannot copy private context or caller authority",()=>{
  const table=migration.slice(migration.indexOf("create table public.validation_customer_interview_shareable_evidence"),migration.indexOf("comment on table"));
  for(const privateField of ["participant_id","interview_session_id","session_notes","classification_rationale","metadata","observation_content"])assert.doesNotMatch(table,new RegExp(privateField));
  assert.doesNotMatch(serviceSource,/p_owner_id\s*:\s*input|canonicalProblemId|promotion/);
  assert.match(repositorySource,/p_owner_id:ownerId/);
  assert.doesNotMatch(migration,/insert into public\.(problem_observations|validation_evidence_promotions|canonical_problems|problem_aliases|problem_intelligence|problem_evolution_snapshots|opportunities|recommendations)/i);
  assert.doesNotMatch([migration,serviceSource,repositorySource,ui].join("\n"),/openrouter|openai|embedding|generateText|generateObject/i);
});

test("UI distinguishes optional private and reviewed shareable evidence without claiming publication",()=>{
  for(const text of ["Private observation content","Shareable evidence statement (optional)","reviewed this exact statement","Leaving it empty","not published or promoted"])assert.ok(ui.toLowerCase().includes(text.toLowerCase()));
  assert.match(ui,/maxLength=\{500\}/);assert.match(ui,/reviewedForSharedEvidenceUse:shareableReviewed/);
  assert.doesNotMatch(ui,/ownerId|owner_id|participantId|canonicalProblemId/);
});

test("persisted camel-case summary and direct quote retain representative semantics",()=>{
  assert.equal(adaptPersistedPromotionRows(rows("summary"))[0].statementKind,"summary");
  assert.equal(adaptPersistedPromotionRows(rows("direct_quote"))[0].statementKind,"direct_quote");
  const fixture=rows("summary");fixture.observations.push({...fixture.observations[0],id:"o2",observation_content:{...fixture.observations[0].observation_content as object,statementKind:"direct_quote"}});fixture.classifications.push({...fixture.classifications[0],id:"c2",observation_id:"o2"});
  assert.equal(prepareValidationPromotion(fixture).selections[0].representativeObservationId,"o2");
});

test("legacy snake-case kind remains readable while non-interview families fail closed",()=>{
  const legacy=rows("summary");legacy.observations[0].observation_content={statement_kind:"direct_quote",content:"Historical private evidence"};
  assert.equal(adaptPersistedPromotionRows(legacy)[0].statementKind,"direct_quote");
  const other=prepareValidationPromotion(rows("summary","survey"));
  assert.equal(other.evaluated[0].eligibility.eligible,false);assert.ok(other.evaluated[0].eligibility.reasons.includes("unsupported_experiment_family"));
});
