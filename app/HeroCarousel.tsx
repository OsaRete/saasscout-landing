"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const slides = [
  {
    image: "/hero/hero-problem-discovery.png",
    title: "Find real problems before you build.",
  },
  {
    image: "/hero/hero-opportunity-scoring.png",
    title: "Turn market signals into scored SaaS opportunities.",
  },
  {
    image: "/hero/hero-growth-confidence.png",
    title: "Build from data. Grow with confidence.",
  },
];

export default function HeroCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((current) => (current + 1) % slides.length);
    }, 6500);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="w-full bg-[#050816] pb-24">
      <div
  className="relative w-full overflow-hidden border-b border-white/10 bg-[#050816] shadow-2xl shadow-violet-950/40"
  style={{ height: "clamp(240px, 45vw, 640px)" }}
>
        {slides.map((slide, index) => (
          <div
            key={slide.image}
            className={`absolute inset-0 flex items-center justify-center transition-all duration-[1400ms] ease-in-out ${
              active === index
                ? "opacity-100 scale-100"
                : "opacity-0 scale-[1.03]"
            }`}
          >
            <Image
              src={slide.image}
              alt={slide.title}
              width={1800}
              height={900}
              priority={index === 0}
              className="h-full w-full object-contain"
            />
          </div>
        ))}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050816]/70 via-transparent to-[#050816]/10" />

        
        <div className="absolute bottom-10 left-8 z-10 hidden md:flex">
  <a
    href="/login"
    className="rounded-xl bg-violet-600 px-7 py-3.5 font-semibold text-white shadow-xl shadow-violet-600/40 transition hover:-translate-y-0.5 hover:bg-violet-500"
  >
    Open Private Beta
  </a>
</div>

        <div className="absolute bottom-10 right-8 z-10 flex gap-3">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setActive(index)}
              className={`h-2.5 rounded-full transition-all duration-500 ${
                active === index ? "w-12 bg-violet-500" : "w-2.5 bg-white/40"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}