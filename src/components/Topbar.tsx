import { SearchBar } from "./SearchBar";
import { DriveStatusBar } from "./DriveStatusBar";
import type { DriveState } from "@/lib/googleDrive";

type TopbarProps = {
  query: string;
  onQueryChange: (q: string) => void;
  onAddClick: () => void;
  onImportClick: () => void;
  driveState: DriveState;
};

export function Topbar({ query, onQueryChange, onAddClick, onImportClick, driveState }: TopbarProps) {
  return (
    <header className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-4 shrink-0">
      <h1 className="text-lg font-bold text-zinc-100 whitespace-nowrap tracking-tight">
        <span className="text-indigo-400">●</span> Personality Map
      </h1>

      <SearchBar query={query} onQueryChange={onQueryChange} />

      <DriveStatusBar driveState={driveState} />

      <button
        onClick={onImportClick}
        className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
      >
        Import
      </button>
      <button
        onClick={onAddClick}
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
      >
        + Add Item
      </button>
    </header>
  );
}
