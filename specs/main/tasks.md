# Tasks: Artifact Data Dashboard v1.0.0

**Spec**: [specs/main/spec.md](specs/main/spec.md) | **Plan**: [specs/main/plan.md](specs/main/plan.md)
**Status**: 进行中（In Progress）

## Phase 1: Setup (Project Initialization)
**Goal**: 确保开发环境与容器编排准备就绪。

- [ ] T001 Verify `docker-compose.yml` includes all services (frontend, backend, mysql, neo4j, redis) with correct ports and volumes.
- [ ] T002 Verify `backend/.env.example` contains all necessary keys (DB credentials, JWT secret, LLM keys).
- [ ] T003 [P] Ensure `backend/Dockerfile` and `frontend/Dockerfile` are optimized for development (hot reload).

## Phase 2: Foundational (Blocking Prerequisites)
**Goal**: 建立数据库 schema 与核心鉴权逻辑。

- [ ] T004 Update `backend/scripts/init-mysql.sql` to match v1 schema (add `email`, `organization`, `title`, `bio` to users; `category`, `era`, `tags` to artifacts).
- [ ] T005 Update `backend/scripts/init-neo4j.js` to define all v1 node types and relationships (Artifact, Category, Era, etc.).
- [ ] T006 Implement `backend/src/middleware/auth.middleware.js` to support Role-Based Access Control (Admin vs User).
- [ ] T007 [P] Configure Redis connection in `backend/src/config/database.js` (or equivalent) with error handling.

## Phase 3: User Story 1 - Authentication
**Goal**: 完成安全的注册/登录，并支持角色（role）管理。

- [ ] T008 [US1] Update `backend/src/routes/auth.routes.js` to support registration with extended user fields.
- [ ] T009 [US1] Update `frontend/src/services/auth.service.js` to handle new registration payload.
- [ ] T010 [US1] Update `frontend/src/pages/Register.js` UI to include new fields (Organization, Title, Bio).
- [ ] T011 [US1] Update `frontend/src/pages/Login.js` to store user role in local storage/context upon login.

## Phase 4: User Story 6 - Data Ingestion
**Goal**: 建立可靠的数据获取与导入流水线。

- [ ] T012 [US6] Enhance `build_kg/crawler/main.py` to add execution logging and error handling.
- [ ] T013 [US6] Implement/Update `build_kg/convert_artifact_to_excel.py` to ensure output matches `debug.routes.js` schema strictness.
- [ ] T014 [US6] Update `backend/src/routes/debug.routes.js` (or `import.routes.js`) to enforce strict Excel schema validation during import.

## Phase 5: User Story 2 - Artifact Management
**Goal**: Admin 可控的 artifact 管理与公开浏览。

- [ ] T015 [US2] Update `backend/src/routes/artifact.routes.js` to restrict POST/PUT/DELETE to Admin role.
- [ ] T016 [US2] Update `frontend/src/services/artifact.service.js` to handle 403 Forbidden responses gracefully.
- [ ] T017 [US2] Update `frontend/src/pages/Dashboard.js` (Artifact List) to hide "Edit/Delete" buttons for non-admin users.
- [ ] T018 [US2] Implement "Read-Only" view mode in `frontend/src/components/ArtifactForm.js` (or equivalent).

## Phase 6: User Story 3 - Knowledge Graph
**Goal**: 高性能的图谱可视化。

- [ ] T019 [US3] Update `backend/src/routes/graph.routes.js` `GET /` to limit response to Top 100 nodes by default.
- [ ] T020 [US3] Implement `POST /api/graph/query` in `backend/src/routes/graph.routes.js` for search-based graph expansion.
- [ ] T021 [US3] Optimize `frontend/src/pages/KnowledgeGraph.js` to handle initial load limit and "Load More" functionality.

## Phase 7: User Story 4 - Chat/QA
**Goal**: 支持 AI Chat，并实现隐私友好的历史存储策略。

- [ ] T022 [US4] Update `backend/src/routes/chat.routes.js` to save session metadata (ID, timestamp) to MySQL `logs` table.
- [ ] T023 [US4] Update `backend/src/routes/chat.routes.js` to save full message history to Redis with 7-day TTL.
- [ ] T024 [US4] Verify `frontend/src/pages/Chat.js` retrieves history correctly from the new backend logic.

## Phase 8: User Story 5 - Wordcloud
**Goal**: 可视化文本分析。

- [ ] T025 [US5] Verify `backend/src/routes/wordcloud.routes.js` correctly processes text and returns frequency data.
- [ ] T026 [US5] Ensure `frontend/src/pages/Wordcloud.js` renders ECharts wordcloud correctly with v1 data format.

## Phase 9: Polish & Cross-Cutting
**Goal**: 测试与最终文档完善。

- [ ] T027 Setup Cypress for E2E testing in `frontend/cypress/`.
- [ ] T028 Write E2E test for "User Login -> View Artifacts" flow.
- [ ] T029 Write E2E test for "Admin Login -> Create Artifact" flow.
- [ ] T030 Update `README.md` with v1 features and deployment instructions.

## Dependencies
- US1（Auth）阻塞 US2、US3、US4、US5。
- US6（Ingestion）阻塞 US2（Content）。
- Phase 2（Foundational）阻塞所有 User Stories。

## Implementation Strategy
1.  **MVP**: 完成 Phase 1、2、3、5（Setup、Foundation、Auth、Artifacts）。
2.  **Data**: 完成 Phase 4（Ingestion）以填充系统数据。
3.  **Advanced**: 完成 Phase 6、7、8（Graph、Chat、Wordcloud）。
