# 第三方许可补充

构建会从实际打包的依赖收集完整许可原文，为网页与 CLI / MCP 分别生成 `THIRD-PARTY-NOTICES.txt`。WeDraft 自身采用根目录的 MIT [LICENSE](../LICENSE)，第三方组件分别沿用其原有许可。

`launder@1.7.1` 的 npm 归档声明 MIT，但没有附带许可文件。本目录保留上游补入的原文，构建时仅对这一精确版本使用：

- 来源：[上游补齐许可证的提交](https://github.com/apostrophecms/apostrophe/commit/f57be4817a92279efbfa30658c9691209f879bbb)。
- 文件：[packages/launder/LICENSE.md](https://github.com/apostrophecms/apostrophe/blob/f57be4817a92279efbfa30658c9691209f879bbb/packages/launder/LICENSE.md)。
- 本地原文：`launder-1.7.1-LICENSE.txt`。不改写版权年份、作者或授权条件。

升级依赖后重新核查；其他依赖缺少原文时构建会停止，不能用自动推测的许可证文本替代。

当安装器下载私有 Node 运行时，也会保留该官方归档中的完整 LICENSE（含 Node 自身的第三方声明），不只复制可执行文件。
