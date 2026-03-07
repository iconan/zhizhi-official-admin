---
description: IAM 前端空白页问题与修复总结
---

# IAM 前端空白页问题与修复总结

## 现象
- 访问任意菜单正常；进入 IAM 业务菜单后，再切换到其它菜单出现页面空白。
- 浏览器控制台报错示例：
  - `Cannot read properties of null (reading 'component')`
  - `Cannot access 'onActionClick' before initialization`

## 根因分析
1. **菜单数据包含 component: null**
   - 后端返回的菜单列表中存在 `component` 为空的节点，动态路由生成时访问空值触发异常，导致整站渲染中断。
2. **Temporal Dead Zone (TDZ) 用法错误**
   - 多个 IAM 页使用 `getColumns(onActionClick)` 创建表格列，但 `onActionClick` 在后面才定义，属于 TDZ 访问，进入页面即抛出 `Cannot access 'onActionClick' before initialization`，同样导致页面崩溃并影响后续路由渲染。

## 修复措施
1. **菜单数据清洗（防御后端空 component）**
   - 位置：`playground/src/router/access.ts`
   - 在 `fetchMenuListAsync` 中对返回菜单递归清洗，若 `component == null` 则删除该字段，避免动态 import 读取空值。

2. **调整 onActionClick 定义顺序，消除 TDZ**
   - 角色管理：`playground/src/views/iam/role/list.vue`
   - 组织管理：`playground/src/views/iam/org/list.vue`
   - 用户管理：`playground/src/views/iam/user/list.vue`
   - 权限点管理：`playground/src/views/iam/permission/list.vue`
   - 统一做法：先定义 `onActionClick`，再定义 `getColumns(onActionClick)`，最后初始化 `useVbenVxeGrid`。

## 预防建议
- 后端菜单接口：尽量不返回 `component: null`；目录/按钮类节点可省略该字段。
- 前端页面：避免在同一作用域先使用再声明（TDZ）。表格列/回调依赖的函数、常量务必提前定义。
- 出现白屏时，优先查看浏览器控制台堆栈，关注未捕获异常与动态 import 失败信息。

## 相关文件
- 菜单清洗：`playground/src/router/access.ts`
- 角色页：`playground/src/views/iam/role/list.vue`
- 组织页：`playground/src/views/iam/org/list.vue`
- 用户页：`playground/src/views/iam/user/list.vue`
- 权限点页：`playground/src/views/iam/permission/list.vue`
