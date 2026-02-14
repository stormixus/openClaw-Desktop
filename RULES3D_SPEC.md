# RULES3D_SPEC.md
OpenClaw Module: **RULES3D — 3D Rule-Editing Puzzle + Agent Commentary**  
Inspired-by (conceptually): “rule-as-objects” puzzle genre (e.g., Baba-like), but implemented as an original **Rule Puzzle System**.

Target: **Tauri + Svelte + Three.js**  
Core Principle: **Deterministic rules engine** controls world behavior.  
Agent only: explains, hints, narrates, difficulty pacing.

---

## 0) Scope & Goals

### MVP Goals
- A grid-based puzzle world rendered in 3D (2.5D look is fine).
- “Word blocks” exist in the world and can be pushed to form rules.
- Rules dynamically change gameplay (e.g., WALL IS STOP → WALL IS PUSH).
- Deterministic validation: win condition is rule-based (e.g., GOAL IS WIN and YOU touch GOAL).
- Agent provides:
  - explanation of current rules
  - progressive hints
  - “why that didn’t work” feedback

### Non-Goals (MVP)
- Massive content editor or full workshop ecosystem (later).
- Physics simulation; grid movement is sufficient.
- LLM-generated rules being executed directly (LLM cannot change engine constraints).

---

## 1) High-Level Architecture

```
Svelte UI
 ├─ Rules3DViewport (Three.js canvas, camera, picking)
 ├─ HUD (level, undo, reset, hint, step counter)
 ├─ AgentPanel (speech, mood, explanation list)
 └─ OverlayLayer (highlighted rule chains, hint markers)

Core (TS)
 ├─ World (grid, entities, movement)
 ├─ RuleParser (extract rules from word blocks)
 ├─ RuleEngine (apply rules → behaviors)
 ├─ LevelSystem (load levels, win/lose conditions)
 ├─ HintSystem (0..3, safe hints)
 └─ StateStore (history for undo, overlays, agent context)
```

---

## 2) Core Concepts

### 2.1 Grid World
- 2D grid (W x H)
- Each cell can hold multiple objects (stack), but MVP can allow limited stacking:
  - words stack allowed
  - entities stack allowed
- Movement is turn-based, 4-direction.

### 2.2 Object Types
- **Entities**: WALL, ROCK, KEY, DOOR, WATER, LAVA, GOAL, PLAYER, etc.
- **Word blocks**: tokens that form sentences:
  - Nouns: WALL, ROCK, YOU, GOAL...
  - Verbs: IS
  - Properties: STOP, PUSH, WIN, YOU, MOVE, SINK, HOT, OPEN, SHUT, DEFEAT...
- **Operators** (Phase 2): AND, NOT

MVP grammar:
```
NOUN  IS  PROPERTY
NOUN  IS  NOUN
```

Examples:
- `WALL IS STOP`
- `ROCK IS PUSH`
- `FLAG IS WIN`
- `PLAYER IS YOU` (recommended convention)

---

## 3) Data Model (TypeScript)

### 3.1 Coordinates
```ts
export type Dir = "U"|"D"|"L"|"R";
export type Pos = { x:number; y:number };
```

### 3.2 Object Instances
```ts
export type ObjKind = "ENTITY" | "WORD";

export type Obj = {
  id: string;
  kind: ObjKind;
  type: string;      // e.g., "WALL", "ROCK", "IS", "PUSH"
  pos: Pos;
};
```

### 3.3 Cell / Grid
```ts
export type Cell = { objects: string[] }; // obj ids
export type Grid = Cell[][];
```

### 3.4 World State
```ts
export type WorldState = {
  width: number;
  height: number;
  objects: Record<string, Obj>;
  grid: Grid;

  // derived each tick:
  rules: ParsedRules;

  // gameplay:
  step: number;
  status: "playing"|"won"|"lost";

  // undo:
  history: WorldStateSnapshot[];
};
```

### 3.5 Snapshot for Undo
```ts
export type WorldStateSnapshot = {
  objects: Record<string, Obj>;
  grid: Grid;
  step: number;
  status: "playing"|"won"|"lost";
};
```

---

## 4) Rule Parsing

### 4.1 Parsing Approach
Rules are read from contiguous 3-token chains (horizontal or vertical):

```
[A] [IS] [B]
```

Where:
- `A` is NOUN word token
- `IS` is verb
- `B` is PROPERTY or NOUN (transform)

### 4.2 Parsed Rules
```ts
export type Property =
  | "STOP" | "PUSH" | "WIN" | "YOU" | "DEFEAT"
  | "SINK" | "HOT" | "MELT" | "OPEN" | "SHUT" | "MOVE";

export type ParsedRules = {
  props: Record<string, Set<Property>>; // e.g., props["WALL"] has STOP
  transforms: Record<string, string>;   // e.g., transforms["ROCK"] = "KEY"
  youTypes: Set<string>;                // all types that are YOU
};
```

### 4.3 Conflict Resolution (MVP)
- Prefer designing levels without transform conflicts.
- If conflicts happen, resolve by stable priority:
  - left-to-right, top-to-bottom scan order
  - first transform wins (documented)

---

## 5) Rule Engine Behaviors (MVP)

Tick order (deterministic):
1. Snapshot for undo
2. Parse rules
3. Apply transforms (`A IS B` where B is NOUN)
4. Move YOU entities per input direction (with PUSH / STOP)
5. Resolve interactions
6. Check win/lose

### 5.1 Movement
- All YOU attempt to move simultaneously (or in stable order for MVP).
- STOP blocks movement.
- PUSH allows pushing chains if space available.

### 5.2 Interactions (MVP minimal set)
- WIN: if any YOU shares a cell with a WIN entity => won
- DEFEAT: if any YOU shares a cell with DEFEAT => lost
- (Optional) SINK: if SINK + any other object share cell => both removed
- (Optional) OPEN/SHUT: if OPEN meets SHUT => both removed

Recommended MVP set:
- STOP, PUSH, YOU, WIN, DEFEAT

---

## 6) Level Format

### 6.1 JSON Level
```json
{
  "id": "r3d-001",
  "title": "First Rules",
  "size": { "w": 12, "h": 10 },
  "objects": [
    { "kind":"ENTITY", "type":"WALL", "x":0, "y":0 },

    { "kind":"WORD", "type":"WALL", "x":2, "y":2 },
    { "kind":"WORD", "type":"IS", "x":3, "y":2 },
    { "kind":"WORD", "type":"STOP", "x":4, "y":2 },

    { "kind":"WORD", "type":"PLAYER", "x":2, "y":5 },
    { "kind":"WORD", "type":"IS", "x":3, "y":5 },
    { "kind":"WORD", "type":"YOU", "x":4, "y":5 },

    { "kind":"ENTITY", "type":"PLAYER", "x":1, "y":6 },

    { "kind":"WORD", "type":"GOAL", "x":7, "y":2 },
    { "kind":"WORD", "type":"IS", "x":8, "y":2 },
    { "kind":"WORD", "type":"WIN", "x":9, "y":2 },
    { "kind":"ENTITY", "type":"GOAL", "x":10, "y":6 }
  ]
}
```

### 6.2 Vocabulary
Maintain a vocabulary whitelist:
- nouns (entity names)
- properties
- verb tokens: IS
This prevents invalid rules.

---

## 7) 3D Rendering Spec (Three.js)

### 7.1 Style
- 2.5D diorama:
  - board is a platform on XZ plane
  - word blocks are cubes with text decals
  - entities are primitives / simple meshes

### 7.2 Camera
- Perspective camera
- Orbit controls with clamp:
  - keep view mostly top-down but allow slight rotation
  - no extreme angles

### 7.3 Word Text Rendering
MVP options:
- CanvasTexture per word (simple, fine for small vocab)
- Atlas textures (better performance later)

### 7.4 Picking
- Raycast against object meshes
- Movement by keyboard is primary; clicking can select and show properties.

### 7.5 Overlays
- Highlight active rules:
  - glow outline on word chain meshes forming valid rules
- Hint marker:
  - pulsing ring on target word block

---

## 8) Controls & UX

- Move: WASD / Arrow keys
- Undo: Ctrl+Z
- Reset: R
- Hint: H
- Show current rules panel always (right side)
- Step counter + level title

---

## 9) Hint System (0..3)

### 9.1 Level-authored hints (Best for MVP)
Per level:
- `hints[0..3]` text
- `hintTargets[0..3]` list of word coordinates to highlight

### 9.2 Engine-generated hints (Optional)
Detect structural issues:
- no YOU rule => tell player to create YOU
- no WIN rule => tell player to create WIN
- player stuck due to STOP => suggest changing STOP/PUSH

### 9.3 Output
```ts
export function getHint(state:WorldState, level:number): {
  highlights: {x:number;y:number;kind:"word"|"entity"}[]
  text: string
}
```

---

## 10) Agent Integration

### 10.1 Safety
Agent is not allowed to output new rules to execute.
Agent can only reference:
- current rule list
- recent action result
- allowed highlight targets

### 10.2 Agent I/O
Input JSON includes:
- current rules as plain lists
- last move outcome
- hint level
- allowed targets for highlight

Output JSON includes:
- speech
- mood
- highlights subset of allowed targets
- hintLevelNext suggestion
- short explanation list

---

## 11) Determinism & Constraints

- Tick order fixed.
- Rule parsing purely from world state.
- Token whitelist enforced.
- Undo uses snapshots (MVP) for simplicity.
- No random elements unless seeded.

---

## 12) Core APIs (Suggested)

```ts
export function loadLevel(levelId:string): WorldState
export function parseRules(state:WorldState): ParsedRules
export function tick(state:WorldState, dir:Dir): WorldState
export function undo(state:WorldState): WorldState
export function reset(state:WorldState): WorldState
export function getCurrentRulesText(state:WorldState): string[]
export function getHint(state:WorldState, level:number): { highlights:any[]; text:string }
```

---

## 13) File Layout

```
/src/lib/rules3d/
  /components/
    Rules3DViewport.svelte
    HUD.svelte
    AgentPanel.svelte
    RulesPanel.svelte
  /core/
    world.ts
    ruleParser.ts
    ruleEngine.ts
    interactions.ts
    types.ts
    hints.ts
  /levels/
    r3d-001.json
    r3d-002.json
  /store/
    rules3dStore.ts
  /assets/
    (optional)
```

---

## 14) MVP Implementation Order

1. 3D grid board + basic object rendering.
2. Deterministic movement with PUSH/STOP.
3. Word blocks + rule parsing (NOUN IS PROPERTY).
4. YOU/WIN/DEFEAT behaviors.
5. Undo/reset with snapshots.
6. Rules panel UI.
7. Level loading.
8. Hints (level-authored).
9. Agent panel + safe I/O schema.
10. Visual polish: rule highlights + animations.

---

## 15) Definition of Done (MVP)

User can:
- load a level
- move YOU in 3D
- push word blocks to change rules live
- see updated rules list instantly
- win via WIN condition
- undo/reset
- request hints
- get agent commentary with highlights

---
