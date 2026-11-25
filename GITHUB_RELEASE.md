# AGY Context Dashboard v1.0.1

## v1.0.1 更新内容

- **底栏自由换色、浅/深色切换与非模态设置面板（[#76](https://github.com/wycocoyu/agy-context-dashboard/issues/76)、[#69](https://github.com/wycocoyu/agy-context-dashboard/pull/69)）**：默认保持原版透明无边框样式与蓝色高缓存命中显示（`>= 70%`），新增停靠在底栏上方的非模态设置弹层，支持 `跟随 / 浅色 / 深色`、高命中 `默认主色 / 语义绿` 切换，以及 `速度 / Token / 配额 / 上下文` 四项独立预设与原生取色器定制（保留告警色覆盖优先级）；并在 `Token · 缓存` 卡片中就地保留与设置面板双向同步的「底栏显示命中率」快捷开关。
- **主输入框宽度保护与极简折叠模式（[#72](https://github.com/wycocoyu/agy-context-dashboard/issues/72)、[#84](https://github.com/wycocoyu/agy-context-dashboard/pull/84)）**：优先保留主对话模型选择器宽度避免文字截断，通过 `compact-text` 中间档平滑收敛并新增持久化的 `完整 / 极简` 状态条收起开关。
- **热力图、配置下钻与 Remote SSH 适配（[#63](https://github.com/wycocoyu/agy-context-dashboard/issues/63)、[#64](https://github.com/wycocoyu/agy-context-dashboard/issues/64)、[#65](https://github.com/wycocoyu/agy-context-dashboard/issues/65)、[#66](https://github.com/wycocoyu/agy-context-dashboard/issues/66)、[#74](https://github.com/wycocoyu/agy-context-dashboard/pull/74)）**：统一 `Token · 缓存` 四视图结构，重做 Insights 正方形活动热力图与日期筛选、升级侧栏用量热力图响应式窗口与规则/技能配置下钻，并支持 Remote SSH 回环桥接与降级提示。

## 安装与升级

- **桌面端扩展包**：下载 `antigrative-dashboard-1.0.1.zip`，运行 `python3 manage.py install` 或 `python3 manage.py upgrade`（详情见 [README.md](README.md)）。
- **IDE 扩展包**：下载 `antigrative-dashboard-ide-1.0.1.vsix`，在 IDE 扩展视图选择「从 VSIX 安装」。

---

## What changed in v1.0.1

- **Per-item bar colors, polarity toggle & non-modal settings ([#76](https://github.com/wycocoyu/agy-context-dashboard/issues/76), [#69](https://github.com/wycocoyu/agy-context-dashboard/pull/69))**: Keeps the default borderless inline bar and accent-blue high cache-hit rate (`>= 70%`), adds a non-modal Settings popover anchored above the bar (`auto / light / dark`, high-hit accent/semantic toggle, and independent `default` + preset swatches + color pickers for `Speed`, `Token`, `Quota`, and `Context` while preserving warning/danger overrides), and keeps a synced quick inline cache-hit toggle inside the `Token · Cache` card.
- **Model selector width guard & minimal strip collapse ([#72](https://github.com/wycocoyu/agy-context-dashboard/issues/72), [#84](https://github.com/wycocoyu/agy-context-dashboard/pull/84))**: Protects the main composer model selector from truncation via a `compact-text` tier before falling back to icons, and adds a persisted `full / minimal` collapse toggle.
- **Heatmaps, config drilldown & Remote SSH ([#63](https://github.com/wycocoyu/agy-context-dashboard/issues/63), [#64](https://github.com/wycocoyu/agy-context-dashboard/issues/64), [#65](https://github.com/wycocoyu/agy-context-dashboard/issues/65), [#66](https://github.com/wycocoyu/agy-context-dashboard/issues/66), [#74](https://github.com/wycocoyu/agy-context-dashboard/pull/74))**: Unified `Token · Cache` IA labels, redesigned square Insights heatmap with date filtering, responsive sidebar usage heatmap windowing, rules & skills drilldown polish, and Remote SSH telemetry + fallback bridge.

## Install or update

- **Desktop App bundle**: Download `antigrative-dashboard-1.0.1.zip` and run `python3 manage.py install` or `python3 manage.py upgrade` (see [README.en.md](README.en.md)).
- **IDE extension**: Download `antigrative-dashboard-ide-1.0.1.vsix` and choose **Install from VSIX…** in the IDE Extensions view.
