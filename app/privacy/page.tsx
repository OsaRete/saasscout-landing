import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-6 py-16 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">
          ← Back to SaaSScout
        </Link>

        <h1 className="mt-10 text-4xl font-bold">Privacy Policy</h1>

        <p className="mt-6 text-gray-400">
          SaaSScout is currently in private beta. We collect only the information
          needed to operate the product, including your email, account details,
          market scans, saved ideas, and beta signup information.
        </p>

        <p className="mt-5 text-gray-400">
          We use this information to provide access to the product, improve the
          experience, and understand what features users need. We do not sell
          your personal data.
        </p>

        <p className="mt-5 text-gray-400">
          Some data may be stored using trusted third-party services such as
          Supabase, Vercel, and analytics or AI providers we may add in the
          future.
          SaaSScout may process publicly available information from third-party
          platforms and public sources to generate research insights. 
          Such information is accessed and used in accordance with the 
          applicable terms and policies of those services.
        </p>

        <p className="mt-5 text-gray-400">
          To request deletion of your data or contact us about privacy, email us
          at: <span className="text-violet-300">contact@trysaasscout.com</span>
        </p>

        <p className="mt-10 text-sm text-gray-500">
          Last updated: 2026
        </p>
      </div>
    </main>
  );
}