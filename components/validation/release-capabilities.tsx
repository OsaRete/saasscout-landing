"use client";
import { createContext, useContext } from "react";
export type ValidationUiCapabilities = Readonly<{
  privateInterviews: boolean;
  privateSurveys: boolean;
  privateCommercialIntent?: boolean;
  publicCommercialIntentParticipation?: boolean;
  privateExternalMvp?: boolean;
  publicExternalMvpParticipation?: boolean;
  privatePrototypes?: boolean;
  publicPrototypeParticipation?: boolean;
  privateLandingPages?: boolean;
  publicLandingParticipation?: boolean;
  publicSurveyParticipation: boolean;
  privateAiDesign: boolean;
  privateAiInterpretation: boolean;
}>;
const Capabilities = createContext<ValidationUiCapabilities>({
  privateInterviews: false,
  privateSurveys: false,
  publicSurveyParticipation: false,
  privateAiDesign: false,
  privateAiInterpretation: false,
});
export function ValidationCapabilityProvider({
  value,
  children,
}: {
  value: ValidationUiCapabilities;
  children: React.ReactNode;
}) {
  return (
    <Capabilities.Provider value={value}>{children}</Capabilities.Provider>
  );
}
export const useValidationCapabilities = () => useContext(Capabilities);
