import {assertObject,text,ValidationServerError} from "./server/contracts.ts";

export const CUSTOMER_INTERVIEW_SHAREABLE_EVIDENCE_VERSION="customer_interview_shareable_evidence_v1" as const;
export const CUSTOMER_INTERVIEW_SHAREABLE_EVIDENCE_MAX_LENGTH=500;

export type CustomerInterviewShareableEvidenceV1={statement:string;reviewedForSharedEvidenceUse:true};

export function parseCustomerInterviewShareableEvidence(value:unknown):CustomerInterviewShareableEvidenceV1|null{
  if(value==null)return null;
  assertObject(value,"shareableEvidence");
  const statement=text(value.statement,"shareableEvidence.statement",CUSTOMER_INTERVIEW_SHAREABLE_EVIDENCE_MAX_LENGTH);
  if(value.reviewedForSharedEvidenceUse!==true)throw new ValidationServerError(400,"invalid_request","Confirm that the exact statement was reviewed for shared evidence use.");
  return{statement,reviewedForSharedEvidenceUse:true};
}
