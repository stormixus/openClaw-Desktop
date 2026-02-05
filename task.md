# openClaw Desktop 작업 요약

## 목표
openClaw를 macOS/Windows/Linux에서 동작하는 데스크톱 앱으로 만들기 위한 초기 스캐폴드와 기본 UI/설정을 구축.

## 진행 내용
- Tauri + Svelte + TypeScript 프로젝트 스캐폴드 생성 (bun 기반).
- 앱 이름/식별자 반영.
- 모듈 없는 i18n 구현 및 언어 설정 UI.
- 테마 설정(시스템/라이트/다크) 및 전역 테마 변수 적용.
- 설정 페이지 UI 정리(CleanMyMac 톤) + 아이콘/모션 추가.
- 설정 항목 확장(자동 업데이트/시작 시 실행/트레이 최소화 토글) 및 로컬 저장.
- 홈 화면 리디자인(히어로/상태 카드/퀵 섹션).
- 임시 앱 아이콘 SVG 생성 후 Tauri 아이콘 세트 생성.
- Updater 기본 설정(엔드포인트 placeholder) 추가.

## 주요 파일
- /Volumes/MacExt/Projects/openClaw Desktop/src/lib/i18n.ts
- /Volumes/MacExt/Projects/openClaw Desktop/src/lib/theme.ts
- /Volumes/MacExt/Projects/openClaw Desktop/src/lib/settings.ts
- /Volumes/MacExt/Projects/openClaw Desktop/src/routes/+layout.svelte
- /Volumes/MacExt/Projects/openClaw Desktop/src/routes/+page.svelte
- /Volumes/MacExt/Projects/openClaw Desktop/src/routes/settings/+page.svelte
- /Volumes/MacExt/Projects/openClaw Desktop/src-tauri/tauri.conf.json
- /Volumes/MacExt/Projects/openClaw Desktop/src-tauri/icons/

## 남은 작업
- 설정 토글 실제 기능 연결(업데이트/자동 실행/트레이 동작).
- Updater 배포 플로우 구성 및 latest.json 실제 경로 연결.
- 홈 화면 카피/데이터 실제 제품 상태에 맞게 교체.
