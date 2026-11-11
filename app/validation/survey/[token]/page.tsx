import { validationOperationAllowed } from "@/lib/validation/server/release-policy";
import { ValidationUnavailable } from "@/components/validation/unavailable";
import PublicSurvey from "./public-survey";
export default async function SurveyPage(props: {
  params: Promise<{ token: string }>;
}) {
  if (!validationOperationAllowed("survey.resolve", "GET"))
    return <ValidationUnavailable />;
  const { token } = await props.params;
  return <PublicSurvey token={token} />;
}
