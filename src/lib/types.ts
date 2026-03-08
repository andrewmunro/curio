export type Category =
  | "Movies"
  | "Music"
  | "Books"
  | "Games"
  | "TV"
  | "Food"
  | "Art"
  | "Travel"
  | "Podcasts"
  | "People"
  | "Other";

export const CATEGORIES: Category[] = [
  "Movies",
  "Music",
  "Books",
  "Games",
  "TV",
  "Food",
  "Art",
  "Travel",
  "Podcasts",
  "People",
  "Other",
];

export const CATEGORY_ICONS: Record<Category, string> = {
  Movies: "🎬",
  Music: "🎵",
  Books: "📚",
  Games: "🎮",
  TV: "📺",
  Food: "🍜",
  Art: "🎨",
  Travel: "✈️",
  Podcasts: "🎙️",
  People: "👤",
  Other: "📦",
};

export type Entry = {
  id: string;
  name: string;
  category: Category;
  subcategory: string;
  tags: string[];
  notes: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  aiMetadata: Record<string, string>;
  dateAdded: string;
  edited: boolean;
};

export type RelationshipType = "related_to";

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  related_to: "Related to",
};

export type Relationship = {
  id: string;
  fromId: string;
  toId: string;
  type: RelationshipType;
  createdBy: "ai" | "user";
};

export type EntryNeighbour = {
  entry: Entry;
  relType: RelationshipType;
  relSource: "ai" | "user";
  relId: string;
};

export type SuggestedRelationship = {
  targetName: string;
  type: RelationshipType;
};

export type GraphEntry = {
  id: string;
  name: string;
  category: Category;
  subcategory: string;
  tags: string[];
};

export type GraphRelationship = {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
  created_by: string;
};

export type GraphPayload = {
  entries: GraphEntry[];
  relationships: GraphRelationship[];
};

export type CategoriseResponse = {
  name?: string;
  category: Category;
  subcategory: string;
  tags: string[];
  aiMetadata: Record<string, string>;
  confidence: "high" | "medium" | "low";
  relationships?: SuggestedRelationship[];
};
