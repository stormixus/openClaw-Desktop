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

### Phase 2: Gateway 연결 🔄 (진행 중)
- [x] Gateway 연결 관리자 ✅
  - [x] WebSocket 클라이언트 (`ws://IP:18789`)
  - [x] 연결 상태 모니터링
  - [x] 인증 (token/password/tailscale)
  - [x] Ed25519 서명 인증 (device identity)
  - [x] 재연결 로직
- [x] 멀티 Gateway 탭 UI ✅
  - [x] 탭 추가/제거
  - [x] 연결 상태 표시 (🟢/🔴/🟡)
  - [x] Gateway 설정 저장 (로컬 스토리지)
  - [ ] 탭 재정렬 (드래그앤드롭)
- [x] 채팅 UI ✅
  - [x] 메시지 송수신 (`chat.send`, `chat.history`) - 프로토콜 완료
  - [x] 스트리밍 응답 수신 (agent/chat events) - Store 업데이트 완료
  - [x] ~~**🔴 버그: UI가 Store 변경을 감지하지 못함**~~ → Svelte 5 runes로 수정 완료
  - [x] ~~**🔴 버그: 입력창 전송 후 초기화 안됨**~~ → 수정 완료
  - [x] 메시지 히스토리
  - [x] 메시지 중단 (`chat.abort`) → sessionKey 파라미터 수정 완료
  - [x] 타이핑 인디케이터 (●●●)
  - [x] 어시스턴트 노트 삽입 (`chat.inject`)
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
- [x] **Agent Picker (에이전트 선택기)** ✅
  - [x] 에이전트 목록 드롭다운
  - [x] 현재 에이전트 표시
  - [x] 에이전트 설명 표시
- [x] **Session Manager (세션 관리자)** ✅
  - [x] 세션 목록 UI
  - [x] 세션 전환/새 세션 버튼
  - [x] 세션별 thinking/verbose 배지
  - [x] Gateway 연동 (실제 API 통합) ✅
- [ ] **Status Bar (상태 바)**
  - [ ] 연결 상태
  - [ ] 현재 agent + session + model
  - [ ] 토큰 카운트 (input/output/total)
- [x] **Tool Output Cards (툴 출력)** ✅
  - [x] 툴 호출 카드 (args + results)
  - [x] 확장/축소 토글
  - [x] 실시간 스트리밍
- [x] **Settings Panel (설정 패널)** ✅
  - [x] Thinking level 선택 (None/Low/Medium/High)
  - [x] Verbose 토글
  - [x] Reasoning 토글
  - [x] Deliver 토글
  - [ ] Gateway 연동 (실제 API 통합)
- [ ] **Slash Command Autocomplete**
  - [ ] `/` 입력 시 명령어 목록
  - [ ] 키보드 네비게이션

### Phase 3: 향상된 파일 처리
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
  - [ ] PDF 썸네일
  - [x] 문서 아이콘
- [ ] 다운로드 관리 (에이전트가 생성한 파일)

### Phase 4: Document Forge (문서 협업) ⭐
- [ ] 문서 편집기 통합
  - [ ] Excel 편집기 (SheetJS + Handsontable 또는 유사)
  - [ ] Word 편집기 (TipTap/ProseMirror)
  - [ ] PowerPoint 뷰어/편집기 (pptxgenjs)
  - [ ] Markdown 편집기
- [ ] Forge 세션
  - [ ] 문서 열기 → 에이전트와 공유
  - [ ] 에이전트 수정 요청
  - [ ] 변경 사항 실시간 반영
  - [ ] 변경 내역 하이라이트 (diff)
- [ ] 버전 관리
  - [ ] 스냅샷 저장
  - [ ] 변경 되돌리기
  - [ ] 변경 이력 표시

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
│   ├── settings.ts          # 로컬 설정 (완료)
│   ├── gateway/
│   │   ├── client.ts        # WebSocket 클라이언트
│   │   ├── types.ts         # Gateway 프로토콜 타입
│   │   └── store.ts         # 연결 상태 스토어
│   ├── forge/
│   │   ├── excel.ts         # Excel 편집기 래퍼
│   │   ├── word.ts          # Word 편집기 래퍼
│   │   └── session.ts       # Forge 세션 관리
│   └── components/
│       ├── Chat/
│       ├── Tabs/
│       ├── FileUpload/
│       └── Forge/
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
├── tauri.conf.json
├── src/
│   └── lib.rs               # Rust 백엔드 (파일 시스템, 클립보드 등)
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

1. **Gateway WebSocket 클라이언트 구현** - 핵심 연결 로직
2. **탭 UI 구현** - 멀티 Gateway 관리
3. **채팅 UI 구현** - 메시지 송수신
4. **파일 드래그앤드롭** - 웹챗 대비 차별점
5. **Forge 프로토타입** - Excel 편집기부터 시작

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
