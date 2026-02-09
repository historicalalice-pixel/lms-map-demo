"use client";

import { motion, useScroll, useTransform } from "framer-motion";

const floaters = [
  { id: "a", size: "h-14 w-14", top: "12%", left: "8%", delay: 0 },
  { id: "b", size: "h-10 w-10", top: "22%", left: "72%", delay: 1 },
  { id: "c", size: "h-20 w-20", top: "52%", left: "16%", delay: 2 },
  { id: "d", size: "h-12 w-12", top: "64%", left: "70%", delay: 3 },
  { id: "e", size: "h-16 w-16", top: "82%", left: "45%", delay: 1.5 },
  { id: "f", size: "h-8 w-8", top: "38%", left: "48%", delay: 2.8 },
  { id: "g", size: "h-6 w-6", top: "70%", left: "28%", delay: 0.6 },
];

export function FloatingElements() {
  const { scrollYProgress } = useScroll();
  const ySlow = useTransform(scrollYProgress, [0, 1], ["0%", "-15%"]);
  const yFast = useTransform(scrollYProgress, [0, 1], ["0%", "-30%"]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <style jsx>{`
        @keyframes drift {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 0.2;
          }
          50% {
            transform: translate3d(0, -12px, 0) scale(1.04);
            opacity: 0.55;
          }
          100% {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 0.2;
          }
        }
      `}</style>
      {floaters.map((floater, index) => (
        <motion.div
          key={floater.id}
          className={`absolute ${floater.size} rounded-full border border-white/10 bg-white/5 shadow-[0_0_25px_rgba(255,255,255,0.12)]`}
          initial={{ opacity: 0 }}
          animate={{
            y: ["0%", "8%", "0%"],
            opacity: [0.2, 0.45, 0.2],
          }}
          transition={{
            duration: 12 + index * 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          aria-hidden="true"
          style={{
            top: floater.top,
            left: floater.left,
            y: index % 2 === 0 ? ySlow : yFast,
            animation: `drift ${14 + index * 1.5}s ease-in-out ${floater.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
