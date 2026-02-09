"use client";

import { motion } from "framer-motion";

export function CTA() {
  return (
    <section className="relative flex min-h-[70vh] items-center justify-center px-6 py-28">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.12),_transparent_65%)]" />
      <motion.div
        initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
        whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        viewport={{ amount: 0.4 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center text-center text-white"
      >
        <span className="text-xs uppercase tracking-[0.35em] text-white/50">
          Ready to begin
        </span>
        <h2 className="mt-6 text-3xl font-light md:text-5xl">
          Відкрий свій маршрут підготовки до НМТ вже сьогодні.
        </h2>
        <p className="mt-4 max-w-2xl text-base text-white/70 md:text-lg">
          Отримай доступ до курсів, живих сесій та персональної аналітики —
          усе в одному місці.
        </p>
        <button className="mt-10 rounded-full bg-white px-10 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-neutral-950 transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(255,255,255,0.2)]">
          Start learning
        </button>
      </motion.div>
    </section>
  );
}
