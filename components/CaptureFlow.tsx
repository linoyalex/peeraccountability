"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { postProof } from "@/app/actions";
import { downscaleProofImage } from "@/lib/image";

interface CaptureFlowProps {
  habitName: string;
  cornerNames: readonly [string, string];
}

export function CaptureFlow({ habitName, cornerNames }: CaptureFlowProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sending, startSending] = useTransition();

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  async function preparePhoto(file: File | undefined) {
    if (!file) return;
    setPreparing(true);
    setError(null);

    try {
      const compressed = await downscaleProofImage(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPhoto(compressed);
      setPreviewUrl(URL.createObjectURL(compressed));
    } catch {
      setError("Couldn’t prepare that photo. Try again.");
    } finally {
      setPreparing(false);
    }
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhoto(null);
    setPreviewUrl(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.click();
  }

  function send() {
    if (!photo) return;
    setError(null);

    startSending(async () => {
      const formData = new FormData();
      formData.set("photo", photo);
      formData.set("note", note);
      const result = await postProof(formData);

      if (!result.ok) {
        setError("Couldn’t send it. Try again.");
        return;
      }

      router.replace("/");
      router.refresh();
    });
  }

  return (
    <main className="min-h-svh bg-ink text-white">
      <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col">
        <header className="flex min-h-20 items-center justify-between px-6 py-4">
          <h1 className="font-headline text-lg font-bold">Proof for {habitName}</h1>
          <Link href="/" className="flex min-h-11 items-center px-2 text-sm text-white/75">
            Cancel
          </Link>
        </header>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => void preparePhoto(event.target.files?.[0])}
        />

        {previewUrl ? (
          <div className="flex flex-1 flex-col">
            <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
              {/* A local object URL cannot go through next/image and never leaves the browser. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Your proof preview" className="size-full object-cover" />
            </div>

            <section className="rounded-t-[2rem] bg-bg px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 text-ink">
              <p className="text-sm text-muted">
                {cornerNames[0]} and {cornerNames[1]} will see this
              </p>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add a note — optional"
                rows={3}
                className="mt-4 w-full resize-none rounded-2xl border border-line bg-white px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent"
              />

              {error ? (
                <p role="alert" className="mt-3 text-sm font-medium text-accent">
                  {error}
                </p>
              ) : null}

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={retake}
                  disabled={sending}
                  className="min-h-14 rounded-2xl border border-line bg-white px-4 font-bold disabled:opacity-50"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={send}
                  disabled={sending}
                  className="min-h-14 rounded-2xl bg-accent px-4 font-bold text-white disabled:opacity-50"
                >
                  Send it
                </button>
              </div>
            </section>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
            {error ? (
              <p role="alert" className="mb-6 text-center text-sm font-medium text-white">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              aria-label="Take proof photo"
              disabled={preparing}
              onClick={() => inputRef.current?.click()}
              className="grid size-24 place-items-center rounded-full border-4 border-white/80 bg-white/15 shadow-[0_0_0_8px_rgba(255,255,255,0.12)] disabled:opacity-50"
            >
              <span className="size-16 rounded-full bg-white" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
