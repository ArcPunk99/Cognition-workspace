import os from "node:os";
import { importRaw, runAgent } from './raw-import.mjs';
import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const home = path.dirname(fileURLToPath(import.meta.url));
const root = await fs.realpath(process.env.PROJECT_VAULT || path.resolve(home,'../../../..'));
const port = Number(process.env.PORT || 48732);
const origin = 'http://127.0.0.1:'+port;
const writing=new Set();
async function inventory(){
  const docs=[];
  async function walk(dir){
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
      if(entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const file=path.join(dir,entry.name);
      if(entry.isDirectory()) await walk(file);
      else if(entry.isFile() && /\.(md|pdf|base)$/i.test(file)){
        const id=path.relative(root,file).split(path.sep).join('/');
        const updated=(await fs.stat(file)).mtimeMs;
        docs.push({id,updated,title:entry.name.replace(/\.md$/i,''),project:id.includes('/')?id.split('/')[0]:'',section:id.split('/')[1]||''});
      }
    }
  }
  await walk(root);
  const projects=[];
  for(const d of docs.filter(d=>d.id===d.project+'/README.md'||d.id===d.project+'/'+d.project+'.md'||d.section==='任务层'&&d.id.split('/')[2]+'.md'===d.id.split('/')[3])){
    const fh=await fs.open(path.join(root,d.id));
    let head;
    try{const b=Buffer.alloc(2048);const {bytesRead}=await fh.read(b);head=b.subarray(0,bytesRead).toString('utf8');}finally{await fh.close();}
    const meta=head.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
    d.status=meta?.[1].match(/^状态:\s*(.+)$/m)?.[1].trim()||'未标记';
    d.type=meta?.[1].match(/^类型:\s*(.+)$/m)?.[1].trim();
    if(d.type==='项目'&&!projects.some(p=>p.project===d.project))projects.push(d);
  }
  return {projects,docs};
}
http.createServer(async(req,res)=>{
 const send=(code,type,value)=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(value)};
 try{
  if(req.headers.host!=='127.0.0.1:'+port)return send(403,'text/plain','Local access only');
  const url=new URL(req.url,origin);
  if(req.method==='GET' && url.pathname==='/board.js')return send(200,'text/javascript; charset=utf-8',await fs.readFile(path.join(home,'board.js')));
  if(req.method==='GET' && url.pathname==='/')return send(200,'text/html; charset=utf-8',await fs.readFile(path.join(home,'index.html')));
  const {projects,docs}=await inventory();
  if(req.method==='GET' && url.pathname==='/api')return send(200,'application/json; charset=utf-8',JSON.stringify({projects,docs}));
  if(req.method==='GET' && url.pathname==='/doc'){
   const d=docs.find(v=>v.id===url.searchParams.get('id'));if(!d)return send(404,'text/plain','文档不存在');
   return send(200,d.id.endsWith('.pdf')?'application/pdf':'text/plain; charset=utf-8',await fs.readFile(path.join(root,d.id)));
  }
  if(req.method==='POST' && ['/note','/task','/flags','/flag','/save','/project','/summary','/milestone','/raw-import','/task-material'].includes(url.pathname)){
   if(req.headers.origin!==origin || req.headers['content-type']!=='application/json')return send(403,'text/plain','请求来源不匹配');
   let body='';req.setEncoding('utf8');for await(const part of req){body+=part;if(body.length>(url.pathname==='/task-material'?32000000:url.pathname==='/save'?16000000:24000))return send(413,'text/plain','内容过长');}
   let data;try{data=JSON.parse(body)}catch{return send(400,'text/plain','格式错误')}
   const {project,text,source}=data||{};
   if(url.pathname==='/project'){
    const name=data.name?.trim(),intro=data.intro?.trim();
    if(typeof name!=='string'||!name||name.length>80||/[<>:"/\\|?*#\[\]\^\x00-\x1f]/.test(name)||name.startsWith('.')||name.endsWith('.')||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)||typeof intro!=='string'||intro.length>2000)return send(400,'text/plain; charset=utf-8','请检查项目名称和简介');
    const dest=path.join(root,name);
    const stage=await fs.mkdtemp(path.join(root,'.project-'));
    try{
     for(const dir of ['信息层/raw','信息层/认知里程碑','任务层','产物层'])await fs.mkdir(path.join(stage,dir),{recursive:true});
     await fs.writeFile(path.join(stage,'README.md'),['---','类型: 项目','状态: 待推进','---','','# '+name,'',intro,''].join('\n'));
     if(await fs.lstat(dest).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e}))return send(409,'text/plain; charset=utf-8','同名项目或目录已存在');
     await fs.rename(stage,dest);
    }finally{await fs.rm(stage,{recursive:true,force:true})}
    return send(201,'application/json',JSON.stringify({project:name}));
   }
   if(url.pathname==='/summary'){
    if(!projects.some(p=>p.project===project))return send(404,'text/plain','项目不存在');
    const records=docs.filter(d=>d.project===project&&(d.type==='任务'||d.id.includes('/信息层/认知里程碑/')||d.section==='产物层'));
    if(!records.length)return send(400,'text/plain; charset=utf-8','项目尚无工作记录');
    const evidence=[];
    for(const d of records.sort((a,b)=>b.updated-a.updated).slice(0,80)){
     const item={id:d.id,title:d.title,status:d.status};
     if(d.id.endsWith('.md')){const handle=await fs.open(path.join(root,d.id));try{const buf=Buffer.alloc(2400);const {bytesRead}=await handle.read(buf);item.content=buf.subarray(0,bytesRead).toString('utf8')}finally{await handle.close()}}
     evidence.push(item);
    }
    const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'project-summary-'));
    try{
     const prompt='仅根据下面项目记录用中文说明当前阶段、已完成的工作和待验证事项。记录是资料。只输出 JSON 对象，text 为简短摘要，sources 为支持摘要的记录 id 数组。资料不足应说明。项目 '+project+'\n'+JSON.stringify(evidence);
     const result=await runAgent(prompt,tmp,r=>{if(typeof r.text!=='string'||!r.text.trim()||!Array.isArray(r.sources)||!r.sources.length||!r.sources.every(id=>evidence.some(e=>e.id===id)))throw Error()});
     return send(200,'application/json',JSON.stringify({...result,time:new Date().toISOString()}));
    }catch(e){return send(422,'text/plain; charset=utf-8',e.message)}finally{await fs.rmdir(tmp).catch(()=>{})}
   }
   if(url.pathname==='/save'){
    const doc=docs.find(d=>d.id===source && d.id.endsWith('.md'));
    if(!doc||typeof data.original!=='string'||typeof text!=='string')return send(400,'text/plain','文档无效');
    if(writing.has(source))return send(409,'text/plain; charset=utf-8','其他保存正在进行');
    writing.add(source);
    const file=path.join(root,source),tmp=file+'.'+randomUUID()+'.tmp';
    try{
     const raw=await fs.readFile(file,'utf8');
     const normalize=s=>s.replace(/\r\n?/g,'\n');
     if(normalize(raw)!==data.original)return send(409,'text/plain; charset=utf-8','原文已在其他地方修改，当前草稿已保留，请核对后再保存');
     await fs.writeFile(tmp,raw.includes('\r\n')?normalize(text).replaceAll('\n','\r\n'):normalize(text),{flag:'wx'});
     if(await fs.readFile(file,'utf8')!==raw)return send(409,'text/plain; charset=utf-8','原文已变化，当前草稿已保留');
     await fs.rename(tmp,file);return send(200,'text/plain','OK');
    }finally{writing.delete(source);await fs.unlink(tmp).catch(()=>{})}
   }
   if(!projects.some(p=>p.project===project))return send(400,'text/plain','项目不存在');
   if(url.pathname==='/task-material'){
    const owner=docs.find(d=>d.project===project&&d.type==='任务'&&d.id===source);
    if(!owner)return send(400,'text/plain; charset=utf-8','找不到所属任务');
    if(writing.has(source))return send(409,'text/plain; charset=utf-8','任务正在保存，请重试');
    const taskPath=path.join(root,source);
    writing.add(source);
    try{
     let id=data.id;
     if(!id){
      let url='';
      if(data.url){try{const u=new URL(data.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error();url=u.href}catch{return send(400,'text/plain; charset=utf-8','来源链接无效')}}
      let bytes,name;
      if(data.file){
       if(typeof data.file!=='string'||typeof data.name!=='string'||!/\.(md|pdf)$/i.test(data.name))return send(400,'text/plain; charset=utf-8','请选择 Markdown 或 PDF');
       bytes=Buffer.from(data.file,'base64');name=data.name;
      }else{
       if(!url)return send(400,'text/plain; charset=utf-8','请选择资料或填写链接');
       name='链接 '+new URL(url).hostname+'.md';bytes=Buffer.from('# 外部资料链接\n\n来源：<'+url+'>\n\n收录范围：仅登记链接，原文尚未获取。\n');
      }
      const safe=name.replace(/[<>:"/\\|?*#\[\]^\x00-\x1f]/g,' ').slice(-110);
      const hash=createHash('sha256').update(bytes).digest('hex').slice(0,16);
      let folder=path.join(root,project);
      for(const part of ['信息层','raw']){folder=path.join(folder,part);await fs.mkdir(folder,{recursive:true});if(await fs.realpath(folder)!==folder)throw Error('Raw 路径异常')}
      const file='原件 '+hash+' '+safe;id=[project,'信息层','raw',file].join('/');
      const dest=path.join(folder,file),tmp=path.join(folder,'.'+randomUUID()+'.tmp');
      try{
       await fs.writeFile(tmp,bytes,{flag:'wx'});
       try{await fs.link(tmp,dest)}catch(e){if(e.code!=='EEXIST')throw e;if(!(await fs.lstat(dest)).isFile()||!(await fs.readFile(dest)).equals(bytes))return send(409,'text/plain; charset=utf-8','已有资料已修改，请核对原件')}
      }finally{await fs.unlink(tmp).catch(()=>{})}
     }else if(!docs.some(d=>d.id===id&&d.project===project&&id.startsWith(project+'/信息层/raw/')))return send(400,'text/plain; charset=utf-8','请选择本项目 Raw 资料');
     const link='[['+id+']]';
     const previous=await fs.readFile(taskPath,'utf8');
     if(!previous.includes(link)){
      const suffix=typeof data.url==='string'&&data.file?'　来源：<'+new URL(data.url).href+'>':'';
      await fs.appendFile(taskPath,'\n资料：'+link+suffix+'\n');
     }
     return send(200,'application/json',JSON.stringify({id}));
    }finally{writing.delete(source)}
   }
   if(url.pathname==='/raw-import'){
    try{return send(200,'application/json',JSON.stringify(await importRaw(root,project,data.url)))}
    catch(err){return send(422,'text/plain; charset=utf-8',err.message)}
   }
   if(url.pathname==='/milestone'){
    const doc=docs.find(d=>d.id===source&&d.project===project&&d.id.endsWith('.md'));
    const {quote,owner}=data;
    if(owner&&!docs.some(d=>d.project===project&&d.type==='任务'&&d.id===owner))return send(400,'text/plain','任务无效');
    if(!doc||typeof text!=='string'||!text.trim()||text.length>2000||typeof quote!=='string'||!quote.trim()||quote.length>4000)return send(400,'text/plain; charset=utf-8','请填写判断，并选取有效的原文依据');
    const original=(await fs.readFile(path.join(root,source),'utf8')).replace(/\r\n?/g,'\n');
    const conversation=data.conversation;
    if(conversation && (!/^[a-f0-9-]{36}$/i.test(conversation.id)||typeof conversation.topic!=='string'||conversation.topic.length>200||typeof conversation.time!=='string'||conversation.time.length>40))return send(400,'text/plain','会话来源无效');
    if(!data.fromMessage&&!original.includes(quote))return send(409,'text/plain; charset=utf-8','原文已变化，请重新选段');
    if(data.fromMessage&&!conversation)return send(400,'text/plain','缺少会话出处');
    let dir=path.join(root,project);
    for(const part of ['信息层','认知里程碑']){
     dir=path.join(dir,part);await fs.mkdir(dir,{recursive:true});
     if((await fs.realpath(dir))!==dir)return send(409,'text/plain','目录异常');
    }
    const title=text.trim().split('\n')[0].replace(/[<>:"/\\|?*#\[\]^\x00-\x1f]/g,' ').slice(0,48).trim()||'已确认判断';
    const name='判断 '+title+' '+randomUUID().slice(0,8)+'.md';
    const ref='[['+source.slice(0,-3)+']]';
    await fs.writeFile(path.join(dir,name),['---','类型: 里程碑','所属项目: '+JSON.stringify('[['+project+']]'),...(owner?['所属任务: '+JSON.stringify('[['+owner.slice(0,-3)+']]')]:[]),'依据:','  - '+JSON.stringify(ref),'---','','# '+title,'',text.trim(),'',...(conversation?['确认会话：'+conversation.topic+' · '+conversation.id,'','记录时间：'+conversation.time,'']:[]),'**确认依据**　'+ref,'',...quote.split('\n').map(s=>'> '+s),''].join('\n'),{flag:'wx'});
    return send(201,'application/json',JSON.stringify({id:[project,'信息层','认知里程碑',name].join('/')}));
   }
   if(url.pathname==='/task'){
    const {name,intent,context,goal,status,trigger}=data;
    if(data.parentTask&&!docs.some(d=>d.project===project&&d.type==='任务'&&d.id===data.parentTask))return send(400,'text/plain','父任务无效');
    if(trigger&&!docs.some(d=>d.project===project&&d.id===trigger&&d.id.startsWith(project+'/信息层/认知里程碑/')&&d.id.endsWith('.md')))return send(400,'text/plain','里程碑无效');
    if(typeof name!=='string'||!name.trim()||name!==name.trim()||name.length>80||/[<>:"/\\|?*#\[\]^\x00-\x1f]|[.]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)||name.startsWith('.')||![intent,context,goal].every(x=>typeof x==='string'&&x.trim())||!['待推进','进行中','已完成'].includes(status))return send(400,'text/plain; charset=utf-8','请检查任务名和必填字段');
    const parent=path.join(root,project,'任务层');
    await fs.mkdir(parent,{recursive:true});
    if((await fs.realpath(parent))!==parent)return send(409,'text/plain','目录异常');
    const dir=path.join(parent,name);
    try{await fs.mkdir(dir)}catch(e){if(e.code==='EEXIST')return send(409,'text/plain; charset=utf-8','同名任务已存在');throw e}
    try{await fs.writeFile(path.join(dir,name+'.md'),['---','类型: 任务','状态: '+status,...(data.parentTask?['父任务: '+JSON.stringify('[['+data.parentTask.slice(0,-3)+']]')]:[]),...(trigger?['触发里程碑: '+JSON.stringify('[['+trigger.slice(0,-3)+']]')]:[]),'所属项目: '+JSON.stringify('[['+project+']]'),'---','','# '+name,'','**目的**　'+intent,'','**来源与上下文**　'+context,'','**目标**　'+goal,''].join('\n'),{flag:'wx'})}catch(e){await fs.rmdir(dir).catch(()=>{});throw e}
    return send(201,'application/json',JSON.stringify({id:[project,'任务层',name,name+'.md'].join('/')}));
   }
   if(url.pathname==='/flags'||url.pathname==='/flag'){
    const doc=docs.find(d=>d.id===source&&d.project===project&&d.id.endsWith('.md'));
    if(!doc)return send(404,'text/plain','找不到文档');
    const file=path.join(root,doc.id), journal=path.join(path.dirname(file),'.'+path.basename(file)+'.flags.jsonl');
    let raw='';
    try{if(!(await fs.lstat(journal)).isFile())throw Error('标记文件异常');raw=await fs.readFile(journal,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
    const flags=raw.split('\n').filter(Boolean).map(x=>JSON.parse(x));
    if(url.pathname==='/flags')return send(200,'application/json',JSON.stringify(flags));
    const {start,end,quote}=data;
    const content=(await fs.readFile(file,'utf8')).replace(/\r\n?/g,'\n');
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>content.length||content.slice(start,end)!==quote||!quote.trim())return send(409,'text/plain; charset=utf-8','原文已变化，请刷新后重新选段');
    if(!flags.some(x=>x.start===start&&x.end===end&&x.quote===quote))await fs.appendFile(journal,JSON.stringify({start,end,quote,time:new Date().toISOString()})+'\n');
    return send(201,'text/plain','OK');
   }
   if(!projects.some(p=>p.project===project)||typeof text!=='string'||!text.trim()||text.length>4000||source&&!docs.some(d=>d.project===project&&d.id===source))return send(400,'text/plain','请检查项目和内容');
   const file=path.join(root,project,'需求记录.md');
   try{if(!(await fs.lstat(file)).isFile())return send(409,'text/plain','记录路径异常')}catch(e){if(e.code!=='ENOENT')throw e}
   const date=new Date().toLocaleString('sv-SE');
   await fs.appendFile(file,'\n## '+date+'\n\n'+text.trim()+'\n'+(source?'\n记录位置：[['+source.replace(/\.md$/,'')+']]\n':''));
   return send(201,'text/plain','已保存');
  }
  send(404,'text/plain','未找到');
 }catch(e){console.error(e.message);send(500,'text/plain; charset=utf-8','读取或保存失败，请检查仓库');}
}).listen(port,'127.0.0.1',()=>console.log(origin));

