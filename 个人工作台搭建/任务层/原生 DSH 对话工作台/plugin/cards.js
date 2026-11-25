import { randomUUID } from 'node:crypto'

export const board = 'http://127.0.0.1:' + Number(process.env.PW_BOARD_PORT || 48732)
const active = card => ['candidate', 'clarifying'].includes(card.status)
const locked = new Set()

function fields(room) {
  const [project, owner, source] = JSON.parse(room.documentKey)
  if (typeof project !== 'string' || !project || !source.startsWith(project + '/')) throw Error('请选择项目内的文档')
  return { project, owner, source }
}

async function request(path, data) {
  const response = await fetch(board + path, { redirect: 'error', signal: AbortSignal.timeout(15000),
    ...(data ? { method: 'POST', headers: { Origin: board, 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}) })
  if (!response.ok) throw Error('工作台：' + (await response.text()).slice(0, 200))
  return response
}

export async function documents(project) {
  const { docs } = await (await request('/api')).json()
  return docs.filter(doc => doc.project === project && doc.id.endsWith('.md'))
}

export const read = async id => (await request('/doc?id=' + encodeURIComponent(id))).text()

export async function library(room, path) {
  const docs = await documents(fields(room).project)
  if (!path) return docs.map(doc => doc.id).join('\n').slice(0, 16000)
  if (!docs.some(doc => doc.id === path)) throw Error('只能读取当前项目列出的 Markdown 文件')
  return (await read(path)).slice(0, 16000)
}

function clean(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) throw Error('字段为空或过长')
  return value.trim()
}

export function updateCandidate(room, args) {
  const { type, status } = args
  if (!['action', 'knowledge', 'undecided'].includes(type) || !['candidate', 'clarifying'].includes(status)) throw Error('候选类型或状态无效')
  const title = clean(args.title, 80), intent = clean(args.intent, 1400)
  const context = args.context ? clean(args.context, 1400) : null
  const evidence = room.log?.find(line => line.seq === args.message && line.who === 'User' && !line.botId && !line.kind)
  if (!evidence) throw Error('请引用当前讨论里真实用户消息的编号')
  const cards = room.triggers ??= []
  let card = args.id ? cards.find(item => item.id === args.id) : cards.find(item => active(item) && item.title === title)
  if (args.id && !card) throw Error('当前讨论没有此候选')
  if (card && (!active(card) || locked.has(card.id))) throw Error('这张卡片已处置或正在写入')
  if (!card) {
    card = { id: randomUUID(), source: { conversation_id: room.id, message_ids: [] }, target: null }
    cards.push(card)
  }
  Object.assign(card, { title, type, intent, context, status })
  if (!card.source.message_ids.includes(evidence.seq)) card.source.message_ids.push(evidence.seq)
  return card
}

export async function originalLines(rt, room, card) {
  return Promise.all(card.source.message_ids.map(async seq => {
    const line = await rt.groupLine(room.id, seq) ?? room.log?.find(entry => entry.seq === seq)
    if (!line?.text) throw Error('原始消息不可用：#' + seq)
    return { seq, text: line.text }
  }))
}

async function writeObject(rt, room, card, kind) {
  const { project, owner, source } = fields(room)
  const marker = '<!-- workspace-trigger:' + card.id + ' -->'
  const docs = await documents(project)
  const taskPath = project + '/任务层/' + card.title + '/' + card.title + '.md'
  const title = card.intent.split('\n')[0].replace(/[<>:"/\\|?*#\[\]^\x00-\x1f]/g, ' ').slice(0, 48).trim() || '已确认判断'
  const possible = docs.filter(doc => kind === 'task' ? doc.id === taskPath : doc.id.startsWith(project + '/信息层/认知里程碑/判断 ' + title + ' '))
  for (const doc of possible) if ((await read(doc.id)).includes(marker)) return { kind, id: doc.id }
  const lines = await originalLines(rt, room, card)
  const ref = 'DSH ' + room.id + ' · ' + lines.map(line => '#' + line.seq).join('、')
  const notes = [card.context, '[[' + source.replace(/\.md$/, '') + ']]', ref, marker].filter(Boolean).join('\n')
  const data = kind === 'task'
    ? { project, source, name: card.title, intent: card.intent, goal: card.intent, context: notes, status: '待推进' }
    : { project, source, owner, text: [card.intent, ref, marker].join('\n\n'), fromMessage: true,
        quote: lines.at(-1).text.slice(0, 4000), conversation: { id: room.id.replace(/^session-/, ''), topic: card.title, time: new Date().toISOString() } }
  const result = await (await request('/' + kind, data)).json()
  return { kind, id: result.id }
}

export async function decide(rt, room, card, action, write = writeObject) {
  if (!['dismiss', 'task', 'milestone'].includes(action)) throw Error('未知操作')
  if (!active(card)) { await rt.save({ required: true }); return card }
  if (locked.has(card.id)) throw Error('正在处理这张卡片')
  if (rt.readOnly()) throw Error('当前为只读')
  locked.add(card.id)
  try {
    if (action !== 'dismiss') card.target = await write(rt, room, card, action)
    card.status = action === 'dismiss' ? 'dismissed' : 'accepted'
    await rt.save({ required: true })
    return card
  } finally { locked.delete(card.id) }
}

