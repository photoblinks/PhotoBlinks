/** Banner used by every photographer directory page — same emerald gradient
 * as the location city pages, with a subtitle line under the H1. */
export function PhotographersHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="relative overflow-hidden bg-linear-to-br from-emerald-950 via-pb-brand to-emerald-800 pt-14 pb-20 sm:pt-20 sm:pb-24">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
        <h1 className="font-heading text-3xl font-semibold text-white sm:text-5xl">{title}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-white/80 sm:text-lg">{subtitle}</p>
      </div>
    </section>
  );
}
