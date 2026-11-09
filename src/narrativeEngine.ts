export type NarrativePhase =
  | 'trigger'
  | 'time'
  | 'words'
  | 'behavior'
  | 'reaction'
  | 'emotion'
  | 'closing'

export type NarrativeInteraction = 'single-choice' | 'text' | 'multi-choice' | 'pause'

export type NarrativeAnswer = {
  value: string
  confirmed?: boolean
  kind: 'choice' | 'text' | 'skip' | 'unknown'
}

export type NarrativeTurn = {
  speaker: 'guide' | 'user'
  text: string
  phase: NarrativePhase
}

export type NarrativeArchive = {
  facts: string[]
  interpretations: string[]
  emotions: string[]
  unknown: string[]
}

export type NarrativeState = {
  phase: NarrativePhase
  interaction: NarrativeInteraction
  question: string
  options: string[]
  placeholder: string
  history: NarrativeTurn[]
  archive: NarrativeArchive
  scene: string
  branch: 'conversation' | 'message' | 'behavior' | 'uncertain'
  completed: boolean
  checkpoints: NarrativeCheckpoint[]
}

export type NarrativeCheckpoint = {
  phase: NarrativePhase
  interaction: NarrativeInteraction
  question: string
  options: string[]
  placeholder: string
  history: NarrativeTurn[]
  archive: NarrativeArchive
  scene: string
  branch: NarrativeState['branch']
  completed: boolean
}

const initialByPhase: Record<NarrativePhase, Pick<NarrativeState, 'question' | 'options' | 'placeholder' | 'interaction'>> = {
  trigger: {
    question: '这一幕最先从哪里开始？',
    options: ['面对面的一次对话', '一条聊天消息', '一次临时见面', '对方突然的一个行为', '记不清了'],
    placeholder: '用一句话描述那个最开始的瞬间……',
    interaction: 'single-choice',
  },
  time: {
    question: '如果把时间放回画面里，大概是在哪个时候？',
    options: ['当天傍晚', '前几天', '最近一周', '更早，但记得片段', '只记得大致顺序'],
    placeholder: '例如：上周五吃完饭后，或“不确定具体时间”',
    interaction: 'single-choice',
  },
  words: {
    question: '画面里有没有一句话，至今还留在你脑中？',
    options: ['记得原话', '只记得意思', '记不清具体内容', '没有说出口', '暂时跳过'],
    placeholder: '尽量保留原话，也可以只写一句大意……',
    interaction: 'single-choice',
  },
  behavior: {
    question: '声音之外，还有什么动作让这一刻变得具体？',
    options: ['表情变化', '突然沉默', '语气变冷', '转身或离开', '没有特别注意'],
    placeholder: '地点、动作、距离或停顿都可以……',
    interaction: 'single-choice',
  },
  reaction: {
    question: '你在那个瞬间做了什么反应？',
    options: ['回应了解释', '说得直接一些', '保持沉默', '离开了现场', '后来才回复'],
    placeholder: '可以写你当时的语言或动作……',
    interaction: 'single-choice',
  },
  emotion: {
    question: '哪个瞬间最让你停下来？',
    options: ['失望', '委屈', '愤怒', '困惑', '担心', '说不清'],
    placeholder: '补充一个具体瞬间，或者只写此刻的感觉……',
    interaction: 'multi-choice',
  },
  closing: {
    question: '现在，我们已经走过这一幕。还想补充什么吗？',
    options: ['关系暂时疏远了', '后来恢复了联系', '事情还没解决', '暂时保留未知', '结束回溯'],
    placeholder: '补充后续变化，或选择结束探索……',
    interaction: 'single-choice',
  },
}

export const createNarrativeState = (seed?: {
  event?: string
  time?: string
  quote?: string
  behavior?: string
  response?: string
  emotion?: string
  aftermath?: string
}): NarrativeState => ({
  phase: 'trigger',
  interaction: 'single-choice',
  question: initialByPhase.trigger.question,
  options: initialByPhase.trigger.options,
  placeholder: initialByPhase.trigger.placeholder,
  history: [{
    speaker: 'guide',
    text: '我们先回到关系里最容易被忽略的一刻。你不必把整个故事讲完整，只需要告诉我：这一切从哪里开始？',
    phase: 'trigger',
  }],
  archive: {
    facts: [
      seed?.event?.trim(),
      seed?.time?.trim() ? `发生时间：${seed.time.trim()}` : '',
      seed?.quote?.trim() ? `表达：${seed.quote.trim()}` : '',
      seed?.behavior?.trim() ? `行为：${seed.behavior.trim()}` : '',
      seed?.response?.trim() ? `我的反应：${seed.response.trim()}` : '',
      seed?.aftermath?.trim() ? `后续变化：${seed.aftermath.trim()}` : '',
    ].filter((value): value is string => Boolean(value)),
    interpretations: [],
    emotions: seed?.emotion?.trim() ? [seed.emotion.trim()] : [],
    unknown: [],
  },
  scene: '入口 · 尚未点亮',
  branch: 'uncertain',
  completed: false,
  checkpoints: [],
})

const getNextPhase = (phase: NarrativePhase): NarrativePhase => {
  const phases: NarrativePhase[] = ['trigger', 'time', 'words', 'behavior', 'reaction', 'emotion', 'closing']
  return phases[Math.min(phases.indexOf(phase) + 1, phases.length - 1)]
}

const valueIsUnknown = (value: string) =>
  /记不清|记不清了|不确定|暂时跳过|不知道|说不清|暂时保留未知/.test(value)

export const advanceNarrative = (state: NarrativeState, answer: NarrativeAnswer): NarrativeState => {
  const value = answer.value.trim()
  if (!value) return state

  const archive = {
    facts: [...state.archive.facts],
    interpretations: [...state.archive.interpretations],
    emotions: [...state.archive.emotions],
    unknown: [...state.archive.unknown],
  }
  const checkpoint: NarrativeCheckpoint = {
    phase: state.phase,
    interaction: state.interaction,
    question: state.question,
    options: [...state.options],
    placeholder: state.placeholder,
    history: state.history.map((turn) => ({ ...turn })),
    archive: {
      facts: [...state.archive.facts],
      interpretations: [...state.archive.interpretations],
      emotions: [...state.archive.emotions],
      unknown: [...state.archive.unknown],
    },
    scene: state.scene,
    branch: state.branch,
    completed: state.completed,
  }

  let branch = state.branch
  let scene = state.scene
  let nextText = ''

  if (state.phase === 'trigger') {
    if (/聊天|消息/.test(value)) {
      branch = 'message'
      scene = '屏幕之间的一个夜晚'
      nextText = '那一段对话被留在了屏幕上。先不急着判断含义，我们确认一下它发生的时间。'
    } else if (/面对面|见面/.test(value)) {
      branch = 'conversation'
      scene = '面对面的那一刻'
      nextText = '这说明情境里还有声音、距离和表情。我们先把时间放回画面，再慢慢看见细节。'
    } else if (/行为/.test(value)) {
      branch = 'behavior'
      scene = '一个动作改变了氛围'
      nextText = '有时候一个动作已经改变了整段对话。先确认它发生在什么时候。'
    } else {
      branch = 'uncertain'
      scene = '模糊而未关闭的入口'
      nextText = '现在还有一部分停在模糊处。我们先保留它，再确认你记得的时间线。'
      archive.unknown.push('事件最初的触发方式')
    }
    if (valueIsUnknown(value)) archive.unknown.push('事件最初的触发方式')
    else archive.facts.push(value)
  } else if (state.phase === 'time') {
    if (valueIsUnknown(value)) archive.unknown.push('具体发生时间')
    else archive.facts.push(`发生时间：${value}`)
    nextText = /消息|聊天/.test(state.scene)
      ? '时间稍微清晰了一点。那条消息或对话里，最让你记住的一句是什么？'
      : '时间的轮廓已经有了一点。再回到声音和话语之间，有没有一句话至今还在？'
  } else if (state.phase === 'words') {
    if (valueIsUnknown(value)) archive.unknown.push('具体原话或表达')
    else archive.facts.push(`表达：${value}`)
    scene = state.branch === 'message' ? '屏幕中的那一句' : '对话里的那一句'
    nextText = '这一句先停在这里，不急着解释它意味着什么。除了话语，你还记得对方当时做了什么吗？'
  } else if (state.phase === 'behavior') {
    if (valueIsUnknown(value)) archive.unknown.push('当时的具体行为或表情')
    else archive.facts.push(`行为：${value}`)
    nextText = value === '突然沉默' || value === '语气变冷'
      ? '沉默或语气本身也会改变空间。你在那个变化发生后，是怎样回应的？'
      : '动作已经进入画面。再看一眼，当时你是沉默、回应，还是先离开了？'
  } else if (state.phase === 'reaction') {
    if (valueIsUnknown(value)) archive.unknown.push('用户当时的反应')
    else archive.facts.push(`我的反应：${value}`)
    nextText = '我们不需要立刻把反应解释成对错。它先作为事实留在这里：那个瞬间，哪种感觉最靠近？'
  } else if (state.phase === 'emotion') {
    if (valueIsUnknown(value)) archive.unknown.push('此刻明确的情绪')
    else {
      archive.emotions.push(value)
      archive.interpretations.push(`用户描述的情绪是：${value}`)
    }
    nextText = '这一段情绪已经可以被看见了。最后，只确认一件事：这件事之后，关系是否发生了可见的变化？'
  } else if (state.phase === 'closing') {
    if (valueIsUnknown(value)) archive.unknown.push('冲突后的关系变化')
    else archive.facts.push(`后续变化：${value}`)
    nextText = '这一幕可以暂时停在这里。已经确认的细节会变得清楚，仍然未知的部分也不会被补成事实。'
  }

  const nextPhase = state.phase === 'closing' ? 'closing' : getNextPhase(state.phase)
  const isComplete = state.phase === 'closing' || /结束回溯/.test(value)
  const next = initialByPhase[nextPhase]
  const history = [
    ...state.history,
    { speaker: 'user' as const, text: value, phase: state.phase },
    { speaker: 'guide' as const, text: nextText || next.question, phase: state.phase },
  ]

  if (isComplete) {
    history.push({
      speaker: 'guide',
      text: '探索可以在这里暂停。你随时可以回到任何一个已经确认的片段。',
      phase: 'closing',
    })
  }

  return {
    phase: isComplete ? 'closing' : nextPhase,
    interaction: isComplete ? 'pause' : next.interaction,
    question: isComplete ? '这一幕暂时停在这里。' : next.question,
    options: isComplete ? ['重新回到这一幕', '跳过未知部分', '继续查看确认内容'] : next.options,
    placeholder: next.placeholder,
    history,
    archive,
    scene,
    branch,
    completed: isComplete,
    checkpoints: [...state.checkpoints, checkpoint],
  }
}

export const rewindNarrative = (state: NarrativeState): NarrativeState => {
  const checkpoint = state.checkpoints.at(-1)
  if (!checkpoint) return state
  return {
    ...checkpoint,
    checkpoints: state.checkpoints.slice(0, -1),
  }
}
