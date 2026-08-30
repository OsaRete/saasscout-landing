export const INTERVIEW_PLAN_GUIDANCE = ["Ask about real past behavior.","Avoid pitching the solution or asking for compliments.","Ask one question at a time.","Use 5–8 high-value questions when that is enough."] as const;
export const DEFAULT_INTERVIEW_QUESTIONS = [
  "Tell me about your role and how this problem area works today.",
  "Walk me through the last time this happened.",
  "What did you do next, and what was the hardest part?",
  "How often does this happen?",
  "What do you use today to deal with it?",
  "Have you tried anything else?",
  "What does this cost in time or money?",
  "What have I not asked that matters here?",
] as const;
export type InterviewObservationCategory="problem_experienced"|"problem_not_experienced"|"frequency"|"workflow"|"current_workaround"|"time_cost"|"money_spent"|"attempted_solution"|"switching_behavior"|"severity"|"unexpected_problem"|"commercial_signal"|"contradiction"|"other";
