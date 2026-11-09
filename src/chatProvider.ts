// 对话通道统一入口：本阶段默认使用本地模拟引擎（不接入真实 AI API）。
// 未来接入真实大模型：把 .env 中 VITE_USE_REAL_LLM 设为 true，即走 /api/chat SSE 通道，
// 无需改动页面代码。真实通道的接口契约：
//   POST /api/chat { channel: 'friend' | 'observer', message, history }
//   -> SSE 流式返回 data: {"text": "..."}，以 event: done 结束。
/// <reference types="vite/client" />

import { generateMockReply, type ChatContextInput } from './mockChatEngine'

export const USE_REAL_LLM = import.meta.env.VITE_USE_REAL_LLM === 'true'

export interface ChatHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamChatInput {
  channel: 'friend' | 'observer'
  message: string
  history: ChatHistoryItem[]
  context: ChatContextInput
  onDelta: (fullText: string) => void
}

export async function streamChat(input: StreamChatInput): Promise<void> {
  if (USE_REAL_LLM) {
    await streamRealChat(input)
    return
  }
  await streamMockChat(input)
}

async function streamMockChat({ channel, message, history, context, onDelta }: StreamChatInput): Promise<void> {
  const reply = generateMockReply(channel, message, history, context)
  // 模拟流式输出：小步渐进，保留“正在输入”的节奏
  const step = Math.max(2, Math.round(reply.length / 36))
  for (let cursor = 0; cursor < reply.length; cursor += step) {
    await new Promise((resolve) => setTimeout(resolve, 30))
    onDelta(reply.slice(0, cursor + step))
  }
}

async function streamRealChat({ channel, message, history, context, onDelta }: StreamChatInput): Promise<void> {
  void context
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel,
      message,
      history: history.map((item) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        content: item.content,
      })),
    }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    throw new Error(errorBody?.error || 'DeepSeek 请求失败')
  }
  if (!response.body) throw new Error('当前浏览器未收到流式响应')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const event of events) {
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue
        try {
          const payload = JSON.parse(line.slice(5).trim())
          if (payload.text) {
            fullText += payload.text
            onDelta(fullText)
          }
        } catch {
          // 忽略不完整的 SSE 片段
        }
      }
    }
  }
}
