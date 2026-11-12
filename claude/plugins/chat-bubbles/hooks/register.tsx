import type { Register } from 'claude-code'

// The person's spec, in terminal cells (a row is ~19 px, a column ~8 px at 13 px × zoom 1.2): text #D4D4D4, the
// person's label #82AAFF on a flat #2E3442 block (no bar, no border; padding 16 × 21 px → 1 row × 3 columns, 26 px
// after → 1 row), the reply's label "✦ Assistant" #E8A06E straight above its text (10 px rounds to no row).
const TEXT = '#D4D4D4'
const YOU = '#82AAFF'
const YOU_BG = '#2E3442'
const ASSISTANT = '#E8A06E'

export const register: Register = on => {
  // The person's own prompts (typed here or from the phone) on a tinted background; every other user row
  // (task notifications, messages from other agents) keeps the engine's drawing.
  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    const kind = e.props.origin.kind
    if (kind !== 'composer' && kind !== 'bridge') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" backgroundColor={YOU_BG} paddingX={3} paddingY={1} marginBottom={1}>
        <Text color={YOU} bold>Toi</Text>
        <Text color={TEXT}>{e.props.text}</Text>
      </Box>
    )
  })

  // A reply opens with "✦ Assistant" in place of the bullet; its later blocks stay as the engine draws them.
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    if (!e.props.isFirstOfReply || e.props.isSummary) return next(e)
    const { Box, Text, Markdown } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text color={ASSISTANT} bold>✦ Assistant</Text>
        <Markdown text={e.props.text} />
      </Box>
    )
  })

  // Once a turn is over, its tools' summary line ("Read 1 file, ran 3 shell commands") goes: ctrl+o still shows
  // every call. While the turn runs it stays, the last action being what Claude is doing now.
  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    if (e.props.isActive || e.props.isExpanded) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  // When each turn of this session ended, kept across restarts: the engine gives the end-of-turn line its duration
  // alone, so a turn is recorded here (end, duration) and the line finds its own by the closest duration.
  type End = { end: number; dur: number }
  // The start is stored, not kept in a variable: a reload of the mod mid-turn would lose it.
  on('prompt.submit', async ($, e, next) => {
    await $.store.set(`start-${await $.session.id()}`, await $.clock.now())
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    const sid = await $.session.id()
    const start = (await $.store.get(`start-${sid}`)) as number | undefined
    if (start) {
      const end = await $.clock.now()
      const ends = ((await $.store.get(`ends-${sid}`)) ?? []) as End[]
      await $.store.set(`ends-${sid}`, [...ends, { end, dur: end - start }].slice(-300))
      await $.store.delete(`start-${sid}`)
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // The end of a turn as one line: how long it took, when it ended (with the date on another day), the shortcut
  // to the details; it closes the reply, so the 30 px after a reply (2 rows) follow it.
  on('ui.render', { component: 'TurnDuration' }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = Math.round(e.props.durationMs / 1000)
    const took = s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`
    const ends = ((await $.store.get(`ends-${await $.session.id().catch(() => '')}`)) ?? []) as End[]
    const mine = ends.filter(x => Math.abs(x.dur - e.props.durationMs) < 3000)
      .sort((a, b) => Math.abs(a.dur - e.props.durationMs) - Math.abs(b.dur - e.props.durationMs))[0]
    return (
      <Box gap={1} marginBottom={2}>
        <Text color="#a6e3a1">✓</Text>
        <Text>Terminé en <Text bold>{took}</Text>{mine ? ` · ${when(mine.end)}` : ''}</Text>
        <Text dimColor>· ctrl+o : détail</Text>
      </Box>
    )
  })
}

// "10:56", or "11 nov. 10:56" on another day.
function when(ms: number) {
  const d = new Date(ms), now = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === now.toDateString()) return hm
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  return `${d.getDate()} ${months[d.getMonth()]} ${hm}`
}
