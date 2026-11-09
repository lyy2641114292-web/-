import assert from 'node:assert/strict'
import {
  advanceNarrative,
  createNarrativeState,
  rewindNarrative,
} from '../src/narrativeEngine.ts'

const answer = (value, kind = 'choice') => ({ value, kind })

function runPath(answers) {
  let state = createNarrativeState({
    event: '约定临时发生变化',
    emotion: '困惑',
  })
  for (const item of answers) state = advanceNarrative(state, answer(item))
  return state
}

const messagePath = runPath([
  '一条聊天消息',
  '当天傍晚',
  '记得原话：“我今天可能来不了”',
  '突然沉默',
  '保持沉默',
  '失望',
  '短暂冷淡',
])
assert.equal(messagePath.branch, 'message')
assert.equal(messagePath.completed, true)
assert(messagePath.archive.facts.some((item) => item.includes('聊天')))
assert(messagePath.archive.emotions.includes('失望'))

const conversationPath = runPath([
  '面对面的一次对话',
  '前几天',
  '记不清具体内容',
  '语气变冷',
  '回应了解释',
  '困惑',
  '事情还没解决',
])
assert.equal(conversationPath.branch, 'conversation')
assert(conversationPath.archive.unknown.includes('具体原话或表达'))
assert.equal(conversationPath.completed, true)

const uncertainPath = runPath([
  '记不清了',
  '只记得大致顺序',
  '没有说出口',
  '没有特别注意',
  '暂时跳过',
  '说不清',
  '暂时保留未知',
])
assert.equal(uncertainPath.branch, 'uncertain')
assert(uncertainPath.archive.unknown.length >= 3)
assert.equal(uncertainPath.completed, true)

const rewindable = advanceNarrative(createNarrativeState(), answer('一条聊天消息'))
const rewound = rewindNarrative(advanceNarrative(rewindable, answer('当天傍晚')))
assert.equal(rewound.phase, 'time')
assert(rewound.archive.facts.some((item) => item.includes('聊天') || item.includes('消息')))

console.log('Narrative engine paths passed: message, conversation, uncertain')
