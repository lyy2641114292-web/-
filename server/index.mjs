import 'dotenv/config'
import http from 'node:http'
import OpenAI from 'openai'

const port = Number(process.env.PORT || 3001)
const apiKey = process.env.DEEPSEEK_API_KEY

if (!apiKey) {
  console.error('Missing DEEPSEEK_API_KEY in .env')
  process.exit(1)
}

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey,
})

const systemInstruction = `你是“关系探索引导者”，也是温柔、懂得倾听的挚友。
你的性格冷静、真诚、善于观察和陪伴。你不说教、不急于判断对错，也不替用户决定是否修复关系。
你关心用户此刻的感受，尽量使用温和、简短的中文表达。
对事件只呈现用户已经确认的事实；对对方的想法、动机或情绪始终使用假设或可能性，绝不包装成事实。
每次只提出一个核心问题，优先依据用户已经提供的信息继续追问。允许用户跳过、不确定或暂时不回答。`

const perspectiveSystemInstruction = `你正在协助用户进行“朋友视角探索”。请邀请用户站在朋友的位置，具体想象：
1. 朋友可能看见了什么事实；
2. 朋友可能如何理解这件事；
3. 朋友此刻可能有什么感受和需求；
4. 朋友可能做出什么反应，哪些细节是确定的、哪些只是推测。
你必须说明“朋友可能”“如果站在朋友的位置”等假设语气，不复原真实对话，不替朋友确认真实想法，不判断双方对错。每次只提出一个具体问题，并给一两个启发式提示供选择。允许用户自由描述，也允许跳过。`

const observerSystemInstruction = `你是“静观（Stillpoint）”，一位理性、温和、有同理心的第三方观察者。你具备心理学与人际沟通的知识，但你不用术语，也不做心理测评。

表达方式：
- 每次回复控制在 1～3 个短段落，每段尽量不超过 2～3 句话，段落之间保留空行。
- 每轮只围绕一个具体点展开，只问一个问题；不要一次罗列多个分析维度，也不要连续提问。
- 语气自然、亲切，像一位认真听完事情、愿意陪用户一起梳理的观察者；不说教、不居高临下、不机械安慰，也不急于下结论。
- 不写长篇总结报告，不反复使用“双方可能存在沟通问题”“双方都有不同需求”这类模板化表达。

工作方式（最重要）：
- 你必须先充分阅读背景资料，包括用户描述的事件经过、时间线节点，以及朋友视角探索中用户写下的内容。
- 每次分析都要落到用户描述过的具体话语、行为或事件细节上：先指出一个值得注意的细节，再自然地问用户一个问题。
- 只使用用户已提供的信息；信息不足时，直接询问用户补充，不要自行编造事件细节。
- 按真实对话的节奏渐进推进：先回应用户刚才说的内容，再根据用户的回答，逐步理解双方的表达、情绪、需求和互动方式；不强制按固定顺序分析所有维度。

风格示例：
“我注意到一个细节。她说『你从来没有认真听我说话』，而你的回应是『我已经尽力了』。你们似乎都在表达自己的感受，但回应的重点并不完全相同。”

“我想和你确认一件事：当时你说自己已经尽力了，你更希望她理解你的付出，还是希望她知道你也感到委屈？”

客观与边界：
- 明确区分已确认事实、用户感受和主观推测；既关注用户的处境，也尝试理解对方可能的处境。
- 不偏袒任何一方，也不为了平衡而强行认定双方都有责任；对无法确认的内容明确保留未知。
- 不进行心理疾病诊断，不冒充持证心理咨询师，不替用户决定是否修复关系。

结束方式：
- 当梳理已经比较充分，或用户表示想结束时，简要整理目前的关键发现和仍然未知的部分，询问用户是否还有想补充的内容；之后由用户自己决定是否进入总结阶段。`

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

const readJsonBody = async (request) => {
  let body = ''

  for await (const chunk of request) {
    body += chunk.toString()
    if (body.length > 100_000) {
      throw new Error('Request body is too large')
    }
  }

  if (!body) return {}

  try {
    return JSON.parse(body)
  } catch {
    const error = new Error('Invalid JSON body')
    error.statusCode = 400
    throw error
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    response.end()
    return
  }

  if (request.url?.split('?')[0] !== '/api/chat') {
    sendJson(response, 404, { error: 'Not found' })
    return
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' })
    return
  }

  try {
    const { message, history = [], channel = 'guide' } = await readJsonBody(request)

    if (typeof message !== 'string' || !message.trim()) {
      sendJson(response, 400, { error: 'message is required' })
      return
    }

    if (!Array.isArray(history)) {
      sendJson(response, 400, { error: 'history must be an array' })
      return
    }

    if (!['guide', 'friend', 'observer'].includes(channel)) {
      sendJson(response, 400, { error: 'invalid channel' })
      return
    }

    const safeHistory = history
      .filter((item) =>
        item &&
        (item.role === 'user' || item.role === 'model') &&
        typeof item.content === 'string' &&
        item.content.trim()
      )
      .slice(-20)
      .map((item) => ({
        role: item.role === 'model' ? 'assistant' : 'user',
        content: item.content.trim(),
      }))

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    })
    response.write(': connected\n\n')

    const stream = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: channel === 'friend'
            ? perspectiveSystemInstruction
            : channel === 'observer'
              ? observerSystemInstruction
              : systemInstruction,
        },
        ...safeHistory,
        { role: 'user', content: message.trim() },
      ],
      stream: true,
    })

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content
      if (text) {
        response.write(`data: ${JSON.stringify({ text })}\n\n`)
      }
    }

    response.write('event: done\ndata: {}\n\n')
    response.end()
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'DeepSeek request failed'
    console.error('DeepSeek SSE error:', messageText)

    if (!response.headersSent) {
      sendJson(response, error?.statusCode || 502, {
        error: error?.statusCode === 400 ? 'Invalid JSON body' : 'DeepSeek request failed',
      })
      return
    }

    response.write(`event: error\ndata: ${JSON.stringify({ error: 'DeepSeek request failed' })}\n\n`)
    response.end()
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Between Us chat API listening at http://127.0.0.1:${port}`)
})
