# ETL 后台管理 API（前端可视化对接完整版）

本文档面向后台管理系统前端（运营/内容/数据治理角色），覆盖 ETL 模块全部管理接口、字段定义、页面映射、错误语义和联调建议。

页面级调用时序图见：`docs/modules/etk/ETL_FRONTEND_SEQUENCE.md`（可选参考，前端落地请以本文 API 能力清单为准）
完整开发任务拆分见：`docs/modules/etk/ETL_FRONTEND_WBS.md`（按任务 ID 直接分配研发/测试）

> 本期前端范围说明：CSV 前端入口暂缓，当前实施以网页采集、任务可视化、任务操作闭环、规则/调度管理、文章发布闭环为主。

- API 前缀：`/api/v1/admin/etl`
- 响应包裹：`ApiResponse<T>`
- 代码位置：`app/api/v1/handlers/admin/etl.py`
- 权限码：
  - 任务：`etl:job:read`（列表/详情/指标/诊断）、`etl:job:create`（导入、网页采集）、`etl:job:control`（运行/重试/取消/恢复/死信/embedding 重放）
  - 调度：`etl:schedule:read`、`etl:schedule:create`、`etl:schedule:update`、`etl:schedule:delete`、`etl:schedule:run`
  - 规则：`etl:rule:read`、`etl:rule:mutate`

### 权限与路由对应关系

| 权限码 | 业务功能 | 路由/方法 |
| --- | --- | --- |
| `etl:job:read` | 任务指标摘要 | GET `/metrics/summary` |
|  | 任务列表 | GET `/jobs` |
|  | 任务状态详情 | GET `/jobs/{job_id}` |
|  | 采集诊断 | GET `/jobs/{job_id}/collect-diagnostics` |
| `etl:job:create` | 创建 CSV 导入任务 | POST `/import` |
|  | 创建网页采集任务 | POST `/collect/web` |
| `etl:job:control` | 取消任务 | POST `/jobs/{job_id}/cancel` |
|  | 恢复任务 | POST `/jobs/{job_id}/resume` |
|  | 重放任务 | POST `/jobs/{job_id}/replay` |
|  | 重放 embedding | POST `/jobs/{job_id}/replay-embedding` |
|  | 批量重放死信 | POST `/jobs/replay-dead-letter` |
|  | 发布文章（`parsed -> published`） | POST `/articles/{article_id}/publish` |
| `etl:schedule:read` | 定时采集列表 | GET `/schedules/web-collect` |
| `etl:schedule:create` | 创建定时采集 | POST `/schedules/web-collect` |
| `etl:schedule:update` | 更新定时采集 | POST `/schedules/web-collect/{schedule_id}/update` |
| `etl:schedule:delete` | 删除定时采集 | POST `/schedules/web-collect/{schedule_id}/delete` |
| `etl:schedule:run` | 手动运行定时采集 | POST `/schedules/web-collect/{schedule_id}/run` |
|  | 批量触发到期调度 | POST `/schedules/web-collect/trigger-due` |
| `etl:rule:read` | 抽取规则列表 | GET `/extract-rules/web` |
| `etl:rule:mutate` | 新建抽取规则 | POST `/extract-rules/web` |
|  | 更新抽取规则 | POST `/extract-rules/web/{rule_id}/update` |
|  | 删除抽取规则 | POST `/extract-rules/web/{rule_id}/delete` |

## 0. ETL 完整链路（当前实现）

> 本节描述当前代码已实现的数据流水线，供前后端统一理解。

### 0.1 S1 抓取与结构化切分（Raw Data）

- 入口：`POST /import`（CSV）或 `POST /collect/web`（网页）
- 入库对象：`articles` + `materials`
- 关键动作：
  - 对原文做规范化（换行/空白/引号）
  - 按自然段切分并生成 `pid`（`p0/p1/...`）
  - 写入 `articles.content_ast`（初始仅 `text` 节点）
  - 写入 `articles.pipeline_meta.s1`
  - 将段落/句级 chunk 写入 `materials`，并在 `attributes` 里保留 `pid/paragraph_index/chunk_index`

### 0.2 S2 批注（LLM Fetching）

- 对 S1 段落按 batch（默认 5 段）请求批注
- 支持 provider：`mock` / `openai_compatible`
- 批注标准字段：`pid/exact_text/replace_white_talk/deep_explain`
- 批注结果写入 `dict_vectors`（用于后续向量召回）
- 若 `exact_text` 在段落中无法匹配，会标记 fallback 元信息

### 0.3 S3 AST 缝合（AST Suture）

- 根据 `pid + exact_text` 在段落内执行 indexOf 匹配
- 命中：将 `text` 节点切成 `[text, highlight, text]`
- 未命中：追加 `fallback_card` 节点
- 回写 `articles.content_ast` 与 `pipeline_meta.s3`

### 0.4 S4 状态流转（发布）

- ETL 入库后文章为 `parsed`
- 运营审核后通过接口发布：`POST /articles/{article_id}/publish`
- 仅允许 `parsed -> published`，`published` 再次调用幂等返回

### 0.5 向量链路（当前）

- `materials.embedding`：chunk 级语义向量（RAG/检索基础层）
- `dict_vectors.embedding`：批注词典向量（术语/金句召回层，当前字段已就绪）

---

## 1. 通用约定

### 1.1 统一响应结构

```json
{
  "code": 0,
  "message": "OK",
  "request_id": "req-xxxx",
  "data": {},
  "detail": null
}
```

字段说明：

- `code`: 业务码，`0` 表示成功
- `message`: 业务信息
- `request_id`: 请求链路 ID（排障必带）
- `data`: 具体业务数据
- `detail`: 错误细节（可选）

### 1.2 常见错误码（前端建议统一 toast/弹窗）

- `40001` 参数错误（表单校验类）
- `40401` 资源不存在（job/rule 已删除或不存在）
- `40901` 资源冲突（任务状态不允许 replay 等）
- `50000` 服务器内部错误
- `50010` 依赖异常

### 1.3 关键枚举

- `extractor_strategy`: `hybrid` | `managed_first` | `rules_only`
- `job_type`: `web_collect` | `csv_import`
- `alert_level`: `normal` | `warning` | `critical`
- `article_status`: `crawled` | `parsed` | `published`

### 1.4 前端字段对齐（核心对象）

- 任务 Job：`job_id`、`job_type`、`status`、`is_finished`、`tenant_schema`、`rows`、`inserted_articles`、`updated_articles`、`inserted_materials`、`extractor_strategy`、`embedding_status`、`embedding_job_id`、`quality_score_avg`、`low_quality_ratio`、`embedding_dead_letter_ratio`、`s2_annotations_count`、`s2_fallback_count`、`s2_batches`、`s2_provider_items`、`s2_normalized_items`、`s2_invalid_items`、`s2_deduplicated_items`、`s2_invalid_ratio`、`s2_deduplicated_ratio`、`alert_level`、`enqueued_at`、`started_at`、`ended_at`
- 抽取规则 Rule：`id`、`name`、`host_pattern`、`title_selectors`、`content_selectors`、`date_selectors`、`source_selectors`、`author_selectors`、`priority`、`enabled`、`version`、`rollout_tenant_schemas`、`rollout_percent`
- 定时采集 Schedule：`schedule_id`、`name`、`tenant_schema`、`seed_urls`、`source_name`、`chunk_size`、`extractor_strategy`、`interval_minutes`、`enabled`、`created_at`、`updated_at`、`last_run_at`、`next_run_at`

### 1.5 列表分页约定

所有列表接口统一支持 `limit + offset` 分页：

- `limit`：每页条数，默认 `50`，范围 `1~200`
- `offset`：起始偏移，默认 `0`
- 响应中包含 `total`（总数）、`has_more`（是否有下一页）、`next_offset`（下一页偏移，`has_more=false` 时为 `null`）
- 前端翻页逻辑：`has_more=true` 时 `next_offset` 即为下页请求的 `offset`

## 2. 页面与接口映射（建议）

### 2.1 任务列表页

- `GET /jobs`
- `GET /metrics/summary`
- `POST /jobs/{job_id}/cancel`
- `POST /jobs/{job_id}/resume`
- `POST /jobs/{job_id}/replay`
- `POST /jobs/{job_id}/replay-embedding`
- `POST /jobs/replay-dead-letter`
- `GET /jobs/{job_id}`
- `GET /jobs/{job_id}/collect-diagnostics`

### 2.2 网页采集任务创建页

- `POST /collect/web`

### 2.3 CSV 导入任务创建页

- `POST /import`

### 2.3.1 文章审核/发布页

- `POST /articles/{article_id}/publish`

### 2.4 抽取规则管理页

- `GET /extract-rules/web`
- `POST /extract-rules/web`
- `POST /extract-rules/web/{rule_id}/update`
- `POST /extract-rules/web/{rule_id}/delete`

### 2.5 定时采集管理页（V2）

- `GET /schedules/web-collect`
- `POST /schedules/web-collect`
- `POST /schedules/web-collect/{schedule_id}/update`
- `POST /schedules/web-collect/{schedule_id}/delete`
- `POST /schedules/web-collect/{schedule_id}/run`
- `POST /schedules/web-collect/trigger-due`

### 2.6 前端最小闭环实施路径（强烈建议按顺序）

1. **任务列表页可用**
   - 完成 `/jobs` + `/metrics/summary` 展示
   - 完成 `alert_level`、`has_dead_letter`、`quality_score_lt` 筛选
2. **任务详情页可用**
   - 完成 `/jobs/{job_id}` + `/jobs/{job_id}/collect-diagnostics`
   - 完成质量卡片（quality + dead-letter + S2）
3. **任务操作闭环**
   - 完成 cancel / resume / replay / replay-embedding / replay-dead-letter
   - 操作后统一回流刷新列表与详情
4. **规则与调度可运营**
   - 完成规则 CRUD 与调度 CRUD/run/trigger-due
5. **发布闭环**
   - 完成文章 `parsed -> published` 发布动作接入
   - 在 UI 上明确状态约束和幂等提示

### 2.7 前端分阶段实施清单（API 能力导向）

> 本节是前端实施主清单。按阶段推进即可，不需要自行拆接口依赖。

| 阶段 | 前端功能 | 必接接口 | 页面产出 | 完成标准 |
| --- | --- | --- | --- | --- |
| P0 | 任务总览与列表 | `GET /metrics/summary`、`GET /jobs` | 任务列表页、看板卡片 | 可筛选/分页/轮询，任务状态可稳定展示 |
| P0 | 任务详情诊断 | `GET /jobs/{job_id}`、`GET /jobs/{job_id}/collect-diagnostics` | 详情页状态区+诊断图表 | 失败原因、extractor、质量、S2 指标完整可见 |
| P0 | 任务操作闭环 | `POST /jobs/{job_id}/cancel`、`POST /jobs/{job_id}/resume`、`POST /jobs/{job_id}/replay`、`POST /jobs/{job_id}/replay-embedding`、`POST /jobs/replay-dead-letter` | 行操作按钮、批量操作弹窗 | 操作成功后状态回流刷新，无断层 |
| P1 | 网页采集创建 | `POST /collect/web` | 采集任务创建页 | 提交后可在任务列表看到新任务 |
| P1 | 规则管理 | `GET /extract-rules/web`、`POST /extract-rules/web`、`POST /extract-rules/web/{rule_id}/update`、`POST /extract-rules/web/{rule_id}/delete` | 规则管理页 | CRUD 全链路可用，列表刷新正确 |
| P1 | 调度管理 | `GET /schedules/web-collect`、`POST /schedules/web-collect`、`POST /schedules/web-collect/{schedule_id}/update`、`POST /schedules/web-collect/{schedule_id}/delete`、`POST /schedules/web-collect/{schedule_id}/run`、`POST /schedules/web-collect/trigger-due` | 调度管理页 | CRUD/run/trigger-due 全链路可用 |
| P1 | 文章发布闭环 | `POST /articles/{article_id}/publish` | 文章审核/发布页 | `parsed -> published` 成功，冲突态提示正确 |
| P2 | CSV 手工导入（按需） | `POST /import` | 运维导入页（可隐藏） | 手工回灌任务可用，创建后可追踪 |

#### 2.7.1 接口依赖顺序（避免返工）

1. 先做只读链路：`/metrics/summary` -> `/jobs` -> `/jobs/{id}` -> `/collect-diagnostics`
2. 再做任务写操作：cancel/resume/replay/replay-embedding/replay-dead-letter
3. 再做运营配置：规则管理 + 调度管理
4. 最后做业务发布：`/articles/{article_id}/publish`

#### 2.7.2 前端统一回流规则（必须实现）

写接口返回 `accepted=true` 后，统一执行：

1. 刷新当前任务列表：`GET /jobs`（沿用当前筛选条件）
2. 若当前处于详情页，刷新：`GET /jobs/{id}` + `GET /jobs/{id}/collect-diagnostics`
3. 异步刷新看板：`GET /metrics/summary`

#### 2.7.3 最小上线闭环（MVP）

上线前至少满足：

- 已完成 P0 全部能力
- 已完成 P1 中“网页采集创建 + 规则管理 + 调度 run/trigger-due + 发布闭环”
- 所有 `40901/40401/50010` 有统一业务提示

---

## 3. 接口清单（全量）

## 3.1 创建 CSV 导入任务

- **POST** `/import`

请求体：

```json
{
  "tenant_schema": "city_110000",
  "csv_path": "/absolute/path/to/file.csv",
  "source_name": "manual_import",
  "chunk_size": 320
}
```

参数说明：

- `tenant_schema`: 租户 schema，必填
- `csv_path`: 绝对路径，必须 `.csv`
- `source_name`: 来源名称（可用于追踪）
- `chunk_size`: 分块大小，范围 `80~1200`

CSV 模版文件：`docs/modules/etk/examples/etl_import_template.csv`

CSV 字段约定：

- `content`：正文内容（必填，空行会被跳过）
- `title`：标题（可选，默认 `未命名文章`）
- `source_name`：来源（可选，默认 `未知来源`）
- `publish_date`：发布日期（可选，格式 `YYYY-MM-DD`，默认当天）
- `original_url`：原文链接（可选）
- `author`：作者（可选）

模板与程序一致性说明（2026-03）：

- 当前模板 `docs/modules/etk/examples/etl_import_template.csv` 与导入解析逻辑一致。
- 字段名按表头匹配，**列顺序可变**；建议仍使用模板顺序，减少人工编辑错误。
- 可出现额外列，导入程序会忽略未使用列。
- `publish_date` 若提供，必须是严格 `YYYY-MM-DD`；非法日期会导致任务执行失败（不是“跳过该行”）。
- `content` 为空的行会被跳过，不会入库。
- `source_name` 优先级：以接口请求体 `source_name` 为准；若请求体为空才会回退 CSV 列值（默认请求体为 `etl`）。

校验与错误提示：

- `tenant_schema` 为空 → `422`，`message: "tenant_schema 不能为空"`
- `csv_path` 为空 → `422`，`message: "csv_path 不能为空"`
- `csv_path` 非绝对路径 → `422`，`message: "csv_path 必须为绝对路径"`
- `csv_path` 非 `.csv` → `422`，`message: "csv_path 仅支持 .csv 文件"`
- 文件不存在或不是文件 → `422`，`message: "csv_path 不存在或不是文件"`

响应 `data`：

```json
{
  "job_id": "etl-import-city_110000-174987654321",
  "queue_name": "system_jobs",
  "tenant_schema": "city_110000",
  "accepted": true,
  "extractor_strategy": null
}
```

---

## 3.2 创建网页采集任务

- **POST** `/collect/web`

请求体：

```json
{
  "tenant_schema": "city_110000",
  "seed_urls": [
    "https://www.gov.cn/zhengce/...",
    "https://example.gov.cn/news/..."
  ],
  "source_name": "crawler",
  "chunk_size": 320,
  "extractor_strategy": "hybrid"
}
```

说明：

- `seed_urls` 长度 `1~200`
- URL 必须为 `http(s)`

响应 `data`：

```json
{
  "job_id": "etl-web-city_110000-a1b2c3d4e5f6g7h8",
  "queue_name": "system_jobs",
  "tenant_schema": "city_110000",
  "accepted": true,
  "extractor_strategy": "hybrid"
}
```

---

## 3.2.1 发布文章（S4）

- **POST** `/articles/{article_id}/publish`

请求体：

```json
{
  "tenant_schema": "city_110000"
}
```

说明：

- 仅 `parsed` 状态文章允许发布为 `published`
- 已是 `published` 时幂等返回成功
- 其它状态（如 `crawled`）返回 `40901`

响应 `data`：

```json
{
  "article_id": "9f1bd0e6-0c25-7f90-a5e8-0d58cc9c4fdb",
  "tenant_schema": "city_110000",
  "previous_status": "parsed",
  "status": "published",
  "accepted": true
}
```

---

## 3.3 ETL 任务列表（筛选 + 分页）

- **GET** `/jobs`

Query 参数：

- `limit`：默认 50，范围 1~200
- `offset`：默认 0
- `tenant_schema`：按租户筛选
- `job_type`：`web_collect` / `csv_import`
- `status`：RQ 状态文本（如 `queued`/`started`/`finished`/`failed`）
- `has_dead_letter`：`true/false`
- `quality_score_lt`：质量均分阈值（0~100）
- `alert_level`：`normal` / `warning` / `critical`

响应 `data`：

```json
{
  "items": [
    {
      "job_id": "etl-web-city_110000-xxxx",
      "status": "finished",
      "is_finished": true,
      "job_type": "web_collect",
      "tenant_schema": "city_110000",
      "rows": 20,
      "inserted_articles": 18,
      "updated_articles": 2,
      "inserted_materials": 128,
      "extractor_strategy": "hybrid",
      "embedding_status": "done",
      "embedding_job_id": "etl-embed-city_110000-xxxx",
      "embedded_materials": 128,
      "embedding_failed_materials": 0,
      "embedding_retry_pending_materials": 0,
      "embedding_dead_letter_materials": 0,
      "embedding_retry_job_id": null,
      "embedding_attempt_index": 1,
      "embedding_max_attempts": 3,
      "quality_score_avg": 64.2,
      "low_quality_rows": 3,
      "low_quality_ratio": 0.15,
      "embedding_dead_letter_ratio": 0.0,
      "s2_annotations_count": 96,
      "s2_fallback_count": 5,
      "s2_batches": 12,
      "s2_provider_items": 110,
      "s2_normalized_items": 96,
      "s2_invalid_items": 9,
      "s2_deduplicated_items": 5,
      "s2_invalid_ratio": 0.0818,
      "s2_deduplicated_ratio": 0.0455,
      "alert_level": "normal",
      "enqueued_at": "2026-02-18T09:00:00+00:00",
      "started_at": "2026-02-18T09:00:02+00:00",
      "ended_at": "2026-02-18T09:00:23+00:00"
    }
  ],
  "sampled_total": 1,
  "has_more": false,
  "next_offset": null
}
```

前端建议：

- 分页：`next_offset = offset + limit`（当 `has_more=true`）
- 主告警色：`alert_level=critical`（红），`warning`（橙），`normal`（灰/绿）

---

## 3.3.1 ETL 指标总览（运营看板）

- **GET** `/metrics/summary`

响应 `data`：

```json
{
  "total_jobs": 120,
  "warning_jobs": 18,
  "critical_jobs": 3,
  "avg_quality_score": 62.4,
  "avg_dead_letter_ratio": 0.0275,
  "tenants": [
    {
      "tenant_schema": "central",
      "total_jobs": 60,
      "warning_jobs": 6,
      "critical_jobs": 1,
      "avg_quality_score": 64.1,
      "avg_dead_letter_ratio": 0.012
    },
    {
      "tenant_schema": "city_110000",
      "total_jobs": 60,
      "warning_jobs": 12,
      "critical_jobs": 2,
      "avg_quality_score": 60.7,
      "avg_dead_letter_ratio": 0.043
    }
  ]
}
```

说明：

- 当前聚合口径基于最近采样到的 ETL 任务列表（默认上限 200 条）
- 可用于首页看板 KPI 与按租户风险排序

---

## 3.4 任务基础状态

- **GET** `/jobs/{job_id}`

响应 `data`：

```json
{
  "job_id": "etl-web-city_110000-xxxx",
  "queue_name": "system_jobs",
  "status": "finished",
  "is_finished": true,
  "enqueued_at": "2026-02-18T09:00:00+00:00",
  "started_at": "2026-02-18T09:00:02+00:00",
  "ended_at": "2026-02-18T09:00:23+00:00",
  "meta": {
    "tenant_schema": "city_110000",
    "rows": 20,
    "inserted_articles": 18,
    "updated_articles": 2,
    "inserted_materials": 128,
    "embedding_status": "done",
    "embedding_job_id": "etl-embed-city_110000-xxxx",
    "embedded_materials": 128,
    "embedding_dead_letter_materials": 0,
    "quality_score_avg": 64.2,
    "low_quality_ratio": 0.15,
    "embedding_dead_letter_ratio": 0.0,
    "s2_annotations_count": 96,
    "s2_fallback_count": 5,
    "s2_batches": 12,
    "s2_provider_items": 110,
    "s2_normalized_items": 96,
    "s2_invalid_items": 9,
    "s2_deduplicated_items": 5,
    "s2_invalid_ratio": 0.0818,
    "s2_deduplicated_ratio": 0.0455,
    "alert_level": "normal"
  }
}
```

用途：

- 详情页实时轮询
- replay 按钮可用性判断

补充说明：

- `meta` 为任务执行阶段写入的动态扩展字段，推荐前端优先读取上例中的质量/告警/S2 指标子集

---

## 3.5 采集诊断详情

- **GET** `/jobs/{job_id}/collect-diagnostics`

响应 `data`：

```json
{
  "job_id": "etl-web-city_110000-xxxx",
  "seed_urls": 20,
  "failed_urls": 2,
  "extractor_strategy": "hybrid",
  "extractor_counts": {
    "managed": 12,
    "local": 4,
    "rules": 2
  },
  "embedding_status": "retrying",
  "embedding_job_id": "etl-embed-city_110000-xxxx",
  "embedded_materials": 120,
  "embedding_failed_materials": 8,
  "embedding_retry_pending_materials": 8,
  "embedding_dead_letter_materials": 1,
  "embedding_retry_job_id": "etl-embed-city_110000-xxxx-retry-2",
  "embedding_attempt_index": 1,
  "embedding_max_attempts": 3,
  "quality_score_avg": 59.8,
  "low_quality_rows": 5,
  "low_quality_ratio": 0.25,
  "embedding_dead_letter_ratio": 0.0083,
  "s2_annotations_count": 120,
  "s2_fallback_count": 7,
  "s2_batches": 18,
  "s2_provider_items": 141,
  "s2_normalized_items": 120,
  "s2_invalid_items": 14,
  "s2_deduplicated_items": 7,
  "s2_invalid_ratio": 0.0993,
  "s2_deduplicated_ratio": 0.0496,
  "alert_level": "warning",
  "collect_reason_counts": {
    "extracted:managed": 12,
    "extracted:rules": 2,
    "fetch_error": 2
  },
  "collect_items_sample": [
    {
      "url": "https://...",
      "status": "ok",
      "reason": "extracted:managed",
      "extractor": "managed",
      "quality_score": 72
    }
  ]
}
```

可视化建议：

- 失败原因柱状图：`collect_reason_counts`
- 抽取通道占比饼图：`extractor_counts`
- 质量分提示：`quality_score_avg` + `low_quality_ratio`
- S2 批注质量：`s2_invalid_ratio` + `s2_deduplicated_ratio`

---

## 3.6 重跑失败 ETL 任务

- **POST** `/jobs/{job_id}/replay`

响应 `data`：

```json
{
  "job_id": "etl-web-city_110000-xxxx-replay-20260218...",
  "replay_of": "etl-web-city_110000-xxxx",
  "queue_name": "system_jobs",
  "accepted": true
}
```

失败场景：

- 原任务非 `failed`：返回 `40901`
- 原任务不是 ETL 任务：返回 `40001`

---

## 3.6.1 取消任务（V2）

- **POST** `/jobs/{job_id}/cancel`

说明：

- 仅 ETL 任务可操作
- 仅 `queued/deferred/started` 状态允许取消
- `started` 会先发送 stop 信号，再执行 cancel

响应 `data`：

```json
{
  "job_id": "etl-web-city_110000-xxxx",
  "queue_name": "system_jobs",
  "action": "cancel",
  "accepted": true,
  "previous_status": "started",
  "status": "canceled",
  "note": "已请求 worker 停止当前任务"
}
```

---

## 3.6.2 恢复任务（V2）

- **POST** `/jobs/{job_id}/resume`

说明：

- 仅 ETL 任务可操作
- 仅 `queued/deferred/failed/canceled/stopped` 允许恢复
- 对异常“queued 但不在队列”会自动补入队

响应 `data`：

```json
{
  "job_id": "etl-web-city_110000-xxxx",
  "queue_name": "system_jobs",
  "action": "resume",
  "accepted": true,
  "previous_status": "failed",
  "status": "queued",
  "note": null
}
```

## 3.6.3 任务操作按钮可用性矩阵（前端必须落实）

| 按钮 | 允许状态 | 接口 | 失败码/提示建议 |
| --- | --- | --- | --- |
| 取消任务 | `queued` / `deferred` / `started` | `POST /jobs/{job_id}/cancel` | `40901`：当前状态不可取消 |
| 恢复任务 | `queued` / `deferred` / `failed` / `canceled` / `stopped` | `POST /jobs/{job_id}/resume` | `40901`：当前状态不可恢复 |
| 重跑任务 | `failed` | `POST /jobs/{job_id}/replay` | `40901`：仅失败任务可重跑 |
| 重跑 embedding | 通常为已完成 ETL 且存在素材的任务 | `POST /jobs/{job_id}/replay-embedding` | `40901`：当前任务不满足 embedding 重跑条件 |
| 批量重放死信 | 任意（建议管理员可见） | `POST /jobs/replay-dead-letter` | 成功后提示 `replayed_jobs` 与 `total_dead_letter_materials` |

前端规则：

- 默认按状态禁用不可用按钮，避免“点了才报错”
- 仍需保留后端兜底错误提示（防并发状态变化）

---

## 3.7 重跑指定任务的 embedding

- **POST** `/jobs/{job_id}/replay-embedding`

响应 `data`：

```json
{
  "embedding_job_id": "etl-embed-city_110000-{batch}-replay-20260218...",
  "replay_of": "etl-web-city_110000-xxxx",
  "queue_name": "system_jobs",
  "accepted": true
}
```

---

## 3.8 批量重放 dead-letter

- **POST** `/jobs/replay-dead-letter`

响应 `data`：

```json
{
  "replayed_jobs": 3,
  "total_dead_letter_materials": 57,
  "accepted": true
}
```

前端建议：

- 危险动作二次确认
- 操作后刷新列表，观察 `embedding_dead_letter_materials` 是否下降

---

## 3.9 列出网页抽取规则

- **GET** `/extract-rules/web?limit=50&offset=0`

Query 参数：

- `limit`：每页条数，默认 `50`，范围 `1~200`
- `offset`：起始偏移，默认 `0`

响应 `data`：

```json
{
  "items": [
    {
      "id": "89d4...",
      "name": "gov-cn",
      "host_pattern": "(^|\\.)gov\\.cn$",
      "title_selectors": ["h1", ".title"],
      "content_selectors": ["article", ".content"],
      "date_selectors": ["time", ".date"],
      "source_selectors": [".source"],
      "author_selectors": [".author"],
      "priority": 20,
      "enabled": true,
      "version": 1,
      "rollout_tenant_schemas": ["central", "city_110000"],
      "rollout_percent": 100
    }
  ],
  "total": 1,
  "has_more": false,
  "next_offset": null
}
```

---

## 3.10 新增网页抽取规则

- **POST** `/extract-rules/web`

请求体：

```json
{
  "name": "district-gov",
  "host_pattern": "(^|\\.)example\\.gov\\.cn$",
  "title_selectors": ["h1", ".title"],
  "content_selectors": ["article", ".content"],
  "date_selectors": ["time", ".date"],
  "source_selectors": [".source"],
  "author_selectors": [".author"],
  "priority": 100,
  "enabled": true,
  "version": 1,
  "rollout_tenant_schemas": ["central"],
  "rollout_percent": 30
}
```

说明：

- `rollout_tenant_schemas` 非空时，仅对白名单租户生效
- `rollout_percent` 用于百分比灰度（1~100），`100` 表示全量

响应 `data`：

```json
{
  "rule_id": "8f182f39-2d70-4f64-a4f6-4dbf3e99d340",
  "accepted": true
}
```

---

## 3.11 更新网页抽取规则

- **POST** `/extract-rules/web/{rule_id}/update`

请求体（部分更新）：

```json
{
  "enabled": false,
  "priority": 200,
  "rollout_tenant_schemas": [],
  "rollout_percent": 100
}
```

响应同新增。

---

## 3.12 删除网页抽取规则

- **POST** `/extract-rules/web/{rule_id}/delete`

响应同新增。

---

## 3.13 定时采集任务列表（V2）

- **GET** `/schedules/web-collect?limit=50&offset=0`

Query 参数：

- `limit`：每页条数，默认 `50`，范围 `1~200`
- `offset`：起始偏移，默认 `0`

响应 `data`：

```json
{
  "items": [
    {
      "schedule_id": "018f9f86-7bc4-7d82-9f3a-9d95e4b5c2f1",
      "name": "daily-gov",
      "tenant_schema": "city_110000",
      "seed_urls": ["https://..."],
      "source_name": "web-schedule",
      "chunk_size": 320,
      "extractor_strategy": "hybrid",
      "interval_minutes": 60,
      "enabled": true,
      "created_at": "2026-02-18T10:00:00+00:00",
      "updated_at": "2026-02-18T10:00:00+00:00",
      "last_run_at": null,
      "next_run_at": "2026-02-18T11:00:00+00:00"
    }
  ],
  "total": 1,
  "has_more": false,
  "next_offset": null
}
```

---

## 3.14 新增定时采集任务（V2）

- **POST** `/schedules/web-collect`

请求体：

```json
{
  "name": "daily-gov",
  "tenant_schema": "city_110000",
  "seed_urls": ["https://..."],
  "source_name": "web-schedule",
  "chunk_size": 320,
  "extractor_strategy": "hybrid",
  "interval_minutes": 60,
  "enabled": true
}
```

响应 `data`：

```json
{
  "schedule_id": "018f9f86-7bc4-7d82-9f3a-9d95e4b5c2f1",
  "accepted": true
}
```

---

## 3.15 更新定时采集任务（V2）

- **POST** `/schedules/web-collect/{schedule_id}/update`

请求体（部分更新）：

```json
{
  "enabled": false,
  "interval_minutes": 120,
  "extractor_strategy": "managed_first"
}
```

响应 `data`：

```json
{
  "schedule_id": "018f9f86-7bc4-7d82-9f3a-9d95e4b5c2f1",
  "accepted": true
}
```

---

## 3.16 删除定时采集任务（V2）

- **POST** `/schedules/web-collect/{schedule_id}/delete`

响应 `data`：

```json
{
  "schedule_id": "018f9f86-7bc4-7d82-9f3a-9d95e4b5c2f1",
  "accepted": true
}
```

---

## 3.17 立即执行定时任务（V2）

- **POST** `/schedules/web-collect/{schedule_id}/run`

响应 `data`：

```json
{
  "schedule_id": "018f9f86-7bc4-7d82-9f3a-9d95e4b5c2f1",
  "job_id": "etl-web-city_110000-xxxx",
  "queue_name": "system_jobs",
  "accepted": true
}
```

---

## 3.18 触发到期定时任务（V2）

- **POST** `/schedules/web-collect/trigger-due?limit=20`

响应 `data`：

```json
{
  "scanned": 12,
  "triggered": 3,
  "schedule_ids": ["etl-sch-a", "etl-sch-b", "etl-sch-c"],
  "job_ids": ["etl-web-1", "etl-web-2", "etl-web-3"]
}
```

---

## 4. 前端可视化字段字典（核心）

### 4.1 任务质量与告警

- `quality_score_avg`: 抽取质量均分（0~100）
- `low_quality_rows`: 低质量条数（阈值为评分 < 45）
- `low_quality_ratio`: 低质量占比
- `embedding_dead_letter_materials`: 死信素材数
- `embedding_dead_letter_ratio`: 死信占比
- `s2_annotations_count`: S2 最终有效批注总数
- `s2_fallback_count`: S2 fallback 批注数量
- `s2_batches`: S2 分批调用次数
- `s2_provider_items`: 模型原始返回条目总数
- `s2_normalized_items`: 归一化后可用条目数
- `s2_invalid_items`: 校验失败/不可用条目数
- `s2_deduplicated_items`: 去重后移除条目数
- `s2_invalid_ratio`: 无效条目占比（`invalid/provider_items`）
- `s2_deduplicated_ratio`: 去重条目占比（`deduplicated/provider_items`）
- `alert_level`: 综合告警等级

### 4.2 embedding 过程状态

- `embedding_status`: `queued`/`retrying`/`done`/`partial_failed`
- `embedding_attempt_index`: 当前轮次
- `embedding_max_attempts`: 最大轮次
- `embedding_retry_job_id`: 下一轮任务 ID（若有）

### 4.3 文章结构化字段（S1-S4）

- `articles.content_ast`：结构化节点数组（`text/highlight/fallback_card`）
- `articles.pipeline_meta.s1`：段落统计与 `pid` 列表
- `articles.pipeline_meta.s2`：批注数量、fallback 数、批次/原始条目/归一化条目、无效与去重统计、模型信息
- `articles.pipeline_meta.s3`：缝合成功数、fallback_card 数
- `articles.status`：`crawled -> parsed -> published`

---

## 5. 联调与交互建议（闭环版）

### 5.1 轮询与刷新策略

1. 列表页默认：`limit=50&offset=0`
2. 列表轮询：每 8~15 秒轮询当前筛选条件下 `/jobs`
3. 详情页：先 `/jobs/{id}` 再 `/jobs/{id}/collect-diagnostics`
4. 当 `is_finished=true` 时，详情页停止轮询
5. 页面不可见（后台标签）时暂停轮询，回到前台立即补拉一次

### 5.2 写操作后的统一回流（防止状态断层）

所有写操作成功后，前端执行统一刷新序列：

1. 刷新当前列表 `/jobs`（保持当前筛选）
2. 若当前在详情页，同步刷新 `/jobs/{id}` + `/collect-diagnostics`
3. 刷新看板 `/metrics/summary`（可异步）

### 5.3 容错与降级（必须实现）

1. 对 `40901` 统一业务提示：`当前状态不可操作，请刷新后重试`
2. 对 `40401` 统一提示：`任务不存在或已被清理`
3. 对 `50010` 提示：`下游依赖异常，请稍后重试`
4. 图表接口失败时：保留表格基础信息，不阻塞页面主体
5. `meta` 字段缺失时使用默认值渲染（如 `0/null/"normal"`），不应崩溃

### 5.4 运营看板闭环指标（建议首屏展示）

1. 全局：`total_jobs / warning_jobs / critical_jobs`
2. 质量：`avg_quality_score / avg_dead_letter_ratio`
3. S2 质量：`s2_invalid_ratio / s2_deduplicated_ratio`
4. 风险分层：按 `alert_level` + `tenant_schema` 做 TopN 列表

### 5.5 联调验收清单（交付前逐条打勾）

- [ ] 任务列表筛选、分页、轮询全部可用
- [ ] 任务详情基础状态与诊断图表可用
- [ ] cancel/resume/replay/replay-embedding/replay-dead-letter 全链路可用
- [ ] 规则管理与调度管理（含 run/trigger-due）全链路可用
- [ ] 发布动作 `parsed -> published` 可用，状态提示清晰
- [ ] `alert_level` 高亮与错误码提示策略已统一
- [ ] S2 指标（计数+比率）在列表与详情均可见
- [ ] 写操作后“列表 + 详情 + 看板”刷新回流已实现
- [ ] 页面异常降级策略已实现（接口失败不阻塞主流程）

---

## 6. 版本变更记录（ETL 管理相关）

- 新增：`alert_level` 过滤
- 新增：`low_quality_ratio` / `embedding_dead_letter_ratio`
- 新增：`/jobs/replay-dead-letter`
- 新增：告警通知通道配置（log 生效，钉钉/企微为预留 stub）
- 新增：`/jobs/{job_id}/cancel`、`/jobs/{job_id}/resume`
- 新增：`/articles/{article_id}/publish`（S4 发布动作）
- 新增：`/schedules/web-collect` 系列接口（列表/创建/删除/立即执行/触发到期）
- 新增：S1/S2/S3 全链路字段说明（`content_ast`、`pipeline_meta`、`dict_vectors`）
- 新增：`/jobs` 与 `/jobs/{job_id}/collect-diagnostics` 返回结构化 S2 质量指标（计数 + 比率）
- 新增：前端最小闭环实施路径、任务操作可用性矩阵、闭环联调验收清单
- 变更：`GET /extract-rules/web` 新增 `limit/offset` 分页参数，响应增加 `total/has_more/next_offset`
- 变更：`GET /schedules/web-collect` 新增 `limit/offset` 分页参数，响应增加 `total/has_more/next_offset`
- 变更：文档中的规则/调度更新与删除方法统一为 POST 路由（与实际实现一致）
- 变更：`POST /import` 权限从 `etl:run` 修正为 `etl:create`（与 `POST /collect/web` 对齐）
- 优化：表存在性检查增加进程级缓存，避免每次请求查 DB
