import { useState, useEffect } from "react";
import type { Entry, Category, EntryNeighbour } from "@/lib/types";
import { CATEGORIES, CATEGORY_ICONS } from "@/lib/types";
import { TagPill } from "./TagPill";
import * as api from "@/lib/api";


type EntryDetailPanelProps = {
  entry: Entry;
  allEntries: Entry[];
  onClose: () => void;
  onSave: (id: string, fields: Partial<Entry>) => void;
  onDelete: (id: string) => void;
  onReanalyse: (name: string) => void;
  onTagClick: (tag: string) => void;
  onNavigateToEntry: (entry: Entry) => void;
};

export function EntryDetailPanel({ entry, allEntries, onClose, onSave, onDelete, onReanalyse, onTagClick, onNavigateToEntry }: EntryDetailPanelProps) {
  const [name, setName] = useState(entry.name);
  const [category, setCategory] = useState<Category>(entry.category);
  const [subcategory, setSubcategory] = useState(entry.subcategory);
  const [tags, setTags] = useState<string[]>(entry.tags);
  const [notes, setNotes] = useState(entry.notes);
  const [rating, setRating] = useState<number>(entry.rating || 0);
  const [aiMetadata, setAiMetadata] = useState<Record<string, string>>(entry.aiMetadata);
  const [newTag, setNewTag] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [neighbours, setNeighbours] = useState<EntryNeighbour[]>([]);
  const [addingConnection, setAddingConnection] = useState(false);
  const [newRelTarget, setNewRelTarget] = useState("");

  useEffect(() => {
    setName(entry.name);
    setCategory(entry.category);
    setSubcategory(entry.subcategory);
    setTags(entry.tags);
    setNotes(entry.notes);
    setRating(entry.rating || 0);
    setAiMetadata(entry.aiMetadata);
    setConfirmDelete(false);
    setAddingConnection(false);
    loadNeighbours();
  }, [entry]);

  async function loadNeighbours() {
    try {
      const data = await api.fetchNeighbours(entry.id);
      setNeighbours(data.neighbours);
    } catch {
      setNeighbours([]);
    }
  }

  const handleSave = () => {
    onSave(entry.id, {
      name, category, subcategory, tags, notes,
      rating: rating > 0 ? (rating as Entry["rating"]) : undefined,
      aiMetadata, edited: true,
    });
  };

  const handleAddTag = () => {
    const tag = newTag.toLowerCase().trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tag: string) => setTags(tags.filter((t) => t !== tag));
  const handleMetadataChange = (key: string, value: string) => setAiMetadata({ ...aiMetadata, [key]: value });

  const handleAddConnection = async () => {
    if (!newRelTarget) return;
    try {
      await api.addRelationship(entry.id, newRelTarget, "related_to");
      setAddingConnection(false);
      setNewRelTarget("");
      loadNeighbours();
    } catch (err) {
      console.error("Failed to add relationship:", err);
    }
  };

  const handleDeleteConnection = async (relId: string) => {
    try {
      await api.deleteRelationship(relId);
      setNeighbours((prev) => prev.filter((n) => n.relId !== relId));
    } catch (err) {
      console.error("Failed to delete relationship:", err);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);


  const otherEntries = allEntries.filter((e) => e.id !== entry.id && !neighbours.some((n) => n.entry.id === e.id));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-zinc-900 border-l border-zinc-800 overflow-y-auto shadow-2xl animate-slide-in">
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-zinc-100">Entry Details</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1 block">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Category / Subcategory */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1 block">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1 block">Subcategory</label>
              <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1 block">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <TagPill key={tag} tag={tag} isAi={entry.tags.includes(tag) && !entry.edited} removable
                  onRemove={() => handleRemoveTag(tag)} onClick={() => onTagClick(tag)} />
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTag()} placeholder="Add tag..."
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button onClick={handleAddTag}
                className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-xs transition-colors">Add</button>
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1 block">Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} onClick={() => setRating(rating === star ? 0 : star)}
                  className={`text-lg transition-colors ${star <= rating ? "text-amber-400" : "text-zinc-600 hover:text-zinc-400"}`}>★</button>
              ))}
            </div>
          </div>

          {/* AI Metadata */}
          {Object.keys(aiMetadata).length > 0 && (
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 block">AI Metadata</label>
              <div className="space-y-2">
                {Object.entries(aiMetadata).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-20 shrink-0 capitalize">{key}</span>
                    <input value={value} onChange={(e) => handleMetadataChange(key, e.target.value)}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Connections */}
          <div>
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 block">Connections</label>
            {neighbours.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {neighbours.map((n) => (
                  <span key={n.relId}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-300 cursor-pointer hover:bg-indigo-500/25 transition-colors">
                    <span onClick={() => onNavigateToEntry(n.entry)}>
                      {CATEGORY_ICONS[n.entry.category]} {n.entry.name}
                    </span>
                    <button onClick={() => handleDeleteConnection(n.relId)}
                      className="ml-0.5 text-indigo-400/50 hover:text-red-400 transition-colors">×</button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">No connections yet</p>
            )}

            {!addingConnection ? (
              <button onClick={() => setAddingConnection(true)}
                className="mt-2 text-xs text-indigo-400/70 hover:text-indigo-400 transition-colors">
                + Add connection
              </button>
            ) : (
              <div className="mt-2 flex gap-2 items-end">
                <div className="flex-1">
                  <select value={newRelTarget} onChange={(e) => setNewRelTarget(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="">Select entry...</option>
                    {otherEntries.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <button onClick={handleAddConnection} disabled={!newRelTarget}
                  className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 text-white text-xs rounded-md transition-colors">Add</button>
                <button onClick={() => setAddingConnection(false)}
                  className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-md transition-colors">Cancel</button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1 block">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Add personal notes..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
              Save Changes
            </button>
            <button onClick={() => onReanalyse(entry.name)}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded-lg transition-colors">
              AI Re-analyse
            </button>
          </div>

          {/* Delete */}
          <div className="pt-2 border-t border-zinc-800">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">Are you sure?</span>
                <button onClick={() => onDelete(entry.id)}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-md transition-colors">Yes, delete</button>
                <button onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-md transition-colors">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                className="text-xs text-red-400/70 hover:text-red-400 transition-colors">Delete this entry</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
