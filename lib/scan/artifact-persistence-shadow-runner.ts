import "server-only";
import { mapCompletedScanWorkflowToArtifact } from "./intelligence-artifact.ts";
import { buildSafeScanArtifactPersistenceShadowLog, persistAndVerifyScanArtifactShadow, ScanArtifactPersistenceError, type ScanArtifactPersistenceAuthorizationContext } from "./artifact-persistence.ts";
import type { executeScanWorkflow } from "./workflow.ts";

export type ScanArtifactPersistenceShadowRunnerResult = Readonly<{ status:"disabled"|"inserted_verified"|"replay_verified"|"unauthorized"|"invalid_artifact"|"conflict"|"write_failed"|"read_failed"|"verification_failed"|"configuration_failed" }>;
export async function runScanArtifactPersistenceShadow(input:{ enabled:boolean; authorization:ScanArtifactPersistenceAuthorizationContext|null; completedWorkflow:Awaited<ReturnType<typeof executeScanWorkflow>>; repository?:typeof persistAndVerifyScanArtifactShadow; now?:()=>number; logger?:Pick<Console,"info"|"warn"> }): Promise<ScanArtifactPersistenceShadowRunnerResult> {
  if (!input.enabled) return Object.freeze({ status:"disabled" });
  const started=(input.now??Date.now)();
  const logger=input.logger??console;
  let artifact;
  try {
    if (!input.authorization) throw new ScanArtifactPersistenceError("scan_artifact_persistence_unauthorized");
    artifact=mapCompletedScanWorkflowToArtifact(input.completedWorkflow);
    const shadow=await (input.repository??persistAndVerifyScanArtifactShadow)({ authorization:input.authorization, artifact });
    logger.info("Scan artifact persistence shadow", buildSafeScanArtifactPersistenceShadowLog({ artifact, status:shadow.verificationStatus, durationMs:(input.now??Date.now)()-started, replayed:shadow.replayed, integrityVerified:true }));
    return Object.freeze({ status:shadow.verificationStatus });
  } catch (shadowError) {
    const code=shadowError instanceof ScanArtifactPersistenceError ? shadowError.code : "scan_artifact_persistence_write_failed";
    const status = code === "scan_artifact_persistence_unauthorized" ? "unauthorized" : code === "scan_artifact_persistence_invalid" ? "invalid_artifact" : code === "scan_artifact_persistence_conflict" ? "conflict" : code === "scan_artifact_persistence_read_failed" ? "read_failed" : code === "scan_artifact_persistence_corrupt" ? "verification_failed" : code === "scan_artifact_persistence_configuration_failed" ? "configuration_failed" : "write_failed";
    logger.warn("Scan artifact persistence shadow", buildSafeScanArtifactPersistenceShadowLog({ artifact, status, durationMs:(input.now??Date.now)()-started, errorCode:code, integrityVerified:false }));
    return Object.freeze({ status });
  }
}
