const $=s=>document.querySelector(s);
const el=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
function button(text,fn){const b=el('button',text);b.onclick=fn;return b}
async function request(url,data){
 const response=await fetch(url,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});
 if(!response.ok)throw Error(await response.text());return response;
}
let db, project, task, current, body='', version=0;
const drafts=new Map();
const save=button('保存',saveDocument);
save.className='primary';
save.hidden=true;
$('#title').after(save);
function trackEdit(pre){
 const original=drafts.get(current.id)?.original??body;
 const text=pre.innerText;
 if(text===original)drafts.delete(current.id);
 else drafts.set(current.id,{original,text});
 save.disabled=!drafts.has(current.id);
 $('#flag').disabled=!save.disabled;
 save.textContent=save.disabled?'已保存':'保存';
}
async function saveDocument(){
 const id=current.id,draft=drafts.get(id);
 if(!draft)return;
 save.disabled=true;
 try{
  await request('/save',{source:id,original:draft.original,text:draft.text});
  const latest=drafts.get(id);
  if(latest===draft)drafts.delete(id);
  else if(latest)latest.original=draft.text;
  if(current.id===id){await render();message('已保存到本地文档')}
 }catch(e){message(e.message);if(current.id===id)save.disabled=false}
}
window.addEventListener('beforeunload',e=>{if(drafts.size){e.preventDefault();e.returnValue=''}});
window.addEventListener('keydown',e=>{if(!save.hidden&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!save.disabled)saveDocument()}});
function go(p,t='',d='',s=''){location.hash=new URLSearchParams({p,t,d,s}).toString()}
function message(text){$('#msg').textContent=text}
function group(title,docs,action,open=false){
 const box=el('details','');box.open=open;box.append(el('summary',title+' · '+docs.length));
 for(const d of docs){const b=button(d.title,()=>action(d));if(d===current)b.setAttribute('aria-current','true');if(d.type==='任务')b.append(el('em',d.status));box.append(b)}
 return box;
}
function postDoc(endpoint,extra={}){return request(endpoint,{project,source:current.id,...extra})}
async function render(){
 document.querySelector('.session-context')?.remove();
 save.hidden=true;
 const turn=++version, args=new URLSearchParams(location.hash.slice(1));project=args.get('p');
 const projectDoc=db.projects.find(d=>d.project===project);
 $('#home').hidden=!!projectDoc;$('#workspace').hidden=!projectDoc;message('');
 $('#cards').replaceChildren();for(const p of db.projects){
 const tasks=db.docs.filter(d=>d.project===p.project&&d.type==='任务');
 const b=button('',()=>go(p.project));b.className='card';b.append(el('b',p.project),el('span',p.status+' · '+tasks.length+' 项任务 · '+tasks.filter(d=>d.status==='已完成').length+' 项完成'));$('#cards').append(b)}
 if(!projectDoc){canvasProject='';if(!db.projects.length)message('仓库中还没有项目页');return}
 const files=db.docs.filter(d=>d.project===project);
 task=files.find(d=>d.id===args.get('t')&&d.type==='任务');
 const linked=db.docs.find(d=>d.id===args.get('d')&&(d.project===project||!d.project));
 const raw=files.filter(d=>d.section==='信息层'&&d.id.split('/')[2].toLowerCase()==='raw');
 const milestones=files.filter(d=>d.section==='信息层'&&d.id.split('/')[2]==='认知里程碑');
 const projectFiles=files.filter(d=>d.id.split('/').length===2);
 const readme=projectFiles.find(d=>d.title.toLowerCase()==='readme'&&d.id.endsWith('.md'));
 const sections={'总览':[],'项目说明':[...new Set([readme||projectDoc,...projectFiles])],'信息':[...raw,...milestones],'任务':files.filter(d=>d.type==='任务'),'产品':files.filter(d=>d.section==='产物层')};
 sections['任务视图']=sections['任务'];
 const inferred=task||linked?.section==='任务层'?'任务':linked?.section==='产物层'?'产品':linked?.section==='信息层'?'信息':linked?'项目说明':'总览';
 const requested=args.get('s');
 const section=requested==='项目说明'&&!linked?'总览':Object.hasOwn(sections,requested)?requested:inferred;
 if(section!=='任务')task=null;
 if(section==='任务'&&!task&&linked?.section==='任务层'){
  task=sections['任务'].find(d=>linked.id.startsWith(d.id.slice(0,d.id.lastIndexOf('/')+1)));
 }
 if(section==='任务'&&!task&&!linked)task=sections['任务'][0];
 current=linked||task||sections[section][0];
 const read=d=>go(project,task?.id||'',d.id,section);
 renderAssistant();
 $('#projectName').textContent=project;
 $('#projectMenu').open=false;
 const referenceDocs=db.docs.filter(d=>!d.project);
 $('#projectDocs').replaceChildren(...referenceDocs.map(d=>button(d.title,()=>{ $('#projectMenu').open=false;go(project,'',d.id,'项目说明') })));

 const choose=(s,d)=>go(project,s==='任务'?d?.id:'',s==='任务'?'':d?.id,s);
 $('#sections').replaceChildren(...Object.keys(sections).filter(s=>s!=='项目说明').map(s=>{
  const b=button(s==='任务视图'?'任务画布':s,()=>s==='任务视图'?go(project,'','','任务视图'):choose(s,sections[s][0]));b.setAttribute('aria-pressed',String(s===section||(s==='总览'&&section==='项目说明')));return b;
 }));
 if(section!=='任务视图')canvasProject='';
 $('#taskOverview').hidden=section!=='任务视图';
 $('#overview').hidden=section!=='总览';
 if(section==='总览'){await showOverview(projectDoc,readme,sections,milestones,turn);return}
 if(section==='任务视图'){await renderTaskOverview(files,sections['任务'],milestones,turn);return}
 const items=$('#items');
 if(section==='信息'){
  const heading=el('div','');heading.className='raw-heading';
  heading.append(group('Raw',raw,read,true),button('＋ 添加',openRawDialog));
  items.replaceChildren(heading,group('认知 Milestone',milestones,read,true));
 }else{
  items.replaceChildren(...sections[section].map(d=>{
   const b=button(d.title,()=>choose(section,d));if(d===current||d===task)b.setAttribute('aria-current','true');
   if(d.type==='任务')b.append(el('em',d.status));return b;
  }));
 }
 $('#related').hidden=!task;
 $('#title').textContent=current?.title||('暂无'+section);$('#path').textContent=current?.id||'';$('#related').replaceChildren();$('#tools').hidden=true;$('#content').replaceChildren();$('article').scrollTop=0;
 if(!current)return;
 if(task){
 const taskText=await(await request('/doc?id='+encodeURIComponent(task.id))).text();if(turn!==version)return;
 const prefix=task.id.slice(0,task.id.lastIndexOf('/')+1);
 const matches=new Set();
 for(const m of taskText.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)){
 const key=m[1].trim();const hit=files.filter(d=>[d.title,d.id,d.id.replace(/\.md$/,'')].includes(key));
 if(hit.length===1&&hit[0]!==projectDoc)matches.add(hit[0].id)}
 const related=files.filter(d=>d!==task&&(d.id.startsWith(prefix)||matches.has(d.id)));
 $('#related').append(el('h3',task.title+' · 关联资料'),...[task,...related].map(d=>{const b=button(d===task?'任务说明':d.title,()=>read(d));if(d===current)b.setAttribute('aria-current','true');return b}));
 $('#related').append(button('＋ 添加任务资料',openMaterial));
 if(!related.length)$('#related').append(el('p','可在任务页用双链关联资料，或将文档放入任务目录。'));
 }
 if(!task)$('#related').append(el('h3','任务文档'),el('p','选择左侧任务查看关联资料。'));
 const url='/doc?id='+encodeURIComponent(current.id);
 if(current.id.endsWith('.pdf')){const frame=el('iframe','');frame.src=url;frame.title=current.title;$('#content').append(frame);return}
 const text=await(await request(url)).text();if(turn!==version)return;body=text.replace(/\r\n?/g,'\n');
 if(task&&current===task){
  const knowledge=files.filter(d=>milestones.includes(d)&&(body.includes('[['+d.id.replace(/\.md$/,'')+']]')||body.includes('[['+d.title+']]')));
  if(knowledge.length){
   const context=el('details','');context.append(el('summary','本任务引用的判断 · '+knowledge.length));
   for(const d of knowledge)context.append(button(d.title,()=>read(d)));
   $('#threadBar').after(context);context.className='session-context';
  }
 }
 if(milestones.includes(current)){
  const sessionId=body.match(/^确认会话：.* · ([a-f0-9-]{36})$/m)?.[1];
  const sourceRef=body.match(/\*\*确认依据\*\*\s*\[\[([^\]]+)\]\]/)?.[1];
  const sourceDoc=files.find(d=>d.id.replace(/\.md$/,'')===sourceRef);
  const ownerRef=body.match(/^所属任务: .*?\[\[([^\]]+)\]\]/m)?.[1];
  const ownerDoc=files.find(d=>d.id.replace(/\.md$/,'')===ownerRef);
  if(sourceDoc){
   const back=button('查看确认来源',()=>{
    const parts=ownerDoc&&ownerDoc.id!==sourceDoc.id?[project,sourceDoc.id,ownerDoc.id]:[project,sourceDoc.id];
    const key='project-board:document-chat:'+JSON.stringify(parts);
    const book=JSON.parse(localStorage.getItem(key)||'null');
    if(sessionId&&book?.sessions?.some(s=>s.id===sessionId)){book.selected=sessionId;localStorage.setItem(key,JSON.stringify(book))}
    go(project,ownerDoc?.id||'',sourceDoc.id,ownerDoc?'任务':'信息');
   });
   $('#content').prepend(back);
  }
 }
 const pre=el('pre',body);$('#content').append(pre);
 if(current.id.endsWith('.md')){
  pre.contentEditable='plaintext-only';pre.setAttribute('aria-label','直接编辑文档正文');pre.spellcheck=false;
  save.hidden=false;save.disabled=!drafts.has(current.id);save.textContent=save.disabled?'保存':'保存修改';
  $('#flag').disabled=drafts.has(current.id);
  pre.oninput=()=>trackEdit(pre);
  if(drafts.has(current.id))pre.textContent=drafts.get(current.id).text;
 }
 if(current.project&&current.id.endsWith('.md')){
 const flags=await(await postDoc('/flags')).json();if(turn!==version)return;
 $('#tools').hidden=false;$('#flagCount').textContent='已标记片段 · '+flags.length;$('#flags').replaceChildren();
 if(drafts.has(current.id))return;
 const ranges=[];
 for(const f of flags){
 const valid=body.slice(f.start,f.end)===f.quote;
 const b=button((valid?'⚑ ':'原文已变化 · ')+f.quote.slice(0,65),()=>{const mark=[...pre.querySelectorAll('mark')].find(m=>Number(m.dataset.start)<=f.start&&Number(m.dataset.end)>f.start);mark?.scrollIntoView({block:'center'})});b.disabled=!valid;$('#flags').append(b);if(valid)ranges.push([f.start,f.end])}
 ranges.sort((a,b)=>a[0]-b[0]);let pos=0;pre.replaceChildren();
 for(const [start,end] of ranges){if(end<=pos)continue;const offset=Math.max(start,pos);pre.append(body.slice(pos,offset));const mark=el('mark',body.slice(offset,end));mark.dataset.start=offset;mark.dataset.end=end;pre.append(mark);pos=end}pre.append(body.slice(pos));
 }
}

function beginMilestone(owner,source,quote='',fromMessage=false){
 const dialog=$('#confirmMilestone'),form=dialog.querySelector('form');
 const session=source.id===current?.id&&$('#taskOverview').hidden?activeSession():null;
 const conversation=session&&{id:session.id,topic:session.topic||source.title,time:new Date().toISOString()};
 form.reset();form.elements.quote.readOnly=fromMessage;form.elements.quote.value=quote;form.querySelector('[role=alert]').textContent='';dialog.showModal();
 form.onsubmit=async e=>{
  e.preventDefault();const submit=form.querySelector('.primary');submit.disabled=true;
  try{await request('/milestone',{project,owner:owner?.id,conversation,fromMessage,source:source.id,...Object.fromEntries(new FormData(form))});dialog.close();await reload()}
  catch(err){form.querySelector('[role=alert]').textContent=err.message}finally{submit.disabled=false}
 };
}
let canvasProject='';
const viewport=$('#taskTiles');
let drag=null;
viewport.addEventListener('pointerdown',e=>{
 if(e.button!==0||!e.isPrimary||e.target.closest('button,a,input,select'))return;
 drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
 viewport.setPointerCapture(e.pointerId);viewport.classList.add('panning');e.preventDefault();
});
viewport.addEventListener('pointermove',e=>{
 if(drag?.id!==e.pointerId)return;
 viewport.scrollTo(drag.left+drag.x-e.clientX,drag.top+drag.y-e.clientY);
});
viewport.addEventListener('lostpointercapture',()=>{drag=null;viewport.classList.remove('panning')});
let curveObserver;
function drawTaskCurves(tree){
 const ns='http://www.w3.org/2000/svg';
 const layer=document.createElementNS(ns,'svg');
 layer.classList.add('taskCurves');layer.setAttribute('aria-hidden','true');tree.prepend(layer);
 const card=node=>node.querySelector(':scope > .projectRoot,:scope > .taskNode > button');
 function draw(){
  const origin=tree.getBoundingClientRect(),paths=[];
  for(const group of tree.querySelectorAll('.branchChildren')){
   if(group.closest('[hidden]')||!group.getClientRects().length)continue;
   const parent=card(group.parentElement).getBoundingClientRect();
   for(const branch of group.children){
    const child=card(branch).getBoundingClientRect();
    const x=parent.right-origin.left,y=parent.top+parent.height/2-origin.top;
    const end=child.left-origin.left,bottom=child.top+child.height/2-origin.top;
    const mid=(x+end)/2;
    const path=document.createElementNS(ns,'path');
    path.setAttribute('d',`M ${x} ${y} C ${mid} ${y}, ${mid} ${bottom}, ${end} ${bottom}`);
    paths.push(path);
    const label=branch.querySelector(':scope > .edgeNote');
    if(label){
     const rect=branch.getBoundingClientRect();
     label.style.left=(origin.left+mid-rect.left)+'px';
     label.style.top=(origin.top+(y+bottom)/2-rect.top)+'px';
    }
   }
  }
  layer.replaceChildren(...paths);
 }
 curveObserver?.disconnect();curveObserver=new ResizeObserver(draw);
 for(const node of tree.querySelectorAll('.branch,.branchChildren,.taskNode'))curveObserver.observe(node);
 curveObserver.observe(tree);draw();return draw;
}
const foldedTasks=new Set();
async function renderTaskOverview(files,tasks,milestones,turn){
 const targetId=new URLSearchParams(location.hash.slice(1)).get('d');
 const selected=tasks.find(d=>d.id===targetId);
 const tiles=$('#taskTiles'),detail=$('#taskDetail');const previous={left:tiles.scrollLeft,top:tiles.scrollTop};detail.replaceChildren();
 const field=(text,name)=>text.split(/\r?\n/).find(line=>line.startsWith('**'+name+'**'))?.split('**').slice(2).join('**').trim()||'';
 const records=await Promise.all([...milestones.filter(d=>d.id.endsWith('.md')),...tasks].map(async d=>{
  const text=await(await request('/doc?id='+encodeURIComponent(d.id))).text();
  const head=text.replace(/^\uFEFF/,'').split(/^---\s*$/m)[1]||'';
  const ref=name=>head.match(new RegExp('^'+name+':[^\\n]*?\\[\\[([^\\]]+)\\]\\]','m'))?.[1];
  return {d,text,intent:field(text,'目的'),reason:field(text,'来源与上下文'),goal:text.match(/^\*\*目标\*\*\s*(.+)$/m)?.[1]||'',parent:ref('父任务'),owner:ref('所属任务'),trigger:ref('触发里程碑')};
 }));
 if(turn!==version)return;
 const matches=(ref,d)=>ref===d.id.replace(/\.md$/,'')||(ref===d.title&&files.filter(x=>x.title===ref).length===1);
 const taskRecords=records.filter(r=>tasks.includes(r.d));
 const milestonesOf=d=>records.filter(r=>milestones.includes(r.d)&&matches(r.owner,d));
 const parentOf=r=>taskRecords.find(p=>matches(r.parent,p.d));
 const selectedRecord=taskRecords.find(r=>r.d===selected);
 let redraw;const shown=new Set();
 function branch(r){
  const node=el('div','');node.className='branch';shown.add(r);
  const tile=button('',()=>go(project,'',r.d.id,'任务视图'));
  tile.setAttribute('aria-pressed',String(r===selectedRecord));
  const statusLabel=el('em',r.d.status);statusLabel.dataset.status=r.d.status;
  tile.append(el('strong',r.d.title),statusLabel,el('small',r.goal.slice(0,85)),el('small','已确认 '+milestonesOf(r.d).length+' 条'));
  const card=el('div','');card.className='taskNode';card.append(tile);node.append(card);
  const nested=el('div','');nested.className='branchChildren';
  for(const child of taskRecords)if(!shown.has(child)&&parentOf(child)===r)nested.append(branch(child));
  if(nested.childElementCount){
   const toggle=button('',()=>{if(foldedTasks.has(r.d.id))foldedTasks.delete(r.d.id);else foldedTasks.add(r.d.id);sync();redraw?.()});
   function sync(){nested.hidden=foldedTasks.has(r.d.id);toggle.textContent=nested.hidden?'展开 '+nested.childElementCount+' 项':'收起子任务';toggle.setAttribute('aria-expanded',String(!nested.hidden))}
   sync();card.append(toggle);node.append(nested);
  }
  const parent=parentOf(r);
  if(parent){
   const edge=button('关系',()=>{detail.replaceChildren(el('h2','任务关系'),el('p',parent.d.title+' → '+r.d.title),el('h3','来源与衍生原因'),el('p',r.reason||'尚未记录原因。'));
    const cause=records.find(m=>milestones.includes(m.d)&&matches(r.trigger,m.d));
    if(cause)detail.append(el('h3','触发判断'),button(cause.d.title,()=>go(project,'',cause.d.id,'信息')));
    detail.append(button('查看子任务',()=>{if(r===selectedRecord)render().catch(e=>message(e.message));else go(project,'',r.d.id,'任务视图')}));
   });edge.className='edgeNote';edge.setAttribute('aria-label',parent.d.title+' 到 '+r.d.title+' 的关系');node.prepend(edge);
  }
  return node;
 }
 const stage=el('div','');stage.className='canvasStage';
 const tree=el('div','');tree.className='branch';stage.append(tree);
 const root=button('',()=>go(project,'','','任务视图'));root.className='projectRoot';
 root.setAttribute('aria-pressed',String(!selected));root.append(el('small','Project'),el('strong',project));tree.append(root);
 const roots=el('div','');roots.className='branchChildren';
 for(const r of [...taskRecords.filter(r=>!parentOf(r)),...taskRecords])if(!shown.has(r))roots.append(branch(r));
 if(roots.childElementCount)tree.append(roots);
 tiles.replaceChildren(stage);redraw=drawTaskCurves(tree);
 if(canvasProject!==project||!selected){
  const anchor=selected?tiles.querySelector('.taskNode button[aria-pressed=true]')||root:root;
  const box=anchor.getBoundingClientRect(),view=tiles.getBoundingClientRect();
  tiles.scrollBy(box.left+box.width/2-view.left-tiles.clientWidth/2,box.top+box.height/2-view.top-tiles.clientHeight/2);
 }else tiles.scrollTo(previous.left,previous.top);
 canvasProject=project;
 if(!selected){
  detail.append(el('h2',project),el('p','任务 · '+tasks.length),button('打开项目说明',()=>go(project,'','','项目说明')),button('创建任务',()=>$('#newTask').click()));
  return;
 }
 detail.append(el('h2',selected.title),el('h3','工作意图'),el('p',selectedRecord.intent||'尚未记录'),el('h3','目标'),el('p',selectedRecord.goal||'尚未记录'),button('进入任务',()=>go(project,selected.id)));
 const discussion=el('details','');discussion.append(el('summary','相关讨论'));
 discussion.append(button('打开任务会话',()=>go(project,selected.id)));
 const folder=selected.id.slice(0,selected.id.lastIndexOf('/')+1);
 for(const m of records.filter(m=>milestones.includes(m.d)&&matches(m.owner,selected))){
  const src=m.text.match(/\*\*确认依据\*\*\s*\[\[([^\]#]+)(?:#[^\]]*)?\]\]/)?.[1];
  const doc=files.find(d=>d.id===src+'.md'&&d.id.startsWith(folder));
  if(doc&&doc!==selected&&![...discussion.querySelectorAll('button')].some(b=>b.textContent===doc.title))discussion.append(button(doc.title,()=>go(project,selected.id,doc.id,'任务')));
 }
 detail.append(discussion);
 const state=el('select','');state.setAttribute('aria-label','任务状态');
 for(const value of ['待推进','进行中','已完成'])state.add(new Option(value,value,false,value===selected.status));
 async function changeField(record,field,value){
  const lines=record.text.replace(/\r\n?/g,'\n').split('\n');
  const end=lines.findIndex((line,i)=>i>0&&line.trim()==='---');
  if(end<0)return message('任务缺少属性区');
  const index=lines.slice(1,end).findIndex(line=>line.startsWith(field+':'));
  lines.splice(index<0?end:index+1,index<0?0:1,field+': '+value);
  try{await request('/save',{source:record.d.id,original:record.text.replace(/\r\n?/g,'\n'),text:lines.join('\n')});await reload()}catch(e){message(e.message);state.value=selected.status}
 }
 state.onchange=()=>changeField(selectedRecord,'状态',state.value);detail.append(state);
 detail.append(el('h3','子任务'),button('新建子任务',()=>{$('#newTask').click();$('#taskDialog form').elements.parentTask.value=selected.id}));
 const ancestors=new Set();let cursor=selectedRecord;
 while(cursor&&!ancestors.has(cursor)){ancestors.add(cursor);cursor=parentOf(cursor)}
 const attach=el('select','');attach.setAttribute('aria-label','关联已有独立任务');attach.add(new Option('关联已有独立任务…',''));
 for(const r of taskRecords)if(!r.parent&&!ancestors.has(r))attach.add(new Option(r.d.title,r.d.id));
 attach.onchange=()=>{const target=taskRecords.find(r=>r.d.id===attach.value);if(target)changeField(target,'父任务',JSON.stringify('[['+selected.id.slice(0,-3)+']]'))};detail.append(attach);
 const summary=el('details','');summary.append(el('summary','查看直接子任务成果'));
 for(const r of taskRecords.filter(r=>parentOf(r)===selectedRecord)){
  summary.append(el('strong',r.d.title+' · '+milestonesOf(r.d).length));
  for(const m of milestonesOf(r.d))summary.append(button(m.d.title,()=>go(project,'',m.d.id,'信息')));
 }
 detail.append(summary);
 const sourceMilestones=records.filter(r=>milestones.includes(r.d));
 const inherited=sourceMilestones.filter(r=>matches(selectedRecord.trigger,r.d)||selectedRecord.text.includes('[['+r.d.id.slice(0,-3)+']]')||selectedRecord.text.includes('[['+r.d.title+']]'));
 if(inherited.length){detail.append(el('h3','引用的判断'));for(const m of inherited)detail.append(button(m.d.title,()=>go(project,'',m.d.id,'信息')))}
 const cite=el('select','');cite.add(new Option('引用已有判断…',''));cite.setAttribute('aria-label','引用已有判断');
 for(const m of sourceMilestones.filter(m=>!inherited.includes(m)))cite.add(new Option(m.d.title,m.d.id));
 cite.onchange=async()=>{if(!cite.value)return;const original=selectedRecord.text.replace(/\r\n?/g,'\n');try{await request('/save',{source:selected.id,original,text:original+'\n引用判断：[['+cite.value.slice(0,-3)+']]\n'});await reload()}catch(e){message(e.message)}};detail.append(cite);
 const confirmed=records.filter(r=>milestones.includes(r.d)&&matches(r.owner,selected));
 detail.append(el('h3','已确认里程碑 · '+confirmed.length));
 for(const {d} of confirmed){
  const row=el('div','');row.append(button(d.title,()=>go(project,'',d.id,'信息')),button('派生任务',()=>{
   $('#newTask').click();const form=$('#taskDialog form');form.elements.trigger.value=d.id;
   form.elements.context.value='由 [['+d.id.replace(/\.md$/,'')+']] 触发。';
  }));
  detail.append(row);
 }
 detail.append(button('确认新里程碑',()=>beginMilestone(selected,selected)));
 const children=records.filter(r=>tasks.includes(r.d)&&confirmed.some(m=>matches(r.trigger,m.d)));
 detail.append(el('h3','派生任务 · '+children.length));
 for(const r of children){const origin=confirmed.find(m=>matches(r.trigger,m.d));detail.append(button(r.d.title,()=>go(project,'',r.d.id,'任务视图')),el('small','来自 '+origin.d.title))}
}


const projectDialog=$('#projectDialog'),projectForm=projectDialog.querySelector('form');
$('#createProject').onclick=()=>{projectForm.reset();projectForm.querySelector('[role=alert]').textContent='';projectDialog.showModal()};
projectForm.onsubmit=async e=>{
 e.preventDefault();const submit=projectForm.querySelector('.primary');submit.disabled=true;
 try{
  const result=await(await request('/project',Object.fromEntries(new FormData(projectForm)))).json();
  db=await(await request('/api')).json();projectDialog.close();go(result.project,'','','总览');
 }catch(err){projectForm.querySelector('[role=alert]').textContent=err.message}finally{submit.disabled=false}
};
const pendingSummaries=new Set();
async function showOverview(projectDoc,readme,sections,milestones,turn){
 const panel=el('div',''),name=projectDoc.project,tasks=sections['任务'],products=sections['产品'];
 $('#overview').replaceChildren(panel);panel.append(el('h2',name));
 const introText=await(await request('/doc?id='+encodeURIComponent((readme||projectDoc).id))).text();
 if(turn!==version)return;
 const document=readme||projectDoc;
 const bodyText=introText.replace(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/,'').trim();
 const card=el('section','');card.className='overviewReadme';
 const heading=el('div','');heading.append(el('h3','项目说明'),button('编辑与主对话',()=>go(name,'',document.id,'项目说明')));
 card.append(heading,el('pre',bodyText||'暂无项目说明'));
 const others=sections['项目说明'].filter(d=>d!==document);
 if(others.length){const links=el('details','');links.append(el('summary','其他项目文档'));for(const d of others)links.append(button(d.title,()=>go(name,'',d.id,'项目说明')));card.append(links)}
 $('#overview').append(card);
 panel.append(el('h3','任务进度'),button(tasks.length+' 项任务',()=>go(name,'','','任务视图')),el('p',['待推进','进行中','已完成'].map(status=>status+' '+tasks.filter(d=>d.status===status).length).join('　')),button('创建任务',()=>$('#newTask').click()));
 for(const [label,list,section] of [['认知里程碑',milestones,'信息'],['产物',products,'产品']]){
  panel.append(el('h3',label+' · '+list.length));
  for(const d of [...list].sort((a,b)=>b.updated-a.updated).slice(0,3))panel.append(button(d.title,()=>go(name,'',d.id,section)));
 }
 if(!tasks.length&&!milestones.length&&!products.length)return;
 panel.append(el('h3','Agent 进展摘要'));
 const key='project-board:summary:'+name,summary=el('div',''),status=el('small','');
 function display(result){
  summary.replaceChildren();if(!result)return;
  summary.append(el('p',result.text),el('small','生成于 '+new Date(result.time).toLocaleString()));
  for(const id of result.sources){const doc=db.docs.find(d=>d.id===id&&d.project===name);if(doc)summary.append(button(doc.title,()=>go(name,doc.type==='任务'?id:'',id)))}
 }
 try{display(JSON.parse(localStorage.getItem(key)))}catch{}
 const generate=button('生成进展摘要',async()=>{
  if(pendingSummaries.has(name))return;
  pendingSummaries.add(name);generate.disabled=true;status.textContent='DSH 正在整理工作记录…';
  try{const result=await(await request('/summary',{project:name})).json();localStorage.setItem(key,JSON.stringify(result));display(result);status.textContent=''}
  catch(e){status.textContent=e.message}finally{pendingSummaries.delete(name);generate.disabled=false;if(turn!==version&&project===name&&new URLSearchParams(location.hash.slice(1)).get('s')==='总览')await render()}
 });
 generate.disabled=pendingSummaries.has(name);panel.append(summary,generate,status);
}

async function reload(){try{db=await(await request('/api')).json();await render()}catch(e){message(e.message)}}
$('#flag').onmousedown=e=>e.preventDefault();
$('#flag').onclick=async()=>{
 const sel=getSelection(), pre=$('#content pre');if(!pre||!sel.rangeCount||sel.isCollapsed)return message('请先选中一段原文');
 const range=sel.getRangeAt(0);if(!pre.contains(range.commonAncestorContainer))return message('请在当前文档正文中选段');
 const before=range.cloneRange();before.selectNodeContents(pre);before.setEnd(range.startContainer,range.startOffset);
 const start=before.toString().length,quote=range.toString();if(quote.length>4000||!quote.trim())return message('请选择 1 至 4000 字的正文');
 try{await postDoc('/flag',{start,end:start+quote.length,quote});await render();message('已标记为人工确认片段')}catch(e){message(e.message)}
};
for(const b of document.querySelectorAll('[data-refresh]'))b.onclick=reload;
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
for(const [trigger,id,endpoint] of [['#newTask','#taskDialog','/task'],['#note','#noteDialog','/note']]){
 const dialog=$(id),form=dialog.querySelector('form');$(trigger).onclick=()=>{form.reset();if(form.elements.parentTask){
  form.elements.parentTask.replaceChildren(new Option('独立任务',''),...db.docs.filter(d=>d.project===project&&d.type==='任务').map(d=>new Option(d.title,d.id)));
 }dialog.querySelector('[role=alert]').textContent='';dialog.showModal()};
 form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('.primary');submit.disabled=true;
 try{const data=Object.fromEntries(new FormData(form));const r=await request(endpoint,{...data,project,source:current?.project?current.id:''});db=await(await request('/api')).json();dialog.close();
 if(endpoint==='/task')go(project,(await r.json()).id);else go(project,'',project+'/需求记录.md');
 }catch(err){dialog.querySelector('[role=alert]').textContent=err.message}finally{submit.disabled=false}}
}
const composer=$('#composer'), promptBox=composer.querySelector('textarea');
const unsent=new Map();
let chatKey='';
function sessionBook(){
 const stored=chatKey&&JSON.parse(localStorage.getItem(chatKey));
 if(stored?.sessions)return stored;
 if(stored?.entries)return {selected:stored.id,sessions:[stored]};
 return {selected:null,sessions:[]};
}
function activeSession(){
 if(!chatKey)return null;
 const book=sessionBook();return book.sessions.find(s=>s.id===book.selected);
}
function writeBook(book){
 try{localStorage.setItem(chatKey,JSON.stringify(book));renderAssistant();return true}
 catch{message('会话保存失败，请检查浏览器存储');return false}
}
function newDiscussion(){
 const topic=window.prompt('本次讨论的主题',current.title);
 if(!topic?.trim())return;
 const book=sessionBook(),session={id:crypto.randomUUID(),topic:topic.trim().slice(0,160),document:current.id,entries:[]};
 book.sessions.push(session);book.selected=session.id;writeBook(book);
}
function renderAssistant(){
 const key=current?'project-board:document-chat:'+JSON.stringify(task&&current.id!==task.id?[project,current.id,task.id]:[project,current.id]):'';
 if(key!==chatKey){
  unsent.set(chatKey,promptBox.value);
  chatKey=key;promptBox.value=unsent.get(key)||'';
 }
 $('#chatRole').textContent=current?.id.toLowerCase()===(project+'/README.md').toLowerCase()?'项目主对话':current?.type==='任务'?'任务主对话':'文档对话';
 const log=$('#chatLog');log.replaceChildren();
 for(const card of document.querySelectorAll('[data-flow]'))card.disabled=!current;
 try{
  const book=sessionBook(),session=activeSession(),bar=$('#threadBar');bar.replaceChildren();
  if(book.sessions.length){
   const select=el('select','');select.setAttribute('aria-label','历次讨论');
   for(const s of book.sessions)select.add(new Option((s.topic||'此前讨论')+(s.closed?' · 已结束':''),s.id,false,s.id===book.selected));
   select.onchange=()=>{book.selected=select.value;writeBook(book)};
   bar.append(select,button('另开讨论',newDiscussion));
   if(session&&!session.closed)bar.append(button('结束本次讨论',()=>{const item=book.sessions.find(s=>s.id===session.id);item.closed=true;writeBook(book)}));
  }
  composer.hidden=!session||session.closed;$('#startChat').hidden=!!session||!current;
  for(const entry of session?.entries||[]){
   const line=el('p',entry.text);line.className='bubble';
   if(entry.kind==='material'){line.replaceChildren(button('资料 · '+entry.text.split('/').pop(),()=>go(project,task?.id||'',entry.text,'任务')))}
   if(entry.quote)line.append(el('blockquote',entry.quote));
   if(entry.kind==='message'&&task&&current?.id.endsWith('.md')&&entry.text.length<=4000)line.append(button('确认成里程碑',()=>beginMilestone(task,current,entry.text,true)));
   log.append(line);
  }
  log.scrollTop=log.scrollHeight;
 }catch{message('会话读取失败，请检查浏览器存储')}
}
function selectedQuote(){
 const selection=getSelection(),pre=$('#content pre');
 if(!pre||!selection?.rangeCount||!pre.contains(selection.getRangeAt(0).commonAncestorContainer))return '';
 return selection.toString().trim();
}
function recordEntry(text,kind,quote=''){
 if(!chatKey)return false;
 try{
  const book=sessionBook();let session=book.sessions.find(s=>s.id===book.selected);
  if(session?.closed){message('本次讨论已结束，请另开讨论');return false}
  if(!session){session={id:crypto.randomUUID(),topic:current.title,document:current.id,entries:[]};book.sessions.push(session);book.selected=session.id}
  if(text)session.entries.push({kind,text,quote,task:task?.id||null,time:new Date().toISOString()});
  return writeBook(book);
 }catch{message('会话保存失败，请检查浏览器存储');return false}
}
const activate=$('#startChat');
activate.onmousedown=e=>e.preventDefault();
activate.onclick=()=>{
 const quote=selectedQuote();
 if(recordEntry(quote?'讨论选中片段':'','discussion',quote))promptBox.focus();
};
for(const card of document.querySelectorAll('[data-flow]')){
 card.onmousedown=e=>e.preventDefault();
 card.onclick=()=>{
  const quote=selectedQuote();
  if(!recordEntry(card.textContent,card.dataset.flow,quote))return;
  if(card.dataset.flow==='milestone'&&current.project&&current.id.endsWith('.md'))beginMilestone(task,current,quote);
  else if(card.dataset.flow==='task'){$('#newTask').click();$('#taskDialog form').elements.context.value='来源：[['+current.id.replace(/\.md$/,'')+']]'+(quote?'\n'+quote:'')}else promptBox.focus();
 };
}
composer.onsubmit=e=>{
 e.preventDefault();const text=promptBox.value.trim();
 if(text&&recordEntry(text,'message'))promptBox.value='';
};
function toggleChat(open){
 $('#assistant').classList.toggle('open',open);
 $('#chatToggle').setAttribute('aria-expanded',String(open));
 if(open)promptBox.focus();else $('#chatToggle').focus();
}
$('#chatToggle').onclick=()=>toggleChat(!$('#assistant').classList.contains('open'));
$('#closeChat').onclick=()=>toggleChat(false);
const materialDialog=$('#materialDialog'),materialForm=materialDialog.querySelector('form');
function openMaterial(){
 materialForm.reset();
 const pick=materialForm.elements.existing;
 pick.replaceChildren(new Option('选择已有资料，或导入新资料',''),...db.docs.filter(d=>d.id.startsWith(project+'/信息层/raw/')).map(d=>new Option(d.title,d.id)));
 materialForm.querySelector('[role=alert]').textContent='';materialDialog.showModal();
}
materialForm.onsubmit=async event=>{
 event.preventDefault();
 const f=materialForm.elements,upload=f.upload.files[0],url=f.url.value.trim(),id=f.existing.value;
 const submit=materialForm.querySelector('.primary'),owner=task,contextKey=chatKey;
 const error=materialForm.querySelector('[role=alert]');submit.disabled=true;
 try{
  if(!owner)throw Error('请选择任务');
  if(id&&(upload||url))throw Error('已有资料和新资料请选择一种');
  if(!id&&!upload&&!url)throw Error('请选择资料或填写链接');
  if(f.usage.value==='chat'&&activeSession()?.closed)throw Error('当前讨论已结束，请先另开讨论');
  const data={project,source:owner.id,id,url};
  if(upload){
   if(upload.size>22*1024*1024||!upload.size)throw Error('请选择 22 MB 以内的非空文件');
   const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('文件读取失败'));reader.readAsDataURL(upload)});
   Object.assign(data,{name:upload.name,file:encoded});
  }
  const result=await(await request('/task-material',data)).json();
  let note='资料已加入任务';
  if(f.usage.value==='chat'){
   const saved=contextKey===chatKey&&recordEntry(result.id,'material');
   note=saved?'已入库，并在当前讨论中引用':'资料已入库；会话引用尚未保存';
  }
  materialDialog.close();await reload();message(note);
 }catch(e){error.textContent=e.message}finally{submit.disabled=false}
};
const rawDialog=$('#rawDialog'),rawForm=rawDialog.querySelector('form');
let rawProject='',importing=false;
function openRawDialog(){
 if(importing&&rawProject!==project)return message('另一项目的链接正在转译，请稍后再试');
 if(rawProject!==project){rawForm.reset();$('#rawResults').replaceChildren()}
 rawProject=project;rawDialog.showModal();
}
rawForm.onsubmit=async event=>{
 event.preventDefault();if(importing)return;
 const urls=new Set(),field=rawForm.elements.urls,results=$('#rawResults');
 results.replaceChildren();
 for(const value of field.value.trim().split(/\s+/)){
  try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();urls.add(u.href)}
  catch{results.textContent='请检查链接：'+value;return}
 }
 const submit=rawForm.querySelector('.primary');
 importing=true;field.disabled=true;submit.disabled=true;
 try{
  const rows=[...urls].map(url=>{const row=el('p',url+' · 等待中');results.append(row);return {url,row}});
  for(const {url,row} of rows){
   row.textContent=url+' · DSH 正在转译';
   try{const r=await(await request('/raw-import',{project:rawProject,url})).json();row.textContent=(r.existing?'已在 Raw · ':'已加入 Raw · ')+r.title}
   catch(err){row.textContent=url+' · '+err.message}
  }
  await reload();
 }finally{importing=false;field.disabled=false;submit.disabled=false}
};
window.onhashchange=()=>render().catch(e=>message(e.message));reload();
