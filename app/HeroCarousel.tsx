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
    title: "Build from evidence. Validate with confidence.",
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
    <div className="relative rounded-[2rem] border border-white/10 bg-[#0B1020]/80 p-3 shadow-2xl shadow-violet-950/30 backdrop-blur">
      <div className="relative overflow-hidden rounded-[1.5rem] bg-[#050816]" style={{ paddingBottom: "66%" }}>
        {slides.map((slide, index) => (
          <div
            key={slide.image}
            className={`absolute inset-0 transition-all duration-[1400ms] ease-in-out ${
              active === index ? "scale-100 opacity-100" : "scale-[1.03] opacity-0"
            }`}
          >
            <Image
              src={slide.image}
              alt={slide.title}
              fill
              priority={index === 0}
              className="object-contain"
              sizes="(min-width: 768px) 50vw, 100vw"
            />
          </div>
        ))}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050816]/80 via-transparent to-[#050816]/5" />

        <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-md">
          <p className="line-clamp-1 text-sm font-semibold text-gray-200">
            {slides[active].title}
          </p>

          <div className="flex shrink-0 gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => setActive(index)}
                className={`h-2 rounded-full transition-all duration-500 ${
                  active === index ? "w-8 bg-violet-500" : "w-2 bg-white/40"
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
