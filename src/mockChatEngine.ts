// 本地模拟对话引擎：本阶段不接入真实 AI API。
// 规则引擎根据事件细节（原话、表情/动作、回应、经过）生成“细节观察 + 一个问题”的回复，
// 并在用户表示结束时给出简要收尾整理。
// 未来接入真实大模型时，由 src/chatProvider.ts 切换到真实 API，本文件保持可用作离线回退。

export type MockChannel = 'friend' | 'observer'

export interface ChatContextInput {
  eventSummary: string
  facts: string[]
  interpretations: string[]
  emotions: string[]
  needs: string[]
  timeline: {
    title: string
    phase: string
    time: string
    event: string
    quote: string
    behavior: string
    response: string
    emotion: string
    aftermath: string
    missing: string
  }[]
  friendNotes: string[]
}

export interface MockMessage {
  role: 'user' | 'assistant'
  content: string
}

interface Detail {
  kind: string
  node: string
  text: string
}

const WRAP_UP_PATTERN = /结束|总结|收个尾|收尾|先到这里|差不多了|完成|没有.*补充|没有了|就这样/

const clampDetail = (text: string, max = 42) => {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

function collectDetails(context: ChatContextInput): Detail[] {
  const details: Detail[] = []
  for (const node of context.timeline) {
    if (node.quote.trim()) details.push({ kind: '原话', node: node.title, text: node.quote.trim() })
    if (node.behavior.trim()) details.push({ kind: '表情或动作', node: node.title, text: node.behavior.trim() })
    if (node.response.trim()) details.push({ kind: '你的回应', node: node.title, text: node.response.trim() })
    if (node.event.trim()) details.push({ kind: '当时的经过', node: node.title, text: node.event.trim() })
  }
  return details
}

// 已在前文出现过的细节不再重复引用
function unusedDetails(details: Detail[], history: MockMessage[]): Detail[] {
  const said = history.filter((item) => item.role === 'assistant').map((item) => item.content).join('\n')
  return details.filter((detail) => !said.includes(detail.text.slice(0, 10)))
}

function observerQuestion(kind: string): string {
  switch (kind) {
    case '原话':
      return '对方说出这句话时，你更在意的是这句话本身，还是说话时的语气？'
    case '表情或动作':
      return '这个表情或动作，让你当时立刻想到了什么？'
    case '你的回应':
      return '你当时那样回应，最希望对方接住的是哪一部分？'
    default:
      return '这个片段里，哪一处到现在想起来还是会让你心里紧一下？'
  }
}

function buildObserverReply(history: MockMessage[], context: ChatContextInput): string {
  const details = collectDetails(context)
  const fresh = unusedDetails(details, history)
  const pool = fresh.length > 0 ? fresh : details
  const turn = history.filter((item) => item.role === 'assistant').length
  const detail = pool[turn % pool.length]

  if (!detail) {
    const emotion = context.emotions[0] || '当时的情绪'
    return `我注意到，你把「${clampDetail(emotion, 16)}」放在了很重要的位置。\n\n如果这份感受可以退后一步被看见，你希望先被理解的是哪一部分？`
  }

  // 优先使用“对方原话 × 你的回应”的并置观察（参考用户期望的表达方式）
  const quote = context.timeline.map((node) => node.quote.trim()).find((item) => item.length > 0)
  const response = context.timeline.map((node) => node.response.trim()).find((item) => item.length > 0)
  if (turn % 3 === 0 && quote && response) {
    return `我注意到一个细节。\n\n对方说「${clampDetail(quote, 36)}」，而你的回应是「${clampDetail(response, 36)}」。\n\n你们似乎都在表达自己的感受，但回应的重点并不完全相同。我想和你确认一件事：当时你那样回应，更希望对方理解你的处境，还是希望对方知道你也在意？`
  }

  const variants = [
    `我注意到一个细节。\n\n在「${detail.node}」里，你写下的${detail.kind}是：${clampDetail(detail.text, 40)}。\n\n${observerQuestion(detail.kind)}`,
    `你写下的「${clampDetail(detail.text, 30)}」，让我停了一下。\n\n它更像是在说感受，还是在说期待？我想听你再走近一点：${observerQuestion(detail.kind)}`,
    `回到「${detail.node}」那一刻。\n\n你记下的${detail.kind}——${clampDetail(detail.text, 40)}——如果被对方看见，她可能注意到的东西和你并不一样。\n\n${observerQuestion(detail.kind)}`,
  ]
  return variants[turn % variants.length]
}

function buildObserverWrapUp(history: MockMessage[], context: ChatContextInput): string {
  const details = collectDetails(context)
  const said = history.filter((item) => item.role === 'assistant').map((item) => item.content).join('\n')
  const discussed = details.filter((detail) => said.includes(detail.text.slice(0, 10))).slice(0, 2)
  const unknowns = context.timeline
    .map((node) => node.missing.trim())
    .filter((item) => item.length > 0)
    .slice(0, 3)

  const foundLines = discussed.length > 0
    ? discussed.map((detail) => `· ${detail.node}：${clampDetail(detail.text, 24)}`).join('\n')
    : `· 你整理出了${context.timeline.filter((node) => node.event.trim() || node.quote.trim()).length}个节点的事实与感受`
  const unknownLines = unknowns.length > 0
    ? unknowns.map((item) => `· ${clampDetail(item, 24)}`).join('\n')
    : '· 对方的真实想法、动机与感受'

  return `先停在这里，我们一起把目前看到的整理一下。\n\n已经比较清楚的部分：\n${foundLines}\n\n仍然未知的部分：\n${unknownLines}\n\n在结束之前，你还有想补充的吗？如果没有，可以随时完成这次回顾。`
}

function buildFriendReply(history: MockMessage[], context: ChatContextInput, lastUserText: string): string {
  const turn = history.filter((item) => item.role === 'assistant').length
  const nodes = context.timeline.filter((node) => node.event.trim() || node.quote.trim() || node.behavior.trim())
  const pool = nodes.length > 0 ? nodes : context.timeline
  const node = pool[turn % pool.length]
  const trimmedLast = lastUserText.trim()

  const acknowledgment = trimmedLast && turn > 0
    ? `嗯，你替她想到了：${clampDetail(trimmedLast, 22)}。这仍然是一种推测，我们先带着它继续。\n\n`
    : ''

  if (!node) {
    return `${acknowledgment}时间线里还没有留下具体的片段。\n\n如果你是她，你猜她会最先记得这件事里的哪一个瞬间？`
  }

  const quote = node.quote.trim()
  const behavior = node.behavior.trim()
  const response = node.response.trim()
  const event = node.event.trim()

  if (quote) {
    return `${acknowledgment}如果站在她的位置，你还记得她说过的那句「${clampDetail(quote, 32)}」吗？\n\n你猜她说出这句话之前，心里最想让你知道的是什么？`
  }
  if (behavior) {
    return `${acknowledgment}「${node.title}」的时候，她的${clampDetail(behavior, 24)}，如果用她的眼睛来看，可能会意味着什么？\n\n试着替她解释一次，不用追求正确。`
  }
  if (response) {
    return `${acknowledgment}你的回应是「${clampDetail(response, 32)}」。\n\n如果她是先看到你的回应的人，她可能会怎么理解这句话？`
  }
  if (event) {
    return `${acknowledgment}回到「${node.title}」那一刻：${clampDetail(event, 36)}。\n\n如果你是刚经历这件事的她，你最先会注意到的会是什么？`
  }
  return `${acknowledgment}关于「${node.title}」，细节还不多。\n\n如果你是她，你最想补充哪一个她可能看见的细节？`
}

function buildFriendWrapUp(context: ChatContextInput): string {
  const notes = context.friendNotes.filter((item) => item.trim()).slice(-3)
  const noteLine = notes.length > 0
    ? notes.map((item) => `· ${clampDetail(item, 24)}`).join('\n')
    : '· 还没有留下具体的推测'
  return `你替她写下的这些，仍然是推测，不是她确认的想法。\n\n${noteLine}\n\n带着这些推测，或许可以退得更远一点——接下来，让静观从第三方位置陪你重新看看。`
}

export function generateMockReply(
  channel: MockChannel,
  userText: string,
  history: MockMessage[],
  context: ChatContextInput,
): string {
  if (WRAP_UP_PATTERN.test(userText)) {
    return channel === 'observer' ? buildObserverWrapUp(history, context) : buildFriendWrapUp(context)
  }
  return channel === 'observer'
    ? buildObserverReply(history, context)
    : buildFriendReply(history, context, userText)
}

// —— 情绪逐层探索的规则配置（同样预留真实 API 接口）——

export const drillFeelingOptions = [
  '我觉得自己没有受到重视',
  '我觉得自己的付出没有得到回应',
  '我害怕这段友情对对方来说并不重要',
  '我只是觉得这件事不公平',
]

export const feelingNeedMap: Record<string, string[]> = {
  '我觉得自己没有受到重视': ['被重视', '被认真对待'],
  '我觉得自己的付出没有得到回应': ['被回应', '被看见'],
  '我害怕这段友情对对方来说并不重要': ['被珍惜', '安全感'],
  '我只是觉得这件事不公平': ['公平对待', '被尊重'],
}

export function reflectionQuestionFor(emotion: string): string {
  if (/(难过|伤心|委屈|受伤)/.test(emotion)) {
    return '如果你可以把这份感受说给对方听而不被误解，你最想让她知道哪一点？'
  }
  if (/(生气|愤怒|火)/.test(emotion)) {
    return '如果当时她能够理解你的一件事，你最希望她理解什么？'
  }
  if (/(失望|失落)/.test(emotion)) {
    return '如果这份失望能变成一句对方听得懂的话，你会怎么说？'
  }
  if (/(困惑|不安|担心|害怕)/.test(emotion)) {
    return '你最想先弄清楚的那件事，具体是什么？'
  }
  return '如果当时她能够理解你的一件事，你最希望她理解什么？'
}

export function needsForFeelings(feelings: string[]): string[] {
  const needs = new Set<string>()
  for (const feeling of feelings) {
    for (const need of feelingNeedMap[feeling] || []) {
      needs.add(need)
    }
  }
  return [...needs]
}
