# openClaw Desktop - 채팅 UI 문제 분석 보고서

**작성일**: 2026-02-06  
**상태**: 🔴 진행 중

---

## 1. 현재 상황 요약

### ✅ 성공적으로 작동하는 기능
- **게이트웨이 연결**: WebSocket 연결 및 인증 (Ed25519 서명) 정상 작동
- **메시지 전송**: `chat.send` API로 메시지가 서버에 정상 전송됨
- **AI 응답 수신**: 서버로부터 AI 응답 수신 확인됨 (콘솔 로그)
- **Store 업데이트**: `chatMessages` store에 메시지 누적됨 (74개까지 확인)

### ❌ 실패하고 있는 기능
- **채팅 UI 렌더링**: 메시지가 화면에 표시되지 않음
- **입력창 초기화**: 메시지 전송 후 입력창이 비워지지 않음

---

## 2. 핵심 문제: UI가 Store 변경을 감지하지 못함

### 증거
```
콘솔 로그:
[Store] User message added, count: 73
[Store] Chat event: final 37809e27-8aed-4821-99b4-6643e4931e9b
[Store] Final text extracted: I am **하인 (Hain)**, 군주님. ⚜️...
[Store] chatMessages updated, count: 74, messages: ["user", "assistant", ...]
```

Store는 정상 업데이트되고 있으나, UI는 여전히 "대화를 시작하세요" 화면 표시.

### 의심되는 원인

#### 2.1 조건부 렌더링 문제
`+page.svelte` (33번째 줄):
```svelte
{#if $activeGatewayState?.status === "connected"}
  <ChatPanel />
```

`$activeGatewayState?.status`가 `"connected"`가 아닐 수 있음.  
→ **확인 필요**: 연결 상태 store 값 검증

#### 2.2 ChatPanel 컴포넌트 마운트 여부
ChatPanel이 조건부로 마운트되며, 상태 변경 시 리마운트될 수 있음.  
→ 리마운트 시 `$chatMessages`가 초기화될 가능성

#### 2.3 Svelte 반응성 문제
`chatMessages` store가 Svelte의 반응성 시스템과 올바르게 연결되지 않았을 가능성:
- `writable()` store가 올바르게 선언되었는지
- 컴포넌트에서 `$` prefix로 구독하고 있는지

---

## 3. 추가 문제: chat.abort 오류

### 오류 메시지
```
INVALID_REQUEST: sessionKey 누락
```

### 원인
`abortMessage()` 함수에서 `sessionKey` 파라미터를 전달하지 않음.

### 수정 위치
`src/lib/gateway/store.ts` - `abortMessage()` 함수

---

## 4. 다음 디버깅 단계

### 4.1 즉시 확인해야 할 사항
1. [ ] `$activeGatewayState?.status` 값이 실제로 `"connected"`인지 콘솔 출력
2. [ ] ChatPanel 컴포넌트가 실제로 DOM에 마운트되었는지 확인
3. [ ] `$chatMessages` 구독이 렌더링을 트리거하는지 확인

### 4.2 수정 방안
1. **조건부 렌더링 디버깅**: `+page.svelte`에 상태 로깅 추가
2. **ChatPanel 마운트 확인**: `onMount` 훅에 로그 추가
3. **Store 반응성 테스트**: 컴포넌트에서 직접 `$chatMessages.length` 출력

---

## 5. 관련 파일

| 파일 | 역할 | 상태 |
|------|------|------|
| `src/lib/gateway/store.ts` | Gateway store 및 채팅 로직 | ⚠️ 수정됨 |
| `src/lib/gateway/client.ts` | WebSocket 클라이언트 | ⚠️ 수정됨 |
| `src/lib/gateway/types.ts` | 타입 정의 | ⚠️ 수정됨 |
| `src/routes/chat/+page.svelte` | 채팅 페이지 레이아웃 | 🔍 검토 필요 |
| `src/lib/components/Chat/ChatPanel.svelte` | 채팅 UI 컴포넌트 | 🔍 검토 필요 |

---

## 6. 테스트 환경

- **앱**: Tauri 2 + Svelte 5
- **게이트웨이**: openClaw-Token (토큰 인증)
- **개발 서버**: `npm run tauri dev` (localhost:1420)
