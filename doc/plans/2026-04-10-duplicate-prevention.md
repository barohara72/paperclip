# Duplicate Prevention Implementation Plan

> For Hermes: implement with strict TDD.

Goal: parent issue 아래에 동일한 child issue가 이미 있을 때 새 issue를 만들지 않고 기존 issue를 재사용한다.

Architecture: `issueService`에 duplicate child 탐지 + create/reuse 진입점을 추가하고, `POST /companies/:companyId/issues` 라우트가 이를 사용하도록 바꾼다. 첫 단계는 exact-match에 가까운 보수적 규칙(같은 parent, 정규화된 title/description, 같은 assignee, 재사용 가능한 status)으로 시작한다.

Tech Stack: TypeScript, Express, Drizzle, Vitest, Supertest, embedded Postgres tests.

## Tasks
1. create route 계약 파악 및 route-level failing test 추가
2. issue service duplicate reuse failing test 추가
3. service에 duplicate detection + createOrReuse 구현
4. route를 createOrReuse로 연결하고 status/wakeup/logging 분기 적용
5. 관련 테스트 실행
6. typecheck / test / build 검증
