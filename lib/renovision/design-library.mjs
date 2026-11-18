/** RENOVISION interior design library: styles, materials, categories,
 * cohesive palettes and room collections.
 *
 * Editorial reference data written for this platform. It describes design
 * directions and material characteristics in general terms; it contains no
 * product listings, no prices and no availability claims. Palette hex values
 * are illustrative design values, not a paint manufacturer's color match —
 * physical samples must be checked before purchase.
 */

export const DESIGN_CATEGORIES = Object.freeze([
  {id: "flooring", name: "Flooring"},
  {id: "wall-treatments", name: "Wall treatments"},
  {id: "paint", name: "Paint"},
  {id: "cabinetry", name: "Cabinetry"},
  {id: "countertops", name: "Countertops"},
  {id: "backsplashes", name: "Backsplashes"},
  {id: "lighting", name: "Lighting"},
  {id: "plumbing-fixtures", name: "Plumbing fixtures"},
  {id: "hardware", name: "Hardware"},
  {id: "furniture", name: "Furniture"},
  {id: "window-treatments", name: "Window treatments"},
  {id: "rugs", name: "Rugs"},
  {id: "decor", name: "Decor"},
]);

export const DESIGN_STYLES = Object.freeze([
  {id: "modern-organic", name: "Modern organic", description: "Clean modern lines softened by natural materials, curved forms and earthy neutrals.", keywords: ["curved", "natural", "warm minimal", "stone", "oak"]},
  {id: "contemporary", name: "Contemporary", description: "Current, fluid design that borrows from the moment: bold shapes, mixed metals, statement lighting.", keywords: ["bold", "current", "mixed metals", "statement"]},
  {id: "minimalist", name: "Minimalist", description: "Restraint as luxury: few pieces, exact proportions, hidden storage, quiet monochrome palettes.", keywords: ["restraint", "monochrome", "hidden storage", "quiet"]},
  {id: "scandinavian", name: "Scandinavian", description: "Light woods, white walls, functional forms and layered textiles built for long winters and bright rooms.", keywords: ["light wood", "white", "hygge", "functional"]},
  {id: "japandi", name: "Japandi", description: "Japanese wabi-sabi meets Scandinavian function: low profiles, natural fibers, negative space.", keywords: ["low profile", "wabi-sabi", "natural fiber", "calm"]},
  {id: "mid-century-modern", name: "Mid-century modern", description: "1950s-60s silhouettes: tapered legs, walnut, teak, and optimistic accent colors.", keywords: ["walnut", "tapered legs", "retro", "teak"]},
  {id: "traditional", name: "Traditional", description: "Symmetry, classic moldings, rich woods and patterned textiles in a formal, enduring register.", keywords: ["symmetry", "moldings", "classic", "formal"]},
  {id: "transitional", name: "Transitional", description: "A bridge between traditional comfort and contemporary clarity: tailored, neutral, uncluttered.", keywords: ["tailored", "neutral", "bridge", "balanced"]},
  {id: "industrial", name: "Industrial", description: "Raw structure as decoration: brick, blackened steel, concrete, reclaimed timber, exposed fittings.", keywords: ["brick", "steel", "concrete", "raw"]},
  {id: "farmhouse", name: "Farmhouse", description: "Practical rural comfort: apron sinks, shiplap, worn wood, and generous work surfaces.", keywords: ["shiplap", "apron sink", "worn wood", "practical"]},
  {id: "coastal", name: "Coastal", description: "Sea-light interiors: white, sand and blue, natural weave textures, relaxed slipcovered forms.", keywords: ["white", "sand", "blue", "breezy"]},
  {id: "bohemian", name: "Bohemian", description: "Collected and layered: global textiles, plants, vintage finds, pattern on pattern.", keywords: ["layered", "global", "plants", "pattern"]},
  {id: "art-deco", name: "Art Deco", description: "1920s glamour: geometry, lacquer, brass, jewel tones and fan/sunburst motifs.", keywords: ["geometry", "brass", "jewel tones", "glamour"]},
  {id: "mediterranean", name: "Mediterranean", description: "Sun-washed plaster, terracotta, arches, ironwork and deep shade against bright light.", keywords: ["plaster", "terracotta", "arches", "ironwork"]},
  {id: "french-country", name: "French country", description: "Provincial elegance: toile, distressed painted wood, linen, lavender and stone.", keywords: ["toile", "linen", "distressed", "provincial"]},
  {id: "rustic", name: "Rustic", description: "Hand-hewn character: beams, stone fireplaces, hides and honest, heavy materials.", keywords: ["beams", "stone", "hand-hewn", "heavy"]},
  {id: "luxury-modern", name: "Luxury modern", description: "Gallery-grade minimalism with precious materials: book-matched marble, bronze, bespoke joinery.", keywords: ["marble", "bronze", "bespoke", "gallery"]},
  {id: "eclectic", name: "Eclectic", description: "A deliberate mix of eras and origins unified by color discipline and confident editing.", keywords: ["mixed eras", "edited", "color discipline"]},
  {id: "southwestern", name: "Southwestern", description: "Desert palette and craft: adobe tones, woven blankets, Saltillo tile, tooled leather.", keywords: ["desert", "adobe", "woven", "saltillo"]},
  {id: "maximalist", name: "Maximalist", description: "More, composed: saturated color, layered pattern, art walls and abundant objects with intent.", keywords: ["saturated", "layered pattern", "art wall", "abundant"]},
]);

export const DESIGN_MATERIALS = Object.freeze([
  {id: "hardwood", name: "Hardwood", category: "flooring", description: "Solid wood planks; warm, repairable by sanding, sensitive to standing water.", durability: "high", maintenance: "moderate"},
  {id: "engineered-wood", name: "Engineered wood", category: "flooring", description: "Real wood veneer over a stable core; more moisture-tolerant than solid hardwood.", durability: "high", maintenance: "moderate"},
  {id: "luxury-vinyl", name: "Luxury vinyl", category: "flooring", description: "Waterproof rigid planks that mimic wood or stone; forgiving underfoot and budget-friendly.", durability: "high", maintenance: "low"},
  {id: "tile", name: "Tile", category: "flooring", description: "Ceramic or porcelain; waterproof and hard-wearing, cold and hard underfoot, grout needs care.", durability: "high", maintenance: "moderate"},
  {id: "natural-stone", name: "Natural stone", category: "flooring", description: "Marble, slate, travertine and similar; unique veining, needs sealing, higher cost.", durability: "high", maintenance: "high"},
  {id: "quartz", name: "Quartz", category: "countertops", description: "Engineered stone; non-porous, consistent pattern, no sealing, heat can damage resin.", durability: "high", maintenance: "low"},
  {id: "marble", name: "Marble", category: "countertops", description: "Natural stone with distinctive veining; etches and stains, needs sealing and gentle use.", durability: "moderate", maintenance: "high"},
  {id: "granite", name: "Granite", category: "countertops", description: "Very hard natural stone; heat and stain resistant once sealed, busy natural patterning.", durability: "high", maintenance: "moderate"},
  {id: "concrete", name: "Concrete", category: "countertops", description: "Cast in place or precast; industrial character, porous unless sealed, develops patina.", durability: "moderate", maintenance: "high"},
  {id: "wallpaper", name: "Wallpaper", category: "wall-treatments", description: "Pattern and texture at scale; quality varies widely by material and installer.", durability: "moderate", maintenance: "moderate"},
  {id: "paint", name: "Paint", category: "paint", description: "The most flexible wall finish; sheen controls durability and light behavior.", durability: "moderate", maintenance: "low"},
  {id: "plaster", name: "Plaster", category: "wall-treatments", description: "Hand-applied mineral finish with depth and movement; specialist application and repair.", durability: "moderate", maintenance: "high"},
  {id: "metal-finishes", name: "Metal finishes", category: "hardware", description: "Brass, bronze, nickel, blackened steel and chrome across hardware, lighting and fixtures.", durability: "high", maintenance: "low"},
  {id: "glass", name: "Glass", category: "decor", description: "Partitions, doors, shelves and decor; light-transmitting, needs regular cleaning.", durability: "moderate", maintenance: "moderate"},
  {id: "natural-fabrics", name: "Natural fabrics", category: "furniture", description: "Linen, cotton, wool upholstery and drapery; breathable, characterful, can fade and stain.", durability: "moderate", maintenance: "moderate"},
  {id: "leather", name: "Leather", category: "furniture", description: "Full-grain hides develop patina; durable seating surface, conditions periodically.", durability: "high", maintenance: "moderate"},
  {id: "upholstery", name: "Upholstery", category: "furniture", description: "Performance and decorative fabrics over padded frames; check rub counts and cleaning codes.", durability: "varies", maintenance: "varies"},
]);

export const DESIGN_PALETTES = Object.freeze([
  {id: "warm-minimal", name: "Warm Minimal", styleId: "modern-organic", colors: [{name: "Warm white", hex: "#F5F0E8", role: "walls"}, {name: "Clay", hex: "#C4A484", role: "accent"}, {name: "Charcoal brown", hex: "#4A3F35", role: "grounding"}, {name: "Sage", hex: "#9CAF88", role: "soft accent"}], materialIds: ["hardwood", "plaster", "natural-fabrics"]},
  {id: "nordic-light", name: "Nordic Light", styleId: "scandinavian", colors: [{name: "Paper white", hex: "#FAFAF7", role: "walls"}, {name: "Pale oak tone", hex: "#D9C7A7", role: "wood"}, {name: "Muted blue-grey", hex: "#8FA3B0", role: "accent"}, {name: "Ink", hex: "#2E3138", role: "grounding"}], materialIds: ["engineered-wood", "paint", "natural-fabrics"]},
  {id: "deco-jewel", name: "Deco Jewel", styleId: "art-deco", colors: [{name: "Deep emerald", hex: "#14532D", role: "walls"}, {name: "Brass tone", hex: "#B08D57", role: "metal"}, {name: "Cream", hex: "#F3EAD8", role: "balance"}, {name: "Noir", hex: "#1C1C1E", role: "grounding"}], materialIds: ["metal-finishes", "marble", "glass"]},
  {id: "coastal-calm", name: "Coastal Calm", styleId: "coastal", colors: [{name: "Sea white", hex: "#F7F5F0", role: "walls"}, {name: "Sand", hex: "#D6C7AE", role: "textile"}, {name: "Harbor blue", hex: "#5B7A99", role: "accent"}, {name: "Driftwood", hex: "#8A7B68", role: "wood"}], materialIds: ["luxury-vinyl", "natural-fabrics", "paint"]},
  {id: "desert-craft", name: "Desert Craft", styleId: "southwestern", colors: [{name: "Adobe", hex: "#B4653F", role: "accent"}, {name: "Bone", hex: "#EDE4D3", role: "walls"}, {name: "Turquoise", hex: "#3E7C7B", role: "accent 2"}, {name: "Mesquite", hex: "#5C4033", role: "wood"}], materialIds: ["tile", "leather", "plaster"]},
  {id: "gallery-luxe", name: "Gallery Luxe", styleId: "luxury-modern", colors: [{name: "Gallery white", hex: "#F4F4F2", role: "walls"}, {name: "Bronze tone", hex: "#7A5C3E", role: "metal"}, {name: "Stone grey", hex: "#8E8B85", role: "stone"}, {name: "Black", hex: "#111111", role: "grounding"}], materialIds: ["marble", "metal-finishes", "glass"]},
  {id: "farmhouse-fresh", name: "Farmhouse Fresh", styleId: "farmhouse", colors: [{name: "Cream", hex: "#F6F1E7", role: "walls"}, {name: "Barn red (muted)", hex: "#9C4A3C", role: "accent"}, {name: "Wheat", hex: "#CBB27F", role: "textile"}, {name: "Iron", hex: "#3B3B3B", role: "metal"}], materialIds: ["hardwood", "tile", "metal-finishes"]},
  {id: "japandi-calm", name: "Japandi Calm", styleId: "japandi", colors: [{name: "Rice white", hex: "#F2EDE4", role: "walls"}, {name: "Bamboo tone", hex: "#C9B18C", role: "wood"}, {name: "Charcoal", hex: "#35322E", role: "grounding"}, {name: "Moss", hex: "#6B7256", role: "soft accent"}], materialIds: ["engineered-wood", "natural-fabrics", "plaster"]},
]);

export const ROOM_COLLECTIONS = Object.freeze([
  {id: "serene-primary-suite", name: "Serene Primary Suite", roomType: "bedroom", styleId: "modern-organic", paletteId: "warm-minimal", materialIds: ["hardwood", "natural-fabrics", "plaster"], notes: "Low-profile bed, layered natural textiles, blackout window treatments; keep walkways to closets and bath clear."},
  {id: "chef-transitional-kitchen", name: "Chef's Transitional Kitchen", roomType: "kitchen", styleId: "transitional", paletteId: "gallery-luxe", materialIds: ["quartz", "tile", "metal-finishes"], notes: "Tailored cabinetry, durable quartz, full-height backsplash; verify appliance clearances and door swings in the layout."},
  {id: "bright-coastal-living", name: "Bright Coastal Living", roomType: "living", styleId: "coastal", paletteId: "coastal-calm", materialIds: ["luxury-vinyl", "natural-fabrics", "paint"], notes: "Slipcovered seating, woven textures, washable surfaces; orient seating to light without blocking window zones."},
  {id: "japandi-work-studio", name: "Japandi Work Studio", roomType: "office", styleId: "japandi", paletteId: "japandi-calm", materialIds: ["engineered-wood", "natural-fabrics"], notes: "Low desk, concealed storage, one plant, nothing else; circulation kept generous for a calm work field."},
  {id: "deco-powder-room", name: "Deco Powder Room", roomType: "bathroom", styleId: "art-deco", paletteId: "deco-jewel", materialIds: ["marble", "metal-finishes", "glass"], notes: "Jewel walls, brass fixtures, geometric mirror; small room, one statement only."},
  {id: "rustic-great-room", name: "Rustic Great Room", roomType: "living", styleId: "rustic", paletteId: "desert-craft", materialIds: ["natural-stone", "leather", "hardwood"], notes: "Stone hearth as obstacle zone in the plan; heavy leather seating; protect the fireplace clearance."},
]);

const byId = (list, id) => list.find((x) => x.id === id) ?? null;

export function listDesignStyles() { return [...DESIGN_STYLES]; }
export function getDesignStyle(id) { return byId(DESIGN_STYLES, id); }
export function listDesignCategories() { return [...DESIGN_CATEGORIES]; }
export function listDesignMaterials({category} = {}) {
  return DESIGN_MATERIALS.filter((m) => !category || m.category === category).map((m) => ({...m}));
}
export function getDesignMaterial(id) { return byId(DESIGN_MATERIALS, id); }
export function listDesignPalettes({styleId} = {}) {
  return DESIGN_PALETTES.filter((p) => !styleId || p.styleId === styleId).map((p) => ({...p, colors: p.colors.map((c) => ({...c}))}));
}
export function getDesignPalette(id) { return byId(DESIGN_PALETTES, id); }
export function listRoomCollections({roomType, styleId} = {}) {
  return ROOM_COLLECTIONS.filter((c) => (!roomType || c.roomType === roomType) && (!styleId || c.styleId === styleId)).map((c) => ({...c}));
}

/** Compare materials side by side on their recorded characteristics. */
export function compareDesignMaterials(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return {valid: false, errors: ["material ids required"]};
  const rows = [];
  for (const id of ids) {
    const m = byId(DESIGN_MATERIALS, id);
    if (!m) return {valid: false, errors: ["unknown material: " + id]};
    rows.push({id: m.id, name: m.name, category: m.category, description: m.description, durability: m.durability, maintenance: m.maintenance});
  }
  return {valid: true, materials: rows, note: "General characteristics only; grades and performance vary by specific product and manufacturer."};
}

/** Free-text search across styles, materials, palettes and collections. */
export function searchDesignLibrary(query) {
  const q = typeof query === "string" ? query.trim().toLowerCase() : "";
  if (!q) return {styles: [], materials: [], palettes: [], collections: []};
  const hit = (...fields) => fields.some((f) => typeof f === "string" && f.toLowerCase().includes(q));
  return {
    styles: DESIGN_STYLES.filter((s) => hit(s.name, s.description, ...(s.keywords ?? []))).map((s) => s.id),
    materials: DESIGN_MATERIALS.filter((m) => hit(m.name, m.description, m.category)).map((m) => m.id),
    palettes: DESIGN_PALETTES.filter((p) => hit(p.name, ...p.colors.map((c) => c.name))).map((p) => p.id),
    collections: ROOM_COLLECTIONS.filter((c) => hit(c.name, c.roomType, c.notes)).map((c) => c.id),
  };
}
