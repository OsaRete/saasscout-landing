export const inquiryRecipient = "cedeomartineze@gmail.com";
export const inquirySubject = "SaaSScout project inquiry";

export const projectTypes = ["Web application", "SaaS", "MVP", "Automation", "AI integration", "Other"];
export const budgetRanges = ["Under $2,500", "$2,500–$5,000", "$5,000–$15,000", "$15,000 or more"];
export const timelines = ["Within a month", "1–3 months", "3+ months", "Flexible"];
export const inquiryLimits = { name: 100, email: 254, description: 1200 };

type DraftResult =
  | { error: { field: string; message: string }; draft?: never }
  | { draft: { href: string; body: string }; error?: never };

export function prepareInquiry(form: FormData): DraftResult {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const projectType = String(form.get("projectType") ?? "");
  const description = String(form.get("description") ?? "").trim();
  const budget = String(form.get("budget") ?? "");
  const timeline = String(form.get("timeline") ?? "");

  if (!name || name.length > inquiryLimits.name || /[\r\n]/.test(name)) {
    return { error: { field: "name", message: "Enter your name on one line." } };
  }
  if (email.length > inquiryLimits.email || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) {
    return { error: { field: "email", message: "Enter a valid contact email, such as name@example.com." } };
  }
  if (!projectTypes.includes(projectType)) {
    return { error: { field: "projectType", message: "Choose a project type." } };
  }
  if (!description || description.length > inquiryLimits.description) {
    return { error: { field: "description", message: `Describe your project in up to ${inquiryLimits.description} characters.` } };
  }
  if (budget && !budgetRanges.includes(budget)) {
    return { error: { field: "budget", message: "Choose a listed budget range or leave it blank." } };
  }
  if (timeline && !timelines.includes(timeline)) {
    return { error: { field: "timeline", message: "Choose a listed timeline or leave it blank." } };
  }
  if (form.get("consent") !== "yes") {
    return { error: { field: "consent", message: "Confirm that SaaSScout may use your details to respond." } };
  }

  const body = [
    `Name: ${name}`,
    `Contact email: ${email}`,
    `Project type: ${projectType}`,
    ...(budget ? [`Estimated budget (USD): ${budget}`] : []),
    ...(timeline ? [`Desired timeline: ${timeline}`] : []),
    "",
    "Project description",
    description,
  ].join("\n");
  const encodedBody = encodeURIComponent(body.toWellFormed().replace(/\r?\n|\r/g, "\r\n"));
  return {
    draft: { href: `mailto:${inquiryRecipient}?subject=${encodeURIComponent(inquirySubject)}&body=${encodedBody}`, body },
  };
}
