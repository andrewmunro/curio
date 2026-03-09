import { useState } from "react";
import type { DriveState } from "@/lib/googleDrive";
import * as drive from "@/lib/googleDrive";

type Props = {
  driveState: DriveState;
};

export function DriveStatusBar({ driveState }: Props) {
  const [loadMenuOpen, setLoadMenuOpen] = useState(false);
  const [manualFileId, setManualFileId] = useState("");
  const [appFiles, setAppFiles] = useState<{ id: string; name: string }[]>([]);

  const { status, email, fileId, saveStatus } = driveState;

  async function handleOpenLoadMenu() {
    const files = await drive.listAppFiles();
    setAppFiles(files);
    setLoadMenuOpen(true);
  }

  async function handleLoadFile(id: string) {
    setLoadMenuOpen(false);
    try {
      await drive.loadFromDrive(id);
    } catch (e) {
      console.error("Load failed:", e);
    }
  }

  async function handleLoadManual() {
    if (!manualFileId.trim()) return;
    setLoadMenuOpen(false);
    try {
      await drive.loadFromDrive(manualFileId.trim());
    } catch (e) {
      console.error("Load failed:", e);
    }
    setManualFileId("");
  }

  const saveLabel =
    saveStatus === "saving" ? "Saving…" :
    saveStatus === "saved" ? "Saved ✓" :
    saveStatus === "error" ? "Save failed" :
    fileId ? "Save" : "Save to Drive";

  const saveDisabled = saveStatus === "saving";

  if (status === "disconnected" || status === "error" || status === "connecting") {
    return null;
  }

  // connected
  return (
    <div className="flex items-center gap-1 relative">
      {/* Status dot + email */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-zinc-400 whitespace-nowrap">
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            saveStatus === "error" ? "bg-red-500" :
            saveStatus === "saving" ? "bg-yellow-400 animate-pulse" :
            "bg-green-500"
          }`}
        />
        {email && <span className="hidden sm:inline max-w-[120px] truncate">{email}</span>}
      </div>

      {/* Save button */}
      <button
        onClick={() => fileId ? drive.saveToExistingFile() : drive.saveToNewFile()}
        disabled={saveDisabled}
        className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
          saveStatus === "saved"
            ? "text-green-400 bg-green-950/40"
            : saveStatus === "error"
            ? "text-red-400 bg-red-950/40"
            : "text-zinc-300 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {saveLabel}
      </button>

      {/* Load button */}
      <button
        onClick={handleOpenLoadMenu}
        className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors whitespace-nowrap"
      >
        Load
      </button>

      {/* Disconnect */}
      <button
        onClick={() => drive.disconnect()}
        className="px-2 py-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        title="Disconnect Google Drive"
      >
        ✕
      </button>

      {/* Load dropdown */}
      {loadMenuOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-3 w-72">
          <div className="text-xs text-zinc-400 mb-2 font-medium">Load from Google Drive</div>

          {appFiles.length > 0 && (
            <div className="space-y-1 mb-3">
              {appFiles.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleLoadFile(f.id)}
                  className="w-full text-left px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
                >
                  {f.name}
                  <span className="text-zinc-600 ml-1">({f.id.slice(0, 8)}…)</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={manualFileId}
              onChange={(e) => setManualFileId(e.target.value)}
              placeholder="Paste file ID…"
              className="flex-1 px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder-zinc-600"
            />
            <button
              onClick={handleLoadManual}
              disabled={!manualFileId.trim()}
              className="px-2 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded disabled:opacity-40"
            >
              Load
            </button>
          </div>

          <button
            onClick={() => setLoadMenuOpen(false)}
            className="mt-2 w-full text-xs text-zinc-600 hover:text-zinc-400 text-right"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
