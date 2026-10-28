# 王子

王子是一个桌面应用。它用来分析、接管和分享 AI Agent 的工作流，并在本机用时间线实时回放执行过程。

界面是黑金极简风格，窗口里有「王子」签名。当前版本是 **0.3.0**。

支持这四个 Agent：

- Codex
- Claude Code
- DeepSeek
- Kimi

## 下载

打开发布页：[王子 v0.3.0](https://github.com/wangyiqt/-/releases/tag/v0.3.0)

请按自己的系统下载对应文件。

### Windows 10 / 11（64 位）

任选一个即可。

- 安装向导：[Wangzi-0.3.0-win-x64.exe](https://github.com/wangyiqt/-/releases/download/v0.3.0/Wangzi-0.3.0-win-x64.exe)
- 系统安装包：[Wangzi-0.3.0-win-x64.msi](https://github.com/wangyiqt/-/releases/download/v0.3.0/Wangzi-0.3.0-win-x64.msi)

### macOS

先看电脑芯片。点左上角苹果菜单，打开「关于本机」。

- 处理器写的是 Intel：下载 [Wangzi-0.3.0-mac-x64.dmg](https://github.com/wangyiqt/-/releases/download/v0.3.0/Wangzi-0.3.0-mac-x64.dmg)
- 芯片写的是 Apple M 系列：下载 [Wangzi-0.3.0-mac-arm64.dmg](https://github.com/wangyiqt/-/releases/download/v0.3.0/Wangzi-0.3.0-mac-arm64.dmg)

### Linux（64 位）

- [Wangzi-0.3.0-linux-x86_64.AppImage](https://github.com/wangyiqt/-/releases/download/v0.3.0/Wangzi-0.3.0-linux-x86_64.AppImage)
- [Wangzi-0.3.0-linux-amd64.deb](https://github.com/wangyiqt/-/releases/download/v0.3.0/Wangzi-0.3.0-linux-amd64.deb)

## 安装

这些安装包没有购买代码签名证书。系统可能会多问一次，按下面的步骤继续即可。

### Windows

1. 下载 exe 或 msi。
2. 双击打开。
3. exe 会一步步问安装位置。msi 会按系统安装程序进行。
4. 如果出现蓝色窗口写着「Windows 已保护你的电脑」，点「更多信息」，再点「仍要运行」。
5. 安装结束后，从开始菜单打开「王子」。

### macOS

1. 下载和自己芯片对应的 dmg。
2. 双击打开，把「王子」拖到「应用程序」文件夹。
3. 打开「应用程序」里的「王子」。
4. 如果系统说「无法打开」，按住键盘 Control，再点应用图标，选择「打开」，然后在提示里再点一次「打开」。
5. 也可以到「系统设置 → 隐私与安全性」，在页面下方点「仍要打开」。

### Linux

AppImage：下载后赋予执行权限，再双击或在终端运行。

```bash
chmod +x Wangzi-0.3.0-linux-x86_64.AppImage
./Wangzi-0.3.0-linux-x86_64.AppImage
```

deb：

```bash
sudo apt install ./Wangzi-0.3.0-linux-amd64.deb
```

## 使用

1. 打开王子。
2. 进入「分析」。把 Codex、Claude Code、DeepSeek 或 Kimi 的会话记录贴进去。不确定格式时，先点对应的「示例」。
3. 点「开始分析」。王子会识别是哪一个 Agent，并列出任务、工具、判断和结果。
4. 进入「接管」。选择从哪一步接手，生成交接提示。点「复制交接提示」，可以贴回原来的 Agent，让它从这一步继续，不必重做前面的步骤。
5. 进入「执行」。点「开始实时回放」。步骤会按时间线逐条亮起。回放只发生在窗口里，用来看清顺序，不会在你的电脑上执行记录中的命令。
6. 进入「分享」。可以复制或保存一份王子分享文件。对方在「导入」里贴上或选择这个文件，就能看到同一条工作流。分享文件会抹掉常见的密钥和 Bearer 令牌。

## 说明

- 版本号：0.3.0
- 分享文件带有「王子」签名。内容被改过就无法导入。
- 应用窗口左侧的竖排「王子」是签名，不是另一套菜单。

## 开发

需要 Node.js 22。

```bash
npm ci
npm test
npm run dev
npm start
```

`npm test` 会运行 26 个测试。`npm run dev` 在浏览器里打开界面。`npm start` 打开桌面窗口。

推送到 `main`，以及推送 `v*` 标签时，GitHub Actions 会编译 Windows（exe、msi）、macOS（Intel 与 Apple 芯片 dmg）和 Linux（AppImage、deb）。标签构建会把这些安装包发到 GitHub Release。
