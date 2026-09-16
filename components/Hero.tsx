import Link from "next/link";

export type HeroProofState = "idle" | "waiting" | "backed" | "broken";

interface HeroProps {
  eyebrow: string;
  runNumber: number;
  unit: "day" | "week";
  nudge: string;
  habitName: string;
  cornerNames: readonly [string, string];
  proofState: HeroProofState;
  statusText: string | null;
  statusTone: "backed" | "cleared" | null;
  actionLabel: "Prove it" | "Start again" | null;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Hero({
  eyebrow,
  runNumber,
  unit,
  nudge,
  habitName,
  cornerNames,
  proofState,
  statusText,
  statusTone,
  actionLabel,
}: HeroProps) {
  const isBroken = proofState === "broken";

  return (
    <section
      className={`rounded-b-[2rem] px-6 pb-8 pt-7 text-white shadow-[0_16px_44px_rgba(14,14,16,0.16)] ${
        isBroken ? "bg-accent" : "bg-ink"
      }`}
    >
      <div className="mx-auto w-full max-w-sm">
        <Link
          href="/run"
          className="flex min-h-11 items-center justify-between border-b border-white/20 pb-4 text-white"
        >
          <span className="font-headline text-xs font-medium uppercase tracking-[0.18em] text-white/65">
            {eyebrow}
          </span>
          <span aria-hidden="true" className="text-xl leading-none text-white/70">
            →
          </span>
          <span className="sr-only">Your run</span>
        </Link>

        <div className="pt-7">
          <p className="font-headline text-[7rem] font-bold leading-[0.82] tracking-[-0.06em]">
            {runNumber}
          </p>
          <p className="mt-3 font-headline text-sm font-bold uppercase tracking-[0.2em] text-white/70">
            {unit === "week" ? "WEEKS IN A ROW" : "DAYS IN A ROW"}
          </p>
          <p className="mt-5 min-h-6 text-base font-medium text-white/90">{nudge}</p>
        </div>

        <div className="mt-7 border-t border-white/20 pt-6">
          <p className="font-headline text-2xl font-bold leading-tight">{habitName}</p>

          <div className="mt-5 flex items-center gap-3">
            <div className="flex -space-x-2" aria-hidden="true">
              {cornerNames.map((name) => (
                <span
                  key={name}
                  className="grid size-10 place-items-center rounded-full border-2 border-ink bg-white font-headline text-xs font-bold text-ink"
                >
                  {initials(name)}
                </span>
              ))}
            </div>
            <p className="text-sm leading-snug text-white/70">
              {cornerNames[0]} and {cornerNames[1]} are in your corner
            </p>
          </div>

          {statusText ? (
            <p
              className={`mt-5 rounded-xl px-4 py-3 text-sm font-semibold ${
                statusTone === "backed"
                  ? "bg-backed text-white"
                  : "border border-white/20 bg-white/10 text-white"
              }`}
            >
              {statusText}
            </p>
          ) : null}

          {actionLabel ? (
            <Link
              href="/capture"
              className={`mt-7 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold shadow-sm transition-transform active:scale-[0.99] ${
                isBroken ? "bg-ink text-white" : "bg-accent text-white"
              }`}
            >
              <span aria-hidden="true">📷</span>
              {actionLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
