# 业务模块权限编码汇总文档

> **文档说明**：zhizhi-official-admin 系统 RBAC 权限编码完整参考手册
> 
> **文档版本**: v2.0 | **更新日期**: 2026-04-05

---

## 目录

- [一、权限编码规范](#一权限编码规范)
- [二、权限编码总览](#二权限编码总览)
- [三、模块权限详情](#三模块权限详情)
- [四、后台管理操作](#四后台管理操作)
- [五、技术参考](#五技术参考)

---

## 一、权限编码规范

### 1.1 编码格式

```
{资源域}:{动作}                    → 示例: admin_menu:read
{资源域}:{子资源}:{动作}            → 示例: etl:schedule:run
```

### 1.2 动作类型

| 动作 | 含义 | 使用场景 |
|-----|------|---------|
| `read` | 查看/读取 | 列表页、详情页 |
| `create` | 创建 | 新增按钮 |
| `update` | 更新 | 编辑按钮 |
| `delete` | 删除 | 删除按钮 |
| `mutate` | 变更（增删改合一） | 简化场景 |
| `control` | 控制 | 启动/停止/重试 |
| `run` | 执行 | 手动触发 |

### 1.3 特殊编码

| 编码 | 说明 |
|-----|------|
| `*` | 超级权限，拥有所有权限 |

---

## 二、权限编码总览

### 2.1 统计概览

| 模块 | 数量 | 资源域 |
|-----|------|-------|
| 租户管理 | 3 | `tenant` |
| IAM-身份管理 | 20 | `org`, `admin_user`, `rbac_role`, `rbac_permission`, `admin_menu` |
| 区域管理 | 4 | `region` |
| ETL-数据采集 | 12 | `etl:job`, `etl:schedule`, `etl:rule`, `etl:article` |
| **合计** | **39** | — |

### 2.2 树形索引

```
租户管理
└── tenant:create, tenant:read, tenant:update

IAM 身份与访问管理
├── 组织管理
│   └── org:read, org:create, org:update, org:delete
├── 用户管理
│   └── admin_user:read, admin_user:create, admin_user:update, admin_user:delete
├── 角色管理
│   └── rbac_role:read, rbac_role:create, rbac_role:update, rbac_role:delete
├── 权限点管理
│   └── rbac_permission:read, rbac_permission:create, rbac_permission:update, rbac_permission:delete
└── 菜单管理
    └── admin_menu:read, admin_menu:create, admin_menu:update, admin_menu:delete

区域管理
└── region:read, region:create, region:update, region:delete

ETL 数据采集
├── 任务管理
│   └── etl:job:read, etl:job:create, etl:job:control
├── 定时采集
│   └── etl:schedule:read, etl:schedule:create, etl:schedule:update, etl:schedule:delete, etl:schedule:run
├── 抽取规则
│   └── etl:rule:read, etl:rule:mutate
└── 文章管理
    └── etl:article:read, etl:article:update
```

---

## 三、模块权限详情

### 3.1 租户管理

| 权限编码 | 名称 | 后端接口 |
|---------|------|---------|
| `tenant:create` | 创建租户 | `POST /v1/admin/tenants` |
| `tenant:read` | 查看租户 | `GET /v1/admin/tenants` |
| `tenant:update` | 更新租户 | `PUT /v1/admin/tenants/{id}` |

---

### 3.2 IAM - 组织管理

| 权限编码 | 名称 | 后端接口 |
|---------|------|---------|
| `org:read` | 查看组织 | `GET /v1/admin/iam/orgs` |
| `org:create` | 创建组织 | `POST /v1/admin/iam/orgs` |
| `org:update` | 更新组织 | `PUT /v1/admin/iam/orgs/{id}` |
| `org:delete` | 删除组织 | `DELETE /v1/admin/iam/orgs/{id}` |

---

### 3.3 IAM - 管理员用户

| 权限编码 | 名称 | 后端接口 |
|---------|------|---------|
| `admin_user:read` | 查看管理员 | `GET /v1/admin/iam/users` |
| `admin_user:create` | 创建管理员 | `POST /v1/admin/iam/users` |
| `admin_user:update` | 更新管理员 | `PUT /v1/admin/iam/users/{id}` |
| `admin_user:delete` | 删除管理员 | `DELETE /v1/admin/iam/users/{id}` |

---

### 3.4 IAM - RBAC 角色管理

| 权限编码 | 名称 | 后端接口 |
|---------|------|---------|
| `rbac_role:read` | 查看角色 | `GET /v1/admin/iam/roles` |
| `rbac_role:create` | 创建角色 | `POST /v1/admin/iam/roles` |
| `rbac_role:update` | 更新角色 | `PUT /v1/admin/iam/roles/{id}` |
| `rbac_role:delete` | 删除角色 | `DELETE /v1/admin/iam/roles/{id}` |

---

### 3.5 IAM - RBAC 权限点管理

| 权限编码 | 名称 | 后端接口 |
|---------|------|---------|
| `rbac_permission:read` | 查看权限点 | `GET /v1/admin/iam/permissions` |
| `rbac_permission:create` | 创建权限点 | `POST /v1/admin/iam/permissions` |
| `rbac_permission:update` | 更新权限点 | `PUT /v1/admin/iam/permissions/{id}` |
| `rbac_permission:delete` | 删除权限点 | `DELETE /v1/admin/iam/permissions/{id}` |

---

### 3.6 IAM - 菜单管理

| 权限编码 | 名称 | 后端接口 |
|---------|------|---------|
| `admin_menu:read` | 查看菜单 | `GET /v1/admin/iam/menus` |
| `admin_menu:create` | 创建菜单 | `POST /v1/admin/iam/menus` |
| `admin_menu:update` | 更新菜单 | `PUT /v1/admin/iam/menus/{id}` |
| `admin_menu:delete` | 删除菜单 | `DELETE /v1/admin/iam/menus/{id}` |

---

### 3.7 区域管理

| 权限编码 | 名称 | 后端接口 |
|---------|------|---------|
| `region:read` | 查看区域 | `GET /v1/admin/regions` |
| `region:create` | 创建区域 | `POST /v1/admin/regions` |
| `region:update` | 更新区域 | `PUT /v1/admin/regions/{id}` |
| `region:delete` | 删除区域 | `DELETE /v1/admin/regions/{id}` |

---

### 3.8 ETL - 任务管理

| 权限编码 | 名称 | 后端接口 |
|---------|------|---------|
| `etl:job:read` | 查看任务 | `GET /v1/admin/etl/jobs` |
| `etl:job:create` | 创建任务 | `POST /v1/admin/etl/collect/web` |
| `etl:job:control` | 控制任务 | `POST /v1/admin/etl/jobs/{id}/cancel`, `replay` |

---

### 3.9 ETL - 定时采集

| 权限编码 | 名称 | 后端接口 |
|---------|------|---------|
| `etl:schedule:read` | 查看定时任务 | `GET /v1/admin/etl/schedules` |
| `etl:schedule:create` | 创建定时任务 | `POST /v1/admin/etl/schedules` |
| `etl:schedule:update` | 更新定时任务 | `PUT /v1/admin/etl/schedules/{id}` |
| `etl:schedule:delete` | 删除定时任务 | `DELETE /v1/admin/etl/schedules/{id}` |
| `etl:schedule:run` | 立即执行 | `POST /v1/admin/etl/schedules/{id}/trigger` |

---

### 3.10 ETL - 抽取规则

| 权限编码 | 名称 | 后端接口 |
|---------|------|---------|
| `etl:rule:read` | 查看规则 | `GET /v1/admin/etl/rules` |
| `etl:rule:mutate` | 管理规则 | `POST/PUT/DELETE /v1/admin/etl/rules` |

---

### 3.11 ETL - 文章管理

| 权限编码 | 名称 | 后端接口 |
|---------|------|---------|
| `etl:article:read` | 查看文章 | `GET /v1/admin/etl/articles` |
| `etl:article:update` | 更新文章 | `PUT /v1/admin/etl/articles/{id}` |

---

## 四、后台管理操作

### 4.1 操作步骤

1. **进入菜单管理** — 导航：系统管理 > 菜单管理
2. **编辑菜单项** — 找到菜单，点击「编辑」
3. **填写权限编码** — 在「权限编码」字段填入对应编码
4. **保存并验证** — 创建测试角色验证权限控制

### 4.2 菜单权限编码对照表

#### IAM 模块

| 菜单名称 | 菜单编码 | 应填权限编码 | 类型 |
|---------|---------|-------------|------|
| 菜单管理 | iam.menu | `admin_menu:read` | 页面 |
| 角色管理 | iam.role | `rbac_role:read` | 页面 |
| 组织管理 | iam.org | `org:read` | 页面 |
| 用户管理 | iam.user | `admin_user:read` | 页面 |
| 权限点管理 | iam.permission | `rbac_permission:read` | 页面 |
| 租户管理 | iam.tenant | `tenant:read` | 页面 |

#### ETL 模块

| 菜单名称 | 菜单编码 | 应填权限编码 | 类型 |
|---------|---------|-------------|------|
| 任务管理 | etl.tasks | `etl:job:read` | 页面 |
| 抽取规则 | etl.rules | `etl:rule:read` | 页面 |
| 定时采集 | etl.schedules | `etl:schedule:read` | 页面 |

#### 运营管理

| 菜单名称 | 菜单编码 | 应填权限编码 | 类型 |
|---------|---------|-------------|------|
| 行政区域管理 | om.regions | `region:read` | 页面 |

### 4.3 菜单类型规则

| 类型 | 权限编码 | 说明 |
|-----|---------|------|
| 目录 | 留空 | 继承子菜单权限 |
| 页面 | `xxx:read` | 查看权限 |
| 按钮 | `xxx:create/update/delete` | 操作权限 |

---

## 五、技术参考

### 5.1 后端权限校验示例

```python
from app.api.deps.admin_auth import require_admin_permission
from fastapi import Depends

etl_job_read_guard = Depends(require_admin_permission("etl:job:read"))

@router.get("/jobs")
async def list_jobs(_: None = etl_job_read_guard):
    return {"jobs": []}
```

### 5.2 相关文件位置

| 文件 | 说明 |
|-----|------|
| `/app/api/v1/handlers/admin/iam.py` | IAM 权限定义 |
| `/app/api/v1/handlers/admin/etl.py` | ETL 权限定义 |
| `/app/api/v1/handlers/admin/regions.py` | 区域权限定义 |
| `/app/api/v1/handlers/admin/tenants.py` | 租户权限定义 |
| `/app/api/deps/admin_auth.py` | 权限校验装饰器 |
| `/app/services/admin/auth/rbac.py` | RBAC 校验逻辑 |

---

*文档结束*
