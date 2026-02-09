"use client";

import { motion } from "framer-motion";

export function Hero() {
  const handleDive = () => {
    const next = document.getElementById("teachers");
    if (next) {
      next.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 pb-24 pt-28">
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_60%)]"
        animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.05, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(74,111,173,0.18),_transparent_55%)]"
        animate={{ opacity: [0.35, 0.7, 0.35], scale: [1, 1.06, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 opacity-[0.15] mix-blend-soft-light [background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22 viewBox=%220 0 50 50%22%3E%3Crect width=%221%22 height=%221%22 fill=%22%23ffffff%22 fill-opacity=%220.5%22/%3E%3C/svg%3E')]" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center text-center text-white">
        <motion.div
          initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="mb-6 inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-xs uppercase tracking-[0.35em]"
        >
          LMS НМТ • Історія України та світу
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.1 }}
          className="max-w-4xl text-4xl font-light leading-tight tracking-wide md:text-6xl"
        >
          Навчання як подорож крізь століття. Платформа, що готує до НМТ
          через історії, карти та глибоку аналітику.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
          className="mt-6 max-w-2xl text-base text-white/70 md:text-lg"
        >
          Стартуй з інтерактивних модулів, живих сесій та персонального
          трекінгу прогресу. Система, де кожен урок — це крок до впевненості.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.5 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <button
            onClick={handleDive}
            className="rounded-full bg-white px-8 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-neutral-950 transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(255,255,255,0.2)]"
          >
            Enter
          </button>
          <button className="rounded-full border border-white/20 px-7 py-3 text-xs uppercase tracking-[0.35em] text-white/80 transition hover:border-white/50">
            Програма курсу
          </button>
        </motion.div>
      </div>
    </section>
  );
}
