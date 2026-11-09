import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  HeartHandshake,
  ImagePlus,
  Mic,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { createNarrativeState, type NarrativeState } from './narrativeEngine'
import { streamChat, type ChatHistoryItem } from './chatProvider'
import { drillFeelingOptions, needsForFeelings, reflectionQuestionFor } from './mockChatEngine'

type Stage = 'home' | 'describe' | 'review' | 'timeline' | 'perspective' | 'complete'
type CategoryKey = 'facts' | 'interpretations' | 'emotions' | 'needs'
type Analysis = Record<CategoryKey, string[]>
type TimelineNode = {
  id: string
  title: string
  phase: string
  time: string
  event: string
  emotion: string
  interpretation: string
  missing: string
  quote: string
  behavior: string
  response: string
  aftermath: string
  status: 'confirmed' | 'pending' | 'unknown'
}
type TimelineQuestionKey = 'time' | 'event' | 'quote' | 'behavior' | 'response' | 'emotion' | 'aftermath' | 'missing'
type TimelineQuestion = { key: TimelineQuestionKey; layer: string; question: string; options: string[]; placeholder: string }
type PerspectiveMode = 'friend' | 'observer'
type PerspectiveChatMessage = {
  role: 'user' | 'assistant'
  content: string
}
type MediaItem = { id: string; dataUrl: string }
type EmotionDrill = { feelings: string[]; custom: string; reflection: string; needs: string[] }

// 图片本地压缩（最长边 640px、JPEG 0.72），避免 localStorage 超限；原始文件不上传、不外传。
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('图片解析失败'))
      image.onload = () => {
        const scale = Math.min(1, 640 / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const drawContext = canvas.getContext('2d')
        if (!drawContext) {
          reject(new Error('当前浏览器无法处理图片'))
          return
        }
        drawContext.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

const categoryMeta: Record<CategoryKey, { label: string; subtitle: string }> = {
  facts: { label: '事实', subtitle: '实际发生了什么' },
  interpretations: { label: '主观判断', subtitle: '我对事件的理解与推测' },
  emotions: { label: '情绪', subtitle: '我当时以及现在的感受' },
  needs: { label: '内在需求', subtitle: '我希望获得什么' },
}
const categoryOrder: CategoryKey[] = ['facts', 'interpretations', 'emotions', 'needs']

const reflectionGuides = [
  {
    short: '时间与关系背景',
    question: '这件事具体发生在哪一天，或哪一段时间？当时你们的关系状态是怎样的？',
    hint: '尽量写具体：日期、星期、前后发生了什么。模糊也没关系，先写最确定的部分。',
    example: '例如：上周五傍晚，我们原本约好一起吃饭，她临时说家里有事来不了。',
    keywords: ['具体日期', '关系状态', '约定或冲突'],
    predictions: ['就是最近几天', '原本有明确约定', '关系近来变得疏远', '说不清具体时间'],
  },
  {
    short: '具体对话过程',
    question: '当时你们具体说了什么？尽量像台词一样回忆原话。',
    hint: '按顺序写：她先说了什么，你回了什么，她接着又说了什么。记不清原话就写大意，并注明“大意”。',
    example: '例如：她说“我今天真的走不开”，我回“那改天吧”，之后她没有再回复。',
    keywords: ['对方原话', '你的回复', '一来一回', '关键转折'],
    predictions: ['记得对方原话', '只记得大意', '有一句让我反复想起的话', '对话到一半就断了'],
  },
  {
    short: '表情与语气',
    question: '她的表情、语气和动作，有哪些让你印象深刻的细节？',
    hint: '不只是说了什么：语速快还是慢，有没有叹气、停顿、避开你的视线，或者突然安静。',
    example: '例如：她说那句话时没有看我，语速很快，好像急着结束对话。',
    keywords: ['表情', '语气', '动作', '沉默或停顿'],
    predictions: ['她当时避开了我的视线', '语气很急或不耐烦', '出现了长时间的沉默', '没有特别注意'],
  },
  {
    short: '你的反应与内心',
    question: '你当时是怎么回应的？心里第一时间想到了什么？',
    hint: '区分你做了什么（回应）和你猜了什么（判断）。例如“我没再追问”是回应，“她不想见我”是猜测。',
    example: '例如：我没再追问，只回了“没事”。心里想：她是不是不想见我。',
    keywords: ['直接反应', '第一想法', '我的理解', '不确定处'],
    predictions: ['我保持了沉默或退开', '我继续追问想弄清楚', '我假装没事', '我猜她并不在乎'],
  },
  {
    short: '错位与转折',
    question: '回想这段交流，是从哪一句话或哪一个瞬间开始，你们理解的走向不一样了？',
    hint: '找到那个“你说东、她想西”的节点，或者突然安静下来的瞬间——交流的错位往往发生在这里。',
    example: '例如：我说“没事”，本意是让她别为难；她可能理解为我已经不高兴了。',
    keywords: ['理解错位', '突然安静', '各说各话', '转折瞬间'],
    predictions: ['我的好意被理解成相反的意思', '对方的话我理解成了别的意思', '某个瞬间后对话变得尴尬', '暂时找不到明显的错位'],
  },
  {
    short: '此刻的情绪与需求',
    question: '现在回头看，你仍然感受到哪些情绪，又最希望得到什么？',
    hint: '情绪可以并存，比如失落、困惑和担心；需求不一定是对方立刻修复，只是被理解、被回应或确认。',
    example: '例如：我感到失落和不安。我希望知道取消约定的原因，也希望关系没有因此变得疏远。',
    keywords: ['当前情绪', '内心需求', '最想确认', '下一步意愿'],
    predictions: ['感到失落或受伤', '感到困惑或不安', '希望被认真回应', '希望确认关系状态'],
  },
]

const defaultTimelineNodes: TimelineNode[] = [
  { id: 'before', title: '冲突前', phase: 'Before', time: '', event: '', emotion: '', interpretation: '', missing: '', quote: '', behavior: '', response: '', aftermath: '', status: 'pending' },
  { id: 'trigger', title: '矛盾触发', phase: 'Trigger', time: '', event: '', emotion: '', interpretation: '', missing: '', quote: '', behavior: '', response: '', aftermath: '', status: 'pending' },
  { id: 'conflict', title: '冲突发生', phase: 'Conflict', time: '', event: '', emotion: '', interpretation: '', missing: '', quote: '', behavior: '', response: '', aftermath: '', status: 'pending' },
  { id: 'aftermath', title: '关系变化', phase: 'Aftermath', time: '', event: '', emotion: '', interpretation: '', missing: '', quote: '', behavior: '', response: '', aftermath: '', status: 'pending' },
]

const timelineQuestionsByPhase: Record<string, TimelineQuestion[]> = {
  Before: [
    { key: 'time', layer: '时间与频率', question: '那段时间大概是哪几天？你们多久联系一次？', options: ['几乎每天', '每周几次', '最近明显变少', '说不清'], placeholder: '例如：上个月中旬，我们大概一周聊一两次……' },
    { key: 'event', layer: '微小的变化', question: '冲突发生前，有没有让你心里咯噔一下的小事？', options: ['回复变慢', '态度变化', '一次不愉快', '没有异常', '不确定'], placeholder: '只写你能确定的一点……' },
    { key: 'quote', layer: '当时的对话', question: '那几天你们有过什么对话？对方说过什么让你印象深刻的话？', options: ['记得原话', '记得大意', '没什么特别', '不确定'], placeholder: '尽量保留原话；不确定就写“不确定”' },
    { key: 'behavior', layer: '语气与表情', question: '对方的语气、表情或态度有什么变化吗？', options: ['变冷淡', '变敷衍', '有些回避', '和平时一样', '没注意'], placeholder: '语气、表情或动作都可以……' },
    { key: 'emotion', layer: '当时的情绪', question: '那时你的心情如何？', options: ['隐隐不安', '还挺好', '说不上来', '不确定'], placeholder: '一句话描述当时的心情……' },
    { key: 'missing', layer: '仍未确定', question: '关于这段时间，还有什么你不确定的？', options: ['对方为什么变化', '对方是否在意', '暂时没有', '不确定'], placeholder: '写下一个你想弄清但还不确定的问题……' },
  ],
  Trigger: [
    { key: 'time', layer: '具体时刻', question: '导火索具体发生在哪一天、什么时间？', options: ['当天', '前几天', '一周左右', '更早', '不确定'], placeholder: '例如：上周五傍晚，或“不确定具体时间”' },
    { key: 'event', layer: '导火索', question: '第一次让你觉得不对劲的，是什么？', options: ['一条消息', '一次见面', '临时变故', '某句话', '记不清'], placeholder: '只写你能确定的一点……' },
    { key: 'quote', layer: '对方原话', question: '对方当时具体说了什么？', options: ['记得原话', '记得大意', '没有说话', '不确定'], placeholder: '尽量保留原话；不确定就写“不确定”' },
    { key: 'behavior', layer: '表情与语气', question: '对方的语气和表情是什么样的？', options: ['冷漠', '不耐烦', '回避', '平静', '没注意'], placeholder: '语气、表情或动作……' },
    { key: 'response', layer: '你的回应', question: '你当时是怎么回应的？', options: ['追问', '沉默', '直接表达不满', '假装没事'], placeholder: '你说了什么，或者做了什么……' },
    { key: 'emotion', layer: '情绪瞬间', question: '那个瞬间你最强烈的情绪是什么？', options: ['愤怒', '委屈', '困惑', '难过', '不确定'], placeholder: '选择一个，也可以补充具体瞬间' },
    { key: 'missing', layer: '没弄明白的', question: '有什么是你当时没弄明白的？', options: ['对方的意图', '对方是否故意', '我的表达是否被误解', '暂时没有'], placeholder: '写下一个悬而未决的疑问……' },
  ],
  Conflict: [
    { key: 'time', layer: '冲突过程', question: '冲突爆发后持续了多久？后来有没有再交流？', options: ['当场结束', '冷战了几天', '之后有过交流', '一直没联系', '不确定'], placeholder: '例如：当晚不欢而散，之后一周没有联系……' },
    { key: 'event', layer: '升级瞬间', question: '冲突是从哪句话或哪个动作开始升级的？', options: ['某句话', '某个动作', '持续冷战', '没有明显升级', '记不清'], placeholder: '只写你能确定的一点……' },
    { key: 'quote', layer: '交锋原话', question: '对峙中，双方都说了什么？有没有让你到现在还记得的话？', options: ['记得原话', '记得大意', '记不清', '没有说话', '不确定'], placeholder: '尽量保留原话；不确定就写“不确定”' },
    { key: 'behavior', layer: '表情与动作', question: '对方当时的表情、动作或语气是怎样的？', options: ['激动', '冷漠', '避开', '平静', '没注意'], placeholder: '表情、动作或语气……' },
    { key: 'response', layer: '你的回应', question: '你当时做了什么回应？', options: ['说了什么', '保持沉默', '离开或结束对话', '后来回复了', '当时没有回应'], placeholder: '你说了什么，或者做了什么……' },
    { key: 'emotion', layer: '情绪瞬间', question: '冲突最激烈的瞬间，你的感受是？', options: ['愤怒', '委屈', '难过', '失望', '不确定'], placeholder: '选择一个，也可以补充具体瞬间' },
    { key: 'missing', layer: '对不上的', question: '现在回想，还有哪里是对不上的？', options: ['对方为什么那么说', '我说的哪句话让对方生气', '双方是否都在误解', '暂时没有'], placeholder: '写下对不上的那一点……' },
  ],
  Aftermath: [
    { key: 'time', layer: '时间距离', question: '冲突之后到现在，过了多久？', options: ['一两天', '一周左右', '一个月内', '更久', '不确定'], placeholder: '例如：快两周了……' },
    { key: 'event', layer: '后续联系', question: '之后你们有联系过吗？最近一次交流是怎样的？', options: ['没有联系', '简短联系过', '恢复了交流', '对方主动联系', '不确定'], placeholder: '只写你能确认的变化……' },
    { key: 'quote', layer: '后来的话', question: '对方后来有没有说过什么？比如解释、道歉或别的话？', options: ['记得原话', '记得大意', '没有说过', '不确定'], placeholder: '尽量保留原话；不确定就写“不确定”' },
    { key: 'behavior', layer: '行动变化', question: '对方的行动有什么变化？比如回避、示好或如常？', options: ['回避', '示好', '和平时一样', '没注意', '不确定'], placeholder: '只写你能确认的变化……' },
    { key: 'response', layer: '你的做法', question: '你后来做了什么？', options: ['没有联系', '主动联系过', '等待对方', '放下不再提', '不确定'], placeholder: '你做了什么，或者没做什么……' },
    { key: 'emotion', layer: '现在的情绪', question: '现在的你回头看，心情如何？', options: ['难过', '平静', '生气', '释然', '说不清'], placeholder: '一句话描述现在的心情……' },
    { key: 'missing', layer: '想弄清的', question: '关于这段关系，还有什么你想弄清楚但还不确定的？', options: ['对方是否还重视', '关系还能不能恢复', '我是否也该说点什么', '暂时没有'], placeholder: '写下一个你还没有答案的问题……' },
  ],
}

const fallbackTimelineQuestions: TimelineQuestion[] = [
  { key: 'event', layer: '事件触发', question: '最初发生了什么？', options: ['一次对话', '一条消息', '一次见面', '某个行为', '记不清'], placeholder: '只写你能确定的一点……' },
  { key: 'time', layer: '具体时间', question: '大概发生在什么时候？', options: ['当天', '前几天', '一周左右', '更早', '不确定'], placeholder: '例如：上周五傍晚，或“不确定具体时间”' },
  { key: 'quote', layer: '具体表达', question: '还记得对方当时具体说了什么吗？', options: ['记得原话', '记得大意', '记不清', '没有说话', '不确定'], placeholder: '尽量保留原话；不确定就写“不确定”' },
  { key: 'behavior', layer: '表情与动作', question: '对方的语气、表情或动作，有哪些细节？', options: ['表情', '语气', '停顿或沉默', '距离或姿势', '没有特别注意'], placeholder: '语气、表情或动作都可以……' },
  { key: 'response', layer: '你的回应', question: '当时你是怎么回应的？', options: ['说了什么', '保持沉默', '离开或结束对话', '后来回复了', '当时没有回应'], placeholder: '你说了什么，或者做了什么……' },
  { key: 'emotion', layer: '情绪瞬间', question: '哪个瞬间让你最不舒服？', options: ['失望', '委屈', '愤怒', '困惑', '担心', '不确定'], placeholder: '选择一个，也可以补充具体瞬间' },
  { key: 'missing', layer: '仍未确定', question: '关于这个节点，还有什么你不确定的？', options: ['对方的意图', '我是否被误解', '暂时没有', '不确定'], placeholder: '写下一个你还没有答案的问题……' },
]

const questionsForNode = (node: TimelineNode): TimelineQuestion[] =>
  timelineQuestionsByPhase[node.phase] || fallbackTimelineQuestions

const nodeAnsweredCount = (node: TimelineNode): number =>
  questionsForNode(node).filter((question) => (node[question.key] || '').trim()).length

// 节点派生状态：全部答完且无未知项 → confirmed；有未知标记 → unknown；部分/未开始 → pending
const nodeDerivedStatus = (node: TimelineNode): TimelineNode['status'] => {
  const questions = questionsForNode(node)
  if (nodeAnsweredCount(node) < questions.length) return 'pending'
  return node.missing.trim() ? 'unknown' : 'confirmed'
}


function createAnalysis(text: string): Analysis {
  void text
  return {
    facts: ['约定发生变化'],
    interpretations: ['担心关系疏远'],
    emotions: ['失落或受伤', '困惑'],
    needs: ['被认真回应'],
  }
}

function App() {
  const stored = (() => {
    try {
      const saved = localStorage.getItem('between-us-state')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })()

  const validStages: Stage[] = ['home', 'describe', 'review', 'timeline', 'perspective', 'complete']
  const [stage, setStage] = useState<Stage>(validStages.includes(stored?.stage as Stage) ? stored?.stage as Stage : 'home')
  const [eventText, setEventText] = useState(stored?.eventText || '')
  const [eventSummary, setEventSummary] = useState<string>(stored?.eventSummary || '')
  const [descriptionIntroComplete, setDescriptionIntroComplete] = useState<boolean>(stored?.descriptionIntroComplete ?? false)
  const [guidedStep, setGuidedStep] = useState<number>(stored?.guidedStep || 0)
  const [guidedAnswers, setGuidedAnswers] = useState<string[]>(
    Array.isArray(stored?.guidedAnswers)
      ? [...stored.guidedAnswers, ...Array(Math.max(0, reflectionGuides.length - stored.guidedAnswers.length)).fill('')].slice(0, reflectionGuides.length)
      : reflectionGuides.map(() => ''),
  )
  const [analysis, setAnalysis] = useState<Analysis>(stored?.analysis || { facts: [], interpretations: [], emotions: [], needs: [] })
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [newItems, setNewItems] = useState<Record<CategoryKey, string>>({ facts: '', interpretations: '', emotions: '', needs: '' })
  const [timelineNodes, setTimelineNodes] = useState<TimelineNode[]>(
    Array.isArray(stored?.timelineNodes) && stored.timelineNodes.length
      ? stored.timelineNodes.map((node: Partial<TimelineNode>, index: number) => ({
          ...defaultTimelineNodes[0],
          ...node,
          id: node.id || `node-migrated-${index}`,
          status: node.status || (node.event?.trim() ? 'confirmed' : 'pending'),
          quote: node.quote || '',
          behavior: node.behavior || '',
          response: node.response || '',
          aftermath: node.aftermath || '',
        }))
      : defaultTimelineNodes,
  )
  const [timelineIndex, setTimelineIndex] = useState<number>(
    typeof stored?.timelineIndex === 'number' ? stored.timelineIndex : 0,
  )
  const [perspectiveIndex, setPerspectiveIndex] = useState<number>(typeof stored?.perspectiveIndex === 'number' ? stored.perspectiveIndex : 0)
  const [narrativeState, setNarrativeState] = useState<NarrativeState>(
    stored?.narrativeState?.archive && Array.isArray(stored.narrativeState.checkpoints)
      ? stored.narrativeState
      : createNarrativeState(),
  )
  const [perspectiveMode, setPerspectiveMode] = useState<PerspectiveMode>(stored?.perspectiveMode === 'observer' ? 'observer' : 'friend')
  const [friendMessages, setFriendMessages] = useState<PerspectiveChatMessage[]>(
    Array.isArray(stored?.friendMessages) ? stored.friendMessages : [],
  )
  const [observerMessages, setObserverMessages] = useState<PerspectiveChatMessage[]>(
    Array.isArray(stored?.observerMessages) ? stored.observerMessages : [],
  )
  const [friendDraft, setFriendDraft] = useState('')
  const [observerDraft, setObserverDraft] = useState('')
  const [friendLoading, setFriendLoading] = useState(false)
  const [observerLoading, setObserverLoading] = useState(false)
  const [friendPerspectiveComplete, setFriendPerspectiveComplete] = useState<boolean>(stored?.friendPerspectiveComplete ?? false)
  const [observerComplete, setObserverComplete] = useState<boolean>(stored?.observerComplete ?? false)
  const [observerWrapUp, setObserverWrapUp] = useState<string>(stored?.observerWrapUp || '')
  const wrapUpPending = useRef(false)
  const [emotionDrills, setEmotionDrills] = useState<Record<string, EmotionDrill>>(stored?.emotionDrills || {})
  const [drillEmotion, setDrillEmotion] = useState<string | null>(null)
  const [drillStep, setDrillStep] = useState(1)
  const [drillFeelings, setDrillFeelings] = useState<string[]>([])
  const [drillCustom, setDrillCustom] = useState('')
  const [drillReflection, setDrillReflection] = useState('')
  const [drillNeeds, setDrillNeeds] = useState<string[]>([])
  const [drillCustomNeed, setDrillCustomNeed] = useState('')
  const [guidedMedia, setGuidedMedia] = useState<Record<number, MediaItem[]>>(stored?.guidedMedia || {})
  const [nodeMedia, setNodeMedia] = useState<Record<string, MediaItem[]>>(stored?.nodeMedia || {})
  const [voiceListening, setVoiceListening] = useState<null | 'guided' | 'timeline'>(null)
  const [voiceNotice, setVoiceNotice] = useState('')
  const recognitionRef = useRef<{ stop: () => void } | null>(null)
  const [optionFlash, setOptionFlash] = useState<string | null>(null)
  const [nodeCompletePulse, setNodeCompletePulse] = useState<string | null>(null)
  const advanceTimer = useRef<number | null>(null)
  const [homePointer, setHomePointer] = useState({ x: 50, y: 50 })
  const [exploredSections, setExploredSections] = useState<string[]>(stored?.exploredSections || [])
  const [homeFocus, setHomeFocus] = useState<string | null>(null)
  const [timelineMode, setTimelineMode] = useState<'map' | 'explore'>(stored?.timelineMode === 'explore' ? 'explore' : 'map')
  const [timelineQuestion, setTimelineQuestion] = useState<number>(stored?.timelineQuestion || 0)
  const [timelinePan, setTimelinePan] = useState<{ x: number; y: number }>(stored?.timelinePan || { x: 0, y: 0 })
  const [timelineDraft, setTimelineDraft] = useState<string>(stored?.timelineDraft || '')
  const timelineDrag = useRef({ active: false, x: 0, y: 0, originX: 0, originY: 0, moved: false })

  useEffect(() => {
    localStorage.setItem('between-us-state', JSON.stringify({
      stage, eventText, eventSummary, descriptionIntroComplete, analysis, timelineNodes, timelineIndex,
      guidedStep, guidedAnswers, perspectiveIndex,
      timelineMode, timelineQuestion, timelinePan, timelineDraft, exploredSections,
      narrativeState,
      perspectiveMode, friendMessages, observerMessages, friendPerspectiveComplete, observerComplete, observerWrapUp,
      emotionDrills, guidedMedia, nodeMedia,
    }))
  }, [stage, eventText, eventSummary, descriptionIntroComplete, analysis, timelineNodes, timelineIndex, guidedStep, guidedAnswers, timelineMode, timelineQuestion, timelinePan, timelineDraft, perspectiveIndex, exploredSections, narrativeState, perspectiveMode, friendMessages, observerMessages, friendPerspectiveComplete, observerComplete, observerWrapUp, emotionDrills, guidedMedia, nodeMedia])

  const getPerspectiveContext = () =>
    [
      `事件概述：${eventSummary.trim() || eventText.trim() || '暂无概述'}`,
      `事实：${analysis.facts.join('；') || '暂无'}`,
      `主观判断：${analysis.interpretations.join('；') || '暂无'}`,
      `情绪：${analysis.emotions.join('；') || '暂无'}`,
      `需求：${analysis.needs.join('；') || '暂无'}`,
      `时间线：${timelineNodes.map((node) =>
        [node.title, node.event, node.quote, node.behavior, node.response, node.emotion, node.aftermath, node.missing]
          .filter((value) => value.trim())
          .join('；'),
      ).filter(Boolean).join('\n') || '暂无补充'}`,
    ].join('\n')

  // 对话通道统一走 chatProvider：本阶段为本地模拟引擎，VITE_USE_REAL_LLM=true 时切换真实 API。
  const requestPerspectiveChat = async (mode: PerspectiveMode, text?: string, wrapUp = false) => {
    const isFriend = mode === 'friend'
    const historyMessages = isFriend ? friendMessages : observerMessages
    const friendExplorationNotes = friendMessages
      .filter((item) => item.role === 'user')
      .map((item) => item.content.trim())
      .filter((content) => content.length > 0)
    const message = text?.trim() || (wrapUp
      ? '我们先把这次回顾收个尾吧：请简要整理目前的关键发现和仍然未知的部分，并问我是否还有想补充的。'
      : isFriend
        ? '请根据以下背景开始朋友视角探索：先提出一个具体、温和的朋友视角问题。'
        : '背景资料在下方。请先认真读完，然后从你注意到的第一个具体细节开始：说出你的观察，再问我一个问题。')

    if (isFriend) setFriendLoading(true)
    else setObserverLoading(true)
    if (wrapUp) wrapUpPending.current = true

    const updateLastAssistant = (content: string) => {
      if (isFriend) {
        setFriendMessages((current) => [...current, { role: 'assistant', content }])
      } else {
        setObserverMessages((current) => [...current, { role: 'assistant', content }])
      }
    }

    try {
      updateLastAssistant('')
      let streamedText = ''
      await streamChat({
        channel: mode,
        message: `${message}\n\n背景资料：\n${getPerspectiveContext()}${isFriend || friendExplorationNotes.length === 0 ? '' : `\n\n朋友视角探索记录（用户站在朋友位置写下的推测）：\n${friendExplorationNotes.join('\n')}`}`,
        history: historyMessages.map((item) => ({
          role: item.role,
          content: item.content,
        })) as ChatHistoryItem[],
        context: {
          eventSummary,
          facts: analysis.facts,
          interpretations: analysis.interpretations,
          emotions: analysis.emotions,
          needs: analysis.needs,
          timeline: timelineNodes,
          friendNotes: friendExplorationNotes,
        },
        onDelta: (fullText) => {
          streamedText = fullText
          if (isFriend) {
            setFriendMessages((current) => current.map((item, index) =>
              index === current.length - 1 && item.role === 'assistant' ? { ...item, content: fullText } : item,
            ))
          } else {
            setObserverMessages((current) => current.map((item, index) =>
              index === current.length - 1 && item.role === 'assistant' ? { ...item, content: fullText } : item,
            ))
          }
        },
      })
      // 收尾请求完成后，把整理结果保存到完成页
      if (wrapUpPending.current && !isFriend) {
        setObserverWrapUp(streamedText)
        setObserverComplete(true)
        wrapUpPending.current = false
      }
    } catch (error) {
      updateLastAssistant(`现在暂时无法连接视角分析服务：${error instanceof Error ? error.message : '请稍后再试'}。你仍然可以继续输入自己的看法。`)
    } finally {
      if (isFriend) setFriendLoading(false)
      else setObserverLoading(false)
    }
  }

  const submitFriendPerspective = (text: string) => {
    const value = text.trim()
    if (!value || friendLoading) return
    setFriendMessages((current) => [...current, { role: 'user', content: value }])
    void requestPerspectiveChat('friend', value)
    setFriendDraft('')
  }

  const submitObserverPerspective = (text: string) => {
    const value = text.trim()
    if (!value || observerLoading) return
    setObserverMessages((current) => [...current, { role: 'user', content: value }])
    void requestPerspectiveChat('observer', value)
    setObserverDraft('')
  }

  const go = (next: Stage, forcedPerspectiveMode?: PerspectiveMode) => {
    if (next === 'perspective') {
      const nextMode = forcedPerspectiveMode || 'friend'
      setPerspectiveMode(nextMode)
      setNarrativeState((current) =>
        current.archive.facts.length === 0 && !current.completed
          ? createNarrativeState(perspectiveTimeline)
          : current,
      )
      if (nextMode === 'friend' && friendMessages.length === 0 && !friendLoading) {
        window.setTimeout(() => void requestPerspectiveChat('friend'), 0)
      }
      if (nextMode === 'observer' && observerMessages.length === 0 && !observerLoading) {
        window.setTimeout(() => void requestPerspectiveChat('observer'), 0)
      }
    }
    setStage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const enterHomeSpace = (section: string, next: Stage) => {
    setExploredSections((current) => current.includes(section) ? current : [...current, section])
    setHomeFocus(section)
    window.setTimeout(() => go(next), 520)
  }

  const updateGuidedAnswer = (value: string) => {
    setGuidedAnswers((current) =>
      current.map((answer, index) => index === guidedStep ? value : answer),
    )
  }

  const togglePredictedChoice = (choice: string) => {
    setGuidedAnswers((current) =>
      current.map((answer, index) => {
        if (index !== guidedStep) return answer
        if (answer.includes(choice)) {
          return answer.replace(choice, '').replace(/\n{2,}/g, '\n').trim()
        }
        return answer.trim() ? `${answer.trim()}\n${choice}` : choice
      }),
    )
  }

  // —— 语音输入（浏览器 Web Speech API；不可用时降级为提示手动输入，接口可替换为真实转写服务）——
  const startVoiceInput = (target: 'guided' | 'timeline') => {
    if (voiceListening) {
      recognitionRef.current?.stop()
      return
    }
    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition
      || (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceNotice('当前浏览器不支持语音识别，请手动输入文字。')
      return
    }
    const recognition = new (SpeechRecognition as new () => {
      lang: string
      interimResults: boolean
      continuous: boolean
      start: () => void
      stop: () => void
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
      onerror: (() => void) | null
      onend: (() => void) | null
    })()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      let transcript = ''
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript
      }
      const trimmed = transcript.trim()
      if (!trimmed) return
      if (target === 'guided') {
        updateGuidedAnswer(`${guidedAnswers[guidedStep]}${guidedAnswers[guidedStep].trim() ? ' ' : ''}${trimmed}`.trim())
      } else {
        setTimelineDraft((current) => `${current}${current.trim() ? ' ' : ''}${trimmed}`.trim())
      }
    }
    recognition.onerror = () => setVoiceNotice('语音识别暂时不可用，请手动输入文字。')
    recognition.onend = () => setVoiceListening(null)
    recognitionRef.current = recognition
    setVoiceNotice('')
    setVoiceListening(target)
    recognition.start()
  }

  const addGuidedMedia = async (file: File) => {
    try {
      const dataUrl = await shrinkImage(file)
      setGuidedMedia((current) => {
        const items = current[guidedStep] || []
        if (items.length >= 3) return current
        return { ...current, [guidedStep]: [...items, { id: crypto.randomUUID(), dataUrl }] }
      })
    } catch {
      setVoiceNotice('图片处理失败，请换一张试试。')
    }
  }

  const removeGuidedMedia = (step: number, id: string) => {
    setGuidedMedia((current) => {
      const items = (current[step] || []).filter((item) => item.id !== id)
      return { ...current, [step]: items }
    })
  }

  const addNodeMedia = async (file: File) => {
    try {
      const dataUrl = await shrinkImage(file)
      const nodeId = timelineNodes[timelineIndex]?.id
      if (!nodeId) return
      setNodeMedia((current) => {
        const items = current[nodeId] || []
        if (items.length >= 3) return current
        return { ...current, [nodeId]: [...items, { id: crypto.randomUUID(), dataUrl }] }
      })
    } catch {
      setVoiceNotice('图片处理失败，请换一张试试。')
    }
  }

  const removeNodeMedia = (nodeId: string, id: string) => {
    setNodeMedia((current) => {
      const items = (current[nodeId] || []).filter((item) => item.id !== id)
      return { ...current, [nodeId]: items }
    })
  }

  // —— 情绪逐层探索 ——
  const openEmotionDrill = (emotion: string) => {
    const saved = emotionDrills[emotion]
    setDrillEmotion(emotion)
    setDrillStep(1)
    setDrillFeelings(saved?.feelings || [])
    setDrillCustom(saved?.custom || '')
    setDrillReflection(saved?.reflection || '')
    setDrillNeeds(saved?.needs || [])
    setDrillCustomNeed('')
  }

  const closeEmotionDrill = () => {
    setDrillEmotion(null)
    setDrillStep(1)
    setDrillCustomNeed('')
  }

  const saveEmotionDrill = () => {
    if (!drillEmotion) return
    const needs = [...drillNeeds]
    if (drillCustomNeed.trim() && !needs.includes(drillCustomNeed.trim())) {
      needs.push(drillCustomNeed.trim())
    }
    setEmotionDrills((current) => ({
      ...current,
      [drillEmotion]: {
        feelings: drillFeelings,
        custom: drillCustom,
        reflection: drillReflection,
        needs,
      },
    }))
    setAnalysis((current) => ({
      ...current,
      needs: [...current.needs, ...needs.filter((need) => !current.needs.includes(need))],
    }))
    closeEmotionDrill()
  }

  const combinedEventText = [
    eventSummary.trim(),
    ...guidedAnswers.map((answer) => answer.trim()),
  ].filter(Boolean).join('\n\n')

  const startAnalysis = () => {
    if (!combinedEventText.trim()) return
    setEventText(combinedEventText)
    setIsAnalyzing(true)
    window.setTimeout(() => {
      setAnalysis(createAnalysis(combinedEventText))
      go('review')
      setIsAnalyzing(false)
    }, 850)
  }

  const updateItem = (category: CategoryKey, index: number, value: string) => {
    setAnalysis((current) => ({
      ...current,
      [category]: current[category].map((item, itemIndex) => itemIndex === index ? value : item),
    }))
  }
  const deleteItem = (category: CategoryKey, index: number) => {
    setAnalysis((current) => ({ ...current, [category]: current[category].filter((_, itemIndex) => itemIndex !== index) }))
  }
  const addItem = (category: CategoryKey) => {
    const value = newItems[category].trim()
    if (!value) return
    setAnalysis((current) => ({ ...current, [category]: [...current[category], value] }))
    setNewItems((current) => ({ ...current, [category]: '' }))
  }

  const resetAll = () => {
    setStage('home')
    setEventText('')
    setEventSummary('')
    setDescriptionIntroComplete(false)
    setGuidedStep(0)
    setGuidedAnswers(reflectionGuides.map(() => ''))
    setAnalysis({ facts: [], interpretations: [], emotions: [], needs: [] })
    setTimelineNodes(defaultTimelineNodes.map((node) => ({ ...node })))
    setTimelineIndex(0)
    setTimelineMode('map')
    setTimelineQuestion(0)
    setTimelinePan({ x: 0, y: 0 })
    setTimelineDraft('')
    setPerspectiveIndex(0)
    setNarrativeState(createNarrativeState())
    setPerspectiveMode('friend')
    setFriendMessages([])
    setObserverMessages([])
    setFriendDraft('')
    setObserverDraft('')
    setFriendPerspectiveComplete(false)
    setObserverComplete(false)
    setObserverWrapUp('')
    setEmotionDrills({})
    setDrillEmotion(null)
    setDrillStep(1)
    setDrillFeelings([])
    setDrillCustom('')
    setDrillReflection('')
    setDrillNeeds([])
    setDrillCustomNeed('')
    setGuidedMedia({})
    setNodeMedia({})
    setExploredSections([])
    setHomeFocus(null)
    localStorage.removeItem('between-us-state')
  }

  const updateTimelineNode = (field: keyof TimelineNode, value: string) => {
    setTimelineNodes((current) => current.map((node, index) =>
      index === timelineIndex ? {
        ...node,
        [field]: value,
        status: value.trim() ? 'confirmed' : node.status === 'confirmed' ? 'pending' : node.status,
      } : node,
    ))
  }

  const activeNodeQuestions = questionsForNode(timelineNodes[timelineIndex] || defaultTimelineNodes[0])
  const currentTimelineQuestion = Math.min(timelineQuestion, Math.max(0, activeNodeQuestions.length - 1))

  const finishNodeAndReturn = (pulse: boolean) => {
    if (pulse) {
      const node = timelineNodes[timelineIndex]
      setNodeCompletePulse(node.id)
      window.setTimeout(() => setNodeCompletePulse(null), 2600)
    }
    setTimelineMode('map')
    setTimelineDraft('')
  }

  const scheduleAdvance = (delay = 520, complete = false) => {
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current)
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null
      if (currentTimelineQuestion < activeNodeQuestions.length - 1) {
        setTimelineQuestion((current) => current + 1)
        setTimelineDraft('')
      } else {
        finishNodeAndReturn(complete)
      }
    }, delay)
  }

  const chooseTimelineAnswer = (value: string) => {
    const question = activeNodeQuestions[currentTimelineQuestion]
    if (!question) return
    const node = timelineNodes[timelineIndex]
    if (!node) return
    const currentValue = node[question.key] || ''
    const isUnknownOption = /记不清|不确定|没注意|说不上|说不清/.test(value)
    const wasRecorded = currentValue.includes(value) || node.missing.includes(value)
    setOptionFlash(value)
    window.setTimeout(() => setOptionFlash(null), 900)
    if (isUnknownOption) {
      setTimelineNodes((current) => current.map((item, index) => index === timelineIndex ? {
        ...item,
        missing: item.missing && item.missing.includes(value) ? item.missing : item.missing ? `${item.missing}；${value}` : value,
        status: 'unknown',
      } : item))
    } else if (!wasRecorded) {
      const nextValue = currentValue ? `${currentValue}\n${value}` : value
      setTimelineNodes((current) => current.map((item, index) => index === timelineIndex ? {
        ...item,
        [question.key]: nextValue,
        status: 'confirmed',
      } : item))
    }
    // 计算本次回答后该节点是否已全部回溯，用于最后一问的“点亮”反馈
    const answeredAfter = activeNodeQuestions.filter((item) => {
      if (item.key === question.key && !isUnknownOption) return true
      return (node[item.key] || '').trim().length > 0
    }).length
    const complete = answeredAfter >= activeNodeQuestions.length
    setTimelineDraft('')
    scheduleAdvance(wasRecorded ? 380 : 520, complete)
  }

  const saveTimelineDraft = () => {
    const value = timelineDraft.trim()
    if (!value) return
    chooseTimelineAnswer(value)
  }

  const nextTimelineQuestion = () => {
    if (currentTimelineQuestion < activeNodeQuestions.length - 1) {
      setTimelineQuestion((current) => current + 1)
      setTimelineDraft('')
    } else {
      const node = timelineNodes[timelineIndex]
      finishNodeAndReturn(node ? nodeAnsweredCount(node) >= activeNodeQuestions.length : false)
    }
  }

  const skipTimelineQuestion = () => {
    setTimelineNodes((current) => current.map((node, index) => index === timelineIndex ? {
      ...node,
      status: node.status === 'confirmed' ? 'confirmed' : 'unknown',
    } : node))
    nextTimelineQuestion()
  }

  const previousTimelineQuestion = () => {
    if (currentTimelineQuestion > 0) {
      setTimelineQuestion((current) => current - 1)
      setTimelineDraft('')
    }
  }

  const addTimelineNode = () => {
    const nextIndex = timelineNodes.length
    setTimelineNodes((current) => [
      ...current,
      {
        id: `node-${crypto.randomUUID()}`,
        title: `补充节点 ${nextIndex + 1}`,
        phase: '补充回忆',
        time: '',
        event: '',
        emotion: '',
        interpretation: '',
        missing: '',
        quote: '',
        behavior: '',
        response: '',
        aftermath: '',
        status: 'pending',
      },
    ])
    setTimelineIndex(nextIndex)
  }

  const deleteTimelineNode = () => {
    if (timelineNodes.length <= 1) return
    if (!window.confirm(`确定删除“${timelineNodes[timelineIndex].title}”节点吗？`)) return
    setTimelineNodes((current) => current.filter((_, index) => index !== timelineIndex))
    setTimelineIndex((current) => Math.max(0, current > 0 ? current - 1 : 0))
  }

  const activeTimeline = timelineNodes[timelineIndex] || defaultTimelineNodes[0]
  const perspectiveTimeline = timelineNodes[perspectiveIndex] || timelineNodes[0] || defaultTimelineNodes[0]

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <button className="brand" onClick={() => go('home')} aria-label="返回首页">
          <span className="brand-mark"><HeartHandshake size={18} /></span><span>Between Us</span>
        </button>
        {stage === 'home' ? (
          <nav className="home-nav" aria-label="主要章节">
            <button onClick={() => enterHomeSpace('describe', 'describe')}><span>01</span>记录冲突</button>
            <button onClick={() => enterHomeSpace('timeline', 'timeline')}><span>02</span>回溯视角</button>
          </nav>
        ) : (
          <div className="progress" aria-label="当前进度">
            {[
              '描述',
              '回溯',
              '视角',
              '静观',
            ].map((label, index) => {
              const activeIndex = ['describe', 'review'].includes(stage) ? 0 : stage === 'timeline' ? 1 : stage === 'perspective' ? 2 : 3
              return (
                <div className="progress-wrap" key={label}>
                  <div className={`progress-step ${activeIndex === index ? 'active' : activeIndex > index ? 'done' : ''}`}>
                    <span>{activeIndex > index ? <Check size={12} /> : index + 1}</span><small>{label}</small>
                  </div>
                  {index < 3 && <div className="progress-line" />}
                </div>
              )
            })}
          </div>
        )}
      </header>

      <main>
        {stage === 'home' && (
          <section
            className="home-page page-enter"
            style={{
              '--pointer-x': `${homePointer.x}%`,
              '--pointer-y': `${homePointer.y}%`,
              '--parallax-x': `${(homePointer.x - 50) * -0.12}px`,
              '--parallax-y': `${(homePointer.y - 50) * -0.12}px`,
            } as React.CSSProperties}
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setHomePointer({
                x: ((event.clientX - rect.left) / rect.width) * 100,
                y: ((event.clientY - rect.top) / rect.height) * 100,
              })
            }}
          >
            <div className="terrain terrain-back" aria-hidden="true">
              <svg viewBox="0 0 900 620" preserveAspectRatio="none">
                <path d="M-40 420 C 110 290, 250 510, 390 330 S 650 210, 940 380" />
                <path d="M-40 460 C 120 330, 250 550, 420 370 S 670 250, 940 420" />
                <path d="M-20 500 C 150 370, 290 590, 440 410 S 700 300, 940 460" />
                <path d="M 80 230 C 230 120, 390 330, 530 180 S 790 100, 960 220" />
              </svg>
            </div>
            <div className="terrain terrain-front" aria-hidden="true">
              <svg viewBox="0 0 900 620" preserveAspectRatio="none">
                <path d="M-60 540 C 100 420, 250 610, 430 470 S 720 360, 960 500" />
                <path d="M-30 580 C 130 460, 270 650, 460 510 S 760 410, 970 540" />
                <path d="M-20 620 C 150 500, 310 690, 500 550 S 790 450, 980 580" />
              </svg>
            </div>
            <div className="paper-fragment fragment-a" aria-hidden="true" />
            <div className="mist-layer" aria-hidden="true" />
            <div className="particle-field" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((particle) => (
                <i key={particle} className={`particle particle-${particle}`} />
              ))}
            </div>
            <button
              className={`space-node node-record ${exploredSections.includes('describe') ? 'explored' : ''} ${homeFocus === 'describe' ? 'focusing' : ''}`}
              onClick={() => enterHomeSpace('describe', 'describe')}
              aria-label="进入事件记录"
            >
              <span className="space-node-core" />
              <span className="space-node-label">记录这件事</span>
            </button>
            <button
              className={`space-node node-timeline ${exploredSections.includes('timeline') ? 'explored' : ''} ${homeFocus === 'timeline' ? 'focusing' : ''}`}
              onClick={() => enterHomeSpace('timeline', 'timeline')}
              aria-label="进入冲突时间线"
            >
              <span className="space-node-core" />
              <span className="space-node-label">回到来时的路径</span>
            </button>
            <button
              className={`space-node node-perspective ${exploredSections.includes('perspective') ? 'explored' : ''} ${homeFocus === 'perspective' ? 'focusing' : ''}`}
              onClick={() => enterHomeSpace('perspective', 'perspective')}
              aria-label="进入对方可能视角探索"
            >
              <span className="space-node-core" />
              <span className="space-node-label">换一个位置看</span>
            </button>
            <button
              className={`space-node node-observer ${exploredSections.includes('observer') ? 'explored' : ''} ${homeFocus === 'observer' ? 'focusing' : ''}`}
              onClick={() => {
                setExploredSections((current) => current.includes('observer') ? current : [...current, 'observer'])
                setHomeFocus('observer')
                window.setTimeout(() => go('perspective', 'observer'), 520)
              }}
              aria-label="进入静观第三方视角"
            >
              <span className="space-node-core" />
              <span className="space-node-label">静观</span>
            </button>
            <div className="home-copy">
              <span className="home-kicker">Between Us</span>
              <h1>Explore the space<br />between perspectives.</h1>
              <p className="home-guidance">有些关系，值得重新看一看。</p>
              <button className="primary-button home-start" onClick={() => enterHomeSpace('describe', 'describe')}>
                开始探索 <ArrowRight size={17} />
              </button>
            </div>
            <div className="home-side-note">
              <span className="side-index">FIELD NOTE · 01</span>
              <p>事实、猜测、情绪与需求之间<br />原本也许没有清楚的边界。</p>
            </div>
            <div className="home-coordinate" aria-hidden="true">34° 12′ N<br />视角之间</div>
          </section>
        )}

        {stage === 'describe' && (
          <section className="describe-page page-enter">
            {!descriptionIntroComplete ? (
              <div className="describe-intro-layer">
                <div className="describe-layer-header">
                  <span className="eyebrow"><span /> 从一段话开始</span>
                  <span className="layer-count">第一步 · 整体概括</span>
                </div>
                <div className="describe-intro-content">
                  <div>
                    <h1>先用一两句话，<br />说说整件事。</h1>
                    <p>不需要立刻想清楚细节。你现在能确定的部分，就已经足够开始。</p>
                  </div>
                  <div className="describe-summary-box">
                    <label htmlFor="event-summary">整件事发生了什么？</label>
                    <textarea
                      id="event-summary"
                      aria-label="简短概括整件事"
                      value={eventSummary}
                      onChange={(event) => setEventSummary(event.target.value)}
                      placeholder="例如：朋友临时取消了约定，我们之后都没有继续联系。"
                      maxLength={240}
                      autoFocus
                    />
                    <div className="summary-meta"><span>先写事实，不必解释原因</span><span>{eventSummary.length} / 240</span></div>
                  </div>
                </div>
                <div className="describe-layer-footer">
                  <button className="secondary-button" onClick={() => go('home')}><ArrowLeft size={16} /> 返回首页</button>
                  <button className="primary-button" disabled={!eventSummary.trim()} onClick={() => setDescriptionIntroComplete(true)}>
                    开始回溯 <ArrowRight size={17} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="guided-layer-page" key={guidedStep}>
                <div className="describe-layer-header">
                  <span className="eyebrow"><span /> 此刻的声音</span>
                  <span className="layer-count">第 {guidedStep + 1} 层 / 共 {reflectionGuides.length} 层</span>
                </div>
                <div className="guided-layer-content">
                  <div className="guided-main-question">
                    <span className="guided-step-label">{reflectionGuides[guidedStep].short}</span>
                    <h1>{reflectionGuides[guidedStep].question}</h1>
                    <div className="guidance-note"><span>可以这样回想</span><p>{reflectionGuides[guidedStep].hint}</p></div>
                  </div>
                  <div className="guided-response">
                    <div className="prediction-options" aria-label="AI 可能的回忆选项">
                      <span>也许有这些可能：</span>
                      <div>
                        {reflectionGuides[guidedStep].predictions.map((prediction) => {
                          const selected = guidedAnswers[guidedStep].includes(prediction)
                          return (
                            <button
                              type="button"
                              key={prediction}
                              className={`prediction-chip ${selected ? 'selected' : ''}`}
                              aria-pressed={selected}
                              onClick={() => togglePredictedChoice(prediction)}
                            >
                              {selected && <Check size={12} />} {prediction}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <label htmlFor="event-description">补充或自行描述</label>
                    <textarea
                      id="event-description"
                      aria-label={reflectionGuides[guidedStep].question}
                      value={guidedAnswers[guidedStep]}
                      onChange={(event) => updateGuidedAnswer(event.target.value)}
                      placeholder={reflectionGuides[guidedStep].example}
                      maxLength={1200}
                    />
                    <div className="recall-tools">
                      <button
                        type="button"
                        className={`recall-tool ${voiceListening === 'guided' ? 'listening' : ''}`}
                        onClick={() => startVoiceInput('guided')}
                        aria-label="语音输入"
                        title="用语音描述"
                      >
                        <Mic size={14} /> {voiceListening === 'guided' ? '正在聆听…' : '语音补充'}
                      </button>
                      <label className="recall-tool" aria-label="添加图片补充">
                        <ImagePlus size={14} /> 图片补充
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) void addGuidedMedia(file)
                            event.target.value = ''
                          }}
                        />
                      </label>
                    </div>
                    {(guidedMedia[guidedStep]?.length || 0) > 0 && (
                      <div className="recall-media-row">
                        {(guidedMedia[guidedStep] || []).map((item) => (
                          <span className="recall-media" key={item.id}>
                            <img src={item.dataUrl} alt="补充的图片" />
                            <button type="button" aria-label="移除图片" onClick={() => removeGuidedMedia(guidedStep, item.id)}><X size={12} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    {voiceNotice && <p className="recall-voice-notice">{voiceNotice}</p>}
                  </div>
                </div>
                <div className="describe-layer-footer">
                  <button
                    className="secondary-button"
                    onClick={() => guidedStep === 0 ? setDescriptionIntroComplete(false) : setGuidedStep((current) => Math.max(0, current - 1))}
                  >
                    <ArrowLeft size={16} /> 上一步
                  </button>
                  <button
                    className="text-button"
                    onClick={() => guidedStep < reflectionGuides.length - 1 ? setGuidedStep((current) => current + 1) : undefined}
                    disabled={guidedStep === reflectionGuides.length - 1}
                  >
                    暂时跳过
                  </button>
                  {guidedStep < reflectionGuides.length - 1 ? (
                    <button className="primary-button" onClick={() => setGuidedStep((current) => Math.min(reflectionGuides.length - 1, current + 1))}>
                      下一层 <ArrowRight size={17} />
                    </button>
                  ) : (
                    <button className="primary-button" disabled={!combinedEventText.trim() || isAnalyzing} onClick={startAnalysis}>
                      {isAnalyzing ? <><span className="spinner" /> 正在梳理</> : <>开始梳理 <ArrowRight size={17} /></>}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {stage === 'review' && (
          <section className="review-page page-enter">
            {drillEmotion ? (
              <div className="emotion-drill">
                <div className="review-heading">
                  <div><span className="eyebrow"><Sparkles size={13} /> 情绪逐层探索</span></div>
                  <button className="text-button" onClick={closeEmotionDrill}><ArrowLeft size={15} /> 返回情绪画布</button>
                </div>
                <div className="drill-layers">
                  <div className="drill-progress" aria-label="探索进度">
                    {[1, 2, 3].map((step) => <span key={step} className={step === drillStep ? 'active' : step < drillStep ? 'done' : ''} />)}
                  </div>
                  {drillStep === 1 && (
                    <div className="drill-layer page-enter" key="drill-1">
                      <span className="drill-chip">「{drillEmotion}」</span>
                      <h1>这种{drillEmotion}背后，是否还包含其他感受？</h1>
                      <p className="drill-hint">可以多选，也可以写下你自己的说法。</p>
                      <div className="drill-options">
                        {drillFeelingOptions.map((feeling) => {
                          const selected = drillFeelings.includes(feeling)
                          return (
                            <button
                              type="button"
                              key={feeling}
                              className={`drill-option ${selected ? 'selected' : ''}`}
                              aria-pressed={selected}
                              onClick={() => setDrillFeelings((current) =>
                                current.includes(feeling) ? current.filter((item) => item !== feeling) : [...current, feeling],
                              )}
                            >
                              {selected && <Check size={13} />} {feeling}
                            </button>
                          )
                        })}
                      </div>
                      <input
                        className="drill-custom"
                        aria-label="补充其他感受"
                        value={drillCustom}
                        onChange={(event) => setDrillCustom(event.target.value)}
                        placeholder="补充其他感受（可选）"
                        maxLength={120}
                      />
                      <button
                        className="primary-button"
                        disabled={drillFeelings.length === 0 && !drillCustom.trim()}
                        onClick={() => setDrillStep(2)}
                      >
                        继续探索 <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                  {drillStep === 2 && (
                    <div className="drill-layer page-enter" key="drill-2">
                      <span className="drill-ai-label">静观会这样问你</span>
                      <h1>{reflectionQuestionFor(drillEmotion)}</h1>
                      <p className="drill-hint">把答案写给你自己，不用追求完整。</p>
                      <textarea
                        aria-label={reflectionQuestionFor(drillEmotion)}
                        value={drillReflection}
                        onChange={(event) => setDrillReflection(event.target.value)}
                        placeholder="例如：我希望她理解，我不是生气她失约，而是生气她没有提前告诉我。"
                        maxLength={600}
                      />
                      <div className="drill-layer-actions">
                        <button className="text-button" onClick={() => setDrillStep(1)}><ArrowLeft size={15} /> 上一步</button>
                        <button className="primary-button" disabled={!drillReflection.trim()} onClick={() => setDrillStep(3)}>
                          继续 <ArrowRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                  {drillStep === 3 && (
                    <div className="drill-layer page-enter" key="drill-3">
                      <span className="drill-ai-label">从感受走向需要</span>
                      <h1>这些感受在告诉你，你也许需要：</h1>
                      <p className="drill-hint">选中后可以补充你自己的说法，确认后会收进「内在需求」。</p>
                      <div className="drill-options">
                        {needsForFeelings(drillFeelings).map((need) => {
                          const selected = drillNeeds.includes(need)
                          return (
                            <button
                              type="button"
                              key={need}
                              className={`drill-option ${selected ? 'selected' : ''}`}
                              aria-pressed={selected}
                              onClick={() => setDrillNeeds((current) =>
                                current.includes(need) ? current.filter((item) => item !== need) : [...current, need],
                              )}
                            >
                              {selected && <Check size={13} />} {need}
                            </button>
                          )
                        })}
                      </div>
                      <input
                        className="drill-custom"
                        aria-label="补充其他需要"
                        value={drillCustomNeed}
                        onChange={(event) => setDrillCustomNeed(event.target.value)}
                        placeholder="补充其他需要（可选）"
                        maxLength={120}
                      />
                      <div className="drill-layer-actions">
                        <button className="text-button" onClick={() => setDrillStep(2)}><ArrowLeft size={15} /> 上一步</button>
                        <button className="primary-button" disabled={drillNeeds.length === 0 && !drillCustomNeed.trim()} onClick={saveEmotionDrill}>
                          确认这份需要 <Check size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="review-heading">
                  <div><span className="eyebrow"><Sparkles size={13} /> 此刻的感受</span></div>
                  <button className="text-button" onClick={() => go('describe')}><ArrowLeft size={15} /> 返回修改原文</button>
                </div>
                <div className="reflection-canvas">
                  <div className="emotion-mist mist-one" aria-hidden="true" />
                  <div className="emotion-mist mist-two" aria-hidden="true" />
                  <div className="emotion-mist mist-three" aria-hidden="true" />
                  <div className="emotion-center" aria-hidden="true"><span>此刻</span></div>
                  {categoryOrder.map((category, columnIndex) => {
                    const meta = categoryMeta[category]
                    const fragmentLimit = category === 'emotions' ? 2 : 1
                    return (
                      <div className={`emotion-cluster emotion-${category}`} key={category} style={{ '--delay': `${columnIndex * 110}ms` } as React.CSSProperties}>
                        {analysis[category].slice(0, fragmentLimit).map((item, index) => {
                          const drill = category === 'emotions' ? emotionDrills[item] : null
                          return (
                            <div
                              className={`emotion-fragment emotion-fragment-${index} ${drill ? 'drilled' : ''} ${category === 'emotions' ? 'drillable' : ''}`}
                              key={`${category}-${index}`}
                              onClick={category === 'emotions' ? () => openEmotionDrill(item) : undefined}
                            >
                              <textarea
                                aria-label={`编辑${meta.label}内容`}
                                value={item}
                                onChange={(event) => updateItem(category, index, event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                rows={1}
                                maxLength={80}
                              />
                              <button className="delete-button" onClick={() => deleteItem(category, index)} aria-label={`删除${meta.label}内容`}><Trash2 size={15} /></button>
                              {category === 'emotions' && (
                                <span className="emotion-drill-open" aria-hidden="true">逐层探索 ↗</span>
                              )}
                              {drill && (
                                <span className="emotion-need-link">
                                  {drill.needs.length > 0 ? `→ ${drill.needs.join('、')}` : '已探索'}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                  <div className="emotion-add">
                    <input aria-label="补充一个感受碎片" value={newItems.emotions} onChange={(event) => setNewItems((current) => ({ ...current, emotions: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') addItem('emotions') }} placeholder="留下一个感受" maxLength={80} />
                    <button onClick={() => addItem('emotions')} disabled={!newItems.emotions.trim()} aria-label="添加感受碎片"><Plus size={15} /></button>
                  </div>
                  <p className="drill-canvas-hint">点击任意情绪碎片，可以向下多走一层。</p>
                </div>
                <div className="review-footer">
                  <button className="secondary-button" onClick={() => go('describe')}><RotateCcw size={16} /> 重新梳理</button>
                  <button className="primary-button" onClick={() => go('timeline')}>确认并回溯时间线 <ArrowRight size={17} /></button>
                </div>
              </>
            )}
          </section>
        )}

        {stage === 'timeline' && (
          <section className="timeline-page page-enter">
            {timelineMode === 'map' ? (
              <>
                <div className="exploration-heading">
                  <div><span className="eyebrow"><span /> 关系地形</span><h1>从这里，沿着事情走一遍。</h1></div>
                  <button className="text-button" onClick={() => go('review')}><ArrowLeft size={15} /> 返回梳理</button>
                </div>
                <div
                  className="exploration-viewport"
                  aria-label="可拖动的事件探索空间"
                  onPointerDown={(event) => {
                    if (event.pointerType === 'mouse' && event.button !== 0) return
                    timelineDrag.current = { active: true, x: event.clientX, y: event.clientY, originX: timelinePan.x, originY: timelinePan.y, moved: false }
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }}
                  onPointerMove={(event) => {
                    if (!timelineDrag.current.active) return
                    const dx = event.clientX - timelineDrag.current.x
                    const dy = event.clientY - timelineDrag.current.y
                    if (Math.abs(dx) + Math.abs(dy) > 4) timelineDrag.current.moved = true
                    setTimelinePan({
                      x: Math.max(-260, Math.min(260, timelineDrag.current.originX + dx)),
                      y: Math.max(-180, Math.min(180, timelineDrag.current.originY + dy)),
                    })
                  }}
                  onPointerUp={(event) => {
                    timelineDrag.current.active = false
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
                  }}
                  onPointerCancel={() => { timelineDrag.current.active = false }}
                >
                  <svg className="exploration-contours" viewBox="0 0 1200 700" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M-80 520 C130 380 260 620 470 470 S760 300 940 420 S1100 320 1280 210" />
                    <path d="M-60 560 C150 420 280 660 490 510 S780 340 960 460 S1120 360 1290 250" />
                    <path d="M20 180 C170 80 300 210 470 130 S760 40 930 150 S1130 120 1270 30" />
                    <path d="M40 220 C190 120 320 250 490 170 S780 80 950 190 S1150 160 1290 70" />
                  </svg>
                  <div className="exploration-world" style={{ transform: `translate3d(${timelinePan.x}px, ${timelinePan.y}px, 0)` }}>
                    <svg className="exploration-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M10 72 C22 58 24 25 43 38 S58 74 68 50 S82 24 91 38" />
                    </svg>
                    {timelineNodes.map((node, index) => {
                      const positions = [
                        [12, 72], [31, 27], [52, 62], [69, 38], [88, 58],
                        [78, 82], [45, 82], [20, 18],
                      ]
                      const position = positions[index] || [10 + ((index * 21) % 80), 18 + ((index * 29) % 64)]
                      const prompt = node.event.trim() || node.title
                      const status = nodeDerivedStatus(node)
                      const answered = nodeAnsweredCount(node)
                      const total = questionsForNode(node).length
                      const complete = answered >= total
                      return (
                        <button
                          key={node.id}
                          className={`exploration-node status-${status} ${complete ? 'complete' : ''} ${timelineIndex === index ? 'active' : ''} ${nodeCompletePulse === node.id ? 'just-lit' : ''}`}
                          style={{
                            '--node-x': `${position[0]}%`,
                            '--node-y': `${position[1]}%`,
                            '--node-progress': `${Math.round((answered / total) * 100)}%`,
                          } as React.CSSProperties}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => {
                            setTimelineIndex(index)
                            const nodeWithAnswers = timelineNodes[index]
                            const nodeQuestions = questionsForNode(nodeWithAnswers)
                            const firstEmpty = nodeQuestions.findIndex((question) => !(nodeWithAnswers?.[question.key] || '').trim())
                            setTimelineQuestion(firstEmpty >= 0 ? firstEmpty : 0)
                            setTimelineDraft('')
                            setTimelineMode('explore')
                          }}
                          role="tab"
                          aria-selected={timelineIndex === index}
                          data-tip={prompt}
                        >
                          <span className="exploration-node-core"><span /></span>
                          <span className="exploration-node-label"><small>{node.phase}</small><strong>{node.title}</strong><em>{complete ? '已点亮' : answered > 0 ? `${answered}/${total}` : '未开始'}</em></span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="map-tools">
                    <span>拖动探索 · 点击节点进入回溯</span>
                    <button type="button" onClick={() => setTimelinePan({ x: 0, y: 0 })}><RotateCcw size={14} /> 回到原点</button>
                  </div>
                  <div className="map-actions">
                    <button type="button" aria-label="新增事件节点" onClick={addTimelineNode}><Plus size={15} /> 新增节点</button>
                  </div>
                </div>
                <div className="exploration-footer">
                  <button className="secondary-button" onClick={() => go('review')}><ArrowLeft size={16} /> 上一步</button>
                  <button className="primary-button" onClick={() => go('perspective')}>进入视角转换 <ArrowRight size={17} /></button>
                </div>
              </>
            ) : (
              <div className="event-explore" key={`${activeTimeline.id}-${currentTimelineQuestion}`}>
                <div className="event-explore-header">
                  <button className="text-button" onClick={() => setTimelineMode('map')}><ArrowLeft size={15} /> 返回地形</button>
                  <div className="event-progress" aria-label="回溯进度">
                    {activeNodeQuestions.map((_, index) => <span key={index} className={index === currentTimelineQuestion ? 'active' : index < currentTimelineQuestion ? 'done' : ''} />)}
                  </div>
                  <div className="event-actions">
                    <button aria-label="新增事件节点" title="新增节点" onClick={addTimelineNode}><Plus size={15} /></button>
                    <button aria-label="删除当前节点" title="删除节点" onClick={deleteTimelineNode} disabled={timelineNodes.length <= 1}><Trash2 size={15} /></button>
                  </div>
                </div>
                {nodeAnsweredCount(activeTimeline) >= activeNodeQuestions.length && (
                  <div className="node-lit-banner">这个节点已点亮。你可以逐题回看或修改，也可以直接返回地形。</div>
                )}
                <div className="event-focus">
                  <aside className="event-presence">
                    <span className="event-phase">{activeTimeline.phase}</span>
                    <input
                      className="event-name"
                      aria-label="事件名称"
                      value={activeTimeline.title}
                      onChange={(event) => updateTimelineNode('title', event.target.value)}
                    />
                    <span className={`event-status status-${nodeDerivedStatus(activeTimeline)}`}>
                      {nodeDerivedStatus(activeTimeline) === 'confirmed' ? '已点亮' : nodeDerivedStatus(activeTimeline) === 'unknown' ? '仍有未知' : '待补充'}
                    </span>
                    <span className="event-answer-count">{nodeAnsweredCount(activeTimeline)} / {activeNodeQuestions.length} 已回溯</span>
                    {activeTimeline.event && <p className="event-seed"><span>已留下</span>{activeTimeline.event}</p>}
                  </aside>
                  <div className="event-question">
                    <span className="question-layer">{activeNodeQuestions[currentTimelineQuestion].layer}</span>
                    <h1>{activeNodeQuestions[currentTimelineQuestion].question}</h1>
                    <div className="quick-answer-options" aria-label="快速回答选项">
                      {activeNodeQuestions[currentTimelineQuestion].options.map((option) => {
                        const currentValue = String(activeTimeline[activeNodeQuestions[currentTimelineQuestion].key] || '')
                        const recorded = currentValue.includes(option) || activeTimeline.missing.includes(option)
                        return (
                          <button
                            type="button"
                            key={option}
                            className={`${recorded ? 'recorded' : ''} ${optionFlash === option ? 'flash' : ''}`}
                            onClick={() => chooseTimelineAnswer(option)}
                          >
                            {recorded && <Check size={12} />} {option}
                          </button>
                        )
                      })}
                    </div>
                    <div className="event-detail-input">
                      <input
                        aria-label={activeNodeQuestions[currentTimelineQuestion].question}
                        value={timelineDraft}
                        onChange={(event) => setTimelineDraft(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') saveTimelineDraft() }}
                        placeholder={activeNodeQuestions[currentTimelineQuestion].placeholder}
                      />
                      <button type="button" aria-label="保存补充内容" disabled={!timelineDraft.trim()} onClick={saveTimelineDraft}>
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        className={`recall-mic ${voiceListening === 'timeline' ? 'listening' : ''}`}
                        aria-label="语音输入补充"
                        title="用语音补充细节"
                        onClick={() => startVoiceInput('timeline')}
                      >
                        <Mic size={14} />
                      </button>
                      <label className="recall-photo" aria-label="添加图片补充" title="添加图片补充">
                        <ImagePlus size={14} />
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) void addNodeMedia(file)
                            event.target.value = ''
                          }}
                        />
                      </label>
                    </div>
                    {(nodeMedia[activeTimeline.id]?.length || 0) > 0 && (
                      <div className="recall-media-row">
                        {(nodeMedia[activeTimeline.id] || []).map((item) => (
                          <span className="recall-media" key={item.id}>
                            <img src={item.dataUrl} alt="补充的图片" />
                            <button type="button" aria-label="移除图片" onClick={() => removeNodeMedia(activeTimeline.id, item.id)}><X size={12} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    {voiceNotice && <p className="recall-voice-notice">{voiceNotice}</p>}
                    {activeTimeline.missing.trim() && <p className="unknown-whisper">仍未知：{activeTimeline.missing}</p>}
                  </div>
                </div>
                <div className="event-question-footer">
                  <button className="text-button" disabled={currentTimelineQuestion === 0} onClick={previousTimelineQuestion}><ArrowLeft size={15} /> 返回修改</button>
                  <button className="text-button" onClick={skipTimelineQuestion}>跳过 / 不确定</button>
                  <button className="primary-button" onClick={nextTimelineQuestion}>
                    {currentTimelineQuestion === activeNodeQuestions.length - 1 ? '回到地形' : '继续'} <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {stage === 'perspective' && (
          <section className={`vn-page vn-phase-${narrativeState.phase} page-enter`}>
            <div className="vn-atmosphere" aria-hidden="true">
              <svg viewBox="0 0 1000 700" preserveAspectRatio="none">
                <path d="M-40 540 C180 410 330 620 520 470 S760 330 1040 430" />
                <path d="M-20 580 C210 450 360 650 540 510 S820 370 1060 480" />
              </svg>
              <div className="vn-focus-ring" />
            </div>
            <header className="vn-header">
              <button className="text-button" onClick={() => go('timeline')}><ArrowLeft size={15} /> 返回时间线</button>
              <span>{perspectiveMode === 'friend' ? '朋友视角探索' : '静观 · Stillpoint'}</span>
              <button
                className="vn-rewind"
                onClick={() => {
                  if (perspectiveMode === 'friend') {
                    setPerspectiveMode('observer')
                    if (observerMessages.length === 0 && !observerLoading) {
                      void requestPerspectiveChat('observer')
                    }
                  } else {
                    setPerspectiveMode('friend')
                  }
                }}
              >
                {perspectiveMode === 'friend' ? '切换静观' : '切换朋友视角'}
              </button>
            </header>
            <div className="vn-stage perspective-chat-stage">
              <div className="perspective-chat-scroll" aria-live="polite">
                {(perspectiveMode === 'friend' ? friendMessages : observerMessages).map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`vn-bubble ${message.role === 'assistant' ? 'vn-friend' : 'vn-user'}`}>
                    <span className="vn-avatar">{message.role === 'assistant' ? (perspectiveMode === 'friend' ? '引导' : '静观') : '我'}</span>
                    <p>{message.content || '正在思考……'}</p>
                  </div>
                ))}
              </div>
            </div>
            <footer className="vn-response">
              {perspectiveMode === 'friend' ? (
                <>
                  {friendPerspectiveComplete && (
                    <div className="observer-light-invitation">
                      <button
                        className="observer-orb"
                        aria-label="进入静观第三方视角"
                        onClick={() => {
                          setPerspectiveMode('observer')
                          if (observerMessages.length === 0 && !observerLoading) {
                            void requestPerspectiveChat('observer')
                          }
                        }}
                      >
                        <span />
                      </button>
                      <p>也许，可以从更远一点的地方重新看待这件事。</p>
                      <button className="text-button" onClick={() => {
                        setPerspectiveMode('observer')
                        if (observerMessages.length === 0 && !observerLoading) {
                          void requestPerspectiveChat('observer')
                        }
                      }}>忽略，直接进入静观 <ArrowRight size={14} /></button>
                    </div>
                  )}
                  <form className="vn-input" onSubmit={(event) => {
                    event.preventDefault()
                    submitFriendPerspective(friendDraft)
                  }}>
                    <label htmlFor="friend-perspective-answer">如果你站在朋友的位置</label>
                    <input
                      id="friend-perspective-answer"
                      value={friendDraft}
                      onChange={(event) => setFriendDraft(event.target.value)}
                      placeholder="你会看见、想到、感受到什么？"
                      disabled={friendLoading}
                    />
                    <button type="submit" disabled={!friendDraft.trim() || friendLoading} aria-label="发送朋友视角回答"><ArrowRight size={17} /></button>
                  </form>
                  {!friendPerspectiveComplete && (
                    <button
                      className="vn-skip"
                      disabled={friendLoading || friendMessages.filter((message) => message.role === 'user').length === 0}
                      onClick={() => setFriendPerspectiveComplete(true)}
                    >
                      朋友视角先到这里
                    </button>
                  )}
                </>
              ) : (
                <>
                  <form className="vn-input" onSubmit={(event) => {
                    event.preventDefault()
                    submitObserverPerspective(observerDraft)
                  }}>
                    <label htmlFor="observer-perspective-answer">从第三方位置补充观察</label>
                    <input
                      id="observer-perspective-answer"
                      value={observerDraft}
                      onChange={(event) => setObserverDraft(event.target.value)}
                      placeholder="事实、情绪、需求或沟通方式里，你想先澄清哪一处？"
                      disabled={observerLoading}
                    />
                    <button type="submit" disabled={!observerDraft.trim() || observerLoading} aria-label="发送第三方分析回答"><ArrowRight size={17} /></button>
                  </form>
                  {observerComplete ? (
                    <button className="primary-button observer-continue" onClick={() => go('complete')}>结束这次回顾 <ArrowRight size={16} /></button>
                  ) : (
                    <button
                      className="primary-button observer-continue"
                      disabled={observerLoading || observerMessages.filter((message) => message.role === 'user').length === 0}
                      onClick={() => void requestPerspectiveChat('observer', undefined, true)}
                    >
                      {observerLoading ? '正在整理…' : '完成回顾'} <ArrowRight size={16} />
                    </button>
                  )}
                </>
              )}
            </footer>
          </section>
        )}

        {stage === 'complete' && (
          <section className="complete-page page-enter">
            <div className="completion-orbit" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit-core"><Check size={30} /></span></div>
            <span className="eyebrow"><span /> 回顾完成</span>
            <h1>你已经为这段关系<br />留出了更多理解的空间。</h1>
            <p>你不必立刻做出决定。此刻能做到的，只是看清正在发生的事，以及它与你有什么关系。</p>
            {observerWrapUp ? (
              <div className="reflection-summary"><span>静观和你一起整理的</span><blockquote>{observerWrapUp}</blockquote></div>
            ) : (
              <div className="reflection-summary"><span>这段回顾还没有收尾</span><blockquote>回到静观，让它陪你一起整理这次看到的东西。</blockquote></div>
            )}
            <div className="completion-actions">
              <button className="secondary-button" onClick={() => go('perspective', 'observer')}><ArrowLeft size={16} /> 返回静观</button>
              <button className="primary-button" onClick={resetAll}>开始新的梳理 <RotateCcw size={16} /></button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
