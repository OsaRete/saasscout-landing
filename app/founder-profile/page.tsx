"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";
import AppShell from "../../components/app-shell";
import {
  Button,
  Field,
  LoadingState,
  Notice,
  PageHeader,
  Panel,
  TextArea,
  TextInput,
} from "../../components/ui";

export default function FounderProfilePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [experienceLevel, setExperienceLevel] = useState("");
  const [technicalSkills, setTechnicalSkills] = useState("");
  const [budgetLevel, setBudgetLevel] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);

      const { data } = await supabase
        .from("founder_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setExperienceLevel(data.experience_level || "");
        setTechnicalSkills(data.technical_skills || "");
        setBudgetLevel(data.budget_level || "");
        setBusinessModel(data.preferred_business_model || "");
        setHoursPerWeek(String(data.available_hours_per_week || ""));
      }

      setLoading(false);
    }

    loadProfile();
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!userId) return;

    setSaving(true);
    setMessage("");

    const payload = {
      user_id: userId,
      experience_level: experienceLevel,
      technical_skills: technicalSkills,
      budget_level: budgetLevel,
      preferred_business_model: businessModel,
      available_hours_per_week: Number(hoursPerWeek || 0),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("founder_profiles")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      console.error(error);
      setMessage("Could not save founder profile.");
      setSaving(false);
      return;
    }

    setMessage("Founder profile saved successfully.");
    setSaving(false);
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading founder profile"
        description="Preparing your founder matching preferences."
      />
    );
  }

  return (
    <AppShell active="/dashboard">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          eyebrow="Founder Matching V1"
          title="Founder Profile"
          description="Tell SaaSScout what kind of founder you are so opportunity intelligence can be matched to your skills, budget, time, and preferred business model."
          actions={<Button href="/dashboard" variant="secondary">Dashboard</Button>}
        />

        <Panel className="mt-8">
          <form onSubmit={handleSave} className="grid gap-5">
            <Field label="Experience level">
              <TextInput
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
                placeholder="Beginner, intermediate, advanced..."
              />
            </Field>

            <Field label="Technical skills">
              <TextArea
                value={technicalSkills}
                onChange={(e) => setTechnicalSkills(e.target.value)}
                placeholder="React, Next.js, Python, no-code, marketing, sales..."
                className="min-h-[130px]"
              />
            </Field>

            <Field label="Budget level">
              <TextInput
                value={budgetLevel}
                onChange={(e) => setBudgetLevel(e.target.value)}
                placeholder="No budget, low, medium, high..."
              />
            </Field>

            <Field label="Preferred business model">
              <TextInput
                value={businessModel}
                onChange={(e) => setBusinessModel(e.target.value)}
                placeholder="SaaS, micro-SaaS, agency, marketplace..."
              />
            </Field>

            <Field label="Available hours per week">
              <TextInput
                type="number"
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(e.target.value)}
                placeholder="Available hours per week"
              />
            </Field>

            <Button type="submit" disabled={saving} className="rounded-2xl px-6 py-4 font-bold">
              {saving ? "Saving..." : "Save Founder Profile"}
            </Button>

            {message && <Notice tone="success">{message}</Notice>}
          </form>
        </Panel>
      </div>
    </AppShell>
  );
}
