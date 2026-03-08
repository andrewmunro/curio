import { useState, useRef, useEffect, useMemo } from "react";
import type { Entry } from "@/lib/types";
import {
  parseImportFile,
  guessNameColumn,
  guessRatingColumn,
  normaliseRating,
  type ParsedFile,
} from "@/lib/parseImportFile";
import { useImport, type ImportProgress } from "@/hooks/useImport";
import { importDb } from "@/lib/db";

type ImportModalProps = {
  open: boolean;
  onClose: () => void;
  onImported: (entries: Entry[]) => void;
  existingEntryNames: string[];
};

type Step = "upload" | "configure" | "importing" | "done" | "db-loaded";

export function ImportModal({ open, onClose, onImported, existingEntryNames }: ImportModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [nameCol, setNameCol] = useState<string>("");
  const [ratingCol, setRatingCol] = useState<string>("");
  const [dragging, setDragging] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const { progress, runImport, reset, abort } = useImport();

  useEffect(() => {
    if (open) {
      setStep("upload");
      setParsed(null);
      setFileName("");
      setNameCol("");
      setRatingCol("");
      setDragging(false);
      reset();
    }
  }, [open]);

  useEffect(() => {
    if (progress.phase === "done") setStep("done");
  }, [progress.phase]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && step !== "importing") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, step]);

  const { toImport, alreadyInMap } = useMemo(() => {
    if (!parsed || !nameCol) return { toImport: 0, alreadyInMap: 0 };
    const existingLower = new Set(existingEntryNames.map((n) => n.toLowerCase()));
    let already = 0;
    let toAdd = 0;
    for (const row of parsed.rows) {
      const name = row[nameCol]?.trim();
      if (!name) continue;
      if (existingLower.has(name.toLowerCase())) already++;
      else toAdd++;
    }
    return { toImport: toAdd, alreadyInMap: already };
  }, [parsed, nameCol, existingEntryNames]);

  if (!open) return null;

  async function handleFile(file: File) {
    setFileName(file.name);

    if (file.name.endsWith(".db")) {
      const buffer = await file.arrayBuffer();
      await importDb(new Uint8Array(buffer));
      setStep("db-loaded");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const result = parseImportFile(file.name, text);
      setParsed(result);
      setNameCol(guessNameColumn(result.columns) ?? "");
      setRatingCol(guessRatingColumn(result.columns) ?? "");
      if (result.rows.length > 0) setStep("configure");
    };
    reader.readAsText(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const handleStartImport = () => {
    if (!parsed || !nameCol) return;
    const existingLower = new Set(existingEntryNames.map((n) => n.toLowerCase()));
    const items = parsed.rows
      .map((row) => {
        const name = row[nameCol]?.trim();
        if (!name) return null;
        const rating = ratingCol ? normaliseRating(row[ratingCol]) : undefined;
        return { name, rating };
      })
      .filter((item): item is { name: string; rating?: 1 | 2 | 3 | 4 | 5 } => item !== null)
      .filter((item) => !existingLower.has(item.name.toLowerCase()));

    if (items.length === 0) return;
    setStep("importing");
    runImport(items, onImported);
  };

  const handleClose = () => {
    if (step === "importing") abort();
    onClose();
  };

  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={step !== "importing" ? handleClose : undefined} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-in max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Import</h2>
          <button onClick={handleClose} className="text-zinc-500 hover:text-zinc-300 text-xl">×</button>
        </div>

        {step === "upload" && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,.db"
              onChange={handleFileChange}
              className="hidden"
            />
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`w-full py-12 border-2 border-dashed rounded-xl text-sm cursor-pointer transition-colors text-center select-none ${
                dragging
                  ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                  : "border-zinc-700 text-zinc-400 hover:border-indigo-500 hover:text-indigo-400"
              }`}
            >
              <p className="font-medium">Drop a file here, or click to browse</p>
              <p className="text-xs mt-1 opacity-60">.csv · .json · .db</p>
            </div>
          </div>
        )}

        {step === "db-loaded" && (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
              <p className="text-sm font-medium text-emerald-400">Database loaded</p>
              <p className="text-xs text-zinc-400 mt-1">{fileName} replaced your current database.</p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {step === "configure" && parsed && (
          <div className="flex flex-col gap-4 overflow-hidden">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="font-medium text-zinc-300">{fileName}</span>
              <span>— {parsed.rows.length} rows, {parsed.columns.length} columns</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                  Name column *
                </label>
                <select
                  value={nameCol}
                  onChange={(e) => setNameCol(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select...</option>
                  {parsed.columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                  Rating column
                </label>
                <select
                  value={ratingCol}
                  onChange={(e) => setRatingCol(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">None</option>
                  {parsed.columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-auto min-h-0">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1 block">
                Preview (first 20)
              </label>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {parsed.rows.slice(0, 20).map((row, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-zinc-300 bg-zinc-800/50 rounded px-2 py-1.5">
                    <span className="flex-1 truncate">{nameCol ? row[nameCol] || "—" : "—"}</span>
                    {ratingCol && row[ratingCol] && (
                      <span className="text-amber-400 shrink-0">{row[ratingCol]}★</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {alreadyInMap > 0 && (
              <p className="text-xs text-zinc-500">
                {alreadyInMap} already in map — will skip (no AI cost)
              </p>
            )}

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setStep("upload")}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleStartImport}
                disabled={!nameCol || toImport === 0}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Import {toImport} items
              </button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">{progress.message}</p>
            <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-500">
              <span>{progress.processed} / {progress.total} items</span>
              <span>
                {progress.created > 0 && `${progress.created} created`}
                {progress.skipped > 0 && `, ${progress.skipped} skipped`}
                {progress.failed > 0 && `, ${progress.failed} failed`}
              </span>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => { abort(); }}
                className="px-4 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <ProgressSummary progress={progress} />
            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressSummary({ progress }: { progress: ImportProgress }) {
  const hasFailures = progress.failed > 0;
  return (
    <div className={`${hasFailures ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20"} border rounded-lg p-4 space-y-1`}>
      <p className={`text-sm font-medium ${hasFailures ? "text-amber-400" : "text-emerald-400"}`}>
        {hasFailures ? "Import completed with issues" : "Import complete"}
      </p>
      <p className="text-xs text-zinc-400">{progress.created} items added to your map</p>
      {progress.skipped > 0 && (
        <p className="text-xs text-zinc-500">{progress.skipped} duplicates skipped</p>
      )}
      {progress.failed > 0 && (
        <p className="text-xs text-amber-400/70">{progress.failed} items failed to categorise</p>
      )}
      {progress.linked > 0 && (
        <p className="text-xs text-zinc-500">{progress.linked} connections created</p>
      )}
    </div>
  );
}
