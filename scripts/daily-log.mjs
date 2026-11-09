import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const logDir = path.join(root, 'dev-log')
await mkdir(logDir, { recursive: true })

const now = new Date()
const date = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-')
const time = now.toLocaleTimeString('zh-CN', { hour12: false })
const logPath = path.join(logDir, `${date}.md`)

if (!existsSync(logPath)) {
  await writeFile(
    logPath,
    `# 开发日志 - ${date}\n\n## 今日目标\n- [ ] 补充今日开发目标\n\n## 已完成事项\n- [x] 初始化 Between Us 项目\n- [x] 完成事件描述、梳理、编辑和阶段完成页面\n- [x] 配置浏览器本地保存与响应式布局\n\n## 待办事项\n- [ ] 接入真实 AI API\n- [ ] 增加内容确认前的数据校验\n- [ ] 补充浏览器端交互测试\n- [ ] 准备 Windows 安装与发布方案\n\n## 开发记录\n- ${time} 创建/检查每日开发日志\n\n## 问题与决策\n- 当前版本使用前端模拟分析，不调用真实 AI API。\n- 当前数据保存于浏览器 localStorage。\n`,
    'utf8',
  )
} else {
  const content = await readFile(logPath, 'utf8')
  const marker = '## 开发记录'
  const record = `- ${time} 检查并更新开发日志`
  if (!content.includes(record)) {
    const updated = content.replace(marker, `${marker}\n${record}`)
    await writeFile(logPath, updated, 'utf8')
  }
}

console.log(`Development log ready: dev-log/${date}.md`)
