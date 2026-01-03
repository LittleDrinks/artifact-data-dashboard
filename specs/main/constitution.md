<!--
Sync Impact Report
- Version change: none -> 1.0.0
- Modified principles: (new constitution created)
- Added sections: Constitution, Principles, Governance, Compliance
- Removed sections: none
- Templates requiring updates: ⚠ pending
  - .specify/templates/plan-template.md (⚠ pending)
  - .specify/templates/spec-template.md (⚠ pending)
  - .specify/templates/tasks-template.md (⚠ pending)
  - .specify/templates/commands/*.md (⚠ pending)
- Follow-up TODOs:
  - TODO(RATIFICATION_DATE): confirm official ratification date if different from creation date
  - TODO: run automated checks to align templates under .specify/templates/ with constitution
-->

# Project Constitution

- **Project Name**: artifact-data-dashboard
- **Constitution Version**: 1.0.0
- **Ratification Date**: 2025-12-31
- **Last Amended Date**: 2025-12-31

## Preamble
本宪章用于确立 artifact-data-dashboard 项目的治理原则、变更流程与合规要求。宪章为项目参与者提供明确且可执行的准则，确保数据质量、可追溯性、安全与工程可复现性。

## Principles

1. Principle: Data Traceability and Reproducibility
   - Rule: 项目中的所有数据输入、处理与模型推断必须可追溯与重现。每个数据源在导入时须记录来源、时间戳、采集脚本或采集者标识、版本/哈希（如适用）。ETL 或训练管道应能以相同参数重建结果。
   - Rationale: 可追溯性保证科研与工程结论的可验证性，便于审计与错误溯源。

2. Principle: Data Quality and Standardization (PRIORITY)
   - Rule: 在接受任何数据进入系统前，必须通过定义的校验与清洗规则。项目必须维护并公开数据字典与 schema 映射，任何新增字段或数据源需记录映射与验证策略。
   - Rationale: 高质量与标准化的数据是可靠模型与可视化的基础，减少下游错误与不确定性。

3. Principle: Modular and Deployable (Docker-First)
   - Rule: 系统组件应模块化设计并能通过 Docker 容器部署。每个服务应包含可运行的 Dockerfile 或等效容器化描述与最小启动示例。开发优先考虑在容器化环境中可重复运行。
   - Rationale: 容器化确保一致的运行环境，降低“在我机器上能运行”的风险并简化 CI/CD。

4. Principle: Interface Contracts First
   - Rule: 所有跨模块接口（HTTP/消息/存储契约）需在规格文档中定义（方法、参数、示例、错误码、权限）。任何接口更改必须遵循变更流程并保留向后兼容或提供迁移说明。
   - Rationale: 明确定义的契约减少整合时摩擦，支持并行开发与自动化测试。

5. Principle: Secure Credential and Privacy Management
   - Rule: 凭证与敏感配置不得直接提交至代码仓库。使用 `.env` 模板并在文档中说明凭证注入与存取策略（Secrets 管理）。对包含个人或敏感信息的数据集，必须制定访问控制与脱敏策略并记录合规审查。
   - Rationale: 保护机密与用户隐私，降低泄露风险并满足合规要求。

6. Principle: Reproducible Automated Data Pipelines
   - Rule: 数据采集、清洗、特征构建与模型训练应以脚本化、版本化流程实现（如 CI/CD 或调度任务）。管道应产出可核验的工件（数据快照、模型版本、配置清单）。关键管道需包含回滚与验证步骤。
   - Rationale: 自动化与可复现的管道提升效率并确保结果可验证与可回滚。

## Governance

- Amendment Procedure: 对于本宪章的任何修改，提议方需提交 GitHub Issue 并在 Pull Request 中说明修订内容与兼容性影响；重大变更（新增/删除原则）需至少两个核心维护者批准。非紧急修订采用 MINOR 或 PATCH 语义版本升级；兼容性破坏性修改采用 MAJOR 版本升级。
- Versioning Policy: 使用语义化版本控制（MAJOR.MINOR.PATCH）。初始版本为 `1.0.0`。
- Compliance Review: 每个里程碑发布前应执行一次宪章合规自查，记录在发布笔记或里程碑报告中。

## Compliance and Validation

- Validation Criteria:
  - 数据可追溯性：示例数据导入记录与管道运行日志可查。
  - 接口契约：主干 API 列表与示例请求/响应在 `doc/speckit/specification.md` 中列明。
  - 部署能力：至少包含一个 Docker Compose 或容器化部署示例。

## Change Log

- 1.0.0 (2025-12-31): 初始版本，确立六条基本原则与治理流程。

## Notes and Deferred Items

- TODO(RATIFICATION_DATE): 若项目有更早的正式采纳日期，请更新 Ratification Date 字段并记录变更请求。
- TODO: 对 `.specify/templates/` 下的模板进行逐项对齐（plan-template.md, spec-template.md, tasks-template.md, commands/*.md）。
# [PROJECT_NAME] Constitution
<!-- Example: Spec Constitution, TaskFlow Constitution, etc. -->

## Core Principles

### [PRINCIPLE_1_NAME]
<!-- Example: I. Library-First -->
[PRINCIPLE_1_DESCRIPTION]
<!-- Example: Every feature starts as a standalone library; Libraries must be self-contained, independently testable, documented; Clear purpose required - no organizational-only libraries -->

### [PRINCIPLE_2_NAME]
<!-- Example: II. CLI Interface -->
[PRINCIPLE_2_DESCRIPTION]
<!-- Example: Every library exposes functionality via CLI; Text in/out protocol: stdin/args → stdout, errors → stderr; Support JSON + human-readable formats -->

### [PRINCIPLE_3_NAME]
<!-- Example: III. Test-First (NON-NEGOTIABLE) -->
[PRINCIPLE_3_DESCRIPTION]
<!-- Example: TDD mandatory: Tests written → User approved → Tests fail → Then implement; Red-Green-Refactor cycle strictly enforced -->

### [PRINCIPLE_4_NAME]
<!-- Example: IV. Integration Testing -->
[PRINCIPLE_4_DESCRIPTION]
<!-- Example: Focus areas requiring integration tests: New library contract tests, Contract changes, Inter-service communication, Shared schemas -->

### [PRINCIPLE_5_NAME]
<!-- Example: V. Observability, VI. Versioning & Breaking Changes, VII. Simplicity -->
[PRINCIPLE_5_DESCRIPTION]
<!-- Example: Text I/O ensures debuggability; Structured logging required; Or: MAJOR.MINOR.BUILD format; Or: Start simple, YAGNI principles -->

## [SECTION_2_NAME]
<!-- Example: Additional Constraints, Security Requirements, Performance Standards, etc. -->

[SECTION_2_CONTENT]
<!-- Example: Technology stack requirements, compliance standards, deployment policies, etc. -->

## [SECTION_3_NAME]
<!-- Example: Development Workflow, Review Process, Quality Gates, etc. -->

[SECTION_3_CONTENT]
<!-- Example: Code review requirements, testing gates, deployment approval process, etc. -->

## Governance
<!-- Example: Constitution supersedes all other practices; Amendments require documentation, approval, migration plan -->

[GOVERNANCE_RULES]
<!-- Example: All PRs/reviews must verify compliance; Complexity must be justified; Use [GUIDANCE_FILE] for runtime development guidance -->

**Version**: [CONSTITUTION_VERSION] | **Ratified**: [RATIFICATION_DATE] | **Last Amended**: [LAST_AMENDED_DATE]
<!-- Example: Version: 2.1.1 | Ratified: 2025-06-13 | Last Amended: 2025-07-16 -->
