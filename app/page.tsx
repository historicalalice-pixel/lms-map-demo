"use client";

import { CTA } from "../components/CTA";
import { FloatingElements } from "../components/FloatingElements";
import { Hero } from "../components/Hero";
import { ScrollSection } from "../components/ScrollSection";

export default function Page() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_top_left,_rgba(93,110,165,0.15),_transparent_55%)]" />
      <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_bottom_right,_rgba(130,85,118,0.15),_transparent_60%)]" />
      <div className="fixed inset-0 z-0 opacity-[0.12] mix-blend-screen [background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22 viewBox=%220 0 40 40%22%3E%3Crect width=%221%22 height=%221%22 fill=%22%23ffffff%22 fill-opacity=%220.35%22/%3E%3C/svg%3E')]" />
      <FloatingElements />

      <Hero />

      <ScrollSection
        id="teachers"
        eyebrow="For Teachers"
        title="Створюй курси як кінорозповідь."
        description="Конструктор модулів, відео та матеріалів дозволяє зібрати маршрут навчання з точністю до теми та події."
      >
        <div className="grid gap-6 md:grid-cols-3">
          {[
            "Швидке створення курсів і уроків",
            "Тести будь-якої складності",
            "Аналітика групи в реальному часі",
          ].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70"
            >
              {item}
            </div>
          ))}
        </div>
      </ScrollSection>

      <ScrollSection
        id="students"
        eyebrow="For Students"
        title="Навчайся в ритмі власного прогресу."
        description="Курси, інтерактивні мапи та планер занять, що підлаштовується під твій графік і підсилює результат."
      >
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
          Календар занять • персональний план • повідомлення від викладача
        </div>
      </ScrollSection>

      <ScrollSection
        id="interactive"
        eyebrow="Interactive Lessons"
        title="Події на мапі. Постаті в контексті."
        description="Хронологія, ключові дати та інтерактивні історичні карти перетворюють підготовку на занурення."
      />

      <ScrollSection
        id="analytics"
        eyebrow="Progress & Analytics"
        title="Аналітика, яка показує шлях."
        description="Детальні звіти, сильні та слабкі теми, рекомендації наступних кроків — усе для впевненого результату."
      />

      <CTA />
    </main>
  );
}
