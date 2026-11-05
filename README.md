# 立交固定入口（GitHub Pages）

入口页面只读取当前公网网址，并在确认立交服务器可以响应后跳转。聊天、文件、验证码和游戏都继续留在电脑服务器。

`entry-config.json` 指定公开仓库和存放 `target.json` 的分支。建议入口页面放在 `main` 分支，当前网址放在独立的 `live` 分支。只在网址变化时更新该文件，无需重复构建页面，也不把连接密钥写入网页。

`live` 分支的 `target.json` 格式：

```json
{"service":"lijiao","target":"https://当前网址.cpolar.cn","updatedAt":0}
```

页面不会接受 cpolar 以外的跳转目标。服务器关闭时连接检查会失败，保留等待页面；恢复连接后再次检查并自动跳转。
