# 兼容性与验证范围

| 系统 | 安装 / 后台发现 | 验证范围 |
| --- | --- | --- |
| Windows | Python / PowerShell，CIM 筛选 standalone + 单次 netstat PID 所属监听端口 | Windows 11 / 桌面 App 2.21.1、2.22.0；真实对话上下文、合并悬浮卡已实机验证并验收；CI 生命周期与数据测试 |
| Linux | Python3 / POSIX shell，当前用户 `/proc` + TCP/TCP6 socket inode | Ubuntu CI 原生端口测试、安装生命周期、官方 2.21.1 资源与 SDK 检查；完整登录 App GUI 待用户实机验证 |
| macOS | Python3 / POSIX shell，当前用户 `ps` + `lsof` PID 所属端口 | macOS CI 原生端口测试、安装生命周期、官方 2.21.1 资源与 SDK 检查；完整登录 App GUI 待用户实机验证 |

上表面向 **Antigravity 桌面 App 2.21.1 / 2.22.0**。CLI 使用独立 statusLine 适配；v0.7.0 新增自带 IDE 的独立 VSIX。VS Code、Visual Studio、JetBrains、Zed、Xcode 中的 Antigravity 扩展以及 iOS 尚未兼容。Linux/macOS 官方资源检查固定为桌面 App 2.21.1，不等同于验证 IDE 或其 2.22.0 登录界面。
Python 3.10+ 仅用于生命周期，无 pip 依赖；后台使用宿主 Node，内嵌桥接需原生 WebSocket，建议 Node 24。Linux/macOS 架构跟随宿主，不分发平台二进制。官方系统要求见 [Antigravity 下载页](https://antigravity.google/download)。

2026-10-28 补充：Windows 11 / 桌面 App **2.28.0** 已实机验证修复后的单份控件、历史会话速率／Token／上下文恢复、详情卡、用量窗口、额度和会话往返切换。延迟回调与重复挂载的浏览器回归纳入三系统 CI；这不等同于 Linux/macOS 2.28.0 或新版独立 IDE 的登录后实机验收。安装后需要完整退出并重开宿主一次。

2026-11-24 / **v1.0.1**（[`#76`](https://github.com/wycocoyu/agy-context-dashboard/issues/76)、[`#69`](https://github.com/wycocoyu/agy-context-dashboard/pull/69)、[`#84`](https://github.com/wycocoyu/agy-context-dashboard/pull/84)、[`#72`](https://github.com/wycocoyu/agy-context-dashboard/issues/72)、[`#81`](https://github.com/wycocoyu/agy-context-dashboard/pull/81)、[`#75`](https://github.com/wycocoyu/agy-context-dashboard/pull/75)、[`#74`](https://github.com/wycocoyu/agy-context-dashboard/pull/74)）：保留原版透明底栏与默认蓝调高命中样式，新增无遮罩悬浮设置面板（浅/深色模式、4 项底栏指标独立调色/还原默认、高命中配色切换）及缓存卡片双向同步开关，合入主输入框模型选择框防截断与极简收起模式、重做 Insights / 用量热力图及 Remote SSH 桥接兼容。桌面 App `2.35.0` macOS 实机已核验底栏透明样式、上下文圆环渐变与双端同步开关，三系统完整流水线由 Release CI 执行校验。

2026-11-23 / **v1.0.0**（[`#60`](https://github.com/wycocoyu/agy-context-dashboard/issues/60)、[`#53`](https://github.com/wycocoyu/agy-context-dashboard/issues/53)、[`#57`](https://github.com/wycocoyu/agy-context-dashboard/issues/57)、[`#61`](https://github.com/wycocoyu/agy-context-dashboard/issues/61)）：上线底栏指标自定义（显隐开关、拖拽与 `↑`/`↓` 排序、Context 圆环三态标签及底部防锁死入口）、上下文轮次与 5 分类步数抽屉、Orchestrator Planner/Executor 拆分与双行 Swarm 名单筛选、用量图表细节与中文展示优化。支持桌面 App `2.34.0+` 与独立 IDE `0.9.x/1.0.x` 保持兼容，不改变宿主权限与凭据机制。

2026-11-22 / **v0.9.9**（[`#46`](https://github.com/wycocoyu/agy-context-dashboard/issues/46)、[`#50`](https://github.com/wycocoyu/agy-context-dashboard/pull/50)、[`#52`](https://github.com/wycocoyu/agy-context-dashboard/issues/52)、[`#55`](https://github.com/wycocoyu/agy-context-dashboard/pull/55)）：修复 macOS 桌面端从 GUI 启动缺少 Homebrew `PATH` 导致应用内「检查更新」误命中 `/usr/bin/python3`（3.9.6）的问题（回退探测 `/opt/homebrew/bin`、`/usr/local/bin` 的 `python3` 与 `python3.14`–`python3.10` 及官方 Framework 路径）；合入 Windows 注册表/OneDrive 重定向桌面快捷方式发现与重拉失败 10 分钟退避保护。不改变宿主兼容矩阵。

2026-11-22 / **v0.9.8**（[`#16`](https://github.com/wycocoyu/agy-context-dashboard/issues/16)、[`#24`](https://github.com/wycocoyu/agy-context-dashboard/issues/24)、[`#28`](https://github.com/wycocoyu/agy-context-dashboard/issues/28)、[`#29`](https://github.com/wycocoyu/agy-context-dashboard/issues/29)、[`#34`](https://github.com/wycocoyu/agy-context-dashboard/issues/34)、[`#43`](https://github.com/wycocoyu/agy-context-dashboard/issues/43)、[`#44`](https://github.com/wycocoyu/agy-context-dashboard/issues/44)）：新增四视图顶层导航（将「每日/每周活动」「按模型用量」置顶），上线宿主上下文构成拆解、压缩趋势、会话审计、USD 费用估算与跨会话全局洞察；新增 `2.34.0` 多代理额度汇总与 `cacheMissSurges` 零缓存断崖计数、按模型缓存命中率列、三语显式「缓存命中率：」胶囊标识、无侵入可切宿主简体中文界面与 192 MiB 内存溢出防护；修复空元数据与 SQLite WAL 重试引发的误报「部分记录暂不可读取」。macOS 桌面 App `2.34.0` 已实机验证内嵌栏挂载与活体上下文/缓存展示；独立 IDE 与 Windows 11 全套自动化套件通过，IDE 登录态 GUI 仍待实机验收。

2026-11-20 / **v0.9.7**（[`#32`](https://github.com/wycocoyu/agy-context-dashboard/issues/32)）：新增非侵入式更新提醒——后台静默检查新版本（启动时 + 每 `6` 小时，与手动检查去重），内嵌栏上下文胶囊绿点与详情弹窗绿色版本徽标（已是最新自动隐藏），更新说明圆点化并附「完整说明 ↗」；修复页脚 GitHub 仓库 SVG 在 IDE Trusted Types 下的渲染。不改变宿主兼容矩阵，`2.33.x` / `2.34.0+` 凭据机制兼容保持不变。

2026-11-20 / **v0.9.6**：适配 **Antigravity 桌面 App 2.34.0+** 取消 `language_server` 命令行 `--csrf_token` 参数的机制变更（新增 `resolveDaemonCredential` 从 `~/.gemini/<appDataDir>/daemon/*.json` 按 PID 与实时端口校验回落读取，兼容 `<= 2.33.x`），并在 macOS Antigravity `2.34.0` 实机验证恢复内嵌栏（`dot live`）与真实额度拉取；同步合入上下文压缩次数（`🗜`）、`>= 75%` / `>= 90%` 警戒变色、`verifyCachedServer` 租约保活、`discoveryCommandError` 报错脱敏及 `#quota-error` 单栏提示去重。

2026-11-18 / **v0.9.5**（[`#19`](https://github.com/wycocoyu/agy-context-dashboard/issues/19)、[`#20`](https://github.com/wycocoyu/agy-context-dashboard/pull/20)）：合并上游 `v0.9.2`–`v0.9.5` 性能优化与启动入口自愈，并加固 **Antigravity 桌面 App 2.33.0+** 默认自动恢复逻辑：
- 合并上游轻量历史补录与内存优化（`GetCascadeTrajectoryGeneratorMetadata({ includeMessages: false })`、过滤孤儿 `brain/<id>`、已稳定空库标记完成、`GetAllCascadeTrajectories` 摘要缓存、HTTP 200 免重扫、日志尾部 `256 KiB` 逆向分块读取、SDK `2 MiB` 分块扫描、主采集器 `--max-old-space-size=192`，以及 `v0.9.3`–`v0.9.4` Windows CI 稳定性修复）；
- 合并上游 Windows `.lnk` 快捷方式与 Linux `~/.local/share/applications/antigravity.desktop` 自动写入及运行期自愈（`compat/launch_config.py`、`compat/launch-config.mjs` 与 `inspectHostArchive`），并在 `uninstall` / `--panel-only` 时仅撤回受管参数；
- 保留本仓全部适配并把内嵌模式 `autoRelaunchDebug` 改为**默认开启（可取消勾选关闭）**：限 Sidecar 启动后前 `20` 秒内最多自动调度 `1` 次重拉（绝不半路杀窗），同 PID 永不重拉、不同 PID 在 `60` 秒滑窗内最多放行 `2` 次（间距 `>= 5` 秒防死循环），并在 `HELPER_OR_NON_MAIN` 中排除 `--headless` 进程；同时在 `README.md` / `README.en.md` 顶部置顶机制说明。

2026-11-17 / **v0.9.2**（[`#17`](https://github.com/wycocoyu/agy-context-dashboard/issues/17)、[`#18`](https://github.com/wycocoyu/agy-context-dashboard/pull/18)）：针对 **Antigravity 桌面 App 2.33.0+** 默认关闭渲染器远程调试端口并在无参启动时删除 `<profile>/DevToolsActivePort`、且常规 Dock/快捷方式及 `autoUpdater.quitAndInstall()` 自动更新重启会丢弃命令行参数的机制变化，在不修改受 `ElectronAsarIntegrity` 与 Hardened Runtime 保护的 `app.asar` 前提下新增：
- 可选调试启动器生命周期：`python3 manage.py install --with-launcher`、`install-launcher`、`uninstall-launcher` 与 `launch [--relaunch]`（传入 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`），生成 macOS `~/Applications/Antigravity (Debug).app`、Windows `%LOCALAPPDATA%\AntigravityPulse\Launch Antigravity (Debug).cmd`、Linux `~/.local/share/applications/antigravity-pulse-debug.desktop`；
- `missing-debug-port` 精准诊断（`compat/runtime-ui.mjs`、`manage.py status` 与原生侧边栏面板），侧边栏（**＋ → Extensions → Antigrative Dashboard**）支持一键调试重开（等待旧主进程 PID 全部退出后再拉起）及 `autoRelaunchDebug` 开关（60 秒冷却防重入；`v0.9.2` 默认关闭，`v0.9.3` 起改为默认开启）。

2026-11-16 / **v0.9.1**：合入上游 `v0.9.1` 更新（[`#14`](https://github.com/wycocoyu/agy-context-dashboard/issues/14)）：新增额度消耗速率预测与周期 Token 参考估算、`minimal` / `cat` 双样式速度卡片、用量弹窗「本机全部 / 当前账号」切换与未登录本地记账、多输入框多实例 + React Fiber 会话 ID 回退、宿主字体同步，以及完整 Antigravity IDE `2.6.0`（`agy --hub` + `jetski-frame` 嵌套 Webview）支持；同时完整保留 `v0.8.13`–`v0.8.16` 全部新模型识别、`language_server.native` 与 `agy 1.5.x` CLI 适配。

2026-11-15 / **v0.8.16**：新增 Claude 4.5（`200K`）与 Claude 4.6–5.5（`1M`）上下文参考、跨端 `word/` / `@` 日期标签 / `perplexity/*` 模型归一化、统一 `3p` `Claude` 额度标签，并将 CLI `statusLine` 对齐至 `Argon` 周额度、`agy 1.5.x` 缓存口径与 `install --with-cli` 版本同步校验（`#3`、`#4`、`#6`、`#7`）；macOS 桌面 App `2.32.1` 重启后已实测 `sidecar` 在线挂载（`mounted` / `live`）与本地接口统计，`agy 1.5.9` 已通过 CLI 生命周期与模型规范化检查，独立 IDE `.vsix` 与 Linux 登录态界面仍待另行实机验收。

2026-11-14 / **v0.8.15**：合入上游 `v0.8.20` 优化（`node:sqlite` 后台流式采集与磁盘 `usage-v1` 账本、`Argon` 周额度独立分组、子代理标签页隔离、更新器 `DirectoryAnchor` 与 Windows 端口探测加固、侧栏版本号显示），保留 `v0.8.13`–`v0.8.14` 全部特性与 `wycocoyu/agy-context-dashboard` 身份。

2026-11-13 / **v0.8.14**：社区接续仓库更名为 `wycocoyu/agy-context-dashboard`，同步调整 `update-worker.py`、IDE 包元数据及安装文档链接；保持本地插件目录 `antigravity-pulse`、历史数据路径及安装包文件名完全向后兼容。

2026-11-13 / **v0.8.13**：社区接续维护版本（`wycocoyu/antigrative-dashboard`）：将应用内更新源切至新仓、macOS 进程发现兼容 `language_server.native`、新增 Gemini 4（`Hydrogen` / `Argon` / `Carbon`）与 `GPT-6.1 Sol` 模型识别及 1M+ 官方上下文参考（主占比继续严格以宿主下发 `maxContextTokens` 为准）。macOS 本地运行：`npm test` 335 项全过、`ide/tests` 11 项全过、Python `unittest` 82 项（80 通过、2 跳过），并完成打包白名单校验。

2026-10-29 / **v0.8.12**：App 与独立 IDE 共用有限历史队列、显式 `usageSync` 门控、同步所有权缓存及异步边界复核。普通轮询、普通卡片刷新和额度重置不启动历史补录；打开「查看用量统计」或点击其右上角「刷新用量」才发起导入。失权后的排队写入在提交前取消；队列／检查点超出预算或记录不可读取时，保留已有统计并报告部分覆盖。

本次本地验证：Node 334 项通过、1 项跳过；Python 81 项通过、1 项跳过（共 82 项）；IDE 11 项通过，相关浏览器回归通过。新版三系统发布 CI 会在发布流程中分别执行，不能将这些本地／浏览器结果视作 Linux/macOS 登录后原生 GUI 已验收。

## Antigravity 自带 IDE

专用包为 `antigrative-dashboard-ide-1.0.0.vsix`，安装入口与桌面 App 独立。
Windows 11 / IDE 2.5.5（VS Code base 1.107.0）与 IDE 2.6.0（`agy --hub` 及嵌套 Agent Webview）已支持并具备完整自动化覆盖；Linux/macOS 登录后的 IDE GUI 仍待实机验收。
Linux/macOS 的 IDE 进程筛选、端口归属、安装打包和 Trusted Types 浏览器 fixture 纳入 CI；登录后的 IDE GUI 仍待实机验收。
当前仅支持默认用户 profile；私有 Preact/DOM 或 RPC 变化可能需要适配，不能保证未来 IDE 版本无需维护。
插件需通过 loopback renderer 端口挂载：完整退出后带 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` 参数启动。普通启动不会自动打开此端口。
不修改应用归档或 CSP，扩展启动／停止后台，并按 profile 协调多窗口所有权。用户数据保存在 IDE 自己的 extension global storage，与桌面 App 的历史和语言设置独立。
完整安装、升级、数据清理与撤回流程见 [ide/README.md](ide/README.md)。

## 安装与自定义位置

Windows：`python manage.py install` / `./install.ps1`（加 `--with-launcher` 一并创建调试启动器）。
Linux/macOS：`python3 manage.py install` / `sh install.sh`（加 `--with-launcher` 一并创建调试启动器）。
启停、状态、卸载与调试启动器管理同样使用 `python3 manage.py <action>`（`install-launcher`、`uninstall-launcher`、`launch [--relaunch]`、`uninstall` 会同时清理本插件创建的调试启动器），或 `sh uninstall.sh`。不要使用 sudo，否则会安装到错误用户目录。

默认查找 Windows 用户安装目录、macOS `/Applications/Antigravity.app` 与 `~/Applications/Antigravity.app`、Linux `/opt/Antigravity`、`/opt/antigravity`、`/usr/share/antigravity`，以及 PATH 中启动器所在目录。
自定义安装：`python3 manage.py install --app-path '/path/to/resources/app.asar'`；安装器记住资源位置供 SDK 发现。
`AG_PULSE_APP_ASAR` 可覆盖生命周期检测位置；`AG_PULSE_PROFILE` 可在安装时指定用户配置目录并保存。
如果宿主省略 SDK 解析与语言服务器路径，可用 `ANTIGRAVITY_AGENTAPI_EXE` 指定其已安装的语言服务器，或 `AG_PULSE_APP_RESOURCES` 指定资源目录。环境变量应传给启动 App 的环境。

语言服务日志：Windows/Linux 默认读取 `<profile>/logs/language_server.log`；macOS 优先读取 `~/Library/Logs/Antigravity/language_server.log`，缺失或不能匹配当前 PID 端口时回退到 profile 日志。`AG_PULSE_LOG` 可显式指定唯一日志位置。回退仍校验当前进程拥有该 HTTP 端口，不连接旧日志中的失效接口。

## 独立用户数据目录

| 内容 | Windows | Linux | macOS |
| --- | --- | --- | --- |
| App profile | `%APPDATA%/Antigravity` | `${XDG_CONFIG_HOME:-~/.config}/Antigravity` | `~/Library/Application Support/Antigravity` |
| 插件设置 | `%LOCALAPPDATA%/AntigravityPulse/settings.json` | `${XDG_DATA_HOME:-~/.local/share}/AntigravityPulse/settings.json` | `~/Library/Application Support/AntigravityPulse/settings.json` |
| 语言选择 | `%LOCALAPPDATA%/AntigravityPulse/preferences.json` | `${XDG_DATA_HOME:-~/.local/share}/AntigravityPulse/preferences.json` | `~/Library/Application Support/AntigravityPulse/preferences.json` |
| 备份 | `%LOCALAPPDATA%/AntigravityPulseBackups` | `${XDG_DATA_HOME:-~/.local/share}/AntigravityPulseBackups` | `~/Library/Application Support/AntigravityPulseBackups` |
| 调试启动器（可选） | `%LOCALAPPDATA%\AntigravityPulse\Launch Antigravity (Debug).cmd` | `~/.local/share/applications/antigravity-pulse-debug.desktop` | `~/Applications/Antigravity (Debug).app` |

三系统插件均在 `~/.gemini/config/plugins/antigravity-pulse`；历史均在 `~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/data/history-v1/<account-hash>/<conversation-id>.json`（宿主可覆盖 data 目录）。
更新、重装、卸载保留统计数据，不保留已卸载的运行代码。设置开关保留其他插件和自定义字段。

## 上下文数值的含义

最近一次 chat model 的 `chatStartMetadata.contextWindowMetadata` 中，`estimatedTokensUsed` 是宿主估计，`maxContextTokens` 是该请求容量。已用 = used/max，剩余不小于零。
这是请求开始时的采样，非会话累计 Token，非实时流式计数。悬停卡明确注明来源、采样模型和历史恢复时间。没有容量就不显示百分比，不通过模型名称猜容量；新模型没有元数据就不沿用旧模型窗口。超过容量的估计显示真实比例并提示，进度环最大填满。压缩后允许下降。

## 更新与失败恢复

默认安装不修改 `resources/app.asar`，由用户插件中的运行时适配器通过宿主现有 loopback 调试通道挂载。每 3 秒重试端口变化、文档替换与窗口重启。只允许 loopback 主 frame，通过受限桥接传递白名单统计。后台凭据仅在内存使用，匹配当前 PID 所属 HTTP 端口。在 Antigravity 桌面 App `2.33.0+` 中，宿主必须带 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` 启动才会写入 `<profile>/DevToolsActivePort`；普通 Dock/快捷方式打开及 `quitAndInstall()` 自动更新重启都会丢弃该参数，此时可通过上述可选调试启动器、`python3 manage.py launch --relaunch` 或侧边栏面板一键重开（以及可选的 `autoRelaunchDebug` 60 秒冷却自动恢复）重建调试会话。

三系统共用同一套合并布局和 V4 桥接协议。每个宿主后台具有独立实例标识与绑定；data 目录中的 `active-sidecar.json` 由新实例原子接管，文件变更通知使旧实例的同步所有权缓存失效，每 2 秒的异步检查作为兜底，确认接管后解绑退出。采集和分页热路径只读取内存布尔值，不反复读取所有权／设置文件；运行边界仍异步复核。启动接管用短期文件锁串行化，异常退出的锁可恢复；不终止无关 PID。退出时只清理自身脚本和绑定，提交前取消旧实例的排队统计写入；已经交给操作系统的原子提交无法撤回。首次从没有接管保护的旧版升级，仍应完全退出宿主并清理已确认的旧插件后台；之后新实例可自动退役旧实例。

内嵌悬浮卡通过浏览器原生 popover 顶层展示，避免输入区层叠上下文导致宿主按钮遮挡；不支持该 API 的旧宿主回退为普通固定定位。

强调色优先跟随宿主当前生效的 `--primary` / `--color-primary`；配置中的 `userSettings.customThemeSeedsDark.primary` 与 `customThemeSeedsLight.primary` 提供深浅主题回退。切换主题或强调色无需重启；上下文环、上下文与额度进度条共用主色，小字号强调文字另行保证可读对比度。后台只传递有效颜色与主题模式，不传递完整配置，也不修改宿主设置。缺失或非法颜色恢复默认配色。

背景与文字同样跟随实际生效的 `--background`、`--popover` / `--card`、`--foreground`；只保存背景 seed 时，从同色系派生卡片、菜单、控件和轨道。配置中仅白名单传递 `background`、`foregroundOverride` 色值作为回退。支持宿主的 color-mix、OKLCH 等有效不透明颜色；文字与背景过于接近时调整对比度，移除颜色后清理旧覆盖值。

v0.5.2 的发布检查在三系统分别运行 Node 数据/路径/后台接管测试、Python 生命周期测试，以及 Chromium 中的主题切换、汉化布局和跨端口语言持久化测试。浏览器使用示意宿主和示例数据；它们不能证明 Linux/macOS 的已登录 App 界面已经实机验收。Windows 本轮修复已在当前真实 App 中验证；Linux/macOS 完整 App GUI 仍待实机确认。

汉化兼容：优先用 `role="combobox"` / `role="textbox"` 与 `contenteditable="true"` 识别输入区，用模型选择器的稳定 `data-testid` 定位；沿 DOM 包含关系找输入区与工具栏的共同父容器，不依赖发送、录音或取消按钮的英文/中文文案。旧版缺少语义属性时保留原英文标识回退。隐藏或存在歧义的候选不随意挂载；宿主若同时改变这些结构或标识，仍可能需要适配。

子代理 / Agent Manager 安全布局（#5）：共同父容器还必须是输入区附近的水平 flex 操作行，应用标题栏、远离输入区的工具栏和不支持的布局不挂载。监控条使用可收缩的有限宽度，不修改宿主模型按钮的 flex 或最小宽度，也不提高条本身的层级。完整内容放不下先保留三个图标，连图标都放不下或与实际可点击控件相交才隐藏并关闭悬浮卡；滚动消息中被遮盖的按钮不算可见碰撞；窗口变宽、按钮移开后自动恢复。浏览器测试覆盖中英文、300–1100px 窗宽、绝对定位按钮、点击命中、重挂载与宿主样式保留。拒绝内嵌挂载时可使用原生侧面板（需要宿主 SDK 兼容）；不保证未知子代理布局中仍有内嵌条。

v0.6.1 子代理展示：在 `[data-testid="agent-input-box"]` 内定位唯一编辑器、发送按钮和静态子代理身份标签，校验其水平操作行与编辑器的邻近关系后挂载。标签文字允许汉化，右侧文件面板的 combobox 不作为子代理锚点。数据请求使用当前 `/c/<id>`，只接收该 ID 的统计；切换父/子会话立即清空旧值，晚到或 ID 不匹配的响应被拒绝。窄窗口先保留速度、缓存和上下文三个图标，仍可打开各自详情；语言可在上下文卡中切换，详情注明“当前子代理统计”和账号共享额度。尚不支持任意浮动子代理窗口或同一页面多个会话同时展示各自监控条。

`python[3] manage.py status` 显示运行模式、健康状态与调试启动诊断：`mounted`、`waiting-for-composer`、`reconnecting`（当 `<profile>/DevToolsActivePort` 缺失时附带 `reason: 'missing-debug-port'`），同时返回 `debugPortAvailable`、`launcher` 安装状态与 `debugPortHint`；检查 `checkedAt` 是否新鲜，历史文件不能证明当前后台仍在运行。原生侧面板是 SDK 兼容时的回退，也可直接用于触发调试重开。

未来关闭调试通道、改变 DOM、SDK 或 RPC 仍可能需要适配，不保证所有未来版本无故障。`--legacy-loader` 仅为 Windows 2.19.1 历史迁移，不用于 Linux/macOS。未知归档修改不会被覆盖。

只保存白名单统计、模型/状态，不保存正文、标题、邮箱、凭据、原始上下文或 token breakdown。账号未确认不加载其他账号数据，缺失旧元数据不能凭空重建。完整故障矩阵见 [ROBUSTNESS.md](docs/ROBUSTNESS.md)。

v0.6.3 密度过渡：共享 desktop renderer 使用 Chromium Web Animations API 的 transform/opacity 过渡，只在完整统计与图标模式切换时创建视觉副本。连续调整宽度只更新安全裁剪范围，不重建动画；三图标模式恢复完整统计保留 12px 余量，减少临界抖动。宿主控件仍保留原布局和点击响应。Windows 本地验收已通过；Windows/Linux/macOS 的浏览器 fixture 纳入发布 CI，登录后的 Linux/macOS 实机 GUI 验收仍单独处理。
