import { CalendarDays, Clock, MapPin, Shirt, Tag, type LucideIcon } from "lucide-react";
import { CITY_QUICK_FACT_FIELDS, type CityQuickFactKey, type CityQuickFacts } from "@/lib/city-quick-facts";

const ICONS: Record<CityQuickFactKey, { icon: LucideIcon; tone: string }> = {
  starting_price: { icon: Tag, tone: "bg-rose-50 text-rose-500" },
  best_season: { icon: CalendarDays, tone: "bg-amber-50 text-amber-500" },
  best_shooting_times: { icon: Clock, tone: "bg-sky-50 text-sky-500" },
  costumes: { icon: Shirt, tone: "bg-violet-50 text-violet-500" },
};

type Row = { label: string; value: string; icon: LucideIcon; tone: string };

/** Admin-entered facts plus the location types, which come automatically from
 * the categories of the city's locations. */
export function buildQuickFactRows(facts: CityQuickFacts, locationTypes: string[]): Row[] {
  return [
    ...CITY_QUICK_FACT_FIELDS.flatMap(({ key, label }): Row[] => {
      const value = facts[key];
      return value ? [{ label, value, ...ICONS[key] }] : [];
    }),
    ...(locationTypes.length > 0
      ? [{ label: "Location Types", value: locationTypes.join(", "), icon: MapPin, tone: "bg-emerald-50 text-emerald-600" }]
      : []),
  ];
}

export function CityQuickFactsCard({ rows }: { rows: Row[] }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <h2 className="font-heading mb-4 text-2xl font-semibold">Quick Facts</h2>
      <ul className="divide-y divide-border">
        {rows.map(({ label, value, icon: Icon, tone }) => (
          <li key={label} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
            <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="font-semibold text-foreground">{value}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
