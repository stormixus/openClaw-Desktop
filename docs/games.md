# Game Hub

## Overview

openClaw Desktop includes a built-in game hub with 14+ games. Games range from classic board games to 3D puzzles, all with optional AI agent integration.

## Lobby

The game lobby (`src/routes/play/+page.svelte`) displays all available games as cards with:
- Thumbnail preview
- Title and description
- Status badge: `Playable` or `Coming Soon`
- Click to launch

## Game Module Structure

Each game follows a consistent module pattern:

```
src/routes/play/<game>/
├── +page.svelte          # Route entry (loads board)
├── <Game>Board.svelte    # Main game UI component
├── engine.ts             # Game logic, state machine, AI prompt builder
├── i18n.ts               # Game-specific translations (EN/KO)
├── sounds.ts             # Audio effects (Web Audio API)
├── state.ts              # State types and helpers
└── themeScene.ts         # 3D theme config (Three.js games only)
```

## Player Modes

Games support various player configurations:

| Mode | Description |
|------|-------------|
| Human | Local player with manual input |
| Program | Built-in algorithmic AI |
| Agent | LLM-powered via gateway connection |

Typical presets:
- **Human vs Program** — Single player against built-in AI
- **Human vs Agent** — Play against gateway LLM
- **Agent vs Agent** — Watch two AIs play each other

## Game Catalog

### Board Games

#### Chess
Classic chess with full rule enforcement.
- **Engine**: `chess.js` for move validation, FEN/PGN support
- **Difficulty**: Easy / Normal / Hard (program AI depth)
- **Features**: Move animation, captured pieces display, check/checkmate detection
- **Agent Mode**: LLM receives board state as FEN, responds with move in algebraic notation

#### Checkers
Standard 8x8 checkers.
- **Rules**: Mandatory jumps, king promotion, multi-jump chains
- **Features**: Valid move highlighting, jump indicators

#### Janggi (Korean Chess)
Korean chess variant with unique piece movements.
- **Board**: 9x10 grid with palace
- **Pieces**: King, Advisor, Elephant, Horse, Chariot, Cannon, Soldier
- **Features**: Palace movement restrictions, cannon jump rules

### Card Games

#### Go-Stop (3-player)
Traditional Korean card game using Hwatu (flower cards).
- **Players**: 3 (left opponent, right opponent, human)
- **Cards**: 48 Hwatu cards (12 months x 4 types)
- **Scoring**: Gwang, Animal, Ribbon, Pi categories
- **Rules**: Go/Stop decision, bonus multipliers (bombs, shakes, etc.)
- **Features**: AI speech bubbles, card matching animation, score breakdown

#### Matgo (2-player)
Two-player variant of Go-Stop.
- **Players**: 2 (opponent, human)
- **Cards**: Same 48 Hwatu deck
- **Hand**: 10 cards each, 8 on table
- **Scoring**: Same categories as Go-Stop with 2-player adjustments

#### Poker (Texas Hold'em)
Multi-seat Texas Hold'em simulation.
- **Seats**: Configurable (Human, Program, Agent per seat)
- **Rounds**: Pre-flop → Flop → Turn → River
- **Features**: Betting UI, pot calculation, hand evaluation, showdown
- **Agent Mode**: LLM receives game state, decides fold/call/raise

### 3D Puzzle Games

All 3D games use **Three.js** for rendering.

#### Go 3D
Classic Go (Baduk) on a 3D rendered board.
- **Board**: Standard 19x19 (or 9x9, 13x13)
- **Features**: Stone placement, capture detection, territory scoring

#### Cube
3D Rubik's cube-style puzzle.
- **Interaction**: Click-and-drag face rotation
- **Features**: Scramble, solve hints, move counter

#### Mines 3D
Minesweeper in 3D space.
- **Grid**: 3D voxel grid
- **Features**: Number reveals, flag placement, mine detection

#### Nonogram 3D
3D logic puzzle based on nonogram rules.
- **Mechanic**: Row/column number clues to reveal 3D shape
- **Features**: Clue display, cell toggling, completion detection

#### Rules 3D
Rule-based 3D puzzle with progressive levels.
- **Mechanic**: Apply rules to transform 3D objects
- **Features**: Level progression, rule visualization

#### Sokoban 3D
Classic block-pushing puzzle in 3D.
- **Mechanic**: Push blocks onto target positions
- **Features**: Level selection, move counter, undo

#### Slitherlink
Loop-drawing logic puzzle.
- **Grid**: Numbered cells indicating adjacent loop segments
- **Features**: Edge drawing, loop validation, constraint checking

#### Lights Out
Toggle puzzle where pressing a light affects neighbors.
- **Grid**: 5x5 (or configurable)
- **Goal**: Turn all lights off
- **Features**: Move counter, solution hint

### Plugin System

Community games can be loaded via the plugin system (`src/routes/play/plugin/`).
- Plugin discovery and loading
- Standardized game interface
- Asset management for plugin resources

## Sound System

Each game module includes a `sounds.ts` file using the **Web Audio API**:

```typescript
// Common sound patterns across games
playCardFlip()     // Card games: card dealt/flipped
playCardSlap()     // Card games: card placed on table
playCapture()      // Board games: piece captured
playMove()         // Board games: piece moved
playWin()          // Victory sound
playLose()         // Defeat sound
playClick()        // UI interaction
```

Sounds are synthesized programmatically (no audio files) using oscillators, noise generators, and filters for zero-dependency audio.

## i18n per Game

Each game has its own `i18n.ts` with a `$kt()` function (game-local translation):

```typescript
// engine.ts or i18n.ts
const labels = {
  en: { score: "Score", turn: "Your Turn", ... },
  ko: { score: "점수", turn: "당신의 차례", ... },
};

export function $kt(key: string): string { ... }
```

This is separate from the global `$t()` system to keep game translations modular.

## State Persistence

Game state is persisted in SQLite via the Rust backend:

```sql
CREATE TABLE game_state (
  game_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Games can save/restore state across sessions.

## AI Agent Integration

### Prompt Building
Each `engine.ts` includes a prompt builder that converts game state to a structured text prompt:

```typescript
function buildAgentPrompt(state: GameState): string {
  // Describes current board, valid moves, scoring context
  // Returns structured prompt for LLM decision-making
}
```

### Response Parsing
Agent responses are parsed for valid moves:
```typescript
function parseAgentMove(response: string): Move | null {
  // Extract move notation from LLM response
  // Validate against current game rules
  // Return parsed move or null
}
```

### Gateway Integration
When a game seat is assigned to "Agent":
1. Game engine builds prompt from current state
2. Prompt sent to active gateway via `chat.send`
3. Response parsed for move decision
4. Move validated and applied to game state
5. UI updates with animation
