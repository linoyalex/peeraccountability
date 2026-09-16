"use client";

import Image from "next/image";
import { useState, useTransition } from "react";

import { castVote } from "@/app/actions";

interface ProofCardProps {
  proofId: string;
  signedUrl: string;
  subjectName: string;
  submittedAt: string;
  note: string | null;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function ProofCard({
  proofId,
  signedUrl,
  subjectName,
  submittedAt,
  note,
}: ProofCardProps) {
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startVote] = useTransition();

  if (removed) return null;

  function vote(value: "back" | "call") {
    setError(false);
    startVote(async () => {
      const result = await castVote(proofId, value);
      if (result.ok) {
        setRemoved(true);
      } else {
        setError(true);
      }
    });
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex gap-4 p-4">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-line">
          <Image
            src={signedUrl}
            alt={`Proof from ${subjectName}`}
            fill
            sizes="96px"
            unoptimized
            className="object-cover"
          />
        </div>
        <div className="min-w-0 flex-1 py-1">
          <div className="flex items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink font-headline text-[0.65rem] font-bold text-white">
              {initials(subjectName)}
            </span>
            <p className="truncate font-semibold text-ink">{subjectName}</p>
          </div>
          <p className="mt-3 text-xs text-muted">{submittedAt}</p>
          {note ? <p className="mt-2 text-sm leading-snug text-ink">{note}</p> : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="border-t border-line px-4 py-2 text-sm text-accent">
          Couldn’t record that. Try again.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => vote("back")}
          className="min-h-11 rounded-xl bg-backed px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Back it
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => vote("call")}
          className="min-h-11 rounded-xl bg-accent px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Call it
        </button>
      </div>
    </article>
  );
}
