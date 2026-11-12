import { getValidationReleasePolicy } from "@/lib/validation/server/release-policy";
import { ValidationCapabilityProvider } from "@/components/validation/release-capabilities";
import { ValidationUnavailable } from "@/components/validation/unavailable";
export const dynamic = "force-dynamic";
export default function ValidationReleaseLayout(props: {
  children: React.ReactNode;
}) {
  const policy = getValidationReleasePolicy();
  if (!policy.privateInterviews && !policy.privateSurveys)
    return <ValidationUnavailable />;
  return (
    <ValidationCapabilityProvider
      value={{
        privateInterviews: policy.privateInterviews,
        privateSurveys: policy.privateSurveys,
        privateCommercialIntent: policy.privateCommercialIntent,
        publicCommercialIntentParticipation: policy.publicCommercialIntentParticipation,
        privateExternalMvp: policy.privateExternalMvp,
        publicExternalMvpParticipation: policy.publicExternalMvpParticipation,
        privatePrototypes: policy.privatePrototypes,
        publicPrototypeParticipation: policy.publicPrototypeParticipation,
        privateLandingPages: policy.privateLandingPages,
        publicLandingParticipation: policy.publicLandingParticipation,
        publicSurveyParticipation: policy.publicSurveyParticipation,
        privateAiDesign: policy.privateAiDesign,
        privateAiInterpretation: policy.privateAiInterpretation,
      }}
    >
      {props.children}
    </ValidationCapabilityProvider>
  );
}
