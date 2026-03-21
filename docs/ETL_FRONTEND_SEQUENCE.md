# ETL 前端页面级接口调用时序图

本文档用于前端后台管理系统实现阶段，给出页面级 API 调用时序（Mermaid），覆盖：

1. 任务列表页（筛选/分页/重跑）
2. 任务详情页（状态轮询 + 诊断）
3. 抽取规则管理页（CRUD）
4. 定时采集管理页（V2）

API 参考：`docs/modules/etk/ETL_ADMIN_API.md`
任务拆分参考：`docs/modules/etk/ETL_FRONTEND_WBS.md`

> 本期范围说明：CSV 前端入口暂缓，本文件默认按“网页采集 + 任务可视化 + 操作闭环 + 规则/调度 + 发布”实施。

## 0) 执行顺序（先做什么）

1. 任务列表页（含看板、筛选、分页、轮询）
2. 任务详情页（状态 + 诊断 + 图表）
3. 任务操作闭环（cancel/resume/replay/replay-embedding/replay-dead-letter）
4. 规则管理页（CRUD）
5. 调度管理页（CRUD + run + trigger-due）
6. 文章发布闭环（parsed -> published）

### 0.1 提测前烟囱清单（必须通过）

- 任意写操作成功后，统一刷新：`/jobs` + 当前详情（如在详情页）+ `/metrics/summary`
- 对 `40901/40401/50010` 有稳定业务提示，不出现白屏
- 列表和详情在弱网下可降级显示（保留基础状态与重试入口）
- 页面隐藏时暂停轮询，回到前台自动恢复轮询

---

## 1) 任务列表页（Job List）

页面目标：

- 展示任务表格
- 支持筛选（tenant/job_type/status/has_dead_letter/quality_score_lt/alert_level）
- 支持 offset 分页
- 支持行级操作（取消、恢复、重跑任务、重跑 embedding）
- 支持批量 dead-letter replay

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant FE as 前端(任务列表页)
    participant BFF as Admin API
    participant S as EtlService
    participant Q as RQ/Redis

    U->>FE: 打开列表页
    FE->>BFF: GET /api/v1/admin/etl/jobs?limit=50&offset=0
    BFF->>S: list_jobs(...)
    S->>Q: 读取队列/registry + job meta
    Q-->>S: jobs
    S-->>BFF: EtlJobListResponse(items,has_more,next_offset)
    BFF-->>FE: ApiResponse(data)
    FE-->>U: 渲染表格

    loop 每 8~15 秒（可选）
      FE->>BFF: GET /jobs(沿用当前筛选)
      BFF-->>FE: 最新状态
      FE-->>U: 局部刷新行状态
    end

    opt 行操作：取消运行中/排队任务
      U->>FE: 点击「取消任务」
      FE->>BFF: POST /api/v1/admin/etl/jobs/{job_id}/cancel
      BFF->>S: cancel_job(job_id)
      S->>Q: cancel + (started 时发送 stop signal)
      BFF-->>FE: accepted=true
      FE->>BFF: GET /jobs(刷新)
    end

    opt 行操作：恢复失败/取消任务
      U->>FE: 点击「恢复任务」
      FE->>BFF: POST /api/v1/admin/etl/jobs/{job_id}/resume
      BFF->>S: resume_job(job_id)
      S->>Q: requeue 或 enqueue_job
      BFF-->>FE: accepted=true
      FE->>BFF: GET /jobs(刷新)
    end

    U->>FE: 修改筛选条件
    FE->>BFF: GET /jobs?...&alert_level=warning
    BFF-->>FE: filtered items
    FE-->>U: 刷新列表

    U->>FE: 点击下一页
    FE->>BFF: GET /jobs?limit=50&offset={next_offset}
    BFF-->>FE: 下一页数据

    opt 行操作：重跑失败任务
      U->>FE: 点击「重跑任务」
      FE->>BFF: POST /api/v1/admin/etl/jobs/{job_id}/replay
      BFF->>S: replay_job(job_id)
      S->>Q: enqueue replay job
      BFF-->>FE: accepted=true
      FE->>BFF: GET /jobs(刷新)
    end

    opt 行操作：重跑 embedding
      U->>FE: 点击「重跑embedding」
      FE->>BFF: POST /api/v1/admin/etl/jobs/{job_id}/replay-embedding
      BFF->>S: replay_embedding(job_id)
      S->>Q: enqueue embedding job
      BFF-->>FE: accepted=true
      FE->>BFF: GET /jobs(刷新)
    end

    opt 批量操作：dead-letter 批量重放
      U->>FE: 点击「批量重放死信」并确认
      FE->>BFF: POST /api/v1/admin/etl/jobs/replay-dead-letter
      BFF->>S: replay_dead_letter_batch()
      S->>Q: enqueue 多个 embedding replay
      BFF-->>FE: replayed_jobs,total_dead_letter_materials
      FE->>BFF: GET /jobs(刷新)
    end
```

---

## 2) 任务详情页（Job Detail + Diagnostics）

页面目标：

- 展示单任务基础状态
- 展示采集诊断（失败原因分布、extractor 占比、质量与告警）
- 在 `is_finished=false` 时轮询

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant FE as 前端(任务详情页)
    participant BFF as Admin API
    participant S as EtlService
    participant Q as RQ/Redis

    U->>FE: 打开任务详情页(job_id)

    par 基础状态
      FE->>BFF: GET /api/v1/admin/etl/jobs/{job_id}
      BFF->>S: get_job_status(job_id)
      S->>Q: fetch job
      Q-->>S: job status/meta
      S-->>BFF: EtlJobStatusResponse
      BFF-->>FE: ApiResponse(data)
    and 采集诊断
      FE->>BFF: GET /api/v1/admin/etl/jobs/{job_id}/collect-diagnostics
      BFF->>S: get_collect_diagnostics(job_id)
      S->>Q: fetch job + parse meta
      S-->>BFF: EtlCollectDiagnosticsResponse
      BFF-->>FE: ApiResponse(data)
    end

    FE-->>U: 渲染状态卡片 + 图表

    loop 当 is_finished=false，每 8~15 秒
      FE->>BFF: GET /jobs/{job_id}
      FE->>BFF: GET /jobs/{job_id}/collect-diagnostics
      BFF-->>FE: 最新状态和诊断
      FE-->>U: 更新页面
    end

    opt 从详情页触发重跑
      U->>FE: 点击重跑
      FE->>BFF: POST /jobs/{job_id}/replay 或 /replay-embedding
      BFF-->>FE: accepted=true
      FE->>BFF: GET /jobs/{job_id}
      FE->>BFF: GET /jobs/{job_id}/collect-diagnostics
    end
```

图表映射建议：

- 失败原因柱状图：`collect_reason_counts`
- 抽取通道占比饼图：`extractor_counts`
- 质量与告警卡片：`quality_score_avg`、`low_quality_ratio`、`alert_level`
- embedding 进度条：`embedded_materials` / `embedding_failed_materials` / `embedding_retry_pending_materials`
- S2 质量卡片：`s2_annotations_count`、`s2_invalid_ratio`、`s2_deduplicated_ratio`

---

## 3) 抽取规则管理页（Rules CRUD）

页面目标：

- 列表展示规则
- 新建规则
- 编辑规则（部分更新）
- 删除规则

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant FE as 前端(规则管理页)
    participant BFF as Admin API
    participant S as EtlService
    participant DB as Platform DB

    U->>FE: 打开规则管理页
    FE->>BFF: GET /api/v1/admin/etl/extract-rules/web
    BFF->>S: list_web_extract_rules()
    S->>DB: query etl_web_extract_rules
    DB-->>S: rules
    S-->>BFF: EtlWebExtractRulesResponse
    BFF-->>FE: ApiResponse(data)

    opt 新建
      U->>FE: 填表并提交
      FE->>BFF: POST /extract-rules/web
      BFF->>S: create_web_extract_rule(req)
      S->>DB: insert rule
      BFF-->>FE: rule_id,accepted
      FE->>BFF: GET /extract-rules/web
    end

    opt 编辑
      U->>FE: 修改并保存
      FE->>BFF: POST /extract-rules/web/{rule_id}/update
      BFF->>S: update_web_extract_rule(rule_id, req)
      S->>DB: update rule
      BFF-->>FE: accepted
      FE->>BFF: GET /extract-rules/web
    end

    opt 删除
      U->>FE: 删除并二次确认
      FE->>BFF: POST /extract-rules/web/{rule_id}/delete
      BFF->>S: delete_web_extract_rule(rule_id)
      S->>DB: delete rule
      BFF-->>FE: accepted
      FE->>BFF: GET /extract-rules/web
    end
```

---

## 4) 前端实现建议（简版）

1. 列表筛选条件入 URL Query，便于分享和刷新恢复。
2. 所有写操作（replay、rules CRUD）完成后立即刷新对应列表。
3. 对 `40901`（状态冲突）做业务提示，不弹系统错误。
4. `alert_level` 色彩规范统一：`critical` 红、`warning` 橙、`normal` 灰/绿。
5. 详情页轮询可在标签页隐藏时暂停（节流）。

---

## 5) 定时采集管理页（Schedules V2）

页面目标：

- 展示定时任务列表
- 支持新增/编辑/删除
- 支持单任务立即执行
- 支持批量触发到期任务

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant FE as 前端(定时任务页)
    participant BFF as Admin API
    participant S as EtlService
    participant R as Redis
    participant Q as RQ/Redis

    U->>FE: 打开定时任务页
    FE->>BFF: GET /api/v1/admin/etl/schedules/web-collect
    BFF->>S: list_web_collect_schedules()
    S->>R: HGETALL etl:web_collect:schedules
    BFF-->>FE: ApiResponse(items)
    FE-->>U: 渲染列表

    opt 新增
      U->>FE: 填写定时配置并提交
      FE->>BFF: POST /schedules/web-collect
      BFF->>S: create_web_collect_schedule(req)
      S->>R: HSET schedule payload
      BFF-->>FE: schedule_id,accepted
      FE->>BFF: GET /schedules/web-collect
    end

    opt 删除
      U->>FE: 删除并二次确认
      FE->>BFF: POST /schedules/web-collect/{schedule_id}/delete
      BFF->>S: delete_web_collect_schedule(schedule_id)
      S->>R: HDEL
      BFF-->>FE: accepted
      FE->>BFF: GET /schedules/web-collect
    end

    opt 编辑
      U->>FE: 修改配置并保存
      FE->>BFF: POST /schedules/web-collect/{schedule_id}/update
      BFF->>S: update_web_collect_schedule(schedule_id, req)
      S->>R: 更新 payload + next_run_at
      BFF-->>FE: accepted
      FE->>BFF: GET /schedules/web-collect
    end

    opt 立即执行
      U->>FE: 点击「立即执行」
      FE->>BFF: POST /schedules/web-collect/{schedule_id}/run
      BFF->>S: run_web_collect_schedule(schedule_id)
      S->>Q: enqueue collect job
      S->>R: update last_run_at/next_run_at
      BFF-->>FE: job_id,accepted
      FE->>BFF: GET /jobs?limit=50&offset=0
      FE->>BFF: GET /schedules/web-collect
    end

    opt 触发到期任务
      U->>FE: 点击「触发到期任务」
      FE->>BFF: POST /schedules/web-collect/trigger-due?limit=20
      BFF->>S: trigger_due_web_collect_schedules(limit)
      S->>R: 扫描 due schedules
      S->>Q: 批量 enqueue
      BFF-->>FE: triggered,schedule_ids,job_ids
      FE->>BFF: GET /jobs
      FE->>BFF: GET /schedules/web-collect
    end
```

---

## 5.1) 文章审核/发布闭环（Article Publish）

页面目标：

- 展示可发布文章（`status=parsed`）
- 支持发布动作（`parsed -> published`）
- 发布后回流刷新任务与文章视图，形成业务闭环

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant FE as 前端(文章审核页)
    participant BFF as Admin API
    participant S as EtlService
    participant TDB as Tenant DB

    U->>FE: 打开文章审核页
    Note over FE: 前端从文章管理接口加载 parsed 列表

    opt 发布动作
      U->>FE: 点击「发布」
      FE->>BFF: POST /api/v1/admin/etl/articles/{article_id}/publish
      BFF->>S: publish_article(article_id, tenant_schema)
      S->>TDB: 校验状态并更新 parsed->published
      BFF-->>FE: previous_status/status/accepted
      FE-->>U: 提示发布成功
      FE->>BFF: GET /jobs (可选，刷新任务状态看板)
      Note over FE: 同步刷新文章列表，移除或标记已发布
    end

    opt 状态冲突
      FE->>BFF: POST /articles/{article_id}/publish
      BFF-->>FE: 40901
      FE-->>U: 提示“仅 parsed 状态可发布”
    end
```

---

## 6) 闭环实施验收（前端交付必须通过）

### 6.1 页面级最小闭环

1. 任务列表页：可筛选、可分页、可轮询、可执行行操作
2. 任务详情页：状态 + 诊断 + 图表全部可展示
3. 规则管理页：新增/编辑/删除全链路可用
4. 定时任务页：新增/编辑/删除/立即执行/触发到期全链路可用

### 6.2 交互闭环规则

1. 所有写操作成功后，统一刷新：`/jobs`、当前详情页（如有）、`/metrics/summary`
2. 对 `40901` 显示业务提示（不可操作状态），不弹系统异常
3. 对 `40401` 显示资源不存在提示，并引导返回列表
4. 图表接口失败时页面不白屏，保留表格和基础状态

### 6.3 质量指标闭环

前端至少要能在列表或详情完整展示：

- 内容抽取质量：`quality_score_avg`、`low_quality_ratio`
- 向量风险：`embedding_dead_letter_materials`、`embedding_dead_letter_ratio`
- S2 质量：`s2_invalid_ratio`、`s2_deduplicated_ratio`
- 综合风险：`alert_level`
