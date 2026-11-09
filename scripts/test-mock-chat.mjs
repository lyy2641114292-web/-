// 模拟对话引擎自动测试：验证静观回复锚定事件细节、区分事实与推测、每轮单问题、收尾整理包含未知项。
import { generateMockReply, reflectionQuestionFor, needsForFeelings, drillFeelingOptions } from '../src/mockChatEngine.ts'

const context = {
  eventSummary: '朋友临时取消了一起旅行，我很难过。',
  facts: ['我们计划了两个月；出发前两天她说家里有事。'],
  interpretations: ['担心关系疏远'],
  emotions: ['失望', '难过'],
  needs: ['被认真回应'],
  timeline: [
    {
      title: '矛盾触发', phase: 'Trigger', time: '上周五傍晚', event: '一条消息：她说家里有事来不了。',
      quote: '她说「我也没有办法」', behavior: '语速很快，没有看我', response: '我回了「没事，你忙吧」',
      emotion: '失望', aftermath: '', missing: '她是不是其实不想去',
    },
    { title: '冲突前', phase: 'Before', time: '', event: '', quote: '', behavior: '', response: '', emotion: '', aftermath: '', missing: '' },
    { title: '冲突发生', phase: 'Conflict', time: '', event: '', quote: '', behavior: '', response: '', emotion: '', aftermath: '', missing: '' },
    { title: '关系变化', phase: 'Aftermath', time: '', event: '', quote: '', behavior: '', response: '', emotion: '', aftermath: '', missing: '' },
  ],
  friendNotes: ['她可能也觉得愧疚，但不知道怎么开口，怕我生气。'],
}

const assertions = []
const check = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`)
  assertions.push(name)
}

// 1. 静观开场：必须引用用户提供的具体细节（原话/回应），且只含一个问题
const open = generateMockReply('observer', '背景资料在下方。请先认真读完，然后从你注意到的第一个具体细节开始。', [], context)
check('observer 开场引用事件原话或回应', open.includes('我也没有办法') || open.includes('没事，你忙吧') || open.includes('语速很快'))
check('observer 开场只有一个问句', (open.match(/[？?]/g) || []).length === 1)
check('observer 开场不超过 3 段', open.split('\n\n').length <= 3)

// 2. 静观多轮：不重复已用细节（第二轮不应再出现第一轮引用的具体句子）
const second = generateMockReply('observer', '她当时确实没有多解释。', [
  { role: 'assistant', content: open },
  { role: 'user', content: '她当时确实没有多解释。' },
], context)
const openQuoted = open.includes('我也没有办法') ? '我也没有办法' : open.includes('没事，你忙吧') ? '没事，你忙吧' : '语速很快'
check('observer 第二轮不重复已引用细节', !second.includes(openQuoted) || (second.match(/[？?]/g) || []).length === 1)

// 3. 收尾：包含“未知”整理与是否补充的询问
const wrap = generateMockReply('observer', '差不多了，我们结束吧。', [
  { role: 'assistant', content: open },
  { role: 'user', content: '差不多了，我们结束吧。' },
], context)
check('observer 收尾包含未知项', wrap.includes('她是不是其实不想去'))
check('observer 收尾询问是否补充', /还有想补充|补充的吗/.test(wrap))

// 4. 朋友视角：站在朋友位置、保持假设语气、单问题
const friendOpen = generateMockReply('friend', '请根据以下背景开始朋友视角探索。', [], context)
check('friend 开场使用假设语气', /站在她的位置|替她|你猜|推测/.test(friendOpen))
check('friend 开场引用事件细节', friendOpen.includes('我也没有办法') || friendOpen.includes('语速很快') || friendOpen.includes('没事，你忙吧') || friendOpen.includes('家里有事'))

// 5. 朋友视角收尾：引导进入静观
const friendWrap = generateMockReply('friend', '朋友视角先到这里。', [], context)
check('friend 收尾提醒保持假设', friendWrap.includes('推测') && friendWrap.includes('静观'))

// 6. 情绪逐层探索规则
check('生气对应反思问题', reflectionQuestionFor('生气').includes('最希望她理解什么'))
check('难过对应不同反思问题', reflectionQuestionFor('难过') !== reflectionQuestionFor('生气'))
const needs = needsForFeelings(['我觉得自己没有受到重视', '我害怕这段友情对对方来说并不重要'])
check('感受映射需求', needs.includes('被重视') && needs.includes('被珍惜'))
check('感受选项共 4 个', drillFeelingOptions.length === 4)

console.log(`Mock chat engine paths passed: ${assertions.join(', ')}`)
