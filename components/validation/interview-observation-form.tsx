"use client";

import {useState} from "react";
import {Button,Field,SelectInput,TextArea} from "@/components/ui";
import {validationErrorMessage,validationRequest} from "./api";

export function InterviewObservationForm({sessionId,onDone}:{sessionId:string;onDone:()=>void}) {
  const [content,setContent]=useState("");
  const [category,setCategory]=useState("other");
  const [kind,setKind]=useState("summary");
  const [polarity,setPolarity]=useState("");
  const [shareableStatement,setShareableStatement]=useState("");
  const [shareableReviewed,setShareableReviewed]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  async function record() {
    if(saving)return;
    setSaving(true);
    setError("");
    try {
      const statement=shareableStatement.trim();
      const observation=await validationRequest<{id:string}>("/api/validation/interview-observations",{
        method:"POST",
        body:JSON.stringify({
          interviewSessionId:sessionId,
          observedAt:new Date().toISOString(),
          category,
          statementKind:kind,
          content,
          ingestionKey:crypto.randomUUID(),
          ...(statement?{shareableEvidence:{statement,reviewedForSharedEvidenceUse:shareableReviewed}}:{})
        })
      });
      if(polarity)await validationRequest("/api/validation/classifications",{method:"POST",body:JSON.stringify({observationId:observation.id,polarity,classificationSource:"user_supplied",authorityStatus:"authoritative"})});
      setContent("");
      setShareableStatement("");
      setShareableReviewed(false);
      onDone();
    } catch (cause) {
      setError(validationErrorMessage(cause,"Could not record interview observation."));
    } finally {
      setSaving(false);
    }
  }

  const hasShareableStatement=Boolean(shareableStatement.trim());
  return <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
    <p className="text-sm font-semibold">Explicit evidence observation</p>
    <p className="text-xs text-slate-400">Choose what becomes immutable private evidence. Negative and contradictory findings are legitimate.</p>
    <div className="grid gap-2 sm:grid-cols-3">
      <SelectInput aria-label="Observation category" value={category} onChange={e=>setCategory(e.target.value)}><option value="problem_experienced">Problem experienced</option><option value="problem_not_experienced">Problem not experienced</option><option value="frequency">Frequency</option><option value="current_workaround">Current workaround</option><option value="contradiction">Contradiction</option><option value="other">Other</option></SelectInput>
      <SelectInput aria-label="Statement kind" value={kind} onChange={e=>setKind(e.target.value)}><option value="summary">User summary</option><option value="direct_quote">Direct quote (verbatim)</option></SelectInput>
      <SelectInput aria-label="Optional classification" value={polarity} onChange={e=>setPolarity(e.target.value)}><option value="">No classification</option><option value="supporting">Supporting</option><option value="contradicting">Contradicting</option><option value="mixed">Mixed</option><option value="neutral">Neutral</option><option value="inconclusive">Inconclusive</option></SelectInput>
    </div>
    <Field label="Private observation content" helper="Immutable source evidence. Nothing is inferred from the working notes above."><TextArea rows={3} maxLength={4000} value={content} onChange={e=>setContent(e.target.value)}/></Field>
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[.04] p-3">
      <Field label="Shareable evidence statement (optional)" helper="A concise human statement that may later contribute to shared Problem Intelligence. Leaving it empty keeps this observation private-only; it is not published or promoted here."><TextArea rows={2} maxLength={500} value={shareableStatement} onChange={e=>{setShareableStatement(e.target.value);setShareableReviewed(false)}}/></Field>
      <p className="mt-2 text-xs text-slate-400">Describe the observed problem without names, company names, contact details, addresses, private links, participant or session references, secrets, or uniquely identifying details.</p>
      {hasShareableStatement&&<label className="mt-3 flex items-start gap-2 text-xs text-slate-300"><input className="mt-0.5" type="checkbox" checked={shareableReviewed} onChange={e=>setShareableReviewed(e.target.checked)}/><span>I wrote or reviewed this exact statement and confirm it is faithful to the private evidence and prepared for shared evidence use.</span></label>}
    </div>
    <Button disabled={saving||!content.trim()||(hasShareableStatement&&!shareableReviewed)} onClick={record}>{saving?"Recording…":"Record immutable observation"}</Button>
    {error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
  </div>;
}
