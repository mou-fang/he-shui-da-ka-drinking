> **v1.1.0 说明**：此分支正在验证数据完整性、跨午夜、历史时段、动画过渡、Android/Windows/网页提醒，以及自动化安装包。正式版请以 CI 验证结果为准。

**更新安全提示**：从旧版 CI 随机生成的 Android debug APK 换到正式签名 APK，通常不能直接覆盖升级。必须先备份饮水记录，然后再迁移。正式版 Android 签名密钥应保持稳定。

**自动化**：Android `versionName/versionCode` 由 `package.json` 版本自动生成，防止覆盖升级时版本号不变。每次 PR/main 运行 Quality Gate、Build Android APK、Build Windows Installer。Windows EXE 在 Actions Artifact 下载；推送 v* 标签后也上传 Releases。Android 正式包必须先配置仓库 Secrets：ANDROID_KEYSTORE_BASE64、ANDROID_KEYSTORE_PASSWORD、ANDROID_KEY_ALIAS、ANDROID_KEY_PASSWORD；缺少密钥只构建测试包，不发布不稳定签名的包。Windows 代码签名证书为可选配置（WINDOWS_CSC_LINK、WINDOWS_CSC_KEY_PASSWORD），未签名安装包会触发 SmartScreen 警告。

**新功能**：所有本地记录支持 JSON 导出/导入；保存失败不会显示成功；新增记录实际时间；历史旧时段不会被新设置隐藏；跨午夜自动刷新。提醒默认关闭，点击按钮授权后启用。网页版需 HTTPS 或 localhost，且浏览器网页保持打开。

---
# 喝水打卡

> **每天 2 升，一杯都不能少！**
>
> **这不是一个打卡表，这是一颗会晃、会破、会为你庆祝的水球。**
>
> 喝一口，水位涨一截，数字一个一个往上跳；喝满 2 升，五彩纸屑从天而降，
> 水球像果冻一样弹一下；喝超了？啪——玻璃裂开，水顺着球面淌下来，
> 在卡片上积成一汪小水洼；摇摇手机，水就从破口里晃出来。
> 每天打开，运气好的话还能撞上一杯「蓝色夏威夷」或者「凤凰之泪」。
>
> **水是真的在晃的。你的 2 升，也是真的。**

---

## 目录

- [这是什么](#这是什么)
- [功能总览](#功能总览)
- [功能模块说明](#功能模块说明)
- [技术栈与目录结构](#技术栈与目录结构)
- [数据模型与 localStorage 结构](#数据模型与-localstorage-结构)
- [关键物理与动画参数](#关键物理与动画参数)
- [本地运行](#本地运行)
- [打包-windows-安装包](#打包-windows-安装包)
- [打包-android-apk](#打包-android-apk)
- [扩展新功能](#扩展新功能)
- [已知与原版的差异](#已知与原版的差异)
- [贡献与维护指南](#贡献与维护指南)
- [License](#license)

## 这是什么

喝水打卡是一款每日饮水提醒与打卡应用：默认每天喝够 2000 ml，
每 2 小时喝一杯 250 ml（08:00–20:00 共 7 个时段），在一颗大水球里
实时看到今天喝了多少、还差多少。

**项目定位**：无需账号或后端，数据保存在本机。v1.1 使用 esbuild 打包共享前端、Capacitor 原生通知与 Electron 桌面壳。
同一份网页代码有三种形态：

| 形态 | 入口 | 数据存在哪 |
| --- | --- | --- |
| 网页版 | `index.html` / `npm run dev` | 浏览器 localStorage |
| Windows 版 | Electron（`electron/`） | 应用内 localStorage，与网页版互不相通 |
| Android 版 | Capacitor（`android/`） | 应用内 WebView 的 localStorage |

**隐私原则**：所有打卡记录、设置只存在用户自己的设备上，
不注册、不登录、不上传、不埋点。仓库里没有任何人的真实喝水记录，
第一次打开是空的（0 ml），也没有为了演示好看而预置的假数据。

## 功能总览

- 目标与时段：默认每日 2000 ml / 每杯 250 ml、7 个提醒时段，全部可改。
- 大水球：heightfield 波浪模拟，真实水面波动，不是 GIF、不是 CSS 假水。
- 选水量：预设滑块（弹簧滑动）+ 直接输入 + ±50 ml 步进器（点按 / 长按连续）。
- 打卡 / 额外加喝：双按钮并排，不用滑动就能点；达标后或看往日时只剩额外加喝。
- 今日每杯曲线：06:00–21:00，每点是一杯的毫升数，不累计。
- 历史：7 天紧凑预览 + 90 天全屏视图，点任意一天跳过去看。
- 达标庆祝：只在跨过目标那一刻触发，五彩纸屑 + 水球弹性缩放。
- 破口溢流：喝超了水球裂开，水流下来积成水洼；摇一摇能把水晃出来；
  回到目标以下玻璃自己「长好」。
- 晃动：手机倾斜 / 摇晃、桌面拖动水球、Windows 版拖动整个窗口，
  水面都会跟着晃。
- 彩蛋：27 个主题，约 60% 的日子是彩蛋日，每天的水都可能换个味道。
- Windows 版是竖版小弹窗（420×880，手机竖屏比例），拖窗口水会晃。

## 功能模块说明

### 1. 水球物理（`src/app.js` 的 `stepWave` / `drawBall`）

水球是整个应用的视觉中心，画在一块 640×640 的 `<canvas>` 上，
CSS 尺寸手机约 253px、桌面约 317px，居中。

- **Heightfield 波浪模拟**：水面是一维高度场，110 个采样点，
  每个点有高度与速度；每帧做两件事——相邻点互相拉动
  （`acc = (left + right - 2·h) × 0.32`）、弹簧拉回静水位
  （`× 0.02`），再乘阻尼 `0.985`。平时有环境波纹，
  打卡、摇晃、拖窗口都会往速度场里注入能量。
- **水位平滑上升**：画面水位 `visualLevel` 每帧向真实水位追赶
  5%（`+= (target - visualLevel) × 0.045`），打卡后不会突然跳变；
  数字逐位递增（先快后慢，最多 2 秒）与上升同步。
- **气泡与高光**：水里有 8 个缓慢上浮的气泡，球面左上方有一道高光弧线。
- **水球里显示什么**：当前总量（大数字）、目标、还差多少；
  超了显示「已超 X ml」。

### 2. 打卡 / 额外加喝（「这次喝了多少水」卡）

- **选水量**：预设 100 / 150 / 200 / 250 / 300 / 400 / 500 / 750 / 1000 ml，
  滑块是带弹簧感的蓝色 pill，跨行也能滑过去；数字两边有 − / + 键，
  点一下 ±50 ml，长按连续增减，范围 10–2000 ml；也可以直接在输入框里输。
  进页面时滑块会从一个随机的非 250 选项滑到 250（约 120ms 内开始），
  用户一点其他份量或打卡就取消这次滑动，绝不覆盖用户的选择。
- **到点打卡**（右边，深蓝实心）：用选好的水量记到最近一个未打卡时段；
  再点已打卡的时段可以撤销。时段都喝完了会提示改用额外加喝。
- **额外加喝**（左边，浅蓝底深蓝描边）：不占时段，单独记一笔，
  列在同一张卡里，每笔都有「撤销」。
- **两个按钮的规则**：并排在选水量正下方，进页面不用滑动就能点；
  达标后或正在看往日时，到点打卡隐藏，额外加喝自动占满整行。
- **时段卡**：7 个时段排成网格，点一下打卡、再点撤销；
  已打卡的时段是浅蓝底。

### 3. 今日每杯曲线

06:00–21:00 的横轴，每点是一杯的毫升数（不是累计），
06:00 前 / 21:00 后的饮水计入当天总量、但不画出来。
曲线高 127（canvas 内部 254px @2x），纵轴自动取当天最大一杯
（最少 500 ml 刻度）。当天还没喝水时显示一句提示，不画空轴。

### 4. 90 天历史与连续达标

- 首页「近期数据」是最近 7 天紧凑预览，今天在最右，
  柱子高度 = 当天总量 / 目标。
- 点「90 天 ›」打开全屏浮层，90 行，每行是日期 + 进度条 + 总量，
  点任意一行跳到那天（水球、时段、曲线、额外记录全部切换过去，
  有平滑过渡）。
- 右上角显示「连续达标 X 天」：从今天往前数，连续总量 ≥ 目标的天数，
  断一天就重新计。

### 5. 达标庆祝

只在**跨过目标的那一刻**触发一次：约 110 片五彩纸屑分 3 波
从顶部落下（约 6.5 秒），水球先压扁再弹性弹开（squash 动画），
手机会震三下。触发后当天记一个 `celebrated` 标记，
重新打开页面、补记往日都不会重播。

### 6. 破口溢流

超过目标的瞬间：

- 水球顶部裂开一道锯齿口子（SVG 裂纹），破开有冲击感 + 震动（120ms）；
- 14 片玻璃碎片飞到界面前面，落到下方卡片上，约 1.6 秒保持不透明、
  再约 1.6 秒淡出；
- 水从裂口流下来：沿球面流下的水线 + 下方卡片上的涟漪水洼，
  超得越多流得越粗（流速按 Torricelli 公式，随超量水头的平方根变化）；
- **水流只在水面真正盖到裂口时才出**，流向跟着真实重力走，
  不是跟着屏幕下方走；破后再加水，先涨一波水花再慢慢回落到裂口水位；
- 回到目标以下时裂口消失，玻璃「长好」。

### 7. 彩蛋系统（`src/eggs.js`）

- 27 个主题，分三类：鸡尾酒（如蓝色夏威夷、莫吉托）、
  虚构饮品（如魔法药水、法力药水、凤凰之泪）、水世界
  （如深海、冰川融水、极光、星空）。
- 每天按日期哈希决定：约 60% 的日子是彩蛋日，命中后在 27 个主题里
  均匀挑一个（每个主题约 1–2% 的日子出现）。彩蛋日水球换色，
  球下方显示一句文案；**非彩蛋日不显示横幅、不预告**。
- 主题只改颜色和文案，不影响打卡数据与物理。
- 原版另有按日期 / 时刻 / 动作触发的隐藏非饮品彩蛋，
  这里只留了扩展点（`HIDDEN_EGGS`，见「扩展新功能」），没有捏造具体内容。

### 8. 设置

设置卡可以改：每日目标（500–5000 ml）、每杯默认量（10–2000 ml）、
开始时间（0–22 时）、间隔（1–4 小时）。时段由开始时间 + 间隔自动算出，
到 20:00 为止；改完点「保存设置」立即生效。还有一个「清空今天」，
会清掉今天的全部打卡记录（要二次确认）。

### 9. 提醒时段

时段默认 08:00 / 10:00 / 12:00 / 14:00 / 16:00 / 18:00 / 20:00。
**v1.1 提醒支持**：进入设置点击「开启系统提醒」，Android 使用本地系统通知（关闭 App 后仍由系统调度）；Windows 原生通知启用后驻留托盘并设置开机启动；浏览器版仅在网页仍打开时通知。系统权限、勿扰模式、省电优化及 Android 非精确闹钟策略可能导致延迟。关闭浏览器不会后台定时唤醒。

## 技术栈与目录结构

**技术栈**：HTML / CSS / JS（ES Module，经 esbuild 打包），Capacitor 本地通知插件；
Canvas 2D 手写水面物理；Electron（Windows）、Capacitor（Android）
只做「把同一套网页装进壳里」，不改业务代码。
Node ≥ 22。推荐 `npm install --no-package-lock`，随后 `npm run build`。

```
he-shui-da-qia/
├── index.html                  # 网页版入口：水球、选水量、时段、曲线、历史、设置
├── src/
│   ├── app.js                  # UI 与 Canvas 交互
│   ├── core.js                 # 数据校验、时段与统计规则
│   ├── reminders.js            # 三端通知调度
│   ├── eggs.js                 # 27 个彩蛋主题 + 日期哈希 + HIDDEN_EGGS 扩展点
│   └── styles.css              # 全部样式（手机优先，max-width 480px 居中）
├── electron/
│   ├── main.cjs                # Electron 主进程：竖版窗口 + 拖窗口算速度/加速度发 IPC
│   ├── preload.cjs             # 只暴露 window.hsdq.onWindowMotion，不暴露 Node API
│   └── window-motion.cjs       # 拖动换算纯函数（computeMotion / tiltFromMotion），可单测
├── electron-builder.yml        # Windows NSIS 打包配置（未签名）
├── capacitor.config.json       # Capacitor 配置（appId / 名称 / webDir）
├── android/
│   └── README.md               # android/ 原生工程的生成说明（目录本身由 cap add 生成）
├── scripts/
│   ├── build.mjs               # 构建：把网页版复制到 dist/
│   ├── package-win.mjs         # Windows 打包入口：先检查平台与 electron-builder
│   └── package-android.mjs     # Android 打包入口：先检查 JDK 与 Android SDK
├── tests/                     # 业务单测 + 窗口运动测试 + Playwright E2E
├── assets/icon.ico             # Windows 安装与托盘图标
├── dist/                       # 构建产物（npm run build 生成，已忽略，不提交）
├── .gitignore
├── LICENSE                     # MIT
├── package.json                # 脚本入口（dev / build / check / test / 打包）
└── README.md                   # 本文件
```

`src/app.js` 内部按段组织（按文件内注释找）：

| 段 | 内容 |
| --- | --- |
| 存储 | `load` / `save`，localStorage 键 `hsdq-v1` |
| 日期 / 时段 | `slotTimes`、`dayData`、`dayTotal`、`dayDrinks` |
| 选水量 | 预设滑块、入场滑动、±50 步进器（长按连续）、直接输入 |
| 打卡 | `checkinSlot`、`addBonus`、`removeBonus`、`afterChange`（达标 / 破裂触发点） |
| 庆祝 | `celebrate`（纸屑 110 片、3 波、6.5 秒） |
| 破裂 | `breakBall` / `healBall` / `spawnShards`（碎片飞散淡出） |
| 水球物理 | `stepWave` / `drawBall` / `drawPuddle` / `loop` |
| 曲线 / 历史 | `drawCurve`、`renderHist7`、`renderHist90` |
| 渲染 | `renderAll`（所有卡片的状态同步都走这里） |
| 设置 | `fillSettings`、保存、清空今天 |
| 晃动 | deviceorientation / devicemotion、拖水球、Electron 拖窗口 |

## 数据模型与 localStorage 结构

全部数据存在一个键里：**`localStorage["hsdq-v1"]`**，JSON。

```jsonc
{
  "settings": {
    "goal": 2000,           // 每日目标 ml，默认 2000
    "defaultAmount": 250,   // 每杯默认 ml，默认 250
    "startHour": 8,         // 开始时间（时），默认 8
    "intervalHours": 2,     // 间隔小时，默认 2
    "removedSlots": []      // 预留：被删掉的时段（目前 UI 未提供删除入口）
  },
  "days": {
    "2026-11-19": {
      "slots": { "08:00": 250, "10:00": 250 },   // 时段 -> 当杯 ml
      "bonus": [                                  // 额外加喝
        { "id": "1731912345678abc12", "ml": 250, "time": "15:32" }
      ]
    }
  },
  "celebrated": { "2026-11-19": true }           // 当天已庆祝过，不重播
}
```

- **当天总量** = 该天 `slots` 毫升之和 + `bonus` 毫升之和。
  250 ml × 8 杯 = 2000 ml，刚好达标；7 个时段（1750 ml）+ 1 笔额外加喝
  （250 ml）也是 2000 ml。
- **日期键**是本地时区的 `YYYY-MM-DD`。换设备、清浏览器数据，记录就没了——
  这是单机版的取舍，不是 bug。
- **不存的东西**：没有任何用户身份、没有任何真实喝水记录随仓库发布；
  `celebrated` 只防重播，不含任何个人信息。
- **损坏处理**：JSON 解析失败或结构不对时，`load()` 静默重建一份
  默认空状态，不会白屏。

## 关键物理与动画参数

| 参数 | 值 | 在哪 |
| --- | --- | --- |
| 波浪采样点 | 110 点 | `src/app.js`：`N` |
| 相邻拉动 / 回弹弹簧 / 阻尼 | 0.32 / 0.02 / 0.985 | `stepWave` |
| 水位追赶速度 | 每帧 4.5% | `visualLevel += (target - visualLevel) × 0.045` |
| 数字滚动 | 先快后慢（三次方缓出），最多 2 秒 | `animateNumber` |
| 倾斜 → 水面坡度 | 满倾斜 ≈ 14px 落差 | `slope = effTiltX() × 14` |
| 摇晃能量衰减 | 每帧 ×0.94 | `stepWave` |
| 摇晃触发阈值 | 加速度模 > 32 | `devicemotion` 监听 |
| 纸屑 | 约 110 片，3 波，约 6.5 秒 | `celebrate` |
| 破裂震动 | 120ms；达标庆祝震三下（40ms 间隔） | `breakBall` / `celebrate` |
| 碎片 | 14 片，约 1.6 秒不透明 + 约 1.6 秒淡出 | `spawnShards` |
| 溢流流速 | Torricelli：`flow = sqrt(超量 / 目标)` | `drawPuddle` |
| 水球尺寸 | 手机约 253px、桌面约 317px（CSS `clamp(253px, 68vw, 317px)`） | `src/styles.css` |
| 曲线范围 | 00:00–24:00，纵轴 ≥500 ml | `drawCurve` |
| 彩蛋概率 | 彩蛋日约 60%，27 个主题各约 1–2% | `src/eggs.js`：`eggForDate` |
| 入场滑块 | 约 120ms 内开始滑向 250 | `introSlider` |
| 拖窗口 → 倾斜 | 500 px/s ≈ 满倾斜；加速度叠加 | `electron/window-motion.cjs`：`tiltFromMotion` |
| 拖窗口 IPC 节流 | 约 60Hz（16ms）；停下 120ms 后补发 settled | `electron/main.cjs` |

调这些参数时，先在网页版 `npm run dev` 里看效果，再同步到打包版——
物理只在 `src/app.js` 和 `electron/window-motion.cjs` 里，别处没有副本。

## 本地运行

```bash
npm install --no-package-lock   # 安装 Node 22 依赖
npm run dev   # 先构建，再在 http://127.0.0.1:5173 启动本地服务
npm run check # 语法检查（app.js / eggs.js / electron 三个 .cjs）
npm test      # 核心数据与运动逻辑测试
npm run test:e2e # 安装 Playwright Chromium 后进行桌面/手机视口交互测试
npm run build # 打包 src/app.js 到 dist/app.js，三端共享
```

请通过 `npm run dev` 浏览打包后的页面；根目录 `index.html` 是模板，不再支持直接双击运行。

**旧版 v1.0.0 的历史验证情况**（2026-11-19，Node 24.22.1 / npm 10.9.4）：
`npm install`、`npm run check`、`npm test`（4/4 通过）、`npm run build` 全部通过；
打卡算数 250 ml × 8 = 2000 ml 达标、额外加喝到 2250 ml 破裂、
撤销回 2000 ml 玻璃长好、90 天历史 90 行，均已在逻辑层面核对。
**没验证到的**：本机沙箱的 Chromium 因平台 WebGL 策略无法启动，
所以没有跑真实浏览器渲染；Windows exe 与 APK 也没在本机打出
（见下面两节的原因）。请在 Mo 的手机 / Windows 电脑上实测一遍
再发 release——尤其是水球在真机上的尺寸、晃动灵敏度、破口水流落点。

## 打包 Windows 安装包

Windows 版是**竖版小弹窗**：默认 420×880，约手机竖屏比例，
像手机一样窄窄地立在桌面上，不是铺满桌面的大窗口；
最小 360×700，可拉大。标题栏拖动窗口时，水球里的水会跟着晃。

```bash
# 必须在 Windows 上跑：
npm run setup:desktop   # 装 electron + electron-builder
npm run package:win     # 生成 NSIS 安装包，在 electron/dist/ 里
```

- **拖窗口晃水的链路**（三段，缺一段就没效果）：
  1. `electron/main.cjs` 监听窗口 `'move'` 事件，用前后两次位置算出
     速度 / 加速度（`electron/window-motion.cjs` 的 `computeMotion`），
     约 60Hz 节流后经 IPC 发 `window-motion`；停下 120ms 后补发一次
     `settled`，让水面开始平复。
  2. `electron/preload.cjs` 只用 `contextBridge` 暴露
     `window.hsdq.onWindowMotion(cb)`，不暴露任何 Node API。
  3. `src/app.js` 收到后换算成等效倾斜（速度 500 px/s ≈ 满倾斜，
     负号是惯性：窗口向右加速，水涌向左）叠加到水面物理上，
     再加一份 `shakeEnergy`；拖得越快晃得越厉害；破了口时拖得猛了
     也会把水晃出来。停下后等效倾斜按帧 ×0.92 衰减，水面慢慢平复。
  4. 网页版没有 `window.hsdq`，相关代码直接跳过，不影响。
- **未签名**：首次安装时 Windows SmartScreen 会提示，
  点「更多信息 → 仍要运行」即可；如需签名，在 CI 里注入证书后再打包。
- **Linux 上打包**：NSIS 需要 wine，本仓库的 `npm run package:win`
  会先检查平台并提示，不会悄悄失败。本机沙箱没有 wine、也没有装
  Electron（内存只有约 500MB 可用，装 Electron + 打包风险大），
  所以 exe 需要在 Windows 电脑或 CI 上打。
- 图标：`electron-builder.yml` 引用 `assets/icon.ico`，
  已经提供 `assets/icon.ico`，无需额外准备图标。

## 打包 Android APK

```bash
# 需要 JDK 21 + Android SDK（设好 ANDROID_HOME），装好后：
npm run setup:android   # 装 @capacitor/core + @capacitor/cli + @capacitor/android，生成 android/ 原生工程
npm run package:android # 同步网页代码，打 debug APK
# APK：android/app/build/outputs/apk/debug/app-debug.apk
```

- `android/` 目录本身由 `npx cap add android` 生成，仓库里只有一份说明
  （`android/README.md`）；网页代码改完后跑 `npx cap sync android` 同步。
- 推荐用 **GitHub Actions 云端打包**：推到 `main` 分支就会自动打 APK，
  上传测试版 Artifact；仅 push v* tag 且配置 Android 固定签名 Secrets 时才发布正式 APK（见 `.github/workflows/build-apk.yml`，
  也可在 Actions 页面手动点 Run workflow）。本地沙箱禁 Java 进程的
  TCP 回环，Gradle 连不上自己的 daemon，本地打 APK 会失败，云端没有
  这个限制；本地脚手架与检查脚本（`scripts/package-android.mjs`，
  缺 JDK / SDK 时会明确报错、不会悄悄失败）仍保留，给有本地 SDK 的人用。
- Android 上「开启晃动」用的是系统的 `deviceorientation` /
  `devicemotion`，WebView 里一般直接可用，不像 iOS 需要点按钮授权。
- 发正式版（release APK / AAB）时，记得在 `android/` 里配签名，
  不要把 keystore 提交进仓库。

## 扩展新功能

- **加新彩蛋主题**：打开 `src/eggs.js`，往 `EGG_THEMES` 里加一行
  `{ id, kind, name, top, deep, note }`——`top` / `deep` 是水面上下
  两端的颜色，`note` 是彩蛋日显示的那句文案。主题是按日期哈希均匀
  挑的，加一个主题后各主题的出现概率会自动重算，不用改别处。
- **加隐藏彩蛋**：往 `HIDDEN_EGGS` 里加
  `{ id, when(state, now), apply(theme) }`——`when` 返回 true 时触发。
  原版的隐藏彩蛋内容没有搬过来，别凭空编一个「就是原版那个」。
- **改默认目标 / 每杯量**：改 `src/app.js` 里 `load()` 的默认
  `settings`（goal / defaultAmount），再在设置卡里验证一遍；
  时段由 `startHour` + `intervalHours` 自动算出，不用手写 7 个时间。
- **系统提醒**：Android 采用 Capacitor Local Notifications 原生调度；Windows 通过 Electron 主进程与托盘定时提醒；网页版 Notification API 必须保持页面打开。不同平台的系统省电、勿扰策略可能延迟通知。
- **改水球手感**：只改「关键物理与动画参数」表里的那几个数，
  先在网页版看效果。波浪三个系数（0.32 / 0.02 / 0.985）互相牵制，
  一次只动一个。
- **加新页面 / 大功能**：先在 `index.html` 里加结构，
  再到 `src/app.js` 的 `renderAll` 里接状态，最后补 `styles.css`；
  别绕开 `renderAll` 各自改 DOM，否则切日期时状态会对不上。

## 已知与原版的差异

原版是跑在 Muse 平台上的空间（带后端存数据、定时提醒走 cron）；
这个开源版是单机网页版，差异都是由此来的，不是漏做的：

| 方面 | 原版 | 开源版 |
| --- | --- | --- |
| 数据 | 存在平台后端 | 只存在本机 localStorage，换设备 / 清数据就没了 |
| 提醒 | 定时任务到点推送 | Android 原生本地通知 / Windows 原生托盘通知 / 网页打开时的通知 |
| 动画 | 平台构建器逐版迭代（v64） | 按 v64 复刻的重新实现，效果同等、不是逐像素复制 |
| 破口水流 | 平台版的精确落点与碎片轨迹 | 同等效果的重新实现，落点可能略有不同 |
| 彩蛋 | 27 主题 + 隐藏非饮品彩蛋 | 27 主题完整；隐藏彩蛋只留扩展点，未搬具体内容 |
| Windows 拖窗口晃水 | 原版没有（平台空间没有窗口可拖） | 开源版新增，Electron 专属 |
| 多人 / 同步 | 平台账号体系 | 无，不做 |

## 贡献与维护指南

- **语言**：界面、注释、README、issue 统一用中文；代码里的标识符用英文。
- **改动流程**：先在网页版（`npm run dev`）改好、看好效果，
  再跑 `npm run check && npm test && npm run build`，
  最后才在 Windows / Android 壳里验证。不要只改 `dist/`——
  它是构建产物，下次 `npm run build` 会覆盖。
- **不要提交的东西**：`node_modules/`、`dist/`、`.gradle/`、
  `local.properties`、keystore、任何人的真实喝水记录。
  `.gitignore` 已配好，提交前 `git status` 看一眼。
- **发版流程**：改 `package.json` 的 `version` → 跑三遍验证
  （check / test / build）→ 在 Windows 上打 exe、在装好 SDK 的机器上
  打 APK → 在 GitHub 上建 release，把 exe 和 APK 一起传上去，
  release 说明里写清楚「未签名，SmartScreen 提示属正常」和
  「数据只存在本机」。
- **接手的人先看**：`src/app.js` 的段注释、`src/eggs.js`、
  `electron/window-motion.cjs` 的单测、`README` 的参数表。
  水球物理只在 `app.js` 里，没有第二份实现——改了一处就等于改了全部三端。
- **提问题时请带上**：在哪一端（网页 / Windows / Android）、
  哪一天的数据状态（总量多少、破没破）、复现步骤；
  「水球看着不对」请附截图或录屏，只说「不对」没法修。

## License

MIT，见 [LICENSE](LICENSE)。


### 安全签名与更新说明

Android 固定签名需保留原始 keystore（离线安全备份）及其密码，在仓库 Settings → Secrets and variables → Actions 设置 `ANDROID_KEYSTORE_BASE64`（keystore 文件 Base64 内容）、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。不得把这些值提交到代码中。只有推送 `v1.1.0` 等版本标签才发布签名 APK；普通 main / PR 仅上传测试构建 Artifact。

Windows 安装包在 main 更新后自动上传到 Actions Artifacts；发布版本标签后上传 Releases。Windows 代码签名需要你自己的证书，否则安装时可能出现 SmartScreen 警告。

**首次从老版 Android Debug APK 迁移到正式签名包时无法保证直接覆盖升级。**请先取出旧记录；新版提供原生分享/保存 JSON 备份功能，但老版没有。无备份前不要直接卸载旧 APK。
