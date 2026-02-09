"use client";

import { motion, useInView } from "framer-motion";
import { ReactNode, useRef } from "react";

type ScrollSectionProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function ScrollSection({
  eyebrow,
  title,
  description,
  children,
}: ScrollSectionProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(ref, { amount: 0.4, once: false });

  return (
    <section className="relative px-6 py-28 md:py-36">
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
