import PublicSurvey from "./public-survey";export default async function SurveyPage({params}:{params:Promise<{token:string}>}){const{token}=await params;return <PublicSurvey token={token}/>}
