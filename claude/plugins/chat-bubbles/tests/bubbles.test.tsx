import { test, expect, mock } from 'claude-code/testing'

test('the person gets a "Toi" bubble, a reply opens with ✦ Assistant, its later blocks stay the engine drawing', async ($, on) => {
  // stands for the engine's own drawing, beneath the plugin
  on('ui.render', ($, e) => { const { Text } = $.ui.resolve(e); return <Text>engine</Text> })
  for (const surface of ['terminal', 'desktop'] as const) {
    const you = await $.ui.mount({ plugin: 'chat-bubbles', surface, component: 'UserMessage',
      props: { text: 'bonjour', origin: { kind: 'composer' }, isExpanded: false } })
    expect(await you.find({ type: 'Text', text: /^Toi$/ })).toBeDefined()
    await you.unmount()

    const reply = await $.ui.mount({ plugin: 'chat-bubbles', surface, component: 'AssistantMessage',
      props: { text: 'Salut', isFirstOfReply: true } })
    expect(await reply.find({ type: 'Text', text: /✦ Assistant/ })).toBeDefined()
    await reply.unmount()

    const later = await $.ui.mount({ plugin: 'chat-bubbles', surface, component: 'AssistantMessage',
      props: { text: 'Suite', isFirstOfReply: false } })
    expect(await later.find({ type: 'Text', text: /✦ Assistant/ })).toBeUndefined()
    expect(await later.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
    await later.unmount()
  }
})

test('a finished turn hides its tools summary and ends on one line with its duration', async ($, on) => {
  on('ui.render', ($, e) => { const { Text } = $.ui.resolve(e); return <Text>engine</Text> })
  mock.store(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const done = await $.ui.mount({ plugin: 'chat-bubbles', surface, component: 'ToolGroup', props: { calls: [], isActive: false, isExpanded: false } })
    expect(await done.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
    await done.unmount()
    const live = await $.ui.mount({ plugin: 'chat-bubbles', surface, component: 'ToolGroup', props: { calls: [], isActive: true, isExpanded: false } })
    expect(await live.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
    await live.unmount()
    const end = await $.ui.mount({ plugin: 'chat-bubbles', surface, component: 'TurnDuration', props: { word: 'Baked', durationMs: 83000 } })
    expect(await end.find({ type: 'Text', text: /^1 min 23 s$/ })).toBeDefined()
    await end.unmount()
  }
})
