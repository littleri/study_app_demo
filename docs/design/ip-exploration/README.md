# 云朵 IP 设计与接入记录

本目录保留角色探索、最终三视图、生成提示词和接入后的界面总览。图像由 Codex 内置 ImageGen 生成，透明素材保留 alpha 通道。

## 角色与风格

- `app-icon-cloud-3d-poses-v1.png`：早期 3D 姿态探索。
- `app-icon-cloud-sticker-v1.png`：用户确认的蓝色云朵贴纸风，深色圆润描边、浅蓝云团、粉色腮红及偏移硬阴影。
- `cloud-sticker-three-views-v1.png`：同风格正面、侧面和背面探索；提示词见同名 `.prompt.txt`。

## 正式素材

运行时文件统一位于 `public/assets/brand/`，本目录不重复存放其透明 PNG 副本。

| 场景 | 正式文件 |
| --- | --- |
| 暂无课程 | `empty-states/no-courses-v1.png` |
| 暂无笔记 | `empty-states/no-notes-v1.png` |
| 搜索无结果 | `empty-states/no-results-v1.png` |
| 首次课程列表加载失败 | `empty-states/connection-error-v1.png` |
| AI 入口左右静止 | `ai-assistant/idle-right-v1.png`、`idle-left-v1.png` |
| AI 入口按下 / 拖动 | `ai-assistant/pressed-v1.png`、`dragging-v1.png` |
| AI 题头和消息头像 | `ai-assistant/avatar-v1.png` |

四张缺省状态图含浅蓝椭圆阴影，按已确认预览的 90% 尺寸显示。AI 入口有静止、按下、拖动三种交互状态；结合左右停靠形成六种组合，左侧按下和拖动通过 CSS 镜像显示。弹窗展开和收起复用拖动图。

## 提示词与界面证据

- `empty-states-v1/`：四张白底原图及 `generation-prompts.json`。
- `ai-chat-icon-preview-v1/generation-prompt.txt`：AI 通用头像提示词。
- `ai-chat-states-preview-v1/states-and-prompts.json`：入口状态盘点及各状态提示词。
- `integrated-v1/four-scenes-preview-overview.png`：缺省页接入效果；同目录下 `tablet/`、`landscape/` 保存对应视口总览。
- `ai-chat-integrated-v1/six-states-screenshot-overview.png`：六种入口组合的接入效果。
- `ai-chat-integrated-v1/dialog-states-screenshot-overview.png`：弹窗初始、等待回复、正常回复的接入效果；对话使用本地演示内容。

原始单页截图、打包下载文件、内嵌图片的 HTML 和临时渲染脚本保留在本地并由 `.gitignore` 排除。正式交互回归位于 `e2e/lesson-ai-chat.spec.ts`，覆盖素材加载、拖动吸附、对话操作和跨底部标签页保留位置（包括进入“我的”后再返回）。
