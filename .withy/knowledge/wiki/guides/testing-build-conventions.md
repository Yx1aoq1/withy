---
id: testing-build-conventions
title: 测试组织与构建配置约定
kind: spec
tags: [tooling, testing, build, monorepo, vitest, tsconfig]
summary: 三包统一 vitest;测试放 tests/ 镜像 src/;vitest include 锁 tests/;tsconfig 不在 typecheck 配置设 rootDir(避 TS6059),rootDir 只留 build 配置以保 dist 无测试;Prettier 忽略 .withy/ 与 *.md(数据/文稿非源码,且会重排 CJK 表格)。
inject: index
injectByDefault: false
sources: []
updated: 2026-06-20
---

# 测试组织与构建配置约定

> 定位:贡献者约定。本仓 `packages/{core,cli,app}` 统一的测试摆放与 TS/vitest 配置规则,以及踩过的两个坑。源于 core 分层重构([[core]])一并整顿。

## 1. 测试统一 vitest

三包(`@withy/core`、`@withy/cli`、`@withy/app`)的 `test` 脚本一律 `vitest run`。cli 历史上用 `node:test`(`tsx --test`),已迁出——断言从 `node:assert` 的 `assert.equal/deepEqual` 改写为 vitest 的 `expect().toBe()/toEqual()`。新增测试一律 `describe/it/expect`,不要再引入 `node:test`。

## 2. 测试放 `tests/` 镜像 `src/`

每包的 `*.test.ts` **全部移出 `src/`**,落在 `packages/<pkg>/tests/` 下、按 `src/` 的目录结构镜像(如 `src/workflow/interpret.ts` 的测试在 `tests/workflow/interpret.test.ts`,`store.ts` 拆分后 `tests/store/…`)。这样:

- `src/` 干净,`find packages/*/src -name '*.test.ts'` 应为空。
- 构建产物 `dist/` 永不含测试(配合下文 build 配置)。

测试 import 业务代码用相对路径回到 `src/`(`../../src/<…>.js`);测内部、未在门面导出的符号时尤其必要(如 core 的 `assertInsideWiki`、store 的 `writeWikiFile`),它们不从 `@withy/core` 导出,只能相对 import。

## 3. vitest 必须显式 `include: ['tests/**/*.test.ts']`(坑①)

每包加 `vitest.config.ts` 显式锁定发现范围:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
```

**坑**:不设 `include` 时,vitest 默认会扫到编译产物 `dist/**/*.test.js`(若 dist 里残留过测试),把它们当成「空 suite」直接报 `No test suite found` 失败。锁 `tests/**` 即根治。app 额外保留 `exclude: ['**/.next/**']`(Next standalone 会复制 src)。

## 4. tsconfig:`rootDir` 只放 build 配置,别放 typecheck 配置(坑②)

- `tsconfig.json`(typecheck,`noEmit`)`include` 同时含 `src/**/*.ts` 与 `tests/**/*.ts`,让类型检查覆盖测试;**但绝不能设 `rootDir: 'src'`**。
- `tsconfig.build.json` 才设 `rootDir: 'src'`,且 `include` 只含 `src/**/*.ts`,从而 `dist/` 不含测试、目录结构干净。

**坑**:即便 `noEmit: true`,只要 typecheck 的 tsconfig 设了 `rootDir: 'src'`,把 `tests/**`(在 `src/` 之外)纳入 `include` 就会触发 `TS6059: File '…/tests/x.test.ts' is not under rootDir '…/src'`。把 `rootDir` 从 typecheck 配置移除、仅保留在 `tsconfig.build.json`,两边各取所需:typecheck 覆盖 tests、build 产物无 tests。

## 5. Prettier 校验范围:忽略 `.withy/` 与 `*.md`

`.prettierignore` 排除 **`.withy/`**(运行时/任务/知识数据,由程序或 agent 写,非手写源码)与 **所有 `*.md`**(作者文稿;且 Prettier 按字符宽度重排中文表格的列对齐——无意义,在不同编辑器下还不稳定)。

**坑**:`.husky/pre-commit` 跑全仓 `pnpm format:check`,所以这两类内容此前会把**与本次改动无关的提交**也卡住(报一堆 `.withy/**` 与中文 md 的格式 warning)。忽略后 format:check 只校验真正的源码(`.ts`/`.json` 等);源码侧的 md(如 packages 下 README)若需校验,再在 `.prettierignore` 收窄规则即可。唯一该管的源码格式债(如超 `printWidth` 的一行 export)仍照修,不靠忽略源码糊弄。

## 验收(重构后长期成立)

- `find packages/*/src -name '*.test.ts'` 无输出。
- `pnpm -r test` 三包均经 vitest 通过;`packages/cli/package.json` 无 `tsx --test`。
- `pnpm -r build` 后任一 `dist/` 无 `*.test.*`。
- `pnpm typecheck` 覆盖 `tests/` 且通过;`pnpm lint --max-warnings=0` 通过。

## 关联页

- [[core]] —— 同轮把 `@withy/core` 重组为 store/业务/装配分层,测试整顿与之同批落地。
