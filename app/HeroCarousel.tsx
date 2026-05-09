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
    <section className="w-full bg-[#050816] pb-12 md:pb-24">
      {/* Wrapper que crea la proporción de aspecto automáticamente */}
      <div className="relative w-full border-b border-white/10 shadow-2xl shadow-violet-950/40"
           style={{ paddingBottom: "56.25%" }}>

        {/* Contenedor absoluto que ocupa el espacio generado por el padding */}
        <div className="absolute inset-0 overflow-hidden bg-[#050816]">

          {slides.map((slide, index) => (
            <div
              key={slide.image}
              className={`absolute inset-0 transition-all duration-[1400ms] ease-in-out ${
                active === index
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-[1.03]"
              }`}
            >
              <Image
                src={slide.image}
                alt={slide.title}
                fill
                priority={index === 0}
                className="object-contain"
                sizes="100vw"
              />
            </div>
          ))}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050816]/70 via-transparent to-[#050816]/10" />

          <div className="absolute bottom-4 right-4 z-10 flex gap-2 md:bottom-10 md:right-8 md:gap-3">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => setActive(index)}
                className={`h-2 rounded-full transition-all duration-500 md:h-2.5 ${
                  active === index
                    ? "w-8 bg-violet-500 md:w-12"
                    : "w-2 bg-white/40 md:w-2.5"
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}