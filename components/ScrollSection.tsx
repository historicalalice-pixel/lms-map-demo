"use client";

import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { ReactNode, useRef } from "react";

type ScrollSectionProps = {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function ScrollSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: ScrollSectionProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(ref, { amount: 0.4, once: false });
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [40, -20]);

  return (
    <section id={id} className="relative px-6 py-28 md:py-36">
      <motion.div
        aria-hidden="true"
        style={{ y }}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_70%)]"
      />
      <motion.div
        ref={ref}
        animate={
          isInView
            ? { opacity: 1, y: 0, filter: "blur(0px)" }
            : { opacity: 0, y: 40, filter: "blur(6px)" }
        }
        transition={{ duration: 1, ease: "easeOut" }}
        className="mx-auto flex w-full max-w-5xl flex-col gap-6 text-white"
      >
        <span className="text-xs uppercase tracking-[0.3em] text-white/50">
          {eyebrow}
        </span>
        <h2 className="text-3xl font-light leading-tight md:text-5xl">
          {title}
        </h2>
        <p className="max-w-2xl text-base text-white/70 md:text-lg">
          {description}
        </p>
        {children}
      </motion.div>
    </section>
  );
}
