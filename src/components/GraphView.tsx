import { fetchGraphData, fetchNeighbours } from "@/lib/api";
import type { Category, Entry, GraphPayload } from "@/lib/types";
import { CATEGORY_ICONS } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

const CATEGORY_COLORS: Record<Category, string> = {
	Movies: "#818cf8",
	Music: "#f472b6",
	Books: "#fb923c",
	Games: "#34d399",
	TV: "#60a5fa",
	Food: "#fbbf24",
	Art: "#c084fc",
	Travel: "#2dd4bf",
	Podcasts: "#f87171",
	People: "#a78bfa",
	Other: "#94a3b8",
};

const LINK_COLOR = "#f472b6";
const SHARED_TAG_COLOR = "#94a3b8";

type GraphNode = {
	id: string;
	type: "category" | "item";
	name: string;
	category: Category;
	val: number;
	icon?: string;
	entry?: string;
	tags?: string[];
	isMatch?: boolean;
	x?: number;
	y?: number;
};

type GraphLink = {
	source: string;
	target: string;
	degree: 1 | 2 | 3;
	relType?: string;
	label?: string;
};

type GraphViewProps = {
	onEntryClick: (entry: Entry) => void;
	refreshKey: number;
	query: string;
	selectedCategory: Category | null;
	selectedSubcategory: string | null;
	onQueryChange: (q: string) => void;
};

function hexToRgb(hex: string) {
	return `${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}`;
}

function normalizeForSearch(s: string): string {
	return s
		.toLowerCase()
		.replace(/[\s\-_]+/g, " ")
		.trim()
		.replace(/\s+/g, "");
}

function entryMatchesQuery(entry: GraphPayload["entries"][number], q: string): boolean {
	const normQ = normalizeForSearch(q);
	if (!normQ) return false;
	if (normalizeForSearch(entry.name).includes(normQ)) return true;
	if (normalizeForSearch(entry.category).includes(normQ)) return true;
	if (normalizeForSearch(entry.subcategory).includes(normQ)) return true;
	if (entry.tags.some((t) => normalizeForSearch(t).includes(normQ))) return true;
	return false;
}

export function GraphView({ onEntryClick, refreshKey, query, selectedCategory, selectedSubcategory, onQueryChange }: GraphViewProps) {
	const fgRef = useRef<any>(undefined);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const roRef = useRef<ResizeObserver | null>(null);
	const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

	const [rawData, setRawData] = useState<GraphPayload | null>(null);
	const [expandedCategories, setExpandedCategories] = useState<Set<Category>>(new Set());
	const [degree, setDegree] = useState<1 | 2 | 3>(3);
	const [hoveredNode, setHoveredNode] = useState<string | null>(null);

	const isFiltered = query.trim().length > 0;

	useEffect(() => {
		fetchGraphData()
			.then((data) => {
				setRawData(data);
				const cats = new Set(data.entries.map((e) => e.category)) as Set<Category>;
				setExpandedCategories(cats);
			})
			.catch(console.error);
	}, [refreshKey]);

	const containerCallbackRef = useCallback((node: HTMLDivElement | null) => {
		if (roRef.current) {
			roRef.current.disconnect();
			roRef.current = null;
		}
		containerRef.current = node;
		if (!node) return;
		setDims({ w: node.clientWidth, h: node.clientHeight });
		const ro = new ResizeObserver((entries) => {
			const { width, height } = entries[0].contentRect;
			if (width > 0 && height > 0) setDims({ w: width, h: height });
		});
		ro.observe(node);
		roRef.current = ro;
	}, []);

	const entriesByCategory = useMemo(() => {
		if (!rawData) return new Map<Category, GraphPayload["entries"]>();
		const map = new Map<Category, GraphPayload["entries"]>();
		for (const e of rawData.entries) {
			const list = map.get(e.category) || [];
			list.push(e);
			map.set(e.category, list);
		}
		return map;
	}, [rawData]);

	const { matchedIds, neighborIds } = useMemo(() => {
		if (!rawData || !isFiltered) return { matchedIds: new Set<string>(), neighborIds: new Set<string>() };

		const matched = new Set<string>();
		for (const e of rawData.entries) {
			if (selectedCategory && e.category !== selectedCategory) continue;
			if (selectedSubcategory && e.subcategory !== selectedSubcategory) continue;
			if (entryMatchesQuery(e, query)) matched.add(e.id);
		}

		const neighbors = new Set<string>();
		for (const rel of rawData.relationships) {
			if (matched.has(rel.from_id) && !matched.has(rel.to_id)) neighbors.add(rel.to_id);
			if (matched.has(rel.to_id) && !matched.has(rel.from_id)) neighbors.add(rel.from_id);
		}

		return { matchedIds: matched, neighborIds: neighbors };
	}, [rawData, query, isFiltered, selectedCategory, selectedSubcategory]);

	const adjacencyMap = useMemo(() => {
		const map = new Map<string, Set<string>>();
		if (!rawData) return map;

		for (const [cat, items] of entriesByCategory) {
			const catId = `cat:${cat}`;
			if (!map.has(catId)) map.set(catId, new Set());
			for (const item of items) {
				map.get(catId)!.add(item.id);
				if (!map.has(item.id)) map.set(item.id, new Set());
				map.get(item.id)!.add(catId);
			}
		}

		const visibleIds = new Set<string>();
		for (const cat of expandedCategories) {
			const items = entriesByCategory.get(cat);
			if (items) items.forEach((e) => visibleIds.add(e.id));
		}

		for (const rel of rawData.relationships) {
			if (visibleIds.has(rel.from_id) && visibleIds.has(rel.to_id)) {
				if (!map.has(rel.from_id)) map.set(rel.from_id, new Set());
				if (!map.has(rel.to_id)) map.set(rel.to_id, new Set());
				map.get(rel.from_id)!.add(rel.to_id);
				map.get(rel.to_id)!.add(rel.from_id);
			}
		}

		return map;
	}, [rawData, entriesByCategory, expandedCategories]);

	const graphData = useMemo(() => {
		if (!rawData) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };

		const nodes: GraphNode[] = [];
		const links: GraphLink[] = [];
		const visibleItemIds = new Set<string>();

		if (isFiltered) {
			const allVisible = new Set([...matchedIds, ...neighborIds]);
			const visibleCats = new Set<Category>();

			for (const e of rawData.entries) {
				if (!allVisible.has(e.id)) continue;
				visibleItemIds.add(e.id);
				visibleCats.add(e.category);
				nodes.push({
					id: e.id,
					type: "item",
					name: e.name,
					category: e.category,
					val: matchedIds.has(e.id) ? 30 : 25,
					entry: e.id,
					tags: e.tags,
					isMatch: matchedIds.has(e.id),
				});
			}

			for (const cat of visibleCats) {
				nodes.push({
					id: `cat:${cat}`,
					type: "category",
					name: cat,
					category: cat,
					val: 64,
					icon: CATEGORY_ICONS[cat],
				});
				for (const id of allVisible) {
					const entry = rawData.entries.find((e) => e.id === id);
					if (entry?.category === cat) {
						links.push({ source: `cat:${cat}`, target: id, degree: 1 });
					}
				}
			}
		} else {
			for (const [cat, items] of entriesByCategory) {
				nodes.push({
					id: `cat:${cat}`,
					type: "category",
					name: cat,
					category: cat,
					val: 64,
					icon: CATEGORY_ICONS[cat],
				});

				if (expandedCategories.has(cat)) {
					for (const item of items) {
						if (selectedCategory && item.category !== selectedCategory) continue;
						if (selectedSubcategory && item.subcategory !== selectedSubcategory) continue;
						visibleItemIds.add(item.id);
						nodes.push({
							id: item.id,
							type: "item",
							name: item.name,
							category: item.category,
							val: 25,
							entry: item.id,
							tags: item.tags,
						});
						links.push({ source: `cat:${cat}`, target: item.id, degree: 1 });
					}
				}
			}
		}

		const entryById = new Map(rawData.entries.map((e) => [e.id, e]));

		for (const rel of rawData.relationships) {
			if (visibleItemIds.has(rel.from_id) && visibleItemIds.has(rel.to_id)) {
				const from = entryById.get(rel.from_id);
				const to = entryById.get(rel.to_id);
				const fromName = from?.name ?? rel.from_id;
				const toName = to?.name ?? rel.to_id;
				const shared = from && to ? from.tags.filter((t) => to.tags.includes(t)) : [];
				const reason = shared.length > 0
					? `shared: ${shared.join(", ")}`
					: "AI linked";
				links.push({
					source: rel.from_id,
					target: rel.to_id,
					degree: 2,
					relType: rel.type,
					label: `${fromName} ↔ ${toName} — ${reason}`,
				});
			}
		}

		if (!isFiltered && expandedCategories.size >= 2) {
			const relPairs = new Set(
				rawData.relationships
					.filter((r) => visibleItemIds.has(r.from_id) && visibleItemIds.has(r.to_id))
					.flatMap((r) => [`${r.from_id}:${r.to_id}`, `${r.to_id}:${r.from_id}`]),
			);
			const visibleItems = rawData.entries.filter((e) => visibleItemIds.has(e.id));
			for (let i = 0; i < visibleItems.length; i++) {
				for (let j = i + 1; j < visibleItems.length; j++) {
					const a = visibleItems[i], b = visibleItems[j];
					if (a.category === b.category) continue;
					if (relPairs.has(`${a.id}:${b.id}`)) continue;
					const shared = a.tags.filter((t) => b.tags.includes(t));
					if (shared.length >= 2) {
						links.push({
							source: a.id,
							target: b.id,
							degree: 3,
							label: `${a.name} ↔ ${b.name} — shared tags: ${shared.join(", ")}`,
						});
					}
				}
			}
		}

		const nodeTooltips = new Map<string, string>();
		for (const link of links) {
			if (link.degree === 1 || !link.label) continue;
			const src = typeof link.source === "object" ? (link.source as any).id : link.source;
			const tgt = typeof link.target === "object" ? (link.target as any).id : link.target;
			const srcName = entryById.get(src)?.name ?? src;
			const tgtName = entryById.get(tgt)?.name ?? tgt;

			const srcLines = nodeTooltips.get(src) || "";
			const tgtLines = nodeTooltips.get(tgt) || "";

			const reason = link.label.split(" — ")[1] || "";
			nodeTooltips.set(src, srcLines + (srcLines ? "\n" : "") + `↔ ${tgtName} — ${reason}`);
			nodeTooltips.set(tgt, tgtLines + (tgtLines ? "\n" : "") + `↔ ${srcName} — ${reason}`);
		}

		for (const node of nodes) {
			if (node.type === "category") continue;
			const connections = nodeTooltips.get(node.id);
			(node as any).__tooltip = connections
				? `${node.name}\n${connections}`
				: node.name;
		}

		return { nodes, links };
	}, [rawData, entriesByCategory, expandedCategories, isFiltered, matchedIds, neighborIds, selectedCategory, selectedSubcategory]);

	const isAdjacentToHovered = useCallback(
		(nodeId: string) => {
			if (!hoveredNode) return true;
			if (nodeId === hoveredNode) return true;
			return adjacencyMap.get(hoveredNode)?.has(nodeId) ?? false;
		},
		[hoveredNode, adjacencyMap],
	);

	const handleNodeClick = useCallback(
		(node: GraphNode) => {
			if (node.type === "category") {
				if (!isFiltered) {
					setExpandedCategories((prev) => {
						const next = new Set(prev);
						if (next.has(node.category)) next.delete(node.category);
						else next.add(node.category);
						return next;
					});
				}
			} else if (node.entry) {
				fetchNeighbours(node.entry)
					.then(({ entry }) => onEntryClick(entry))
					.catch(console.error);
			}
		},
		[onEntryClick, isFiltered],
	);

	const handleNodeHover = useCallback((node: GraphNode | null) => {
		setHoveredNode(node?.id ?? null);
	}, []);

	const nodeCanvasObject = useCallback(
		(node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
			const x = node.x ?? 0;
			const y = node.y ?? 0;
			const isCat = node.type === "category";
			const baseColor = CATEGORY_COLORS[node.category] || "#94a3b8";

			const hoverAdjacent = isAdjacentToHovered(node.id);
			let alpha: number;
			if (hoveredNode) {
				alpha = hoverAdjacent ? 1 : 0.12;
			} else if (isFiltered && !isCat) {
				alpha = node.isMatch ? 1 : 0.45;
			} else {
				alpha = 0.9;
			}

			const r = Math.sqrt(node.val);

			ctx.save();
			ctx.globalAlpha = alpha;

			ctx.beginPath();
			ctx.arc(x, y, r, 0, 2 * Math.PI);
			ctx.fillStyle = baseColor;
			ctx.fill();

			if (isFiltered && node.isMatch && !isCat) {
				ctx.strokeStyle = "#e4e4e7";
				ctx.lineWidth = 1.5 / globalScale;
				ctx.stroke();
			}

			if (isCat && !isFiltered && expandedCategories.has(node.category)) {
				ctx.strokeStyle = "#e4e4e7";
				ctx.lineWidth = 2 / globalScale;
				ctx.stroke();
			}

			if (isCat && node.icon) {
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.font = `${Math.max(r * 0.9, 8)}px sans-serif`;
				ctx.fillStyle = "#fff";
				ctx.fillText(node.icon, x, y);
			}

			const labelSize = isCat
				? Math.max(12 / globalScale, 3.5)
				: Math.max(10 / globalScale, 2.5);
			ctx.font = `${isCat ? "600 " : ""}${labelSize}px sans-serif`;
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			ctx.fillStyle = isCat ? "#e4e4e7" : "#a1a1aa";

			const label = node.name.length > 20 ? node.name.slice(0, 18) + "..." : node.name;
			ctx.fillText(label, x, y + r + 3 / globalScale);

			if (isCat) {
				const countSize = Math.max(8 / globalScale, 2);
				ctx.font = `${countSize}px sans-serif`;
				ctx.fillStyle = "#71717a";
				const count = entriesByCategory.get(node.category)?.length ?? 0;
				ctx.fillText(`${count} items`, x, y + r + 3 / globalScale + labelSize + 2 / globalScale);
			}

			ctx.restore();
		},
		[hoveredNode, isAdjacentToHovered, expandedCategories, entriesByCategory, isFiltered],
	);

	const linkColor = useCallback(
		(link: GraphLink) => {
			const src = typeof link.source === "object" ? (link.source as any).id : link.source;
			const tgt = typeof link.target === "object" ? (link.target as any).id : link.target;
			const adjacent = !hoveredNode || src === hoveredNode || tgt === hoveredNode;
			const dim = adjacent ? 1 : 0.06;

			if (link.degree === 1) return `rgba(140, 140, 160, ${0.5 * dim})`;
			if (link.degree === 2) {
				const bothMatch = isFiltered && matchedIds.has(src) && matchedIds.has(tgt);
				const opacity = bothMatch ? 1 : 0.9;
				const rgb = hexToRgb(LINK_COLOR);
				return `rgba(${rgb}, ${opacity * dim})`;
			}
			const rgb = hexToRgb(SHARED_TAG_COLOR);
			return `rgba(${rgb}, ${0.25 * dim})`;
		},
		[hoveredNode, isFiltered, matchedIds],
	);

	const linkWidth = useCallback((link: GraphLink) => {
		if (link.degree === 1) return 1.5;
		if (link.degree === 2) return 2.5;
		return 1;
	}, []);

	const linkLineDash = useCallback((link: GraphLink) => {
		if (link.degree === 3) return [4, 4];
		return [];
	}, []);

	const linkVisibility = useCallback(
		(link: GraphLink) => link.degree <= degree,
		[degree],
	);

	useEffect(() => {
		const fg = fgRef.current;
		if (!fg) return;
		fg.d3Force("charge").strength(-25);
		fg.d3Force("link").distance((link: GraphLink) => {
			const l = link as GraphLink;
			return l.degree === 1 ? 80 : l.degree === 2 ? 120 : 100;
		});
	}, [graphData.nodes.length]);

	useEffect(() => {
		if (fgRef.current && graphData.nodes.length > 0) {
			setTimeout(() => fgRef.current?.zoomToFit(400, 60), 500);
		}
	}, [expandedCategories, graphData.nodes.length, isFiltered, query]);

	if (!rawData) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-zinc-950">
				<div className="text-zinc-400 text-sm animate-pulse">Loading graph...</div>
			</div>
		);
	}

	if (rawData.entries.length === 0) {
		return (
			<div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950">
				<p className="text-4xl mb-4">🗺️</p>
				<p className="text-zinc-300 text-lg font-medium mb-1">No items yet</p>
				<p className="text-zinc-500 text-sm">Add some items to see the graph</p>
			</div>
		);
	}

	const matchCount = matchedIds.size;
	const neighborCount = neighborIds.size;

	return (
		<div ref={containerCallbackRef} className="relative w-full h-full overflow-hidden bg-zinc-950">
			<div className="absolute top-3 left-3 z-10 bg-zinc-800/90 border border-zinc-700 rounded-lg px-3 py-2 backdrop-blur-sm">
				<label className="text-xs text-zinc-400 block mb-1">Connections</label>
				<div className="flex items-center gap-2">
					<input
						type="range"
						min={1}
						max={3}
						value={degree}
						onChange={(e) => setDegree(Number(e.target.value) as 1 | 2 | 3)}
						className="w-24 accent-indigo-500"
					/>
					<span className="text-xs text-zinc-300 font-medium w-4 text-center">{degree}</span>
				</div>
			</div>

			{isFiltered && (
				<div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-indigo-500/20 border border-indigo-500/30 rounded-full px-4 py-1.5 backdrop-blur-sm">
					<span className="text-xs text-indigo-300">
						"{query}" — {matchCount} match{matchCount !== 1 ? "es" : ""}{neighborCount > 0 ? ` + ${neighborCount} connected` : ""}
					</span>
					<button
						onClick={() => onQueryChange("")}
						className="text-indigo-400 hover:text-indigo-200 text-sm leading-none transition-colors"
					>
						×
					</button>
				</div>
			)}

			{isFiltered && matchCount === 0 && (
				<div className="absolute inset-0 flex items-center justify-center z-5 pointer-events-none">
					<div className="text-center">
						<p className="text-zinc-400 text-lg mb-1">No matches for "{query}"</p>
						<p className="text-zinc-500 text-sm">Try different terms</p>
					</div>
				</div>
			)}

			<div className="absolute top-3 right-3 z-10 bg-zinc-800/90 border border-zinc-700 rounded-lg px-3 py-2 backdrop-blur-sm max-h-64 overflow-y-auto">
				<div className="text-xs text-zinc-400 mb-1.5">Categories</div>
				<div className="flex flex-col gap-1">
					{[...entriesByCategory.keys()].map((cat) => (
						<div key={cat} className="flex items-center gap-1.5 text-xs text-zinc-400">
							<div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
							<span>{CATEGORY_ICONS[cat]} {cat}</span>
							{!isFiltered && expandedCategories.has(cat) && <span className="text-zinc-600 ml-0.5">(open)</span>}
						</div>
					))}
				</div>
				{degree >= 2 && (
					<div className="mt-2 pt-2 border-t border-zinc-700 flex flex-col gap-1">
						<div className="text-xs text-zinc-400 mb-0.5">Links</div>
						<div className="flex items-center gap-1.5 text-xs text-zinc-500">
							<div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: LINK_COLOR }} />
							related
						</div>
						{degree >= 3 && (
							<div className="flex items-center gap-1.5 text-xs text-zinc-500">
								<div className="w-4 h-0.5 rounded-full border-t border-dashed border-zinc-500" style={{ backgroundColor: "transparent" }} />
								shared tags
							</div>
						)}
					</div>
				)}
			</div>

			{dims && (
				<ForceGraph2D
					ref={fgRef}
					graphData={graphData}
					width={dims.w}
					height={dims.h}
					backgroundColor="#09090b"
					nodeCanvasObject={nodeCanvasObject}
					nodeCanvasObjectMode={() => "replace" as const}
					nodePointerAreaPaint={(node: GraphNode, color, ctx) => {
						const r = Math.sqrt(node.val);
						ctx.beginPath();
						ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
						ctx.fillStyle = color;
						ctx.fill();
					}}
					nodeLabel={(node: GraphNode) => (node as any).__tooltip || node.name}
					linkColor={linkColor}
					linkWidth={linkWidth}
					linkLineDash={linkLineDash}
					linkVisibility={linkVisibility}
					linkLabel={(link: GraphLink) => link.label || ""}
					linkHoverPrecision={8}
					onNodeClick={handleNodeClick}
					onNodeHover={handleNodeHover}
					enableNodeDrag={true}
					autoPauseRedraw={false}
					cooldownTicks={100}
					d3AlphaDecay={0.03}
					d3VelocityDecay={0.3}
				/>
			)}
		</div>
	);
}
