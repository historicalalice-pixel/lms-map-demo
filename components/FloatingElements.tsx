"use client";

import { motion, useScroll, useTransform } from "framer-motion";

const floaters = [
  { id: "a", size: "h-14 w-14", top: "15%", left: "10%" },
  { id: "b", size: "h-10 w-10", top: "28%", left: "75%" },
  { id: "c", size: "h-20 w-20", top: "55%", left: "18%" },
  { id: "d", size: "h-12 w-12", top: "65%", left: "68%" },
  { id: "e", size: "h-16 w-16", top: "82%", left: "42%" },
];

export function FloatingElements() {
  const { scrollYProgress } = useScroll();
  const ySlow = useTransform(scrollYProgress, [0, 1], ["0%", "-15%"]);
  const yFast = useTransform(scrollYProgress, [0, 1], ["0%", "-30%"]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {floaters.map((floater, index) => (
        <motion.div
          key={floater.id}
          style={{
            top: floater.top,
            left: floater.left,
            y: index % 2 === 0 ? ySlow : yFast,
          }}
          className={`absolute ${floater.size} rounded-full border border-white/10 bg-white/5 shadow-[0_0_25px_rgba(255,255,255,0.12)]`}
          animate={{
            y: ["0%", "8%", "0%"],
            opacity: [0.2, 0.45, 0.2],
          }}
          transition={{
            duration: 12 + index * 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
