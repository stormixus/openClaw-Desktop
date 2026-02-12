# openClaw Desktop

> **멀티 게이트웨이 허브 + 문서 협업 클라이언트**

공식 OpenClaw 앱이 단일 로컬 Gateway에 집중한다면, 이 앱은 **여러 원격 Gateway를 탭으로 관리**하고 **문서 협업(Forge)** 기능을 제공하는 **파워 유저용 데스크톱 클라이언트**입니다.

---

## 핵심 컨셉

### 1. Multi-Gateway Hub (멀티 게이트웨이 허브)
- 여러 컴퓨터에 설치된 OpenClaw Gateway에 WebSocket으로 연결
- 탭 UI로 게이트웨이 간 빠른 전환
- 연결 상태/세션 관리
- 원격 Gateway 설정 (IP:Port, 인증)

### 2. Enhanced Chat (향상된 채팅)
- **드래그앤드롭** 파일/이미지 업로드 (웹챗에서 불가능한 기능)
- 클립보드 이미지 붙여넣기
- 로컬 파일 시스템 접근
- 미디어 프리뷰 (이미지, PDF, 문서)

### 3. Document Forge (문서 협업) - Claude Forge 스타일
- 문서 편집기 내장 (Excel, PowerPoint, Word 등)
- AI 에이전트와 **실시간 공동 편집**
- 변경 사항 추적 및 버전 관리
- 에이전트가 수정한 부분 하이라이트

### 4. Model Selector (모델 선택기) - 차별화 기능 ⭐
- 채팅 창에서 **셀렉트 박스로 즉시 모델 변경**
- 현재 모델 표시 + 드롭다운
- 사용 가능한 모델 목록 (providers 별 그룹화)
- 빠른 전환 (CLI `/model` 대해)
- 모델 상태 표시 (auth 상태, fallback 설정)

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Framework | Tauri 2 (Rust backend) |
| Frontend | SvelteKit + TypeScript |
| Styling | Vanilla CSS (테마 시스템) |
| Runtime | Bun |
| Protocol | OpenClaw Gateway WebSocket (ws://IP:18789) |

### ⚠️ Svelte 5 Runes 필수 사용

모든 Svelte 컴포넌트에서 **Svelte 5 Runes**를 사용해야 합니다:

- `$props()` - props 정의
- `$state()` - 반응형 상태
- `$derived()` - 파생 값
- `$effect()` - 사이드 이펙트

**Writable Store 구독 패턴**:
```svelte
<script lang="ts">
  import { myStore } from "$lib/store";
  
  let value = $state(false);
  $effect(() => {
    const unsub = myStore.subscribe(v => value = v);
    return unsub;
  });
</script>
```

---

## UI/UX 디자인 가이드 (CleanMyMac X 스타일)

### 디자인 철학
- **macOS 네이티브 느낌** - Apple HIG 준수
- **프리미엄 & 미니멀** - 불필요한 요소 제거
- **다크 모드 우선** - 시스템 설정 연동
- **부드러운 애니메이션** - 자연스러운 전환

### 레이아웃

```
┌──────────────────────────────────────────────────────────────┐
│ ● ● ●                                                        │ <- 윈도우 컨트롤
├─────────┬────────────────────────────────────────────────────┤
│         │  ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│   🏠    │  │🟢 Home  │ │🟢 Work  │ │🔴 VPS  │   <- Gateway Tabs
│  Home   │  └─────────┘ └─────────┘ └─────────┘              │
│         ├────────────────────────────────────────────────────┤
│   💬    │                                                    │
│  Chat   │   User: Can you summarize the project?             │
│         │                                                    │
│   📄    │   🤖 Agent: Here's the summary...                  │
│ Forge   │       [스트리밍 타이핑 인디케이터]                  │
│         │                                                    │
│   ⚙️    │   [툴 출력 카드: File Search (2 results)]         │
│ Settings│                                                    │
│         ├────────────────────────────────────────────────────┤
│         │  ┌─────────────────────────────────────────────┐ │
│         │  │ 메시지를 입력하세요...                           ↑ │ │
│         │  └─────────────────────────────────────────────┘ │
│         │  ┌─────────────────────────────────────────────┐ │
│         │  │ ➕  🌐  🔗  📝  🤖 Sonnet 4.5 ▼       🎙️  ↑  │ │
│         │  └─────────────────────────────────────────────┘ │
│         │     ^     ^    ^    ^         ^             ^   ^   │
│         │     |     |    |    |         |             |   |   │
│         │   파일  웹   MCP 세션    Model Selector    마이크 Send │
└─────────┴────────────────────────────────────────────────────┘
  Sidebar                    Main Content Area
 (고정 폭)                   (유동 폭)
```

### Input Toolbar (입력창 하단 툴바) - Claude 스타일

입력창 아래에 툴바 배치 (왼쪽→오른쪽):

| 아이콘 | 기능 | 설명 |
|--------|------|------|
| ➕ | 파일 추가 | 드래그앤드롭 / 파일 선택 |
| 🌐 | 웹 검색 | 웹 컨텍스트 추가 |
| 🔗 | MCP | MCP 서버 연결 |
| 📝 | 세션 | 세션 선택/새 세션 |
| 🤖 Model ▼ | **모델 선택기** | 드롭다운으로 모델 변경 |
| 🎙️ | 마이크 | 음성 입력 |
| ↑ | Send | 메시지 전송 |

### 컬러 팔레트

**Dark Theme (기본)**
```css
:root {
  /* Background */
  --bg-sidebar: #1a1a2e;           /* 딥 네이비 */
  --bg-main: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
  --bg-card: rgba(255, 255, 255, 0.05);
  --bg-input: rgba(255, 255, 255, 0.08);
  
  /* Text */
  --text-primary: #f4f4f5;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  
  /* Accent */
  --accent-blue: #3b82f6;
  --accent-purple: #8b5cf6;
  --accent-gradient: linear-gradient(135deg, #3b82f6, #8b5cf6);
  
  /* Status */
  --status-online: #22c55e;
  --status-offline: #ef4444;
  --status-connecting: #f59e0b;
  
  /* Shadows */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.4);
  --shadow-glow: 0 0 20px rgba(59, 130, 246, 0.3);
}
```

**Light Theme**
```css
:root[data-theme="light"] {
  --bg-sidebar: #f5f5f7;
  --bg-main: #ffffff;
  --bg-card: rgba(0, 0, 0, 0.03);
  --bg-input: rgba(0, 0, 0, 0.05);
  
  --text-primary: #1a1a2e;
  --text-secondary: #52525b;
  --text-muted: #a1a1aa;
  
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.12);
}
```

### 타이포그래피

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", 
               "Segoe UI", "Noto Sans KR", sans-serif;
  --font-mono: "SF Mono", "Fira Code", monospace;
  
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 15px;
  --text-lg: 17px;
  --text-xl: 20px;
  --text-2xl: 24px;
}
```

### 컴포넌트 스타일

**1. Sidebar**
- 고정 폭: 80px (아이콘 + 레이블)
- 배경: 반투명 다크 + blur
- 아이콘: 24x24, 라운드 백그라운드
- 활성 항목: 글로우 효과 + 악센트 색상

**2. Gateway Tabs**
- 필(pill) 모양 버튼
- 상태 도트: 🟢 연결됨, 🔴 끊김, 🟡 연결 중
- 호버: 살짝 밝아짐
- 활성: 악센트 그라데이션 배경

**3. Chat Messages**
- User: 오른쪽 정렬, 악센트 배경
- Agent: 왼쪽 정렬, 카드 배경
- 스트리밍: 타이핑 인디케이터 (●●●)
- 코드 블록: 모노 폰트 + 복사 버튼

**4. Input Area**
- 라운드 입력 필드 (border-radius: 20px)
- 드래그앤드롭 존: 점선 테두리, 호버 시 하이라이트
- 첨부 파일: 썸네일 미리보기
- Send 버튼: 그라데이션 + 아이콘

**5. Cards & Panels**
- border-radius: 16px (squircle 느낌)
- 배경: 반투명 + backdrop-filter: blur(20px)
- 테두리: 1px rgba(255,255,255,0.1)

### 애니메이션

```css
:root {
  --transition-fast: 150ms ease;
  --transition-base: 250ms ease;
  --transition-slow: 400ms ease;
}

/* 호버 효과 */
.hoverable:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

/* 탭 전환 */
.tab-content {
  animation: fadeSlideIn 200ms ease;
}

@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 스트리밍 타이핑 */
@keyframes typing {
  0%, 60%, 100% { opacity: 0.3; }
  30% { opacity: 1; }
}
```

### 아이콘
- 스타일: Lucide Icons (일관된 선 두께)
- 크기: 20-24px
- 색상: currentColor (텍스트 색상 상속)

### 반응형
- 최소 창 크기: 800x600
- 사이드바: 항상 표시 (모바일 대응 불필요)
- 채팅 영역: 유동 폭

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    openClaw Desktop                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────┐ ┌─────┐ ┌─────┐                                   │
│  │ 🏠  │ │ 💼  │ │ 🖥️  │  ← Gateway Tabs                   │
│  │Home │ │Work │ │Server│                                   │
│  └──┬──┘ └─────┘ └─────┘                                   │
│     │                                                       │
│  ┌──┴────────────────────────────────────────────────────┐ │
│  │                    Chat Panel                          │ │
│  │  ┌────────────────────────────────────────────────┐   │ │
│  │  │ Agent: Here's the updated spreadsheet...       │   │ │
│  │  └────────────────────────────────────────────────┘   │ │
│  │  ┌────────────────────────────────────────────────┐   │ │
│  │  │ [📎 Drop files here or paste images]           │   │ │
│  │  └────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │               Forge Panel (Split View)               │ │
│  │  ┌─────────────────────┐ ┌─────────────────────────┐ │ │
│  │  │   Document Editor   │ │   AI Suggestions        │ │ │
│  │  │   (Excel/PPT/Doc)   │ │   & Change History      │ │ │
│  │  └─────────────────────┘ └─────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌──────────┐         ┌──────────┐         ┌──────────┐
    │ Gateway  │         │ Gateway  │         │ Gateway  │
    │ (Home)   │         │ (Work)   │         │ (Server) │
    │ :18789   │         │ :18789   │         │ :18789   │
    └──────────┘         └──────────┘         └──────────┘
```

---

## 개발 로드맵

### Phase 1: 기반 구축 ✅ (완료)
- [x] Tauri + SvelteKit + Bun 스캐폴드
- [x] i18n 시스템 (언어별 폴더 구조: src/lib/lang/{code}/)
- [x] 테마 시스템 (시스템/라이트/다크)
- [x] 기본 설정 UI
- [x] **Setup Wizard (초기 설정 마법사)** - CleanMyMac 스타일 ⭐
  - [x] 첫 실행 감지 (`localStorage` 기반)
  - [x] Step 1: 언어 선택 (🇺🇸/🇰🇷)
  - [x] Step 2: 테마 선택 (시스템/라이트/다크)
  - [x] Step 3: 게이트웨이 연결
    - [x] 로컬 openClaw 자동 감지 (Tauri `detect_local_openclaw` 명령)
    - [x] 설정 파일 스캔 (`~/.config/openclaw/`, `~/.openclaw/`)
    - [x] 포트 18789 사용 여부 확인
    - [x] 감지 시 자동 폼 채움 + "Local openClaw detected!" 배지
    - [x] 수동 입력도 가능 (Name, URL, Token)
  - [x] Step 4: 완료 화면 (설정 요약)
  - [x] Skip 버튼 (나중에 설정)
  - [x] 자동 연결 (로컬 감지 시)

### Phase 2: Gateway 연결 ✅ (완료)
- [x] Gateway 연결 관리자 ✅
  - [x] WebSocket 클라이언트 (`ws://IP:18789`)
  - [x] 연결 상태 모니터링
  - [x] 인증 (token/password/tailscale)
  - [x] Ed25519 서명 인증 (device identity)
  - [x] 재연결 로직
- [x] 멀티 Gateway 탭 UI ✅
  - [x] 탭 추가/제거
  - [x] 연결 상태 표시 (🟢/🔴/🟡)
  - [x] Gateway 설정 저장 (SQLite + localStorage fallback)
  - [ ] 탭 재정렬 (드래그앤드롭) — 현재 탭 드래그는 메시지 포워딩용
- [x] 채팅 UI ✅
  - [x] 메시지 송수신 (`chat.send`, `chat.history`) - 프로토콜 완료
  - [x] 스트리밍 응답 수신 (agent/chat events) - Store 업데이트 완료
  - [x] ~~**🔴 버그: UI가 Store 변경을 감지하지 못함**~~ → Svelte 5 runes로 수정 완료
  - [x] ~~**🔴 버그: 입력창 전송 후 초기화 안됨**~~ → 수정 완료
  - [x] 메시지 히스토리
  - [x] 메시지 중단 (`chat.abort`) → sessionKey 파라미터 수정 완료
  - [x] 타이핑 인디케이터 (●●●)
  - [x] 어시스턴트 노트 삽입 (`chat.inject`)
  - [x] 메시지 포워딩 (다른 Gateway로 전송) ✅
  - [x] 코드 블록 복사/핀 버튼 (single quote 인코딩 수정 완료) ✅
- [x] **Model Selector (모델 선택기)** ⭐ ✅
  - [x] `models.list` 메서드로 모델 목록 조회
  - [x] 셀렉트 박스 UI (provider별 그룹화)
  - [x] `models.set` 메서드로 모델 변경
  - [x] 현재 모델 + fallback 상태 표시
- [x] **Add Gateway Modal (게이트웨이 추가 모달)** ✅
  - [x] 이름/URL 입력
  - [x] 인증 방식 선택 (Tailscale/Token/Password)
  - [x] 인증 방식별 UI 전환
  - [x] 유효성 검사
  - [x] 게이트웨이 편집 모드 ✅
  - [x] 중복 URL 감지 ✅
- [x] **Agent Picker (에이전트 선택기)** ✅
  - [x] 에이전트 목록 드롭다운
  - [x] 현재 에이전트 표시
  - [x] 에이전트 설명 표시
- [x] **Session Manager (세션 관리자)** ✅
  - [x] 세션 목록 UI
  - [x] 세션 전환/새 세션 버튼
  - [x] 세션별 thinking/verbose 배지
  - [x] Gateway 연동 (실제 API 통합) ✅
- [x] **Status Bar (상태 바)** ✅
  - [x] 연결 상태 (connected/connecting/disconnected + 아이콘)
  - [x] 현재 agent + session + model
  - [x] 토큰 카운트 (input/output/total)
- [x] **Tool Output Cards (툴 출력)** ✅
  - [x] 툴 호출 카드 (args + results)
  - [x] 확장/축소 토글
  - [x] 실시간 스트리밍
- [x] **Settings Panel (설정 패널)** ✅
  - [x] Thinking level 선택 (None/Low/Medium/High)
  - [x] Verbose 토글
  - [x] Reasoning 토글
  - [x] Deliver 토글
  - [x] Gateway API Keys 관리 UI ✅ (ApiKeysPanel + SettingsPanel 통합)
- [x] **Slash Command Autocomplete** ✅
  - [x] `/` 입력 시 명령어 목록 (`/status`, `/npc`, `/model` 등)
  - [x] 팝업 메뉴 UI
- [x] **Notification System (알림 시스템)** ✅
  - [x] 알림 서비스 (chime/pop/ding 사운드)
  - [x] 브라우저 Permission 핸들링
- [x] **NPC Mode (NPC 모드)** ✅
  - [x] 애니메이션 캐릭터 렌더링 (blink, wave, bow)
  - [x] 감정 감지 (emotion detection)
  - [x] 커스텀 NPC 테마 시스템
  - [x] 아바타 팩 (mood backgrounds, thinking faces)
  - [x] 배경 크로스페이딩
  - [x] 다이얼로그 패널

### Phase 2.5: 인프라 ✅ (완료)
- [x] **SQLite 데이터베이스 마이그레이션** ✅
  - [x] Rust 백엔드 (rusqlite, WAL 모드)
  - [x] DB 스키마 (gateways, settings, device_identity, device_auth, npc_themes, npc_bg_paths)
  - [x] Tauri 커맨드 19개 등록
  - [x] TypeScript DAL (`src/lib/db.ts`) — Proxy 패턴으로 Tauri/localStorage 자동 전환
  - [x] One-time 마이그레이션 (`src/lib/migration.ts`)
  - [x] 웹 전용 개발 모드 (localStorage fallback) 지원

### Phase 3: 향상된 파일 처리 ✅ (완료)
- [x] **드래그앤드롭 파일 업로드** ✅
  - [x] 이미지 (JPG, PNG, WebP, GIF)
  - [x] 문서 (PDF, DOCX, XLSX, PPTX)
  - [x] 기타 파일
  - [x] 이미지 미리보기 생성
  - [x] 파일 타입별 아이콘
  - [x] Gateway 연동 (Base64 → chat.send) ✅
- [x] 클립보드 이미지 붙여넣기 (Ctrl/Cmd+V) ✅
- [x] 파일 프리뷰
  - [x] 이미지 인라인 표시
  - [x] PDF 썸네일 ✅ (pdfjs-dist 로컬 번들)
  - [x] 문서 아이콘
- [x] 다운로드 관리 (에이전트가 생성한 파일) ✅ (FileDownload 컴포넌트)

### Phase 4: Document Forge (문서 협업) ⭐ ✅ (완료)
- [x] 문서 편집기 통합 ✅
  - [x] Excel 편집기 (Rust: calamine + rust_xlsxwriter) ✅
  - [x] Word 편집기 (TipTap/ProseMirror) ✅
  - [x] PowerPoint 뷰어 (플레이스홀더 + 슬라이드 목록) ✅
  - [ ] Markdown 편집기 (Phase 5로 이동)
- [x] Forge 세션 ✅
  - [x] 문서 열기 → 에이전트와 공유 (doc_open, doc_read_view)
  - [x] 에이전트 수정 요청 (stagePatch, JsonPatch)
  - [x] 변경 사항 실시간 반영 (tool_use 인터셉트 → forgeState → ApprovalModal) ✅
  - [x] 변경 내역 하이라이트 (DiffViewer, ApprovalModal) ✅
- [x] 버전 관리 ✅
  - [x] 스냅샷 저장 (undo/redo stack, MAX_UNDO_DEPTH=20)
  - [x] 변경 되돌리기 (doc_undo, doc_redo)
  - [x] 변경 이력 표시 UI (HistoryTimeline) ✅
- [x] Rust 백엔드 모듈 (`src-tauri/src/document/`) ✅
  - [x] types.rs — DocState, CellValue, PatchOperation 등
  - [x] manager.rs — SessionManager (Mutex + HashMap)
  - [x] commands.rs — 11개 Tauri IPC 커맨드
  - [x] formats/excel.rs — ExcelAdapter (read/save)
  - [x] patch.rs — apply_patch, diff_states
- [x] Svelte 프론트엔드 ✅
  - [x] document.svelte.ts — Store + Rust↔UI 타입 변환
  - [x] ExcelGrid.svelte — 페이지네이션 그리드
  - [x] DocPreview.svelte — 멀티시트 탭 뷰어
  - [x] DiffViewer.svelte — 변경 diff 테이블
  - [x] ApprovalModal.svelte — HITL 승인 모달
- [x] 보안 하드닝 ✅
  - [x] MAX_TOTAL_CELLS=5,000,000 (DoS 방지)
  - [x] MAX_UNDO_DEPTH=20 (메모리 제한)
  - [x] max_rows 1000 cap (IPC 페이로드 제한)

### Phase 5: 고급 기능
- [ ] Canvas 통합 (OpenClaw Canvas/A2UI)
- [ ] 음성 입력 (Voice Wake 연동)
- [ ] 세션 관리 (멀티 에이전트)
- [ ] 스킬 탐색기 (ClawHub 연동)
- [ ] 시스템 트레이 + 백그라운드 실행

---

## 주요 파일 구조

```
src/
├── lib/
│   ├── i18n.ts              # 다국어 시스템 (완료)
│   ├── lang/                # 언어 파일들
│   │   ├── en/
│   │   │   └── index.ts     # 영어 번역
│   │   └── ko/
│   │       └── index.ts     # 한글 번역
│   ├── theme.ts             # 테마 관리 (완료)
│   ├── settings.ts          # 앱 설정 (완료, SQLite 연동)
│   ├── db.ts                # SQLite DAL (Tauri/localStorage 자동 전환)
│   ├── migration.ts         # localStorage → SQLite 마이그레이션
│   ├── notifications.ts     # 알림 서비스
│   ├── gateway/
│   │   ├── client.ts        # WebSocket 클라이언트
│   │   ├── types.ts         # Gateway 프로토콜 타입
│   │   ├── store.svelte.ts  # 연결 상태 스토어 (Svelte 5 Runes)
│   │   ├── device-identity.ts # Ed25519 키 관리
│   │   ├── device-auth.ts   # 디바이스 인증 토큰
│   │   ├── npcThemeStore.svelte.ts # NPC 테마 스토어
│   │   └── npcBackgroundService.ts # NPC 배경 서비스
│   ├── forge/
│   │   ├── excel.ts         # Excel 편집기 래퍼 (미구현)
│   │   ├── word.ts          # Word 편집기 래퍼 (미구현)
│   │   └── session.ts       # Forge 세션 관리 (미구현)
│   └── components/
│       ├── Chat/            # 채팅 UI (MessageBubble, ChatInput, ChatPanel 등)
│       ├── Gateway/         # Gateway 모달 (AddGatewayModal, ForwardModal)
│       ├── Tabs/            # Gateway 탭 UI
│       ├── FileUpload/      # 파일 업로드/프리뷰
│       ├── Wizard/          # 설정 마법사
│       ├── NPC/             # NPC 아바타/테마
│       └── Forge/           # 문서 협업 (미구현)
├── routes/
│   ├── +layout.svelte       # 앱 쉘 + 탭바
│   ├── +page.svelte         # 홈 (대시보드)
│   ├── chat/
│   │   └── [gatewayId]/     # 게이트웨이별 채팅
│   ├── forge/
│   │   └── +page.svelte     # 문서 협업 화면
│   ├── settings/
│   │   └── +page.svelte     # 설정
│   └── onboarding/
│       └── +page.svelte     # 첫 실행 가이드
src-tauri/
├── Cargo.toml               # rusqlite 의존성 포함
├── tauri.conf.json
├── src/
│   ├── lib.rs               # Rust 백엔드 + DB 초기화 + 19개 커맨드
│   └── database/            # SQLite 데이터베이스 모듈
│       ├── mod.rs            # DbState, init_db()
│       ├── schema.rs         # CREATE TABLE SQL
│       ├── models.rs         # Rust 데이터 구조체
│       ├── gateways.rs       # Gateway CRUD 커맨드
│       ├── settings.rs       # Settings 커맨드
│       ├── identity.rs       # Device Identity 커맨드
│       ├── auth.rs           # Device Auth 커맨드
│       ├── themes.rs         # NPC Theme 커맨드
│       └── migration.rs      # 마이그레이션 커맨드
└── icons/
```

---

## Gateway WebSocket 프로토콜 (공식 문서 기반)

OpenClaw Gateway는 `ws://IP:18789`에서 WebSocket으로 통신합니다.

### Transport
- WebSocket, text frames with JSON payloads
- 현재 프로토콜 버전: **3**

### Connection Lifecycle

```
Client                          Gateway
   |                               |
   |<-- event:connect.challenge ---|  (서버가 먼저 challenge 전송)
   |                               |
   |---- req:connect ------------->|  (클라이언트 인증 + 연결)
   |<------ res (hello-ok) --------|  (연결 성공 + snapshot)
   |                               |
   |<------ event:presence --------|  (presence 업데이트)
   |<------ event:tick ------------|  (keepalive)
   |                               |
   |------- req:agent ------------>|  (에이전트 호출)
   |<------ res:agent (ack) -------|  (접수 확인: {runId, status:"accepted"})
   |<------ event:agent -----------|  (스트리밍 응답)
   |<------ res:agent (final) -----|  (최종 결과: {runId, status, summary})
```

### Frame Types

```typescript
// Request (Client → Gateway)
interface Request {
  type: "req";
  id: string;           // 고유 요청 ID
  method: string;       // 메서드 이름
  params: object;       // 파라미터
}

// Response (Gateway → Client)
interface Response {
  type: "res";
  id: string;           // 요청 ID와 매칭
  ok: boolean;          // 성공 여부
  payload?: object;     // 성공 시 데이터
  error?: {             // 실패 시 에러
    code: string;
    message: string;
    details?: object;
    retryable?: boolean;
    retryAfterMs?: number;
  };
}

// Event (Gateway → Client, server-push)
interface Event {
  type: "event";
  event: string;        // 이벤트 타입
  payload: object;      // 이벤트 데이터
  seq?: number;         // 시퀀스 번호 (gap 감지용)
  stateVersion?: number;
}
```

### Handshake (connect)

**1. Challenge (Server → Client)**
```json
{
  "type": "event",
  "event": "connect.challenge",
  "payload": { "nonce": "...", "ts": 1737264000000 }
}
```

**2. Connect Request (Client → Server)**
```json
{
  "type": "req",
  "id": "...",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "openclaw-desktop",
      "version": "0.1.0",
      "platform": "macos",  // "macos" | "windows" | "linux"
      "mode": "operator"
    },
    "role": "operator",
    "scopes": ["operator.read", "operator.write"],
    "caps": [],
    "commands": [],
    "permissions": {},
    "auth": {
      "token": "..."  // OPENCLAW_GATEWAY_TOKEN if set
    },
    "locale": "ko-KR",
    "userAgent": "openclaw-desktop/0.1.0",
    "device": {
      "id": "device_fingerprint",
      "publicKey": "...",
      "signature": "...",    // sign the challenge nonce
      "signedAt": 1737264000000,
      "nonce": "..."
    }
  }
}
```

**3. Hello OK (Server → Client)**
```json
{
  "type": "res",
  "id": "...",
  "ok": true,
  "payload": {
    "type": "hello-ok",
    "protocol": 3,
    "policy": {
      "maxPayload": 10485760,
      "maxBufferedBytes": 52428800,
      "tickIntervalMs": 15000
    },
    "snapshot": {
      "presence": [...],
      "health": {...},
      "stateVersion": 42,
      "uptimeMs": 123456
    },
    "auth": {
      "deviceToken": "...",  // 저장해서 재사용
      "role": "operator",
      "scopes": ["operator.read", "operator.write"]
    }
  }
}
```

### Roles & Scopes

| Role | 용도 |
|------|------|
| `operator` | 컨트롤 플레인 클라이언트 (CLI/UI/자동화) |
| `node` | 기능 호스트 (camera/screen/canvas) |

**Operator Scopes:**
- `operator.read` - 상태 조회
- `operator.write` - 메시지 전송, 에이전트 호출
- `operator.admin` - 관리 작업
- `operator.approvals` - 실행 승인
- `operator.pairing` - 디바이스 페어링

### Methods (Operator)

| Method | 설명 |
|--------|------|
| `health` | 전체 헬스 스냅샷 |
| `status` | 간단 요약 |
| `system-presence` | 현재 presence 목록 |
| `send` | 활성 채널로 메시지 전송 |
| `agent` | 에이전트 턴 실행 (스트리밍) |
| `chat.history` | 채팅 히스토리 조회 |
| `chat.send` | 채팅 전송 |
| `chat.inject` | 어시스턴트 노트 삽입 |
| `node.list` | 페어링/연결된 노드 목록 |
| `node.invoke` | 노드 명령 실행 |
| `models.list` | 사용 가능한 모델 목록 조회 ⭐ |
| `models.status` | 현재 모델 + auth 상태 |
| `models.set` | Primary 모델 변경 |

### Events (Server → Client)

| Event | 설명 |
|-------|------|
| `connect.challenge` | 연결 시 challenge nonce |
| `agent` | 에이전트 스트리밍 출력 (seq 태그) |
| `presence` | presence 업데이트 (delta) |
| `tick` | keepalive |
| `shutdown` | Gateway 종료 (reason, restartExpectedMs) |
| `chat` | 채팅 메시지 |

### Error Codes

| Code | 설명 |
|------|------|
| `NOT_LINKED` | WhatsApp 미인증 |
| `AGENT_TIMEOUT` | 에이전트 응답 시간 초과 |
| `INVALID_REQUEST` | 스키마/파라미터 검증 실패 |
| `UNAVAILABLE` | Gateway 종료 중 또는 의존성 불가 |

### Authentication

1. **Token Auth**: `OPENCLAW_GATEWAY_TOKEN` 환경변수 또는 `--token` 플래그 설정 시, `connect.params.auth.token`이 일치해야 함
2. **Device Token**: 첫 연결 후 `hello-ok.auth.deviceToken`을 받아 저장, 이후 연결에 재사용
3. **Local Auto-Approve**: 로컬 연결 (loopback)은 자동 승인 가능
4. **Remote**: 비로컬 연결은 challenge nonce 서명 필요

### Remote Access

원격 Gateway 연결 방법:

**1. SSH Tunnel (권장)**
```bash
ssh -N -L 18789:127.0.0.1:18789 user@remote-host
# 로컬에서 ws://127.0.0.1:18789로 연결
```

**2. Tailscale**
- `gateway.tailscale.mode: "serve"` (tailnet only)
- `gateway.tailscale.mode: "funnel"` (public, 비밀번호 필수)

**3. Direct (VPN 내)**
- `gateway.bind: "0.0.0.0"` + 인증 토큰 필수

### WebChat Methods (채팅 UI)

WebChat이 사용하는 메서드들 (우리 앱도 동일하게 사용):

| Method | 설명 |
|--------|------|
| `chat.history` | 채팅 히스토리 가져오기 |
| `chat.send` | 메시지 전송 (에이전트 실행) |
| `chat.inject` | 어시스턴트 노트 직접 삽입 (에이전트 실행 없이) |

### 참고 문서

- [Gateway Protocol](https://docs.openclaw.ai/gateway/protocol)
- [Gateway Architecture](https://docs.openclaw.ai/concepts/architecture)
- [Remote Access](https://docs.openclaw.ai/gateway/remote)
- [Session Management](https://docs.openclaw.ai/concepts/session)
- [WebChat](https://docs.openclaw.ai/web/webchat)

---

## OpenClaw 기존 UI 분석 및 개선점

### 기존 UI 현황

OpenClaw는 세 가지 UI를 제공:

| UI | 설명 | 한계 |
|----|------|------|
| **Control UI (Web)** | 브라우저 기반 대시보드 | 기능 초점, UI/UX 단순 |
| **TUI** | 터미널 UI | 키보드 단축키 필수 `/model` 명령어 |
| **macOS App** | 네이티브 앱 | macOS only, 단일 Gateway |

### Control UI 기능 목록 (현재)

1. **Chat**
   - `chat.history`, `chat.send`, `chat.abort`, `chat.inject`
   - 스트리밍 툴 콜 + 라이브 툴 출력 카드

2. **Channels**
   - WhatsApp/Telegram/Discord/Slack 상태
   - QR 로그인 + 채널별 설정

3. **Instances (Presence)**
   - 연결된 클라이언트 목록

4. **Sessions**
   - 세션 목록 + thinking/verbose 오버라이드

5. **Cron Jobs**
   - 작업 list/add/run/enable/disable

6. **Skills**
   - 스킬 상태, enable/disable, install

7. **Nodes**
   - 노드 목록 + 기능 (caps)

8. **Exec Approvals**
   - allowlist 편집 + 승인 정책

9. **Config**
   - `~/.openclaw/openclaw.json` 편집
   - 스키마 기반 폼 + JSON 에디터

10. **Debug**
    - status/health/models 스냅샷
    - 이벤트 로그 + 수동 RPC 호출

11. **Logs**
    - 라이브 테일 + 필터/내보내기

12. **Update**
    - 패키지 업데이트 + 재시작

### TUI 기능 목록 (현재)

**Slash Commands:**
- `/model`, `/agent`, `/session` - 선택기
- `/think`, `/verbose`, `/reasoning` - 설정
- `/new`, `/reset` - 세션 관리
- `/status`, `/help`, `/context` - 정보
- `/stop`, `/abort` - 중단
- `!<command>` - 로컬 셸 실행

**Keyboard Shortcuts:**
- `Ctrl+L`: 모델 피커
- `Ctrl+G`: 에이전트 피커
- `Ctrl+P`: 세션 피커
- `Ctrl+O`: 툴 출력 확장/축소
- `Ctrl+T`: thinking 표시 토글

### 개선 포인트 (우리 앱에 반영)

#### ⭐ 핵심 개선 (Phase 2)

| 기존 문제 | openClaw Desktop 해결책 |
|-----------|------------------------|
| 모델 변경: `/model` 명령어 필수 | **Model Selector UI** - 드롭다운 즉시 변경 |
| 단일 Gateway | **멀티 Gateway 탭** |
| 파일 업로드 불가 (WebChat) | **드래그앤드롭 + 클립보드** |
| UI/UX 단순 | **CleanMyMac 스타일** 프리미엄 디자인 |

#### 📂 Sessions Panel (세션 관리)
- 세션 목록 사이드바
- 세션별 thinking/verbose 토글
- 세션 이름 변경
- 세션 삭제/아카이브

#### 🤖 Agent Picker (에이전트 선택)
- 에이전트 목록 드롭다운
- 현재 에이전트 표시
- 에이전트 설명 툴팁

#### ⚙️ Settings Panel (설정)
- Thinking level: `off|minimal|low|medium|high|xhigh`
- Verbose: `on|full|off`
- Reasoning: `on|off|stream`
- Elevated: `on|off|ask|full`
- Token usage: `off|tokens|full|cost`

#### 📊 Status Bar (상태 바)
- 연결 상태 (connected/disconnected/reconnecting)
- 현재 에이전트 + 세션
- 현재 모델
- 토큰 카운트 (input/output/total)
- Deliver 상태

#### 🔧 Tool Output Cards (툴 출력)
- 툴 호출 카드 (args + results)
- 확장/축소 토글
- 실시간 스트리밍 업데이트
- 코드 블록 구문 강조

#### 📝 Slash Command Autocomplete
- `/` 입력 시 명령어 목록 표시
- 키보드 네비게이션
- 파라미터 힌트

#### 🔔 Exec Approvals UI
- 승인 요청 모달
- allow-once / allow-always / deny 버튼
- allowlist 자동 추가

### 추가 기능 (후순위)

| 기능 | 설명 | Phase |
|------|------|-------|
| Channels Panel | 채널 상태 + QR 로그인 | 5 |
| Skills Manager | 스킬 목록 + enable/disable | 5 |
| Nodes Panel | 노드 목록 + 기능 | 5 |
| Cron Jobs | 작업 스케줄러 | 5 |
| Config Editor | JSON 설정 편집기 | 5 |
| Logs Viewer | 라이브 로그 테일 | 5 |

---

## 경쟁 우위

| 기능 | WebChat | 공식 macOS 앱 | openClaw Desktop (이 앱) |
|------|---------|---------------|-------------------------|
| 멀티 Gateway | ❌ | ❌ | ✅ 탭으로 관리 |
| 드래그앤드롭 파일 | ❌ | ? | ✅ |
| 문서 협업 (Forge) | ❌ | ❌ | ✅ Excel/PPT/Word |
| **모델 선택 UI** | ❌ `/model` 명령어만 | ❌ | ✅ 셀렉트 박스 |
| 크로스플랫폼 | 브라우저 | macOS only | ✅ macOS/Windows/Linux |
| 오프라인 캐시 | ❌ | ? | 예정 |

---

## 다음 작업 (우선순위)

1. **탭 재정렬 (드래그앤드롭)** - Gateway 탭 순서 변경 (현재 DnD는 메시지 포워딩용)
2. **Markdown 편집기** - Forge에 Markdown 편집 지원 추가
3. **API Key 암호화** - SQLite에 저장된 키를 keyring/encryption으로 보호
4. **Store 리팩토링** - NPC/Forge 로직을 별도 서비스로 분리
5. **PowerPoint 실제 렌더링** - 현재 플레이스홀더 → JSZip 기반 슬라이드 파싱

---

## 개발 명령어

```bash
# 개발 서버 (Vite + Tauri)
bun run tauri dev

# 빌드
bun run tauri build

# 타입 체크
bun run check
```

---

## 참고 링크

- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [OpenClaw Docs](https://docs.openclaw.ai)
- [Gateway 문서](https://docs.openclaw.ai/gateway)
- [WebSocket 아키텍처](https://docs.openclaw.ai/concepts/architecture)
- [Tauri 2 Docs](https://v2.tauri.app)

---

## 작업 로그 (2026-02-11)

### 이번에 완료한 주요 구현

1. Forge 문서 협업 UX/에디터 확장
- Chat 패널 폭 확장 및 리사이즈(패널 드래그) 지원
- 문서 열기 타임아웃 처리(Opening 무한 대기 방지)
- Markdown 간단 WYSIWYG 에디터 추가
- JSON 포맷/검증 에디터 추가
- Plain text 에디터 추가
- PDF.js 기반 PDF 뷰어 추가
- OCR 추출 커맨드(`doc_pdf_ocr_extract`) 및 PDF bytes 커맨드(`doc_get_pdf_bytes`) 추가

2. DOC/DOCX 파이프라인 개선
- DOCX 스타일 파싱 강화(`styles.xml` 기반)
- 문단 정렬/글자 크기/기본 폰트 크기 반영 개선
- `.doc` 열기 경로 보완(`textutil` 변환 경유)
- WordEditor 확장:
  - 정렬(left/center/right/justify)
  - 폰트 크기
  - Heading/BlockQuote/Strike/Code/Underline
  - Superscript/Subscript
  - 글자색(Color) / 하이라이트(Highlight)

3. Excel 협업 편집 개선
- 시트 탭 UX 개선(하단 탭)
- 컨텍스트 메뉴 기반 행/열 삽입/삭제 흐름 보완
- 인라인 셀 편집/스타일 메타 반영 개선

4. HWP/HWPX 1차 지원 추가
- Forge 파일 선택/업로드 확장자에 `.hwp/.hwpx` 추가
- Rust `HwpAdapter` 신규 추가 (`src-tauri/src/document/formats/hwp.rs`)
- 로딩 후보 경로 다중화:
  - `hwp5txt`
  - `textutil -> docx -> DocxAdapter`
  - `textutil -> html`
  - native HWP BodyText 파서
- 후보 결과 스코어링 로직 도입(테이블 구조/가시 텍스트/노이즈 기준)
- `CTRL_HEADER(tbl)` + `LIST_HEADER` 기반 셀 위치 복원 로직 추가

### 이번 작업에서 확인된 문제점 / 리스크

1. HWP 원본 충실도
- 일부 문서는 표 골격만 살아 있고 텍스트가 누락되거나, 반대로 텍스트만 세로로 나오는 케이스가 있음
- 원인: HWP 내부 제어문자/컨트롤(특히 `LIST_HEADER`/`TABLE`/캡션/폼 필드) 케이스 다양성
- 대응 상태: 후보 선택 로직 + 테이블 셀 복원 로직 보강 완료, 하지만 문서별 편차 여전히 존재

2. 외부 파서 의존성 제약
- 현재 환경에서 `hwpjs`(또는 동급 파서) 패키지 직접 설치/연동 제약이 있었음
- 네트워크/레지스트리 접근 조건에 따라 고급 파서 교체 작업이 지연될 수 있음

3. 저장 포맷 한계
- `.hwp/.hwpx` 네이티브 저장은 아직 미지원
- 현재는 읽기/편집 중심이며, 저장은 `.docx` 등으로 변환 저장 전략이 필요

4. 운영 상 주의점
- Rust 백엔드 변경 후에는 앱(tauri dev) 완전 재시작이 필요
- 미재시작 상태에서 테스트하면 “수정했는데 동일” 현상이 반복될 수 있음

### 다음 액션 권장

1. 문서 샘플 고정 기반 디버그 덤프
- 문제 HWP 2~3개를 기준으로 파서 중간 산출(JSON) 저장 후 케이스별 규칙 보강

2. HWP 렌더링 계층 분리
- 현재 후보 선택 + 파싱 혼합 로직을 `parse -> normalize -> render` 3단계로 분리해 유지보수성 개선

3. 저장 UX 보강
- `.hwp/.hwpx` 편집 시 `Save As .docx`를 명시적으로 제공

---

## 작업 로그 (2026-02-12 ~ 2026-02-13)

### PDF AI Editor 구현 (Phase 4.5)

pdf-AI.md 스펙에 따른 오버레이 기반 PDF AI 에디터 전면 구현. PDF 원본은 건드리지 않고 Op 모델로 편집하는 아키텍처.

#### 완료된 작업

**1. Rust 백엔드 — bbox OCR + Layout Engine**

- `src-tauri/src/document/types.rs` — PDF 레이아웃 타입 추가 (`BBox`, `PdfWord`, `PdfLine`, `PdfBlock`, `PdfLayoutResult`)
- `src-tauri/src/document/formats/pdf_layout.rs` — **신규 파일** (Layout Engine)
  - `parse_tsv_words()` — Tesseract TSV 파싱
  - `group_words_into_lines()` — y좌표 클러스터링 (overlap > 0.5)
  - `group_lines_into_blocks()` — 간격 기반 문단 그룹핑
  - `detect_block_kind()` — title/header/footer/paragraph 분류
  - `build_layout()` — 통합 파이프라인
- `src-tauri/src/document/commands.rs` — `doc_pdf_ocr_layout` 커맨드
  - **이미지 기반 OCR**: 프론트에서 300 DPI PNG → base64 → Rust에서 디코딩 → 임시 PNG 저장 → Tesseract 실행
  - Tesseract는 macOS에서 PDF 직접 읽기 불가 → 이미지 파이프라인 필수

**2. Rust 백엔드 — PDF Export (lopdf)**

- `src-tauri/Cargo.toml` — `lopdf = "0.34"` 의존성 추가
- `src-tauri/src/document/formats/pdf_export.rs` — **신규 파일** (~415줄)
  - `ExportOp` enum (delete, replaceText, insertText, highlight, move, comment)
  - `ExportBlock` struct (id, page, bbox)
  - 좌표 변환 (top-left → bottom-left PDF 좌표계)
  - 화이트 rect + 새 텍스트 렌더링
  - 하이라이트 반투명 rect 렌더링
  - 폰트 리소스 관리 (Helvetica 임베드)
  - content stream 조작 via lopdf
- `src-tauri/src/document/commands.rs` — `doc_pdf_export_overlay` 커맨드
  - `output_path: String` 받아서 Rust에서 직접 파일 저장 (IPC 오버헤드 방지)

**3. 프론트엔드 — 타입 + 스토어**

- `src/lib/types/pdfEditor.ts` — **신규 파일**
  - `BBox`, `PdfWord`, `PdfLine`, `PdfBlock`, `Op`, `PdfDocState`, `PdfLayoutResultRaw` 타입 정의
  - `PdfDocState.pageHeights: number[]` 필드 추가
- `src/lib/stores/pdfEditor.svelte.ts` — **신규 파일** (Svelte 5 runes)
  - `docState`, `selectedBlockId`, `activeOp`, `isAnalyzing` 상태
  - `analyzePages(sessionId, pageHeights, pageImages, lang?, tessdataDir?)` — OCR 호출 → docState 구성
  - `initEmpty(pages, heights?)` — OCR 없이 어노테이션 전용 모드 초기화
  - `pushOp()` / `undoOp()` / `redoOp()` — 로컬 Op 히스토리
  - `getModifiedBlock()` — Ops 적용된 블록 상태 계산
  - `getInsertedTexts()` / `getHighlights()` / `getComments()` — 페이지별 Op 필터
  - `exportState()` — 내보내기용 전체 상태 반환

**4. 프론트엔드 — PdfViewer 리팩토링 (레이어 시스템)**

- `src/lib/components/Forge/PdfViewer.svelte` — 기존 캔버스 뷰어 → 풀 에디터로 확장 (~1100줄)
  - **레이어 구조**: canvas bg-layer + text-select-layer + edit-layer + annot-layer
  - **편집 도구**: Select blocks, Highlight, Comment, Insert Text
  - **블록 편집**: 클릭 선택 (파란 테두리), 더블클릭 인라인 편집, Delete키 삭제
  - **AI Rewrite**: 블록 툴바에서 "AI Rewrite" 클릭 → `onAiRewrite` 콜백 → forge에서 AI 메시지 전송 → 응답 자동 적용
  - **하이라이트 도구**: 드래그로 영역 선택, 실시간 미리보기 사각형
  - **코멘트 도구**: 클릭 위치에 핀 + 텍스트 입력
  - **텍스트 삽입**: 클릭 위치에 새 텍스트 입력
  - **OCR 분석**: 300 DPI 렌더링 → base64 PNG → Rust OCR → 블록 시각화
  - **에러 핸들링**: `analyzeError` 상태 + 인라인 빨간 에러 배너
  - `setModeWithInit()` — OCR 없이도 도구 사용 가능 (`initEmpty` 호출)
  - `tessScale()` — OCR 데이터 없으면 1 반환 (어노테이션 전용 모드)
  - Undo/Redo 버튼 연동

**5. Forge 라우트 연동**

- `src/routes/forge/+page.svelte` — PDF AI 편집 모드 통합
  - `pdfEditorStore` import + 블록 선택 핸들러
  - `handlePdfAiRewrite(blockId, text)` — gateway로 rewrite 메시지 전송
  - `$effect` — 스트리밍 종료 감지 → 마지막 AI 응답을 `replaceText` Op으로 자동 적용
  - `handlePdfExport()` — save dialog → `doc_pdf_export_overlay` 호출 → 파일 저장
  - Export PDF 버튼 (OCR layout 완료 시 표시)
  - `onBlockSelect` + `onAiRewrite` props를 PdfViewer에 전달

**6. 기타 수정**

- `src/lib/stores/fonts.svelte.ts` — Svelte 5 모듈에서 `$derived` export 불가 버그 수정 → getter 함수로 변경
- `src/lib/components/Forge/WordEditor.svelte` — `systemFonts` → `getSystemFonts()` 업데이트
- `src/lib/components/Document/ExcelGrid.svelte` — 동일 업데이트
- 랜딩 페이지 채팅 패널 제거 (문서 열었을 때만 표시)
- "새 문서" 드롭다운 메뉴 추가 (txt, md, docx, xlsx → 임시 파일 생성 → 편집기 열기)
- `src-tauri/src/lib.rs` — `create_temp_document` 커맨드 추가, invoke_handler 등록

#### 파일 변경 요약

| 파일 | 작업 |
|------|------|
| `src-tauri/src/document/types.rs` | PDF 레이아웃 타입 추가 |
| `src-tauri/src/document/commands.rs` | `doc_pdf_ocr_layout`, `doc_pdf_export_overlay` 커맨드 |
| `src-tauri/src/document/formats/pdf_layout.rs` | **신규** — Layout Engine |
| `src-tauri/src/document/formats/pdf_export.rs` | **신규** — PDF Export (lopdf) |
| `src-tauri/src/document/formats/mod.rs` | `pub mod pdf_layout;`, `pub mod pdf_export;` |
| `src-tauri/src/lib.rs` | `create_temp_document`, 커맨드 등록 |
| `src-tauri/Cargo.toml` | `lopdf = "0.34"` |
| `src/lib/types/pdfEditor.ts` | **신규** — TS 타입 정의 |
| `src/lib/stores/pdfEditor.svelte.ts` | **신규** — PDF 에디터 스토어 |
| `src/lib/stores/fonts.svelte.ts` | `$derived` export 버그 수정 |
| `src/lib/components/Forge/PdfViewer.svelte` | 레이어 시스템 + 편집 도구 |
| `src/lib/components/Forge/WordEditor.svelte` | fonts import 변경 |
| `src/lib/components/Document/ExcelGrid.svelte` | fonts import 변경 |
| `src/routes/forge/+page.svelte` | AI Rewrite + Export + 새문서 + 랜딩 정리 |

#### 빌드 상태

- `cargo check`: 0 errors ✅
- `svelte-check`: 0 errors ✅
- `vite build`: success ✅

#### 알려진 제한/이슈

1. **Tesseract 필수**: OCR 분석은 `tesseract` CLI가 설치되어 있어야 함 (`brew install tesseract`)
2. **한국어 OCR**: `kor.traineddata` 별도 설치 필요 (`brew install tesseract-lang`)
3. **폰트 제한**: PDF Export는 Helvetica만 임베드 (한국어 폰트 미지원 → 추후 개선 필요)
4. **좌표 정밀도**: OCR bbox와 실제 PDF 좌표 간 미세 오차 가능 (DPI 변환)
