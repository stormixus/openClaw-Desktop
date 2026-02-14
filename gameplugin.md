# OpenClaw Game Plugin Spec (v0.1)

목표: OpenClaw Desktop(호스트)은 **Svelte(UI/라우팅)** 로 유지하되, 게임은 **플러그인(Web 번들)** 로 배포/설치되게 해서 누구나(React/Vue/Svelte/Vanilla/Three/Canvas 등) 만들고 스토어에 올릴 수 있게 한다.

핵심 원칙
- **호스트 = UI/권한/스토어/저장소/LLM 브릿지**
- **게임 = 샌드박스된 Web Plugin(정적 번들)**
- **게임 규칙/엔진은 플러그인 내부**, 호스트는 실행/통신/권한만 제공

---

## 현재 코드베이스 (As-Is)

현재 게임은 호스트 앱에 직접 번들된 Svelte 컴포넌트이다.

```
src/lib/games/
├── module.ts              # GameModule 인터페이스
├── registry.ts            # GAME_MODULES[] 정적 배열
├── chess/                 # 참조 구현 (playable)
│   ├── module.ts          #   GameModule 등록 객체
│   ├── engine.ts          #   chess.js 래퍼 + LLM 프롬프트/파서
│   ├── board3d.ts         #   Three.js ChessBoard3D 클래스
│   ├── state.ts           #   모듈-레벨 상태 보존 (save/load/clear)
│   ├── i18n.ts            #   게임별 ko/en 번역 (derived store)
│   └── ChessBoard.svelte  #   메인 UI (Svelte 5 $state 룬)
├── janggi/                # 장기 (status: 'soon')
├── checkers/              # 체커
├── go3d/                  # 3D 바둑 (코어: src/lib/go3d/)
├── mines3d/               # 3D 지뢰찾기 (코어: src/lib/mines3d/)
└── rules3d/               # 규칙 3D (코어: src/lib/rules3d/)

src/routes/games/
├── +page.svelte           # 게임 허브 (GAME_MODULES 그리드)
├── chess/+page.svelte     # 각 게임의 라우트 페이지
├── janggi/+page.svelte
└── ...
```

### 현재 GameModule 인터페이스

```typescript
// src/lib/games/module.ts
export type GameModuleStatus = 'playable' | 'soon';
export interface GameModule {
  id: string;            // 'chess', 'janggi', ...
  route: string;         // '/games/chess'
  emoji: string;         // 허브 카드 이모지
  titleKey: string;      // 전역 i18n 키
  descKey: string;       // 전역 i18n 키
  status: GameModuleStatus;
}
```

### 현재 LLM 연동 패턴 (chess 참조)

```typescript
// chess/engine.ts — 프롬프트 빌더
buildChessPrompt(game: Chess, locale: string, difficulty: Difficulty): string
// chess/engine.ts — 응답 파서 (3단계 폴백: 정확매치→포함검사→좌표표기)
parseLlmMove(response: string, game: Chess): string | null

// ChessBoard.svelte — Gateway 호출
const client = getActiveClient();
await client.sendChat({
  sessionKey: `chess-${shortUUID}`,  // 격리된 일회성 세션
  message: prompt,
  idempotencyKey: crypto.randomUUID(),
  deliver: false,  // 메인 채팅에 노출 안 함
});
// 폴링으로 응답 수신 (최대 30초, 1초 간격)
```

### 현재 한계

1. 게임 추가 = 호스트 코드 직접 수정 + 앱 전체 리빌드 필요
2. `registry.ts` 정적 배열 — 런타임 추가/제거 불가
3. 게임이 호스트의 모든 API(gateway store, Tauri IPC 등)에 직접 접근
4. 프레임워크 종속(Svelte 5 + SvelteKit 라우팅 필수)

---

## 1) 플러그인 형태

### 1.1 패키지 단위
- 파일 확장자: `.ocpkg` (zip 컨테이너)
- 내부 구조:

```
my-game.ocpkg/
  manifest.json
  dist/
    index.html       ← 플러그인 진입점 (어떤 프레임워크든 가능)
    assets/...
  signatures/
    publisher.sig (optional)
```

### 1.2 배포 방식
- 스토어에서 다운로드 → OpenClaw가 로컬에 설치(캐시)
- 로컬 파일로도 설치 가능(드래그&드롭)

### 1.3 호스트 설치 경로 (Tauri)

```
{app_data_dir}/plugins/{pluginId}/
  manifest.json
  dist/
    index.html
    assets/...
```

**구현:** `src-tauri/src/` 에 `plugin/` 모듈 추가

```rust
// src-tauri/src/plugin/mod.rs
pub mod installer;   // .ocpkg 해제, 검증, 설치/삭제
pub mod registry;    // 설치된 플러그인 목록 관리 (SQLite)
pub mod loader;      // WebView 로딩 경로 해석
```

**Tauri 커맨드:**
```rust
#[tauri::command]
fn plugin_install(path: String) -> Result<PluginMeta, String>
#[tauri::command]
fn plugin_uninstall(plugin_id: String) -> Result<(), String>
#[tauri::command]
fn plugin_list() -> Result<Vec<PluginMeta>, String>
```

---

## 2) 실행 모델

### 2.1 컨테이너

현재 게임은 SvelteKit 라우트에서 직접 렌더링된다. 플러그인은 **샌드박스 iframe**으로 전환한다.

**변경 대상:** `src/routes/games/` 라우트 구조

```
src/routes/games/
├── +page.svelte              # 게임 허브 (변경: 동적 레지스트리에서 로드)
├── [pluginId]/+page.svelte   # 동적 라우트 — iframe 로더
│
├── chess/+page.svelte        # 내장 게임 (당분간 유지, 점진적 마이그레이션)
├── janggi/+page.svelte
└── ...
```

**새 파일:** `src/routes/games/[pluginId]/+page.svelte`

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import PluginHost from '$lib/plugin/PluginHost.svelte';

  const pluginId = $page.params.pluginId;
</script>

<PluginHost {pluginId} />
```

**새 파일:** `src/lib/plugin/PluginHost.svelte`

```svelte
<!-- 샌드박스 iframe으로 플러그인 로드 + postMessage 브릿지 관리 -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { PluginBridge } from './bridge';
  import { ArrowLeft } from '@lucide/svelte';
  import { t } from '$lib/i18n';

  export let pluginId: string;

  let iframe: HTMLIFrameElement;
  let bridge: PluginBridge;
  let pluginMeta = $state<PluginMeta | null>(null);

  onMount(async () => {
    pluginMeta = await invoke('plugin_get_meta', { pluginId });
    bridge = new PluginBridge(iframe, pluginId, pluginMeta.permissions);
    bridge.sendInit({ locale, theme, grantedPermissions });
  });

  onDestroy(() => bridge?.destroy());
</script>

<div class="plugin-page">
  <div class="header">
    <a href="/games" class="back-link"><ArrowLeft size={16} />{$t('games.back')}</a>
    <h2>{pluginMeta?.name ?? pluginId}</h2>
  </div>
  <iframe
    bind:this={iframe}
    src="tauri://localhost/plugin/{pluginId}/dist/index.html"
    sandbox="allow-scripts allow-same-origin"
    class="plugin-frame"
  />
</div>
```

### 2.2 라이프사이클

플러그인은 다음 메시지를 처리해야 한다:
- `oc:init` : 초기화(권한, 테마, 언어, 세션)
- `oc:mount` : 화면 마운트(필요 시)
- `oc:unmount` : 정리(이벤트 제거, 타이머 정리)
- `oc:suspend` / `oc:resume` : 백그라운드/포커스 전환

**호스트 구현:** `src/lib/plugin/bridge.ts`

```typescript
export class PluginBridge {
  private port: MessagePort;
  private handlers = new Map<string, (msg: OcMessage) => void>();

  constructor(
    private iframe: HTMLIFrameElement,
    private pluginId: string,
    private permissions: GrantedPermissions,
  ) {
    const channel = new MessageChannel();
    this.port = channel.port1;
    this.port.onmessage = (e) => this.handleMessage(e.data);
    // port2를 플러그인에 전달
    iframe.contentWindow?.postMessage(
      { type: 'oc:handshake', port: channel.port2 }, '*', [channel.port2]
    );
  }

  sendInit(opts: InitPayload) {
    this.send({ type: 'oc:init', payload: opts });
  }

  private handleMessage(msg: OcMessage) {
    // 권한 게이팅 후 라우팅
    switch (msg.type) {
      case 'plugin:ready': /* ... */ break;
      case 'storage:get':  /* 권한 체크 → scoped storage */ break;
      case 'llm:invoke':   /* 권한 체크 → gateway proxy */ break;
      // ...
    }
  }

  destroy() {
    this.send({ type: 'oc:unmount' });
    this.port.close();
  }
}
```

---

## 3) manifest.json 스펙

### 3.1 예시
```json
{
  "schemaVersion": "0.1",
  "id": "com.example.mines3d",
  "name": "Mines 3D",
  "version": "1.0.0",
  "description": "3D Minesweeper with agent hints",
  "entry": "dist/index.html",
  "icon": "dist/assets/icon.png",
  "authors": [{"name": "Example Studio"}],
  "categories": ["game", "puzzle"],
  "minHostVersion": "0.8.0",
  "permissions": {
    "storage": "scoped",
    "clipboard": "readwrite",
    "network": {"mode": "deny"},
    "llm": {"mode": "ask", "models": ["local:*", "openai:gpt-*"]}
  },
  "capabilities": {
    "saveState": true,
    "replay": false,
    "leaderboard": false
  }
}
```

### 3.2 필드 정의
- `schemaVersion` (string, required): 스펙 버전
- `id` (string, required): 역도메인 형태의 고유 ID
- `name` (string, required)
- `version` (semver, required)
- `description` (string)
- `entry` (string, required): 패키지 내 진입 HTML 경로
- `icon` (string)
- `authors` (array)
- `categories` (array): 예) `game`, `puzzle`, `strategy`
- `minHostVersion` (string)
- `permissions` (object, required): 권한 요청 선언
- `capabilities` (object): 호스트 기능 의존성 선언

### 3.3 GameModule 인터페이스 확장

현재 `GameModule`을 플러그인과 호환하도록 확장:

```typescript
// src/lib/games/module.ts (수정)
export type GameModuleStatus = 'playable' | 'soon' | 'installed';
export type GameModuleSource = 'builtin' | 'plugin';

export interface GameModule {
  id: string;
  route: string;
  emoji: string;
  titleKey: string;          // builtin: i18n key, plugin: 직접 문자열
  descKey: string;
  status: GameModuleStatus;
  // 신규 필드
  source: GameModuleSource;  // 'builtin' | 'plugin'
  pluginId?: string;         // source=plugin일 때 manifest.id
  icon?: string;             // 플러그인 아이콘 경로
  version?: string;
}
```

### 3.4 레지스트리 동적화

```typescript
// src/lib/games/registry.ts (수정)
import { invoke } from '@tauri-apps/api/core';

// 내장 게임 (기존)
const BUILTIN_MODULES: GameModule[] = [
  chessModule, janggiModule, go3dModule,
  checkersModule, mines3dModule, rules3dModule,
];

// 설치된 플러그인을 GameModule로 변환
async function loadPluginModules(): Promise<GameModule[]> {
  const plugins: PluginMeta[] = await invoke('plugin_list');
  return plugins.map(p => ({
    id: p.id,
    route: `/games/${p.id}`,
    emoji: p.icon ? '' : '🎮',  // 아이콘 이미지가 있으면 emoji 비움
    titleKey: p.name,            // 직접 문자열 (i18n key 아님)
    descKey: p.description,
    status: 'installed' as const,
    source: 'plugin' as const,
    pluginId: p.id,
    icon: p.icon,
    version: p.version,
  }));
}

// 통합 레지스트리
export async function getGameModules(): Promise<GameModule[]> {
  const plugins = await loadPluginModules();
  return [
    ...BUILTIN_MODULES.map(m => ({ ...m, source: 'builtin' as const })),
    ...plugins,
  ];
}

// 동기 내보내기 유지 (기존 코드 호환)
export const GAME_MODULES = BUILTIN_MODULES.map(m => ({
  ...m, source: 'builtin' as const,
}));
```

### 3.5 게임 허브 수정

```svelte
<!-- src/routes/games/+page.svelte (수정) -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getGameModules, GAME_MODULES } from '$lib/games/registry';

  let modules = $state(GAME_MODULES);  // 즉시 내장 게임 표시

  onMount(async () => {
    modules = await getGameModules();  // 플러그인 추가 로드
  });
</script>

{#each modules as game}
  <a href={game.route} class="game-card">
    <!-- source=plugin이면 icon 이미지, 아니면 emoji -->
    {#if game.source === 'plugin' && game.icon}
      <img src="tauri://localhost/plugin/{game.pluginId}/{game.icon}" alt="" />
    {:else}
      <span class="game-emoji">{game.emoji}</span>
    {/if}
    <!-- titleKey가 i18n 키인지 직접 문자열인지 판별 -->
    <h3>{game.source === 'builtin' ? $t(game.titleKey) : game.titleKey}</h3>
    <!-- ... -->
  </a>
{/each}
```

---

## 4) 권한 모델 (Permission Model)

원칙: **기본 차단(Deny by default)** + 명시적 승인.

### 4.1 storage
- `"storage": "scoped"` (권장)
  - 플러그인 전용 샌드박스 경로만 접근
  - 호스트 API로만 접근(직접 FS 접근 금지)

**구현:** `src-tauri/src/plugin/storage.rs`
```rust
// 스코프: {app_data_dir}/plugin_data/{pluginId}/
fn scoped_path(plugin_id: &str, key: &str) -> PathBuf
```

### 4.2 network
- 기본 `deny`
- 허용 시 도메인 allowlist:
```json
"network": {"mode":"allow", "allowlist":["api.example.com"]}
```

### 4.3 llm
- LLM 호출은 비용/프라이버시 이슈가 크므로 `ask` 권장
- 모델 allowlist 지원

**구현:** 브릿지에서 `llm:invoke` 수신 시 → 현재 gateway 호출로 프록시

```typescript
// src/lib/plugin/bridge.ts — llm:invoke 핸들러
async handleLlmInvoke(msg: OcMessage) {
  if (!this.permissions.llm) return this.deny(msg);

  const client = getActiveClient();
  if (!client) return this.error(msg, 'No gateway connected');

  const sessKey = `plugin-${this.pluginId}-${crypto.randomUUID().slice(0,8)}`;
  await client.sendChat({
    sessionKey: sessKey,
    message: msg.payload.messages.map(m => m.content).join('\n'),
    idempotencyKey: crypto.randomUUID(),
    deliver: false,
  });

  // 폴링 (현재 chess 패턴과 동일)
  const response = await this.pollResponse(sessKey, 30);
  this.reply(msg, { content: response });
}
```

### 4.4 clipboard
- `read`, `write`, `readwrite`

### 4.5 notifications (optional)
- 사용자 알림 권한

---

## 5) 호스트 ↔ 플러그인 메시지 프로토콜

### 5.1 공통 Envelope
```ts
type OcMessage<T = any> = {
  v: "0.1";
  id: string;            // request id (UUID)
  type: string;          // e.g. "oc:init", "plugin:ready"
  payload?: T;
  replyTo?: string;      // response correlation
}
```

### 5.2 초기화 시퀀스

```
호스트                          플러그인
  │                               │
  │──── oc:handshake (port2) ────→│  iframe.postMessage
  │                               │
  │──── oc:init ─────────────────→│  locale, theme, permissions
  │                               │
  │←──── plugin:ready ────────────│  렌더 준비 완료
  │                               │
  │←──── llm:invoke ──────────────│  AI 수 요청
  │──── llm:invoke.reply ────────→│  AI 응답
  │                               │
  │←──── storage:set ─────────────│  상태 저장
  │──── storage:set.reply ───────→│  확인
  │                               │
  │──── oc:unmount ──────────────→│  정리 요청
  │                               │
```

### 5.3 theme/locale 동기화

호스트의 CSS 변수를 플러그인에 전달:

```typescript
// oc:init payload.theme
{
  colorBg: '#0a0a0f',
  colorSurface: '#141420',
  colorPrimary: '#6366f1',
  colorText: '#e2e8f0',
  // ... var(--color-*) 매핑
}
```

플러그인은 이 값을 자유롭게 적용하거나 무시할 수 있다.

---

## 6) 표준 API (Host Services)

### 6.1 Storage API
- `storage:get` `{ key }`
- `storage:set` `{ key, value }`
- `storage:delete` `{ key }`
- `storage:list` `{ prefix? }`

스코프: `pluginId/` 하위에만 저장.

### 6.2 LLM API
- `llm:invoke` payload:
```json
{
  "model": "local:qwen2.5",
  "messages": [{"role":"user","content":"..."}],
  "temperature": 0.3,
  "json": true
}
```

호스트는:
- 권한 체크 (manifest.permissions.llm)
- 비용/토큰 제한
- Gateway 세션 격리 (`plugin-{pluginId}-{uuid}`)

### 6.3 Clipboard API
- `clipboard:read`
- `clipboard:write` `{ text }`

### 6.4 Telemetry (optional)
- `telemetry:event` `{ name, props }`
  - 기본 off, 사용자 opt-in

---

## 7) 저장/세이브 규격

### 7.1 saveState / loadState

현재 내장 게임 패턴:
```typescript
// chess/state.ts — 모듈-레벨 변수 (네비게이션 간 유지)
let saved: ChessGameState | null = null;
export function saveChessState(s) { saved = {...s}; }
export function loadChessState() { return saved; }
```

플러그인 패턴:
```json
{
  "schema": "com.openclaw.game.state@1",
  "updatedAt": 1730000000000,
  "data": { "mode": "classic", "seed": "...", "progress": {} }
}
```

- `capabilities.saveState=true` 선언 시 호스트가 `plugin:saveState` 요청 가능
- 플러그인은 `plugin:saveStateResult`로 JSON 반환
- 호스트는 scoped storage에 자동 저장

### 7.2 리플레이 (옵션)
- `capabilities.replay=true`일 때
- 입력 이벤트 로그 기반

---

## 8) 스토어 업로드/검증 (개요)

### 8.1 정적 검증
- `manifest.json` 스키마 검증
- 파일 경로 검증(Entry 존재)
- 번들 크기 제한(예: 200MB)

### 8.2 보안 검증
- 네트워크 권한 요청 확인
- 외부 스크립트 로딩 차단 권장(CSP)
- 서명(선택) + 퍼블리셔 신뢰 체계(차후)

**CSP 정책:** `tauri.conf.json`의 현재 CSP를 플러그인 iframe에도 적용
```
default-src 'self'; script-src 'self'; connect-src 'none';
```

---

## 9) 내장 게임 플러그인화 (마이그레이션)

장기적으로 내장 게임도 동일한 `.ocpkg` + `manifest.json`으로 제공하면,
- 내장/외부 게임 실행 경로가 동일해지고
- 스토어 생태계 확장성이 좋아진다.

### 마이그레이션 순서 (제안)

| 단계 | 작업 | 영향 범위 |
|------|------|-----------|
| **Phase 0** | 현행 유지 — 이 스펙 확정 | 없음 |
| **Phase 1** | `PluginHost.svelte` + `bridge.ts` 구현, `[pluginId]` 동적 라우트 추가 | 신규 파일만 |
| **Phase 2** | `registry.ts` 동적화 — 설치된 플러그인 로드 | registry.ts, 게임 허브 |
| **Phase 3** | Tauri 백엔드 `plugin/` 모듈 (install/uninstall/list) | src-tauri/src/ |
| **Phase 4** | 내장 게임 중 1개(mines3d)를 플러그인으로 추출하여 검증 | mines3d 관련 파일 |
| **Phase 5** | 나머지 내장 게임 점진적 마이그레이션 | 각 게임 디렉토리 |

**Phase 1~2 동안 기존 내장 게임은 그대로 동작한다.**
- `BUILTIN_MODULES`는 유지
- 내장 게임 라우트(`chess/+page.svelte` 등)는 삭제하지 않음
- 플러그인 라우트(`[pluginId]/+page.svelte`)와 병존

---

## 10) 구현 체크리스트

### 호스트 — 프론트엔드 (src/)

- [ ] `src/lib/plugin/bridge.ts` — MessageChannel 기반 통신
- [ ] `src/lib/plugin/PluginHost.svelte` — iframe 로더 + 헤더 + 브릿지
- [ ] `src/lib/plugin/types.ts` — OcMessage, PluginMeta, GrantedPermissions
- [ ] `src/lib/plugin/permissions.ts` — 권한 게이팅 로직
- [ ] `src/routes/games/[pluginId]/+page.svelte` — 동적 라우트
- [ ] `src/lib/games/module.ts` — GameModule 인터페이스 확장 (source, pluginId)
- [ ] `src/lib/games/registry.ts` — `getGameModules()` 비동기 함수 추가
- [ ] `src/routes/games/+page.svelte` — 플러그인 카드 렌더링 분기

### 호스트 — 백엔드 (src-tauri/)

- [ ] `src-tauri/src/plugin/mod.rs` — 모듈 선언
- [ ] `src-tauri/src/plugin/installer.rs` — .ocpkg 해제/검증/설치/삭제
- [ ] `src-tauri/src/plugin/registry.rs` — 설치 목록 SQLite 관리
- [ ] `src-tauri/src/plugin/storage.rs` — 스코프드 파일 스토리지
- [ ] `src-tauri/src/plugin/loader.rs` — 플러그인 HTML 서빙 (asset protocol)
- [ ] `src-tauri/src/lib.rs` — Tauri 커맨드 등록
- [ ] `src-tauri/tauri.conf.json` — 플러그인 asset protocol 허용

### 플러그인 SDK (별도 패키지, 추후)

- [ ] `@openclaw/plugin-sdk` — 브릿지 클라이언트 라이브러리
- [ ] `create-oc-plugin` — 스캐폴딩 CLI
- [ ] 예제 플러그인 (Vanilla JS, React, Vue 각 1개)

---

## 11) 다음 버전(v0.2) 제안
- Manifest에 `routes` 지원(게임 내부 subpage)
- 리소스 접근: `asset://` 프로토콜
- 테마 토큰 공유(호스트 CSS variables 실시간 동기화)
- 멀티윈도우/팝업 권한
- 리더보드/업적 호스트 API
- 플러그인 간 통신 (예: 멀티플레이어 매치메이킹)

---

끝.
