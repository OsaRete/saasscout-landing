import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-6 py-16 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">
          ← Back to SaaSScout
        </Link>

        <h1 className="mt-10 text-4xl font-bold">Terms of Use</h1>

        <p className="mt-6 text-gray-400">
          SaaSScout is an early-stage private beta product. The service may
          change, improve, or become temporarily unavailable as we continue
          building and testing the platform.
        </p>

        <p className="mt-5 text-gray-400">
          SaaSScout provides software opportunity research and idea analysis for
          informational purposes only. We do not guarantee that any idea,
          score, market insight, or recommendation will lead to business success.
        </p>

        <p className="mt-5 text-gray-400">
          You are responsible for validating ideas, researching markets, and
          making your own business decisions before building or investing in any
          product.
        </p>

        <p className="mt-5 text-gray-400">
          By using SaaSScout, you agree not to misuse the platform, attempt to
          access other users’ data, or use the product for unlawful purposes.
        </p>

        <p className="mt-5 text-gray-400">
          For questions, contact us at:{" "}
          <span className="text-violet-300">cedeomartineze@gmail.com</span>
        </p>

        <p className="mt-10 text-sm text-gray-500">
          Last updated: 2026
        </p>
      </div>
    </main>
  );
}