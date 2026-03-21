# ETL 前端可视化开发任务拆分（WBS）

> 适用范围：ETL 后台管理前端实施（任务可视化、诊断、操作闭环、规则、调度、发布）
>
> 说明：本期不包含 CSV 前端入口（保留为后续迭代）
>
> 关联文档：
> - API 主文档：`docs/modules/etk/ETL_ADMIN_API.md`
> - 页面调用时序：`docs/modules/etk/ETL_FRONTEND_SEQUENCE.md`

---

## 1. 范围与目标

### 1.1 本期范围（In Scope）

1. 任务看板与列表（状态、质量、S2 指标）
2. 任务详情与采集诊断
3. 任务操作闭环（取消、恢复、重放、embedding 重放、死信重放）
4. 网页规则管理（CRUD）
5. 网页调度管理（CRUD + run + trigger-due）
6. 文章发布闭环（parsed -> published）

### 1.2 非本期范围（Out of Scope）

1. CSV 文件上传与导入页面
2. BI 级趋势分析大盘与导出中心

---

## 2. 里程碑（M0~M4）

- **M0 基础可跑**：路由、权限、API Client、公共组件
- **M1 可观测**：看板、列表、详情、诊断
- **M2 可操作**：任务控制动作 + 回流刷新
- **M3 可运营**：规则管理 + 调度管理
- **M4 可发布**：文章发布闭环 + 联调回归 + 灰度上线

---

## 3. 完整任务拆分表（可直接建任务）

> 工时单位：人天（PD）

| ID | 模块 | 子任务 | 对接接口 | 前置依赖 | 角色 | 估算 |
| --- | --- | --- | --- | --- | --- | --- |
| ETL-FE-001 | 工程基建 | ETL 路由/菜单/权限挂载 | - | 无 | FE | 0.5 |
| ETL-FE-002 | 工程基建 | 统一 API Client（错误拦截、超时、重试） | 全部 | 001 | FE | 1 |
| ETL-FE-003 | 工程基建 | ETL 领域类型定义（job/status/alert/S2） | 全部 | 002 | FE | 0.5 |
| ETL-FE-004 | 工程基建 | 通用状态组件（加载/空态/错误/无权限） | - | 001 | FE | 0.5 |
| ETL-FE-101 | 任务看板 | 概览卡片渲染 | `GET /metrics/summary` | 002 | FE | 0.5 |
| ETL-FE-102 | 任务列表 | 列表字段渲染（含 S2 指标） | `GET /jobs` | 003 | FE | 1 |
| ETL-FE-103 | 任务列表 | 筛选与分页 | `GET /jobs` | 102 | FE | 1 |
| ETL-FE-104 | 任务列表 | 自动轮询与前后台切换策略 | `GET /jobs` `GET /metrics/summary` | 101/102 | FE | 0.5 |
| ETL-FE-105 | 任务列表 | 操作按钮可用矩阵（禁用态/提示） | - | 102 | FE | 0.5 |
| ETL-FE-201 | 任务详情 | 基础状态卡 | `GET /jobs/{job_id}` | 002 | FE | 0.5 |
| ETL-FE-202 | 任务详情 | 诊断面板（reason/extractor/quality） | `GET /jobs/{job_id}/collect-diagnostics` | 201 | FE | 1 |
| ETL-FE-203 | 任务详情 | S2 质量可视化（count + ratio） | `GET /jobs/{job_id}` + diagnostics | 202 | FE | 0.5 |
| ETL-FE-204 | 任务详情 | 详情轮询（未完成轮询、完成停轮询） | `GET /jobs/{job_id}` | 201 | FE | 0.5 |
| ETL-FE-301 | 任务操作 | 取消任务 | `POST /jobs/{job_id}/cancel` | 105 | FE | 0.5 |
| ETL-FE-302 | 任务操作 | 恢复任务 | `POST /jobs/{job_id}/resume` | 105 | FE | 0.5 |
| ETL-FE-303 | 任务操作 | 重放任务 | `POST /jobs/{job_id}/replay` | 105 | FE | 0.5 |
| ETL-FE-304 | 任务操作 | 重放 embedding | `POST /jobs/{job_id}/replay-embedding` | 105 | FE | 0.5 |
| ETL-FE-305 | 任务操作 | 死信重放（批量） | `POST /jobs/replay-dead-letter` | 105 | FE | 0.5 |
| ETL-FE-306 | 任务操作 | 写操作统一回流刷新 | 写接口 + 列表/详情/诊断/看板 | 301~305 | FE | 0.5 |
| ETL-FE-401 | 规则管理 | 规则列表 | `GET /extract-rules/web` | 002 | FE | 0.5 |
| ETL-FE-402 | 规则管理 | 新建规则 | `POST /extract-rules/web` | 401 | FE | 0.5 |
| ETL-FE-403 | 规则管理 | 更新规则 | `POST /extract-rules/web/{rule_id}/update` | 401 | FE | 0.5 |
| ETL-FE-404 | 规则管理 | 删除规则 | `POST /extract-rules/web/{rule_id}/delete` | 401 | FE | 0.5 |
| ETL-FE-501 | 调度管理 | 调度列表 | `GET /schedules/web-collect` | 002 | FE | 0.5 |
| ETL-FE-502 | 调度管理 | 新建调度 | `POST /schedules/web-collect` | 501 | FE | 0.5 |
| ETL-FE-503 | 调度管理 | 更新调度 | `POST /schedules/web-collect/{schedule_id}/update` | 501 | FE | 0.5 |
| ETL-FE-504 | 调度管理 | 删除调度 | `POST /schedules/web-collect/{schedule_id}/delete` | 501 | FE | 0.5 |
| ETL-FE-505 | 调度管理 | 立即执行 | `POST /schedules/web-collect/{schedule_id}/run` | 501 | FE | 0.5 |
| ETL-FE-506 | 调度管理 | 触发到期任务 | `POST /schedules/web-collect/trigger-due` | 501 | FE | 0.5 |
| ETL-FE-601 | 发布闭环 | 发布按钮与状态约束 | `POST /articles/{article_id}/publish` | 002 | FE | 0.5 |
| ETL-FE-602 | 发布闭环 | 发布后回流刷新 | publish + read APIs | 601 | FE | 0.5 |
| ETL-FE-701 | 稳定性 | 统一错误提示（40901/40401/50010） | 全写接口 | 002 | FE | 0.5 |
| ETL-FE-702 | 稳定性 | 幂等防重（按钮防抖/请求中禁用） | 全写接口 | 701 | FE | 0.5 |
| ETL-FE-703 | 稳定性 | 埋点（页面、操作、异常） | - | 001 | FE | 0.5 |
| ETL-QA-801 | 测试 | 联调用例设计 | 全部 | FE 核心页 | QA | 1 |
| ETL-QA-802 | 测试 | 全链路功能回归 | 全部 | 801 | QA | 1.5 |
| ETL-QA-803 | 测试 | 异常回归（网络抖动/超时/500） | 全部 | 801 | QA | 1 |
| ETL-QA-804 | 测试 | 验收报告输出 | - | 802/803 | QA | 0.5 |
| ETL-REL-901 | 发布 | 灰度开关与权限投放 | - | QA 通过 | PM/FE | 0.5 |
| ETL-REL-902 | 发布 | 回滚预案 | - | 901 | PM/RD | 0.5 |
| ETL-REL-903 | 发布 | 上线观察与复盘 | - | 902 | PM/RD/FE | 0.5 |

---

## 4. 关键依赖关系（执行顺序）

1. `001~004` -> `101~105`
2. `101~105` -> `201~204`
3. `105` -> `301~306`
4. `002` -> `401~404` 与 `501~506`
5. `002` -> `601~602`
6. `301~306` + `401~506` + `601~602` -> `801~804` -> `901~903`

---

## 5. 统一验收标准（Definition of Done）

每个 FE 任务默认满足以下 DoD：

1. 成功路径可演示（页面状态与接口结果一致）
2. 失败路径可演示（含 40901/40401/50010）
3. 写操作后完成“回流刷新”
4. 关键交互具备 loading / disabled / empty / error 态
5. 提交说明包含接口影响范围与回归点

---

## 6. 测试清单（最小必测）

1. 列表筛选组合（tenant + status + alert_level）
2. 详情页在任务进行中轮询，完成后停止
3. cancel/resume/replay/replay-embedding/replay-dead-letter 全链路
4. 规则 CRUD 与调度 CRUD/run/trigger-due
5. 发布动作仅 `parsed` 可执行，冲突态提示准确
6. 弱网/超时/后端 5xx 场景下不白屏

---

## 7. 交付建议（资源与周期）

- FE 预计：18~21 PD
- QA 预计：4~5 PD
- 发布与运维协同：1.5~2 PD
- 总计：23.5~28 PD

建议并行方式：

- FE-A：任务看板/列表/详情/诊断
- FE-B：任务操作/规则/调度/发布
- QA：从 M2 开始并行介入

---

## 8. 任务卡模板（可复制）

```md
### [ETL-FE-xxx] 任务标题
- 目标：
- 页面：
- 接口：
- 输入输出：
- 异常处理：
- 依赖：
- 预计工时：
- 验收标准：
  1) 成功路径
  2) 失败路径
  3) 回流刷新
  4) 埋点/日志
```

---

## 9. API 责任矩阵（页面到接口一览）

| 页面/模块 | 接口 | 前端责任 | 完成定义 |
| --- | --- | --- | --- |
| 看板卡片 | `GET /metrics/summary` | 卡片数据渲染、定时刷新、异常降级 | 刷新不抖动，失败有重试入口 |
| 任务列表 | `GET /jobs` | 筛选、分页、排序、状态色、风险标记 | 支持 URL 持久化筛选条件 |
| 任务详情 | `GET /jobs/{job_id}` | 状态卡、阶段状态、轮询策略 | 任务完成后自动停止轮询 |
| 采集诊断 | `GET /jobs/{job_id}/collect-diagnostics` | 图表渲染（reason/extractor/quality/S2） | 图表失败不影响主页面 |
| 任务控制 | `POST /jobs/{job_id}/cancel` | 行级操作 + 二次确认 + 回流刷新 | 成功后列表与详情一致 |
| 任务控制 | `POST /jobs/{job_id}/resume` | 行级操作 + 回流刷新 | 冲突态有业务提示 |
| 任务控制 | `POST /jobs/{job_id}/replay` | 行级操作 + 回流刷新 | accepted=true 后触发统一刷新 |
| 任务控制 | `POST /jobs/{job_id}/replay-embedding` | 行级操作 + 回流刷新 | 重跑状态可见 |
| 批量死信重放 | `POST /jobs/replay-dead-letter` | 弹窗确认、结果回显、回流刷新 | 返回统计值完整显示 |
| 规则管理 | `GET/POST /extract-rules/web` + update/delete | 列表、表单校验、CRUD | CRUD 后列表一致 |
| 调度管理 | `GET/POST /schedules/web-collect` + update/delete/run/trigger-due | 列表、表单校验、动作执行 | run/trigger-due 后可在任务列表观测 |
| 文章发布 | `POST /articles/{article_id}/publish` | 状态约束、幂等提示、回流刷新 | 仅 parsed 可执行，冲突文案正确 |

---

## 10. 一次性交付物清单（提测前全部备齐）

### 10.1 前端代码交付

1. ETL 模块页面与路由
2. API Client 与错误码映射
3. 轮询与回流刷新机制
4. 页面埋点与关键异常日志

### 10.2 联调资料交付

1. 页面-接口映射表（可引用本文件第 9 节）
2. 联调账号与权限申请单（`etl:*`）
3. 联调数据样本（成功/失败/死信/冲突态）
4. 已知限制与风险列表（含不在本期范围项）

### 10.3 测试交付

1. 功能测试报告（列表/详情/规则/调度/发布）
2. 异常测试报告（40901/40401/50010/弱网/超时）
3. 回归清单（本期变更接口）

### 10.4 上线交付

1. 灰度发布方案（批次、观察指标、回滚阈值）
2. 回滚方案（开关、版本、负责人）
3. 上线值守表（FE/BE/QA/运维）

---

## 11. 变更记录

- 2026-03-21：初版创建，明确本期不包含 CSV 前端入口。
- 2026-03-21：补充 API 责任矩阵与一次性交付物清单，支持直接提测与上线。
