import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { documents } from './cards.js'

export const vault = path.resolve(process.env.PROJECT_VAULT || 'E:/project/Project')
const safeName = s => typeof s === 'string' && s.trim() === s && s.length > 0 && !s.startsWith('.') && !/[<>:"/\\|?*\x00-\x1f]/.test(s)
const trashName = '.原生工作台回收站'

async function physical(parent, name, create = false) {
  const dir = path.join(parent, name)
  if (create) await fs.mkdir(dir).catch(e => { if (e.code !== 'EEXIST') throw e })
  if (!(await fs.lstat(dir)).isDirectory() || path.relative(dir, await fs.realpath(dir)) !== '') throw Error('目录已移动或是链接')
  return dir
}
async function projectDir(project) {
  if (!safeName(project)) throw Error('项目名称无效')
  return physical(await fs.realpath(vault), project)
}
export async function removed(project) {
  const proj = await projectDir(project)
  let trash
  try { trash = await physical(proj, trashName) } catch(e) { if(e.code==='ENOENT')return []; throw e }
  const items = []
  for(const rec of await fs.readdir(trash,{withFileTypes:true})) {
    if (!rec.isDirectory() || !/^[0-9a-f-]{36}$/i.test(rec.name)) continue
    const entries = await fs.readdir(await physical(trash, rec.name),{withFileTypes:true})
    for(const entry of entries) if(entry.isDirectory() && safeName(entry.name)) items.push({id:rec.name,title:entry.name})
  }
  return items
}
export async function removeTask(project, id) {
  const doc = (await documents(project)).find(d => d.type==='任务' && d.id===id)
  const name = doc?.title
  if (!safeName(name) || id !== [project,'任务层',name,name+'.md'].join('/')) throw Error('只能移除当前项目的任务目录')
  const proj = await projectDir(project)
  const dir = await physical(await physical(proj,'任务层'),name)
  // These tasks hold the running local services.
  for (const service of ['H5看板/server.mjs','plugin/index.js']) {
    if (await fs.stat(path.join(dir,service)).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e})) throw Error('该任务存放工作台程序，运行期间不能移除')
  }
  const trash = await physical(proj,trashName,true)
  const token = randomUUID()
  const dest = await physical(trash,token,true)
  try { await fs.rename(dir,path.join(dest,name)) } catch(e) { await fs.rmdir(dest);throw e }
  return {id:token,title:name}
}
export async function restoreTask(project, token) {
  const item=(await removed(project)).find(r=>r.id===token)
  if(!item)throw Error('回收站中没有此任务')
  const proj=await projectDir(project), base=await physical(proj,'任务层')
  const dest=path.join(base,item.title)
  if(await fs.lstat(dest).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e}))throw Error('同名任务已存在')
  const holder=await physical(await physical(proj,trashName),item.id)
  await fs.rename(await physical(holder,item.title),dest)
  await fs.rmdir(holder)
  return {id:[project,'任务层',item.title,item.title+'.md'].join('/')}
}
