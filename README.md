# 王子

王子是一个桌面应用。它用来分析、接管和分享 AI Agent 的工作流，并在本机用时间线实时回放执行过程。

界面是黑金极简风格，窗口里有「王子」签名。当前版本是 **0.4.0**。

支持这四个 Agent：

- Codex
- Claude Code
- DeepSeek
- Kimi

## 下载

打开发布页：[王子 v0.4.0](https://github.com/wangyiqt/-/releases/tag/v0.4.0)

请按自己的系统下载对应文件。

### Windows 10 / 11（64 位）

任选一个即可。

- 安装向导：[Wangzi-0.4.0-win-x64.exe](https://github.com/wangyiqt/-/releases/download/v0.4.0/Wangzi-0.4.0-win-x64.exe)
- 系统安装包：[Wangzi-0.4.0-win-x64.msi](https://github.com/wangyiqt/-/releases/download/v0.4.0/Wangzi-0.4.0-win-x64.msi)

### macOS

先看电脑芯片。点左上角苹果菜单，打开「关于本机」。

- 处理器写的是 Intel：下载 [Wangzi-0.4.0-mac-x64.dmg](https://github.com/wangyiqt/-/releases/download/v0.4.0/Wangzi-0.4.0-mac-x64.dmg)
- 芯片写的是 Apple M 系列：下载 [Wangzi-0.4.0-mac-arm64.dmg](https://github.com/wangyiqt/-/releases/download/v0.4.0/Wangzi-0.4.0-mac-arm64.dmg)

### Linux（64 位）

- [Wangzi-0.4.0-linux-x86_64.AppImage](https://github.com/wangyiqt/-/releases/download/v0.4.0/Wangzi-0.4.0-linux-x86_64.AppImage)
- [Wangzi-0.4.0-linux-amd64.deb](https://github.com/wangyiqt/-/releases/download/v0.4.0/Wangzi-0.4.0-linux-amd64.deb)

## 安装

这些安装包没有购买代码签名证书。系统可能会多问一次，按下面的步骤继续即可。

### Windows

1. 下载 exe 或 msi。
2. 双击打开。
3. exe 会一步步问安装位置。msi 会按系统安装程序进行。
4. 如果出现蓝色窗口写着「Windows 已保护你的电脑」，点「更多信息」，再点「仍要运行」。
5. 安装结束后，从开始菜单打开 Wangzi。窗口里面的标题是「王子」。

### macOS

1. 下载和自己芯片对应的 dmg。
2. 双击打开，把 Wangzi 拖到「应用程序」文件夹。
3. 打开「应用程序」里的 Wangzi。窗口里面的标题是「王子」。
4. 如果系统说「无法打开」，按住键盘 Control，再点应用图标，选择「打开」，然后在提示里再点一次「打开」。
5. 也可以到「系统设置 → 隐私与安全性」，在页面下方点「仍要打开」。

### Linux

AppImage：下载后赋予执行权限，再双击或在终端运行。

```bash
chmod +x Wangzi-0.4.0-linux-x86_64.AppImage
./Wangzi-0.4.0-linux-x86_64.AppImage
```

deb：

```bash
sudo apt install ./Wangzi-0.4.0-linux-amd64.deb
```

## 使用

### 接着本机上已经开始的工作

1. 打开王子，停在「会话」。
2. 这里会列出这台电脑上的 Claude Code 和 Codex 记录。有新内容时，列表和时间线会自己更新。
3. 点「打开」看步骤。点某一步的「从这里接管」。王子会自己带上交接说明，继续原来的会话，不用再复制粘贴。

### 新开一项工作

1. 打开「运行」。
2. 选 Claude Code、Codex、DeepSeek 或 Kimi。
3. 点「选择文件夹」，写一句要做的事，再点「开始」。输出会一行行出现。
4. 需要停一下时点「暂停」，接着做点「继续」，不想做了点「停止」。
5. 下面的「补充说明」可以再发一句话。

如果还没安装 claude 或 codex，王子会告诉你。装好之后，在终端里输入对应命令能打开，再回到王子点「设置」里的「刷新」。

DeepSeek 和 Kimi 不需要命令行。到「设置」里粘贴密钥并保存。密钥留在这台电脑的系统钥匙串里。

碰到删除、管理员权限这类命令，王子会先问你。明确会破坏系统的命令会直接拦住，不会执行。

### 原来的分析、回放和分享

1. 「分析」仍可以粘贴一段记录，或载入示例。
2. 「接管已有记录」会生成交接说明。「只回放」只在窗口里按时间线演示，不会在电脑上执行命令。
3. 「分享」可以导出或导入王子文件。导出时会抹掉常见密钥。0.3.0 的分享文件仍然能导入。

## 说明

- 版本号：0.4.0
- 分享文件带有「王子」签名。内容被改过就无法导入。
- 应用窗口左侧的竖排「王子」是签名，不是另一套菜单。
- 暂停在 macOS 上会冻住正在跑的命令。Windows 上暂停不能冻住进程，要结束请点「停止」。
- 王子要等命令输出出现后才能发现危险命令，所以它会立刻暂停。极少数情况下，命令可能已经开始。
- 开始菜单或应用程序文件夹里的名字是 Wangzi，打开后窗口标题是「王子」。

## 开发

需要 Node.js 22。

```bash
npm ci
npm test
npm run dev
npm start
```

`npm test` 会运行解析、接管和进程控制测试。`npm run dev` 在浏览器里打开界面。`npm start` 打开桌面窗口。

推送到 `main`，以及推送 `v*` 标签时，GitHub Actions 会编译 Windows（exe、msi）、macOS（Intel 与 Apple 芯片 dmg）和 Linux（AppImage、deb）。标签构建会把这些安装包发到 GitHub Release。
