const __arcpunkCore=(()=>{const module={exports:{}};
'use strict';

const FIELD_KEYS = { category: '分类', registered: '登记时间', planned: '计划结束时间' };
const TASK = /^- \[([^\]])\] (.*)$/;
const FIELD = /^(?: {4}|\t)(分类|登记时间|计划结束时间):[ \t]*(.*)$/;
const ACTION_SUFFIX = /\s+(?:✅|🗑️?)\s+\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?\s*$/u;
const PROGRESS_HEADER = /^(?: {4}|\t)> \[!todo-progress\][+-]? (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · (.+)$/;
const QUOTED_LINE = /^(?: {4}|\t)>(?: |$)/;
const trimBlankLines = text => text.replace(/^(?:[ \t]*\n)+/,'').replace(/(?:\n[ \t]*)+$/,'');

function lineRecords(text) {
  const result = [];
  const re = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  for (let m; (m = re.exec(text)) && m[0];) result.push({ text:m[1], start:m.index, end:m.index+m[0].length });
  return result;
}

function validDate(value) {
  if (value === '') return true;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(value);
  if (!m) return false;
  const [year,month,day] = m.slice(1,4).map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  if (day > new Date(Date.UTC(year,month,0)).getUTCDate()) return false;
  return m[4] === undefined || (Number(m[4]) < 24 && Number(m[5]) < 60);
}

function nowLocal() {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Shanghai', year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

function parseTasks(text) {
  const lines=lineRecords(text), tasks=[];
  let fence=null, inFrontmatter=lines[0]?.text==='---';
  for(let i=0;i<lines.length;i++) {
    const line=lines[i].text;
    if(inFrontmatter) { if(i>0 && line==='---') inFrontmatter=false; continue; }
    const fm=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if(fm) { if(!fence) fence={char:fm[1][0],length:fm[1].length}; else if(fence.char===fm[1][0]&&fm[1].length>=fence.length&&fm[2].trim()==='') fence=null; continue; }
    if(fence) continue;
    const match=TASK.exec(line);
    if(!match) continue;
    let j=i+1;
    while(j<lines.length && (lines[j].text.trim()==='' || /^[ \t]/.test(lines[j].text))) j++;
    const start=lines[i].start,end=j<lines.length?lines[j].start:text.length;
    const key=match[2].replace(ACTION_SUFFIX,'').trimEnd();
    const fields={category:'',registered:'',planned:''}, seen=new Set();
    const inverse=Object.fromEntries(Object.entries(FIELD_KEYS).map(([k,v])=>[v,k]));
    const detailLines=[],progress=[];
    for(let k=i+1;k<j;k++) {
      const progressHeader=PROGRESS_HEADER.exec(lines[k].text);
      if(progressHeader && validDate(progressHeader[1])) {
        const body=[];
        let p=k+1;
        while(p<j && QUOTED_LINE.test(lines[p].text) && !PROGRESS_HEADER.test(lines[p].text)) {
          body.push(lines[p].text.replace(/^(?: {4}|\t)> ?/,''));p++;
        }
        progress.push({recordedAt:progressHeader[1],author:progressHeader[2],body:trimBlankLines(body.join('\n'))});
        k=p-1;
        continue;
      }
      const field=FIELD.exec(lines[k].text);
      if(field) {
        if(seen.has(field[1])) throw Error(`“${key}”中${field[1]}重复，请先核实原记录`);
        seen.add(field[1]); fields[inverse[field[1]]]=field[2].trim();
      } else {
        const unindented=lines[k].text.replace(/^(?: {4}|\t)/,'').replace(/^> ?/,'');
        if(!/^\[![^\]]+\][+-]?(?:\s|$)/.test(unindented)) detailLines.push(unindented);
      }
    }
    tasks.push({key,title:key.replace(/<!--.*?-->/g,'').trim(),state:match[1].toLowerCase(),...fields,
      details:detailLines.join('\n').trim(),progress,block:text.slice(start,end),start,end});
    i=j-1;
  }
  return tasks;
}

function locate(text,key,expectedBlock) {
  const found=parseTasks(text).filter(t=>t.key===key);
  if(found.length!==1) throw Error(found.length?'同名待办不唯一，已停止写入，请核对来源':'待办已变更或移出，请刷新后重试');
  if(typeof expectedBlock==='string' && found[0].block!==expectedBlock) throw Error('这条待办刚被修改，已保留新内容，请刷新后重试');
  return found[0];
}

function mutateTask(text,key,patch,expectedBlock) {
  const task=locate(text,key,expectedBlock);
  const lines=lineRecords(task.block),edits=[],newFields=[];
  const first=lines[0];
  const originalEol=task.block.slice(first.text.length,first.end);
  const newline=originalEol||'\n';
  const unknown=Object.keys(patch).filter(k=>!['state',...Object.keys(FIELD_KEYS)].includes(k));
  if(unknown.length) throw Error('不支持的待办字段：'+unknown.join('、'));
  if(Object.hasOwn(patch,'state')) {
    if(![' ','x','-'].includes(patch.state)) throw Error('完成用x，舍弃用-，恢复活动用空格');
    if(patch.state!==task.state) {
      let suffix='';
      if(patch.state==='x') suffix=' ✅ '+nowLocal();
      if(patch.state==='-') suffix=' 🗑 '+nowLocal();
      edits.push({start:0,end:first.text.length,value:`- [${patch.state}] ${task.key}${suffix}`});
    }
  }
  for(const [property,label] of Object.entries(FIELD_KEYS)) {
    if(!Object.hasOwn(patch,property)) continue;
    if(typeof patch[property]!=='string' || /[\r\n\0]/.test(patch[property])) throw Error(label+'须为单行文本');
    const value=patch[property].trim();
    if(property!=='category'&&!validDate(value)) throw Error(label+'请填 YYYY-MM-DD 或 YYYY-MM-DD HH:mm，未知可留空');
    const found=lines.find(line=>FIELD.exec(line.text)?.[1]===label);
    if(found) edits.push({start:found.start,end:found.start+found.text.length,value:'    '+label+': '+value});
    else newFields.push('    '+label+': '+value);
  }
  if(newFields.length) edits.push({start:first.end,end:first.end,value:(originalEol?'':newline)+newFields.join(newline)+newline});
  let after=task.block;
  for(const edit of edits.sort((a,b)=>b.start-a.start)) after=after.slice(0,edit.start)+edit.value+after.slice(edit.end);
  return {text:text.slice(0,task.start)+after+text.slice(task.end),task,before:task.block,after};
}

function restoreTask(text,key,expectedAfter,before) {
  const task=locate(text,key,expectedAfter);
  return text.slice(0,task.start)+before+text.slice(task.end);
}

function appendProgress(text,key,entry,expectedBlock) {
  const task=locate(text,key);
  if(typeof expectedBlock==='string' && task.block!==expectedBlock) {
    const expected=parseTasks(expectedBlock)[0];
    const sameBase=expected && ['key','state','category','registered','planned','details'].every(k=>task[k]===expected[k]);
    const oldRecordsRemain=expected && task.progress.length>=expected.progress.length && expected.progress.every((p,i)=>JSON.stringify(p)===JSON.stringify(task.progress[i]));
    // Another writer may have appended progress; keep it and append atomically.
    // Changes to the task itself or existing records still require a fresh review.
    if(!sameBase || !oldRecordsRemain) throw Error('这条待办或原有进度刚被修改，已保留新内容，请核对后重试');
  }
  if(!entry || typeof entry.content!=='string' || !entry.content.trim()) throw Error('请填写进度内容');
  if(typeof entry.author!=='string' || !entry.author.trim() || /[\r\n\0]/.test(entry.author)) throw Error('记录者须为非空单行文本');
  if(entry.source!==undefined && typeof entry.source!=='string') throw Error('来源须为文本');
  if(/\0/.test(entry.content+(entry.source||''))) throw Error('进度不能包含空字符');
  const recordedAt=nowLocal(),author=entry.author.trim();
  const newline=task.block.slice(lineRecords(task.block)[0].text.length,lineRecords(task.block)[0].end)||'\n';
  // Escape a pasted entry header so it remains body text, rather than a forged record.
  const bodyLines=trimBlankLines(entry.content.replace(/\r\n|\r/g,'\n')).split('\n');
  const source=(entry.source||'').trim();
  if(source) bodyLines.push('','**来源**：'+source.replace(/\r\n|\r/g,'\n'));
  const body=bodyLines.join('\n').split('\n').map(line=>line.replace(/^\[!todo-progress\]/,'\\[!todo-progress]')).join('\n');
  const record=[`    > [!todo-progress]- ${recordedAt} · ${author}`,...body.split('\n').map(line=>'    >'+(line?' '+line:''))].join(newline);
  const trailing=task.block.match(/(?:\r\n|\n|\r)(?:[ \t]*(?:\r\n|\n|\r))*[ \t]*$/)?.[0]||'';
  const cut=task.block.length-trailing.length;
  const inserted=newline+newline+record;
  const after=task.block.slice(0,cut)+inserted+task.block.slice(cut);
  const result=text.slice(0,task.start)+after+text.slice(task.end);
  return {text:result,task,before:task.block,after,progress:{recordedAt,author,body}};
}

function purposeFromDetails(details) {
  const lines=details.split('\n');
  const at=lines.findIndex(line=>/^\*\*(?:原事项|干嘛用的)\*\*[：:]/.test(line));
  if(at<0)return '';
  const value=[lines[at].replace(/^\*\*(?:原事项|干嘛用的)\*\*[：:][ \t]*/,'')];
  for(let i=at+1;i<lines.length;i++){if(/^\*\*[^*]+\*\*[：:]/.test(lines[i]))break;value.push(lines[i]);}
  return value.join('\n').trim();
}

function parseArchiveRecords(text) {
  const lines=lineRecords(text),records=[];
  // Existing heading-based entries are read without rewriting their titles or bodies.
  let fence=null,inFrontmatter=lines[0]?.text==='---';
  for(let i=0;i<lines.length;i++) {
    const line=lines[i].text;
    if(inFrontmatter){if(i>0&&line==='---')inFrontmatter=false;continue;}
    const fm=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if(fm){if(!fence)fence={char:fm[1][0],length:fm[1].length};else if(fence.char===fm[1][0]&&fm[1].length>=fence.length&&fm[2].trim()==='')fence=null;continue;}
    if(fence)continue;
    const heading=/^### (.+)$/.exec(line);
    if(!heading)continue;
    let j=i+1,bodyFence=null;
    while(j<lines.length) {
      const nested=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[j].text);
      if(nested){if(!bodyFence)bodyFence={char:nested[1][0],length:nested[1].length};else if(bodyFence.char===nested[1][0]&&nested[1].length>=bodyFence.length&&nested[2].trim()==='')bodyFence=null;j++;continue;}
      if(!bodyFence&&(/^#{1,3} /.test(lines[j].text)||TASK.test(lines[j].text)))break;
      j++;
    }
    const values={};
    for(let k=i+1;k<j;k++) {
      const field=/^- \*\*([^*]+)\*\*[：:][ \t]*(.*)$/.exec(lines[k].text);
      if(!field)continue;
      const body=[field[2]];
      let p=k+1;
      while(p<j&&!/^- \*\*[^*]+\*\*[：:]/.test(lines[p].text)&&lines[p].text!=='---'){body.push(lines[p].text);p++;}
      values[field[1]]=body.join('\n').trim();k=p-1;
    }
    if(!Object.hasOwn(values,'完成')&&!Object.hasOwn(values,'办结'))continue;
    const completion=values['完成']||values['办结']||'';
    const time=/^(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?)/.exec(completion);
    const completedAt=time&&validDate(time[1])?time[1].replace('T',' '):'';
    const parts=(values['分类']||'').split(/\s+[｜|]\s+/);
    const category=parts[0]||'';
    const registered=parts.find(p=>/^登记\s/.test(p))?.replace(/^登记\s+/,'')||values['登记时间']||'';
    const planned=parts.find(p=>/^计划\s/.test(p))?.replace(/^计划\s+/,'')||values['计划结束时间']||'';
    const start=lines[i].start,end=j<lines.length?lines[j].start:text.length;
    const rawBody=text.slice(lines[i].end,end);
    const display=parseTasks('- [x] archive-entry\n'+rawBody.split(/\r\n|\r|\n/).map(line=>line&&!/^[ \t]/.test(line)?'    '+line:line).join('\n')).at(0);
    const progress=display?.progress||[];
    records.push({key:heading[1],title:heading[1],state:'x',category,registered,planned,completedAt,
      completionNote:completion,purpose:values['原事项']||values['干嘛用的']||'',
      details:display?.details||rawBody.trim(),progress,heading:heading[1],format:'heading',block:text.slice(start,end),start,end});
    i=j-1;
  }
  // New archives may contain the whole original native task block, including progress.
  for(const task of parseTasks(text)) {
    if(records.some(r=>task.start>=r.start&&task.start<r.end))continue;
    const marker=/\s+✅\s+(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?)\s*$/.exec(task.block.split(/\r\n|\r|\n/)[0]);
    const field=/^(?: {4}|\t)(?:办结时间|完成时间):[ \t]*(.*)$/m.exec(task.block);
    const value=field?.[1]?.trim()||marker?.[1]||'';
    records.push({...task,completedAt:validDate(value)?value.replace('T',' '):'',completionNote:value,
      purpose:purposeFromDetails(task.details),heading:'',format:'task'});
  }
  return records.sort((a,b)=>a.start-b.start);
}

module.exports={parseTasks,mutateTask,restoreTask,appendProgress,validDate,nowLocal,parseArchiveRecords};

return module.exports;})();
const __arcpunkZones=(()=>{const module={exports:{}};
'use strict';
const {nowLocal,validDate}=__arcpunkCore;
const ZONES=['01_灵感区','02_信息块'];
const BOARD_PATHS=new Set(ZONES.flatMap(z=>[`${z}/${z}看板.md`,`${z}/${z}看板-归档.md`]));
function lines(text){const result=[];for(const m of text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)){if(!m[0])continue;result.push({text:m[1],start:m.index,end:m.index+m[0].length});}return result;}
function splitCells(line){
 const pipes=[];let ticks=0;
 for(let i=0;i<line.length;i++){
  if(line[i]==='`'){let n=1;while(line[i+n]==='`')n++;ticks=ticks===n?0:(ticks||n);i+=n-1;continue;}
  if(line[i]!=='|'||ticks)continue;let b=0;for(let j=i-1;j>=0&&line[j]==='\\';j--)b++;if(b%2===0)pipes.push(i);
 }
 if(pipes.length<2||line.slice(0,pipes[0]).trim()||line.slice(pipes.at(-1)+1).trim())return null;
 return pipes.slice(0,-1).map((p,i)=>({start:p+1,end:pipes[i+1],raw:line.slice(p+1,pipes[i+1]),value:line.slice(p+1,pipes[i+1]).trim().replace(/\\\|/g,'|')}));
}
const aliases={selection:['是否选为题','选题'],recognition:['是不是我的认知'],time:['时间','收录日期'],title:['点子','观点／方法','观点/方法','信息块','事项','标题'],description:['触发内容','简短说明','内容提示','事实／进展','事实/进展'],feedback:['我的设想','我的理解／疑问','我的理解/疑问','我的兴趣点','我的补充／待核对','我的补充/待核对'],source:['来源'],destination:['归档记录／去向','归档记录/去向']};
function indexFor(headers,key,fallback){const i=headers.findIndex(v=>aliases[key].includes(v));return i>=0?i:fallback;}
function firstWiki(value){const m=/\[\[([^\]]+)\]\]/.exec(value);if(!m)return null;const target=m[1].split('|')[0],at=target.indexOf('#');return {path:at>=0?target.slice(0,at):target,fragment:at>=0?target.slice(at+1):''};}
function parseBoards(text,path=''){
 const all=lines(text),tables=[];let category='',fence=null,front=all[0]?.text==='---';
 for(let i=0;i<all.length;i++){
  const s=all[i].text;if(front){if(i>0&&s==='---')front=false;continue;}
  const fm=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(s);if(fm){if(!fence)fence={c:fm[1][0],n:fm[1].length};else if(fence.c===fm[1][0]&&fm[1].length>=fence.n&&!fm[2].trim())fence=null;continue;}if(fence)continue;
  const head=/^#{2,3} (.+)$/.exec(s);if(head)category=head[1];
  const headerCells=splitCells(s),separator=i+1<all.length?splitCells(all[i+1].text):null;
  if(!headerCells||!separator||!separator.every(c=>/^:?-{3,}:?$/.test(c.value)))continue;
  const headers=headerCells.map(c=>c.value);
  if(headers.length<7||separator.length!==headers.length)continue;
  const current=headers.includes('是否选为题')&&headers.includes('是不是我的认知');
  const legacy=headers.includes('选题')&&headers.includes('是否沉淀');
  if(!current&&!legacy)continue;
  const ix=Object.fromEntries(Object.keys(aliases).map(key=>[key,indexFor(headers,key,-1)]));
  if(Object.keys(aliases).some(key=>{
   const matches=headers.filter(header=>aliases[key].includes(header)).length;
   if(key==='destination'||(key==='recognition'&&legacy&&!current))return matches>1;
   if(['selection','recognition','source'].includes(key))return matches!==1;
   return !matches;
  }))continue;
  const archived=ix.destination>=0||path.endsWith('看板-归档.md');
  const rows=[];let j=i+2;
  while(j<all.length){const cells=splitCells(all[j].text);if(!cells)break;if(cells.length!==headers.length){rows.length=0;break;}
   const row={category,headers,cells:cells.map(c=>c.value),raw:all[j].text,start:all[j].start,end:all[j].start+all[j].text.length,cellRanges:cells,indices:ix};
   for(const key of Object.keys(aliases))row[key]=ix[key]>=0?cells[ix[key]]?.value||'':'';
   row.key=JSON.stringify([category,row.title,row.source]);row.link=firstWiki(row.title);rows.push(row);j++;
  }
  // Invalid row geometry is left to native Markdown instead of guessing columns.
  if(j<all.length&&splitCells(all[j].text)&&!rows.length)continue;
  const start=all[i].start,end=j<all.length?all[j].start:text.length;
  tables.push({key:JSON.stringify([category,headers]),start,end,lineStart:i,lineEnd:j-1,category,headers,archived,rows});i=j-1;
 }
 return tables;
}
function setChoice(text,key,field,value,expectedRaw){
 if(!['selection','recognition'].includes(field))throw Error('仅可修改选题或认知判断');
 if(!['','是','否'].includes(value))throw Error('请选择空白、是或否');
 const found=parseBoards(text).flatMap(t=>t.rows.map(r=>({...r,archived:t.archived}))).filter(r=>r.key===key);
 if(found.length!==1||found[0].archived)throw Error('条目已变更、归档或不唯一，请刷新核对');const row=found[0];
 if(typeof expectedRaw==='string'&&expectedRaw!==row.raw)throw Error('此行刚被修改，请刷新后重试');
 const cell=row.cellRanges[row.indices[field]];if(!cell||row.headers[row.indices.selection]!=='是否选为题')throw Error('旧版表头，请先迁移后再编辑');
 if(cell.value===value)return {text,before:row.raw,after:row.raw};
 const leading=/^\s*/.exec(cell.raw)[0],trailing=/\s*$/.exec(cell.raw.slice(leading.length))[0];
 const after=row.raw.slice(0,cell.start)+leading+value+trailing+row.raw.slice(cell.end);
 return {text:text.slice(0,row.start)+after+text.slice(row.end),before:row.raw,after};
}
const DISC=/^> \[!zone-discussion\][+-]? (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · (.+)$/;
function separateDiscussion(raw){
 const ls=lines(raw),body=[],discussion=[];let fence=null;
 for(let i=0;i<ls.length;i++){const s=ls[i].text,quote=/^> ?/.test(s),candidate=quote?s.replace(/^> ?/,''):s,fm=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(candidate);if(fm){if(!fence)fence={c:fm[1][0],n:fm[1].length,quote};else if(fence.quote===quote&&fence.c===fm[1][0]&&fm[1].length>=fence.n&&!fm[2].trim())fence=null;body.push(s);continue;}
  const h=!fence&&DISC.exec(s);if(!h||!validDate(h[1])){body.push(s);continue;}
  const content=[];let j=i+1;while(j<ls.length&&/^>(?: |$)/.test(ls[j].text)&&!DISC.test(ls[j].text)){content.push(ls[j].text.replace(/^> ?/,''));j++;}
  discussion.push({recordedAt:h[1],author:h[2],body:content.join('\n').replace(/(?:\n[ \t]*)+$/,'')});i=j-1;
 }
 return {body:body.join('\n').trim(),discussion,unclosedFence:!!fence};
}
function extractBlock(text,fragment){
 const ls=lines(text);if(!fragment){const noFront=text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'');return {heading:'',...separateDiscussion(noFront),raw:text,start:0,end:text.length};}
 const f=fragment.normalize('NFC'),found=[];let fence=null,front=ls[0]?.text==='---';
 for(let i=0;i<ls.length;i++){const s=ls[i].text;if(front){if(i>0&&s==='---')front=false;continue;}const fm=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(s);if(fm){if(!fence)fence={c:fm[1][0],n:fm[1].length};else if(fence.c===fm[1][0]&&fm[1].length>=fence.n&&!fm[2].trim())fence=null;continue;}if(fence)continue;const h=/^(#{1,6}) (.+)$/.exec(s);if(h&&h[2].normalize('NFC')===f)found.push({i,level:h[1].length,heading:h[2]});}
 if(found.length!==1)throw Error('标题定位缺失或不唯一，请点原标题核对');
 const h=found[0];let j=h.i+1,innerFence=null;
 for(;j<ls.length;j++){const fm=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(ls[j].text);if(fm){if(!innerFence)innerFence={c:fm[1][0],n:fm[1].length};else if(innerFence.c===fm[1][0]&&fm[1].length>=innerFence.n&&!fm[2].trim())innerFence=null;continue;}if(innerFence)continue;const next=/^(#{1,6}) /.exec(ls[j].text);if(next&&next[1].length<=h.level)break;}
 const start=ls[h.i].start,end=j<ls.length?ls[j].start:text.length,raw=text.slice(start,end),content=text.slice(ls[h.i].end,end);
 return {heading:h.heading,...separateDiscussion(content),raw,start,end};
}
function appendDiscussion(text,fragment,entry,expectedRaw){
 if(!fragment)throw Error('缺少具体信息块标题，不能向整页猜写讨论');const block=extractBlock(text,fragment);
 if(block.unclosedFence)throw Error('原信息块有未闭合代码围栏，请先打开原文核对');
 if(expectedRaw&&expectedRaw!==block.raw){const expected=extractBlock(expectedRaw,fragment);if(expected.body!==block.body||expected.heading!==block.heading||expected.discussion.length>block.discussion.length||!expected.discussion.every((r,i)=>JSON.stringify(r)===JSON.stringify(block.discussion[i])))throw Error('原信息块或旧讨论刚被修改，请核对后重试');}
 if(!entry||typeof entry.content!=='string'||!entry.content.trim())throw Error('请填写讨论内容');if(typeof entry.author!=='string'||!entry.author.trim()||/[\r\n\0]/.test(entry.author))throw Error('记录者须为非空单行文本');if(entry.source!==undefined&&typeof entry.source!=='string')throw Error('来源须为文本');if(/\0/.test(entry.content+(entry.source||'')))throw Error('讨论不能包含空字符');
 const now=nowLocal(),author=entry.author.trim(),first=lines(block.raw)[0],nl=block.raw.slice(first.text.length,first.end)||'\n';
 let body=entry.content.replace(/\r\n|\r/g,'\n').replace(/^(?:[ \t]*\n)+/,'').replace(/(?:\n[ \t]*)+$/,'');if(entry.source?.trim())body+='\n\n**来源**：'+entry.source.trim().replace(/\r\n|\r/g,'\n');body=body.split('\n').map(s=>s.replace(/^\[!zone-discussion\]/,'\\[!zone-discussion]')).join('\n');
 const record=[`> [!zone-discussion]- ${now} · ${author}`,...body.split('\n').map(s=>'>'+(s?' '+s:''))].join(nl);
 const trailing=block.raw.match(/(?:\r\n|\n|\r)(?:[ \t]*(?:\r\n|\n|\r))*[ \t]*$/)?.[0]||'',at=block.raw.length-trailing.length;
 const after=block.raw.slice(0,at)+nl+nl+record+block.raw.slice(at);
 return {text:text.slice(0,block.start)+after+text.slice(block.end),before:block.raw,after};
}
module.exports={ZONES,BOARD_PATHS,parseBoards,setChoice,extractBlock,appendDiscussion,lines,splitCells,firstWiki};

return module.exports;})();
const __arcpunkLight = (() => {
  'use strict';
  const { lines, splitCells, firstWiki } = __arcpunkZones;
  const HEADERS = {
    intake: ['材料与原文入口', '内容提示', '我的看法', '本轮处理', '待反刍', '灵感', '兴趣', '信息块', '待办'],
    interest: ['日期', '兴趣点', '我的看法', '来源', '已有加工'],
    rumination: ['日期', '资料与原文入口', '待反刍范围', '我的看法', '已有加工', '继续反刍'],
  };
  const PROCESS_OPTIONS = ['', '舍弃', '仅归档原文', '提取一条', '提取多条'];
  function annotationFields(kind) {
    return kind === 'intake' ? ['我的看法', '灵感', '兴趣', '信息块', '待办']
      : ['interest', 'rumination'].includes(kind) ? ['我的看法'] : [];
  }
  function encodeAnnotation(content) {
    // Only encode the new fragment. Existing owner text and Markdown stay byte-for-byte intact.
    // Protect table geometry and keep literal HTML, backslashes and code delimiters reversible.
    return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\\/g, '&#92;').replace(/`/g, '&#96;').replace(/\|/g, '\\|')
      .replace(/\r/g, '&#13;').replace(/\n/g, '<br>');
  }
  function decodeAnnotation(content) {
    return content.replace(/<br>/g, '\n').replace(/\\\|/g, '|')
      .replace(/&#13;/g, '\r').replace(/&#96;/g, '`').replace(/&#92;/g, '\\')
      .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  }
  function kindFor(path) {
    if (typeof path !== 'string') return '';
    if (/^00_缓存区\/\d{4}-\d{2}-\d{2}\/资料批注总表_\d{4}-\d{2}-\d{2}\.md$/.test(path)) {
      const dates = path.match(/\d{4}-\d{2}-\d{2}/g);
      return dates[0] === dates[1] ? 'intake' : '';
    }
    if (path === '03_兴趣区/03_兴趣区看板.md') return 'interest';
    if (path === '反刍清单.md') return 'rumination';
    return '';
  }
  function parseTables(text, path) {
    const kind = kindFor(path), tables = [];
    if (!kind) return tables;
    const all = lines(text);
    let heading = '', fence = null, front = all[0]?.text === '---', comment = false;
    for (let i = 0; i < all.length; i++) {
      const s = all[i].text;
      if (front) { if (i && s === '---') front = false; continue; }
      if (comment) {
        comment = !s.includes('-->');
        continue;
      }
      const fm = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(s);
      if (fm) {
        if (!fence) fence = { c: fm[1][0], n: fm[1].length };
        else if (fence.c === fm[1][0] && fm[1].length >= fence.n && !fm[2].trim()) fence = null;
        continue;
      }
      if (fence) continue;
      if (s.includes('<!--')) { comment = !s.includes('-->', s.indexOf('<!--')); continue; }
      const h = /^#{1,6} (.+)$/.exec(s);
      if (h) heading = h[1];
      const hc = splitCells(s), sep = all[i + 1] && splitCells(all[i + 1].text);
      if (!hc || !sep || hc.length !== sep.length || !sep.every(c => /^:?-{3,}:?$/.test(c.value))) continue;
      const headers = hc.map(c => c.value);
      if (!HEADERS[kind].every(key => headers.filter(v => v === key).length === 1)) continue;
      const rows = [];
      let j = i + 2, malformed = false;
      for (; j < all.length; j++) {
        const cells = splitCells(all[j].text);
        if (!cells) break;
        if (cells.length !== headers.length) { malformed = true; break; }
        const values = Object.fromEntries(headers.map((key, index) => [key, cells[index].value]));
        const identity = kind === 'intake' ? values['材料与原文入口'] : kind === 'interest' ? [values['兴趣点'], values['来源']] : values['资料与原文入口'];
        rows.push({ key: JSON.stringify([heading, identity]), raw: all[j].text,
          start: all[j].start, end: all[j].start + all[j].text.length,
          headers, cells: cells.map(c => c.value), ranges: cells, values });
      }
      if (malformed) { i = j; continue; }
      tables.push({ kind, key: JSON.stringify([kind, heading, headers]), heading, headers, rows,
        start: all[i].start, end: j < all.length ? all[j].start : text.length });
      i = j - 1;
    }
    return tables;
  }
  function setCell(text, path, tableKey, rowKey, field, value, expectedRaw) {
    const kind = kindFor(path);
    const values = kind === 'intake' && field === '本轮处理' ? PROCESS_OPTIONS
      : kind === 'intake' && field === '待反刍' ? ['', '是']
      : kind === 'rumination' && field === '继续反刍' ? ['', '是', '否'] : null;
    if (!values || !values.includes(value)) throw Error('此看板只允许修改对应选择字段');
    if (typeof expectedRaw !== 'string') throw Error('缺少原行版本，请刷新后重试');
    const tables = parseTables(text, path).filter(t => t.key === tableKey);
    if (tables.length !== 1) throw Error('原表已变化或不唯一，请刷新核对');
    const found = tables[0].rows.filter(row => row.key === rowKey);
    if (found.length !== 1 || found[0].raw !== expectedRaw) throw Error('此行刚被修改或已移走，请刷新后重试');
    const row = found[0];
    if (kind === 'intake') {
      if (field === '本轮处理' && value === '舍弃' && !['', '否'].includes(row.values['待反刍'])) throw Error('待反刍与舍弃不能同时选择；请先核对反刍意向');
      if (field === '待反刍' && value === '是' && row.values['本轮处理'] === '舍弃') throw Error('舍弃与待反刍不能同时选择；请先核对本轮处理');
    }
    const cell = row.ranges[row.headers.indexOf(field)];
    if (cell.value === value) return { text, before: row.raw, after: row.raw };
    const leading = cell.value ? /^\s*/.exec(cell.raw)[0] : cell.raw.slice(0, Math.ceil(cell.raw.length / 2));
    const trailing = cell.value ? /\s*$/.exec(cell.raw.slice(leading.length))[0] : cell.raw.slice(leading.length);
    const after = row.raw.slice(0, cell.start) + leading + value + trailing + row.raw.slice(cell.end);
    return { text: text.slice(0, row.start) + after + text.slice(row.end), before: row.raw, after };
  }
  function appendAnnotation(text, path, tableKey, rowKey, field, content, recordedAt, expectedRaw) {
    const kind = kindFor(path);
    if (!annotationFields(kind).includes(field)) throw Error('此看板只允许向本人批注栏追加');
    if (typeof content !== 'string' || !content.trim()) throw Error('请填写批注正文');
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(recordedAt) || !__arcpunkCore.validDate(recordedAt)) throw Error('写入时间无效');
    if (typeof expectedRaw !== 'string') throw Error('缺少原行版本，请刷新后重试');
    const tables = parseTables(text, path).filter(table => table.key === tableKey);
    if (tables.length !== 1) throw Error('原表已变化或不唯一，请刷新核对');
    const found = tables[0].rows.filter(row => row.key === rowKey);
    if (found.length !== 1 || found[0].raw !== expectedRaw) throw Error('此行刚被修改或已移走；输入已保留，请复制后刷新核对');
    const row = found[0], cell = row.ranges[row.headers.indexOf(field)];
    const encoded = encodeAnnotation(content);
    const appended = `${cell.value ? '<br><br>' : ''}${recordedAt} · 本人补充：${encoded}`;
    // Insert before the original trailing padding; never trim or replace earlier owner feedback.
    const padding = /\s*$/.exec(cell.raw)[0];
    const at = cell.end - padding.length;
    const after = row.raw.slice(0, at) + appended + row.raw.slice(at);
    return { text: text.slice(0, row.start) + after + text.slice(row.end), before: row.raw, after,
      appended, field, recordedAt };
  }
  return { HEADERS, PROCESS_OPTIONS, annotationFields, encodeAnnotation, decodeAnnotation,
    kindFor, parseTables, setCell, appendAnnotation, firstWiki };
})();

'use strict';

const { Plugin, MarkdownRenderChild, MarkdownRenderer, Component, Modal, Notice, TFile, MarkdownView, setIcon } = require('obsidian');
const core = __arcpunkCore;
const zones = __arcpunkZones;

const ALLOWED_PATHS = new Set(['待办事项.md', '待办交互核验_临时.md']);
const ARCHIVE_PATHS = new Set(['待办归档.md', '待办归档核验_临时.md']);
const MOUNT_CLASS = 'arcpunk-todo-ui';
const ZONE_DEBUG_LOG = 'E:\\worksapece\\DSH-BOT\\tmp\\zone-debug.log';
function zoneDebug() {
  const parts = [...arguments];
  try {
    if (require('fs').existsSync(ZONE_DEBUG_LOG) && require('fs').statSync(ZONE_DEBUG_LOG).size > 4 * 1024 * 1024) require('fs').writeFileSync(ZONE_DEBUG_LOG, '', 'utf8');
  } catch (_) { /* 日志维护失败不影响渲染 */ }
  try {
    const line = `[${new Date().toISOString()}] ` + parts.map((part) => {
      if (typeof part === 'string') return part;
      try { return JSON.stringify(part); } catch (_) { return String(part); }
    }).join(' ') + '\n';
    require('fs').appendFileSync(ZONE_DEBUG_LOG, line, 'utf8');
  } catch (_) { /* 写日志失败不影响渲染 */ }
}
const ZONE_PATHS = new Map(['01_灵感区', '02_信息块'].flatMap((dir) => [
  [`${dir}/${dir}看板.md`, { dir, archived: false }],
  [`${dir}/${dir}看板-归档.md`, { dir, archived: true }],
]));
ZONE_PATHS.set('01_灵感区/四区卡片核验_临时.md', { dir: '01_灵感区', archived: false, test: true });
ZONE_PATHS.set('01_灵感区/四区卡片核验_临时-归档.md', { dir: '01_灵感区', archived: true, test: true });
const ZONE_TEST_BODY = '01_灵感区/四区正文核验_临时.md';

function projectTodoPath(path, name) {
  if (typeof path !== 'string' || /[\\\x00-\x1f]/.test(path)) return false;
  const parts = path.split('/');
  return parts.length === 3 && parts[0] === 'staging' && !!parts[1]
    && !parts[1].startsWith('.') && parts[2] === name;
}

function allowed(path) {
  return typeof path === 'string' && (ALLOWED_PATHS.has(path) || projectTodoPath(path, '待办事项.md'));
}

function archiveAllowed(path) {
  return typeof path === 'string' && (ARCHIVE_PATHS.has(path) || projectTodoPath(path, '待办归档.md'));
}

function archiveSectionRange(markdown, info) {
  if (!info || !Number.isInteger(info.lineStart) || !Number.isInteger(info.lineEnd) || info.lineStart < 0 || info.lineEnd < info.lineStart) return null;
  const starts = [0];
  const newline = /\r\n|\r|\n/g;
  for (let match; (match = newline.exec(markdown));) starts.push(match.index + match[0].length);
  if (info.lineStart >= starts.length) return null;
  const start = starts[info.lineStart];
  const end = starts[info.lineEnd + 1] ?? markdown.length;
  if (typeof info.text === 'string') {
    const normalize = (text) => text.replace(/\r\n|\r/g, '\n').trim();
    const snapshot = normalize(info.text);
    // Host versions may supply either the full source or the current section text.
    if (snapshot !== normalize(markdown) && snapshot !== normalize(markdown.slice(start, end))) return null;
  }
  return { start, end };
}

function element(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(doc, text, className) {
  const el = element(doc, 'button', className, text);
  el.type = 'button';
  return el;
}

function errorText(error) {
  return error instanceof Error ? error.message : '操作未完成，请刷新后重试';
}

function zoneTableSource(table, contextPath) {
  const embed = table.closest('.markdown-embed');
  if (embed) {
    const sources = ['data-src', 'src'].map((name) => embed.getAttribute(name)).filter((value) => typeof value === 'string' && value.trim());
    if (sources.length) {
      const paths = sources.map((value) => {
        const target = value.trim().replace(/^!?\[\[([\s\S]*)\]\]$/, '$1').split('|')[0].split('#')[0];
        return target.endsWith('.md') ? target : `${target}.md`;
      });
      const path = paths[0];
      return paths.every((candidate) => candidate === path) && ZONE_PATHS.get(path)?.archived ? path : null;
    }
    // Without an explicit embed target, only the host's archive source context is safe.
    return ZONE_PATHS.get(contextPath)?.archived ? contextPath : null;
  }
  return ZONE_PATHS.has(contextPath) ? contextPath : null;
}

function zoneTableSignature(table) {
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const rows = [...table.querySelectorAll('tr')].filter((row) => row.closest('table') === table);
  return JSON.stringify(rows.map((row) => [...row.children].filter((cell) => cell.tagName === 'TH' || cell.tagName === 'TD').map((cell) => ({
    text: normalize(cell.textContent),
    links: [...cell.querySelectorAll('a')].map((link) => link.getAttribute('data-href') || link.getAttribute('href') || ''),
  }))));
}

async function matchReadonlyZoneTable(app, markdown, path, nativeTable, parsed) {
  // Embedded heading sections can use relative line offsets. Match their readonly
  // table by the host's own Markdown rendering: every cell and link target, in order.
  const expected = zoneTableSignature(nativeTable);
  const owner = new Component();
  owner.load();
  const matches = [];
  try {
    for (const table of parsed) {
      if (!table.archived || !table.rows.length) continue;
      const wrapper = element(nativeTable.ownerDocument, 'div', MOUNT_CLASS);
      const body = element(nativeTable.ownerDocument, 'div');
      wrapper.append(body);
      await MarkdownRenderer.render(app, markdown.slice(table.start, table.end), body, path, owner);
      const rendered = [...body.querySelectorAll('table')].filter((candidate) => !candidate.parentElement?.closest('table'));
      if (rendered.length === 1 && zoneTableSignature(rendered[0]) === expected) matches.push(table);
    }
  } finally { owner.unload(); }
  return matches.length === 1 ? matches : [];
}

// A date without a clock time expires at the end of that Shanghai calendar day.
// This computes a display label only; it never invents or writes a planned date.
function isOverdue(value, now = Date.now()) {
  if (!value || !core.validDate(value)) return false;
  const normalized = value.replace('T', ' ');
  const stamp = normalized.length === 10
    ? `${normalized}T23:59:59.999+08:00`
    : `${normalized.replace(' ', 'T')}:00+08:00`;
  const deadline = Date.parse(stamp);
  return Number.isFinite(deadline) && now > deadline;
}

class TaskMetadataModal extends Modal {
  constructor(plugin, path, task) {
    super(plugin.app);
    this.plugin = plugin;
    this.path = path;
    this.task = task;
  }

  onOpen() {
    this.modalEl.classList.add('arcpunk-todo-edit-modal');
    this.titleEl.textContent = '编辑待办';
    const doc = this.contentEl.ownerDocument;
    const form = element(doc, 'form', 'arcpunk-todo-edit-form');
    const inputs = {};
    this.contentEl.replaceChildren(element(doc, 'p', 'arcpunk-todo-edit-title', this.task.title), form);
    const fields = [
      ['category', '分类', '留空为未分类'],
      ['registered', '登记时间', 'YYYY-MM-DD 或 YYYY-MM-DD HH:mm'],
      ['planned', '计划结束时间', 'YYYY-MM-DD 或 YYYY-MM-DD HH:mm'],
    ];
    for (const [key, label, placeholder] of fields) {
      const row = element(doc, 'label', 'arcpunk-todo-edit-field');
      const input = element(doc, 'input');
      input.type = 'text';
      input.value = this.task[key] || '';
      input.placeholder = placeholder;
      input.autocomplete = 'off';
      row.append(element(doc, 'span', '', label), input);
      form.append(row);
      inputs[key] = input;
    }
    const error = element(doc, 'p', 'arcpunk-todo-edit-error');
    error.setAttribute('role', 'alert');
    const actions = element(doc, 'div', 'arcpunk-todo-edit-actions');
    const cancel = button(doc, '取消');
    const save = button(doc, '保存', 'mod-cta');
    save.type = 'submit';
    cancel.addEventListener('click', () => this.close());
    actions.append(cancel, save);
    form.append(error, actions);
    let saving = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (saving) return;
      saving = true;
      save.disabled = true;
      error.textContent = '';
      try {
        await this.plugin.updateTask(this.path, this.task, {
          category: inputs.category.value,
          registered: inputs.registered.value,
          planned: inputs.planned.value,
        });
        this.close();
      } catch (err) {
        error.textContent = errorText(err);
      } finally {
        saving = false;
        save.disabled = false;
      }
    });
    inputs.category.focus();
  }

  onClose() {
    this.contentEl.replaceChildren();
  }
}

class TaskProgressModal extends Modal {
  constructor(plugin, path, task) {
    super(plugin.app);
    this.plugin = plugin;
    this.path = path;
    this.task = task;
  }

  onOpen() {
    this.modalEl.classList.add('arcpunk-todo-edit-modal', 'arcpunk-todo-progress-modal');
    this.titleEl.textContent = '追加进度';
    const doc = this.contentEl.ownerDocument;
    const form = element(doc, 'form', 'arcpunk-todo-edit-form');
    this.contentEl.replaceChildren(element(doc, 'p', 'arcpunk-todo-edit-title', this.task.title), form);
    const field = (label, tag, placeholder, rows) => {
      const row = element(doc, 'label', 'arcpunk-todo-edit-field');
      const input = element(doc, tag);
      if (tag === 'input') input.type = 'text';
      if (rows) input.rows = rows;
      input.placeholder = placeholder;
      row.append(element(doc, 'span', '', label), input);
      form.append(row);
      return input;
    };
    const content = field('进度正文', 'textarea', '记录本次进展、结果或待核情况', 5);
    content.required = true;
    const author = field('记录者', 'input', '记录者');
    author.value = '本人';
    const source = field('来源（选填）', 'textarea', '可填写库内双链或补充出处', 2);
    const error = element(doc, 'p', 'arcpunk-todo-edit-error');
    error.setAttribute('role', 'alert');
    const actions = element(doc, 'div', 'arcpunk-todo-edit-actions');
    const cancel = button(doc, '取消');
    const save = button(doc, '保存进度', 'mod-cta');
    save.type = 'submit';
    cancel.addEventListener('click', () => this.close());
    actions.append(cancel, save);
    form.append(error, actions);
    let saving = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (saving) return;
      error.textContent = '';
      if (!content.value.trim()) {
        error.textContent = '请填写进度正文';
        content.focus();
        return;
      }
      saving = true;
      save.disabled = true;
      try {
        await this.plugin.appendProgress(this.path, this.task, {
          content: content.value,
          author: author.value,
          source: source.value,
        });
        this.close();
      } catch (err) {
        // Keep this modal and every entered field intact on validation or CAS failure.
        error.textContent = errorText(err);
      } finally {
        saving = false;
        save.disabled = false;
      }
    });
    content.focus();
  }

  onClose() {
    this.contentEl.replaceChildren();
  }
}

class ArchiveCheckboxGuard extends MarkdownRenderChild {
  constructor(list, plugin) {
    super(list);
    this.plugin = plugin;
    this.previous = new Map();
  }

  onload() {
    for (const input of this.containerEl.querySelectorAll('input[type="checkbox"]')) {
      this.previous.set(input, input.disabled);
      input.disabled = true;
    }
  }

  onunload() {
    for (const [input, disabled] of this.previous) input.disabled = disabled;
    this.previous.clear();
    delete this.containerEl.dataset.arcpunkTodoArchiveGuarded;
    this.plugin.archiveGuards.delete(this);
  }
}

class ArchiveRenderChild extends MarkdownRenderChild {
  constructor(slot, mount, sourceList, plugin, path, keys) {
    super(slot);
    this.mountEl = mount;
    this.sourceList = sourceList;
    this.plugin = plugin;
    this.path = path;
    this.keys = new Set(keys);
    this.revision = 0;
    this.disposed = false;
    this.timer = null;
    this.renderOwner = null;
    this.openDetails = new Set();
    this.openProgress = new Set();
  }

  onload() {
    this.registerEvent(this.plugin.app.vault.on('modify', (file) => {
      if (file.path === this.path) this.scheduleRefresh();
    }));
    this.registerEvent(this.plugin.app.vault.on('delete', (file) => {
      if (file.path === this.path) this.scheduleRefresh();
    }));
    this.registerEvent(this.plugin.app.vault.on('rename', (file, oldPath) => {
      if (file.path === this.path || oldPath === this.path) this.scheduleRefresh();
    }));
    this.waitForPreview();
  }

  waitForPreview(attempt = 0) {
    if (this.disposed || !this.plugin.enabled) return;
    if (this.containerEl.closest('.markdown-preview-view') && !this.containerEl.closest('.markdown-source-view')) {
      void this.refresh();
      return;
    }
    const win = this.containerEl.ownerDocument.defaultView;
    if (win && attempt < 5) this.timer = win.setTimeout(() => this.waitForPreview(attempt + 1), 20);
    else { this.sourceList.hidden = false; this.mountEl.hidden = true; }
  }

  scheduleRefresh() {
    if (this.disposed) return;
    const win = this.containerEl.ownerDocument.defaultView;
    if (!win) { void this.refresh(); return; }
    if (this.timer !== null) win.clearTimeout(this.timer);
    this.timer = win.setTimeout(() => { this.timer = null; void this.refresh(); }, 40);
  }

  async refresh() {
    const revision = ++this.revision;
    try {
      const file = this.plugin.getArchiveFile(this.path);
      const markdown = await this.plugin.app.vault.read(file);
      if (this.disposed || revision !== this.revision) return;
      const records = core.parseArchiveRecords(markdown).filter((record) => this.keys.has(record.key));
      if (records.some((record) => record.state !== 'x')) {
        this.sourceList.hidden = false;
        this.mountEl.hidden = true;
        for (const input of this.sourceList.querySelectorAll('input[type="checkbox"]')) input.disabled = true;
        return;
      }
      if (this.renderOwner) this.removeChild(this.renderOwner);
      this.renderOwner = this.addChild(new Component());
      this.mountEl.replaceChildren();
      this.mountEl.hidden = false;
      this.sourceList.hidden = true;
      const doc = this.mountEl.ownerDocument;
      const jobs = [];
      for (const record of records) {
        const card = element(doc, 'article', 'arcpunk-todo-item arcpunk-todo-archive-item');
        card.dataset.archiveKey = record.key;
        card.setAttribute('aria-label', `已办结：${record.title}`);
        const header = element(doc, 'div', 'arcpunk-todo-archive-header');
        // Native legacy h3 headings remain outside this slot, with their original anchors.
        if (!record.heading) header.append(element(doc, 'span', 'arcpunk-todo-title', record.title));
        header.append(element(doc, 'span', 'arcpunk-todo-archive-status', '已办结'));
        header.append(element(doc, 'span', 'arcpunk-todo-archive-category', record.category || '未分类'));
        const times = element(doc, 'div', 'arcpunk-todo-times arcpunk-todo-archive-times');
        times.append(element(doc, 'span', '', `完成时间：${record.completedAt || '未核定'}`));
        times.append(element(doc, 'span', '', `登记时间：${record.registered || '未填写'}`));
        times.append(element(doc, 'span', '', `计划结束时间：${record.planned || '未填写'}`));
        card.append(header, times);
        this.mountEl.append(card);
        const detailsText = record.details || record.purpose || '';
        if (detailsText) {
          const details = element(doc, 'details', 'arcpunk-todo-details');
          details.open = this.openDetails.has(record.key);
          details.append(element(doc, 'summary', '', '原事项、来源与产物'));
          const body = element(doc, 'div', 'arcpunk-todo-detail-body');
          details.append(body);
          card.append(details);
          details.addEventListener('toggle', () => {
            if (details.open) this.openDetails.add(record.key);
            else this.openDetails.delete(record.key);
          });
          jobs.push(this.renderReadonlyMarkdown(detailsText, body, this.renderOwner));
        }
        if (record.progress?.length) {
          const progress = element(doc, 'details', 'arcpunk-todo-progress');
          progress.open = this.openProgress.has(record.key);
          progress.append(element(doc, 'summary', '', `进度记录（${record.progress.length}）`));
          card.append(progress);
          progress.addEventListener('toggle', () => {
            if (progress.open) this.openProgress.add(record.key);
            else this.openProgress.delete(record.key);
          });
          for (const entry of record.progress) {
            const section = element(doc, 'section', 'arcpunk-todo-progress-entry');
            section.append(element(doc, 'p', 'arcpunk-todo-progress-heading', `${entry.recordedAt} · ${entry.author}`));
            const body = element(doc, 'div', 'arcpunk-todo-detail-body');
            section.append(body);
            progress.append(section);
            jobs.push(this.renderReadonlyMarkdown(entry.body, body, this.renderOwner));
          }
        }
      }
      await Promise.all(jobs);
    } catch (err) {
      if (this.disposed || revision !== this.revision) return;
      this.sourceList.hidden = false;
      this.mountEl.hidden = false;
      this.mountEl.replaceChildren(element(this.mountEl.ownerDocument, 'p', 'arcpunk-todo-error', errorText(err)));
    }
  }

  async renderReadonlyMarkdown(markdown, body, owner) {
    await MarkdownRenderer.render(this.plugin.app, markdown, body, this.path, owner);
    for (const input of body.querySelectorAll('input[type="checkbox"]')) input.disabled = true;
  }

  onunload() {
    this.disposed = true;
    this.revision++;
    const win = this.containerEl.ownerDocument.defaultView;
    if (win && this.timer !== null) win.clearTimeout(this.timer);
    this.plugin.archiveChildren.delete(this);
    this.sourceList.hidden = false;
    delete this.sourceList.dataset.arcpunkTodoArchiveMounted;
    if (this.sourceList.parentElement === this.containerEl && this.containerEl.parentElement) this.containerEl.replaceWith(this.sourceList);
  }
}

class TaskListChild extends MarkdownRenderChild {
  constructor(slot, mount, sourceList, plugin, path) {
    super(slot);
    this.mountEl = mount;
    this.sourceList = sourceList;
    this.plugin = plugin;
    this.path = path;
    this.revision = 0;
    this.disposed = false;
    this.renderOwner = null;
    this.timer = null;
    this.openDetails = new Set();
    this.openProgress = new Set();
    this.isLeader = false;
    this.viewGroup = null;
    this.attachTimer = null;
  }

  onload() {
    this.registerEvent(this.plugin.app.vault.on('modify', (file) => {
      if (file.path === this.path) this.scheduleRefresh();
    }));
    this.registerEvent(this.plugin.app.vault.on('delete', (file) => {
      if (file.path === this.path) this.scheduleRefresh();
    }));
    this.registerEvent(this.plugin.app.vault.on('rename', (file, oldPath) => {
      if (file.path === this.path || oldPath === this.path) this.scheduleRefresh();
    }));
    const win = this.containerEl.ownerDocument.defaultView;
    if (win) {
      const interval = win.setInterval(() => this.updateOverdueLabels(), 60000);
      this.register(() => win.clearInterval(interval));
    }
    this.attachToPreview();
  }

  attachToPreview(attempt = 0) {
    if (this.disposed || !this.plugin.enabled) return;
    if (this.plugin.attachToPreview(this)) return;
    // Markdown sections can be processed before insertion; never mount an editor widget.
    const win = this.containerEl.ownerDocument.defaultView;
    if (win && attempt < 5) {
      this.attachTimer = win.setTimeout(() => this.attachToPreview(attempt + 1), 20);
    } else {
      this.sourceList.hidden = false;
      this.mountEl.hidden = true;
    }
  }

  setLeader(value) {
    if (this.isLeader === value) return;
    this.isLeader = value;
    this.revision++;
    this.mountEl.hidden = !value;
    if (value) this.scheduleRefresh();
    else {
      if (this.renderOwner) this.removeChild(this.renderOwner);
      this.renderOwner = null;
      this.mountEl.replaceChildren();
    }
  }

  scheduleRefresh() {
    if (this.disposed || !this.isLeader) return;
    const win = this.containerEl.ownerDocument.defaultView;
    if (!win) { void this.refresh(); return; }
    if (this.timer !== null) win.clearTimeout(this.timer);
    this.timer = win.setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, 40);
  }

  updateOverdueLabels() {
    for (const label of this.mountEl.querySelectorAll('[data-planned-date]')) {
      const overdue = isOverdue(label.dataset.plannedDate);
      label.classList.toggle('is-overdue', overdue);
      label.textContent = `计划结束时间：${label.dataset.plannedDate || '未填写'}${overdue ? ' · 已逾期' : ''}`;
    }
  }

  async refresh() {
    if (this.disposed || !this.isLeader) return;
    const revision = ++this.revision;
    try {
      const file = this.plugin.getFile(this.path);
      const markdown = await this.plugin.app.vault.read(file);
      if (this.disposed || !this.isLeader || revision !== this.revision) return;
      // Only explicit completion/discard states leave the active display.
      const tasks = core.parseTasks(markdown).filter((task) => task.state !== 'x' && task.state !== '-');
      if (this.renderOwner) this.removeChild(this.renderOwner);
      this.renderOwner = this.addChild(new Component());
      this.mountEl.replaceChildren();
      const doc = this.containerEl.ownerDocument;
      const undo = this.plugin.pendingUndo.get(this.path);
      if (undo && !undo.undone) this.renderUndo(doc, undo);
      if (!tasks.length) {
        this.mountEl.append(element(doc, 'p', 'arcpunk-todo-empty', '当前没有待办'));
        return;
      }
      const groups = new Map();
      for (const task of tasks) {
        const category = task.category || '未分类';
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(task);
      }
      const renderJobs = [];
      for (const [category, group] of groups) {
        const section = element(doc, 'section', 'arcpunk-todo-group');
        section.append(element(doc, 'h3', 'arcpunk-todo-group-title', category || '未分类'));
        const list = element(doc, 'div', 'arcpunk-todo-list');
        section.append(list);
        this.mountEl.append(section);
        for (const task of group) renderJobs.push(this.renderTask(doc, list, task, this.renderOwner));
      }
      await Promise.all(renderJobs);
    } catch (err) {
      if (this.disposed || !this.isLeader || revision !== this.revision) return;
      this.mountEl.replaceChildren(element(this.containerEl.ownerDocument, 'p', 'arcpunk-todo-error', errorText(err)));
    }
  }

  renderUndo(doc, record) {
    const banner = element(doc, 'div', 'arcpunk-todo-result');
    const undo = button(doc, '撤销', 'arcpunk-todo-undo');
    banner.setAttribute('role', 'status');
    banner.append(element(doc, 'span', '', `${record.message}：${record.title}`), undo);
    undo.addEventListener('click', async () => {
      undo.disabled = true;
      try { await this.plugin.undoTask(record); }
      catch (err) { new Notice(errorText(err)); undo.disabled = false; }
    });
    this.mountEl.append(banner);
  }

  async renderTask(doc, list, task, owner) {
    const card = element(doc, 'article', 'arcpunk-todo-item');
    const row = element(doc, 'div', 'arcpunk-todo-main');
    const checkLabel = element(doc, 'div', 'arcpunk-todo-check-label');
    const checkbox = element(doc, 'input', 'arcpunk-todo-checkbox');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', `确认完成：${task.title}`);
    checkLabel.append(checkbox, element(doc, 'span', 'arcpunk-todo-title', task.title));
    const actions = element(doc, 'div', 'arcpunk-todo-actions');
    const edit = button(doc, '', 'arcpunk-todo-icon-button');
    edit.title = '编辑分类与时间';
    edit.setAttribute('aria-label', `编辑分类与时间：${task.title}`);
    setIcon(edit, 'pencil');
    const discard = button(doc, '', 'arcpunk-todo-icon-button arcpunk-todo-discard');
    discard.title = '舍弃此项';
    discard.setAttribute('aria-label', `舍弃：${task.title}`);
    setIcon(discard, 'trash-2');
    const addProgress = button(doc, '追加进度', 'arcpunk-todo-progress-button');
    addProgress.setAttribute('aria-label', `追加进度：${task.title}`);
    actions.append(addProgress, edit, discard);
    row.append(checkLabel, actions);
    const times = element(doc, 'div', 'arcpunk-todo-times');
    const planned = element(doc, 'span');
    planned.dataset.plannedDate = task.planned || '';
    const overdue = isOverdue(task.planned);
    planned.classList.toggle('is-overdue', overdue);
    planned.textContent = `计划结束时间：${task.planned || '未填写'}${overdue ? ' · 已逾期' : ''}`;
    times.append(element(doc, 'span', '', `登记时间：${task.registered || '未填写'}`), planned);
    card.append(row, times);
    if (task.state !== ' ') card.append(element(doc, 'p', 'arcpunk-todo-state-warning', `原状态 [${task.state}]，含义待核`));
    list.append(card);
    let busy = false;
    const changeState = async (state) => {
      if (busy) return;
      busy = true;
      checkbox.disabled = edit.disabled = discard.disabled = addProgress.disabled = true;
      try {
        await this.plugin.updateTask(this.path, task, { state });
        card.hidden = true;
      } catch (err) {
        checkbox.checked = false;
        new Notice(errorText(err));
      } finally {
        busy = false;
        checkbox.disabled = edit.disabled = discard.disabled = addProgress.disabled = false;
      }
    };
    checkbox.addEventListener('change', () => { if (checkbox.checked) void changeState('x'); });
    discard.addEventListener('click', () => { void changeState('-'); });
    edit.addEventListener('click', () => new TaskMetadataModal(this.plugin, this.path, task).open());
    addProgress.addEventListener('click', () => new TaskProgressModal(this.plugin, this.path, task).open());
    const renderJobs = [];
    if (task.details) {
      const details = element(doc, 'details', 'arcpunk-todo-details');
      details.open = this.openDetails.has(task.key);
      details.append(element(doc, 'summary', '', '背景与来源'));
      const body = element(doc, 'div', 'arcpunk-todo-detail-body');
      details.append(body);
      card.append(details);
      details.addEventListener('toggle', () => {
        if (details.open) this.openDetails.add(task.key);
        else this.openDetails.delete(task.key);
      });
      // The mount ancestor prevents this render's own Markdown post-processing from re-entering.
      renderJobs.push(MarkdownRenderer.render(this.plugin.app, task.details, body, this.path, owner));
    }
    if (task.progress?.length) {
      const progress = element(doc, 'details', 'arcpunk-todo-progress');
      progress.open = this.openProgress.has(task.key);
      progress.append(element(doc, 'summary', '', `进度记录（${task.progress.length}）`));
      progress.addEventListener('toggle', () => {
        if (progress.open) this.openProgress.add(task.key);
        else this.openProgress.delete(task.key);
      });
      // Attach before invoking MarkdownRenderer so its postprocessor sees the mount ancestor.
      card.append(progress);
      for (const record of task.progress) {
        const entry = element(doc, 'section', 'arcpunk-todo-progress-entry');
        entry.append(element(doc, 'p', 'arcpunk-todo-progress-heading', `${record.recordedAt} · ${record.author}`));
        const body = element(doc, 'div', 'arcpunk-todo-detail-body');
        entry.append(body);
        progress.append(entry);
        renderJobs.push(MarkdownRenderer.render(this.plugin.app, record.body, body, this.path, owner));
      }
    }
    await Promise.all(renderJobs);
  }

  onunload() {
    this.disposed = true;
    this.revision++;
    const win = this.containerEl.ownerDocument.defaultView;
    if (win && this.timer !== null) win.clearTimeout(this.timer);
    if (win && this.attachTimer !== null) win.clearTimeout(this.attachTimer);
    this.plugin.detachFromPreview(this);
    this.plugin.taskChildren.delete(this);
    this.sourceList.hidden = false;
    delete this.sourceList.dataset.arcpunkTodoMounted;
    if (this.sourceList.parentElement === this.containerEl && this.containerEl.parentElement) this.containerEl.replaceWith(this.sourceList);
  }
}

class ZoneDiscussionModal extends Modal {
  constructor(plugin, path, row, target) {
    super(plugin.app);
    Object.assign(this, { plugin, path, row, target });
  }

  onOpen() {
    this.modalEl.classList.add('arcpunk-todo-edit-modal');
    this.titleEl.textContent = '追加讨论';
    const doc = this.contentEl.ownerDocument;
    const form = element(doc, 'form', 'arcpunk-todo-edit-form');
    this.contentEl.replaceChildren(element(doc, 'p', 'arcpunk-todo-edit-title', this.target.block.heading), form);
    const field = (label, tag, rows) => {
      const wrap = element(doc, 'label', 'arcpunk-todo-edit-field');
      const input = element(doc, tag);
      if (tag === 'input') input.type = 'text';
      if (rows) input.rows = rows;
      wrap.append(element(doc, 'span', '', label), input);
      form.append(wrap);
      return input;
    };
    const content = field('讨论正文', 'textarea', 5);
    content.required = true;
    const author = field('记录者', 'input');
    author.value = '本人';
    const source = field('来源（选填，支持库内双链）', 'textarea', 2);
    const error = element(doc, 'p', 'arcpunk-todo-edit-error');
    error.setAttribute('role', 'alert');
    const actions = element(doc, 'div', 'arcpunk-todo-edit-actions');
    const cancel = button(doc, '取消');
    const save = button(doc, '保存讨论', 'mod-cta');
    save.type = 'submit';
    cancel.addEventListener('click', () => this.close());
    actions.append(cancel, save);
    form.append(error, actions);
    let saving = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (saving) return;
      error.textContent = '';
      if (!content.value.trim()) { error.textContent = '请填写讨论正文'; content.focus(); return; }
      saving = true;
      save.disabled = true;
      try {
        await this.plugin.appendZoneDiscussion(this.path, this.row, this.target, {
          content: content.value, author: author.value, source: source.value,
        });
        this.close();
      } catch (err) {
        // No retry: the original target snapshot and the user's draft both remain intact.
        error.textContent = errorText(err);
      } finally { saving = false; save.disabled = false; }
    });
    content.focus();
  }

  onClose() { this.contentEl.replaceChildren(); }
}

class UnacceptedCognitionModal extends Modal {
  async onOpen() {
    this.titleEl.textContent = '认知选否的条目';
    this.contentEl.classList.add(MOUNT_CLASS);
    const doc = this.contentEl.ownerDocument;
    try {
      let count = 0;
      for (const dir of zones.ZONES) {
        const path = `${dir}/${dir}看板.md`;
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw Error('无法读取 ' + path);
        const board = await this.app.vault.read(file);
        const rows = zones.parseBoards(board, path).flatMap(table => table.rows).filter(row => row.recognition === '否');
        if (!rows.length) continue;
        this.contentEl.append(element(doc, 'h3', '', dir));
        for (const row of rows) {
          const body = element(doc, 'div', 'arcpunk-todo-detail-body');
          this.contentEl.append(body);
          await MarkdownRenderer.render(this.app, row.title, body, path, this.component);
        }
        count += rows.length;
      }
      if (!count) this.contentEl.append(element(doc, 'p', '', '当前信息块及灵感看板暂无明确选“否”的条目。'));
    } catch (err) {
      this.contentEl.append(element(doc, 'p', 'arcpunk-todo-error', errorText(err)));
    }
  }

  constructor(app) {
    super(app);
    this.component = new Component();
    this.component.load();
  }

  onClose() {
    this.component.unload();
    this.contentEl.replaceChildren();
  }
}

class ZoneTableChild extends MarkdownRenderChild {
  constructor(slot, mount, sourceTable, plugin, path, tableKey) {
    super(slot);
    Object.assign(this, { mountEl: mount, sourceTable, plugin, path, tableKey });
    this.disposed = false;
    this.revision = 0;
    this.timer = null;
    this.renderOwner = null;
    this.bodyPaths = new Set();
    this.openFolds = new Set();
  }

  onload() {
    zoneDebug('child-onload', { path: this.path, tableKey: this.tableKey, connected: this.containerEl.isConnected === true, chain: this.ancestorChain() });
    const affected = (file) => file.path === this.path || this.bodyPaths.has(file.path);
    this.registerEvent(this.plugin.app.vault.on('modify', (file) => { if (affected(file)) this.scheduleRefresh(); }));
    this.registerEvent(this.plugin.app.vault.on('delete', (file) => { if (affected(file)) this.scheduleRefresh(); }));
    this.registerEvent(this.plugin.app.vault.on('rename', (file, oldPath) => {
      if (affected(file) || oldPath === this.path || this.bodyPaths.has(oldPath)) this.scheduleRefresh();
    }));
    this.waitForPreview();
  }

  previewReady() {
    return !!this.containerEl.closest('.markdown-preview-view') && !this.containerEl.closest('.markdown-source-view');
  }

  ancestorChain() {
    const chain = [];
    let node = this.containerEl;
    for (let index = 0; node && index < 8; index += 1) {
      const cls = typeof node.className === 'string' ? node.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      chain.push(node.tagName + (cls ? `.${cls}` : ''));
      node = node.parentElement;
    }
    return chain;
  }

  waitForPreview(attempt = 0) {
    if (this.disposed || !this.plugin.enabled) {
      zoneDebug('wait-preview-skip', { path: this.path, tableKey: this.tableKey, attempt, disposed: this.disposed === true, enabled: this.plugin.enabled === true });
      return;
    }
    const ready = this.previewReady();
    if (!ready) {
      zoneDebug('wait-preview', { path: this.path, tableKey: this.tableKey, attempt, hasPreview: !!this.containerEl.closest('.markdown-preview-view'), inSource: !!this.containerEl.closest('.markdown-source-view'), connected: this.containerEl.isConnected === true, chain: this.ancestorChain() });
    } else if (attempt > 0) {
      zoneDebug('wait-preview-ok', { path: this.path, tableKey: this.tableKey, attempt });
    }
    if (ready) {
      void this.refresh();
      return;
    }
    const win = this.containerEl.ownerDocument.defaultView;
    if (win && attempt < 60) this.timer = win.setTimeout(() => this.waitForPreview(attempt + 1), attempt < 10 ? 20 : 150);
    else this.fallback();
  }

  scheduleRefresh() {
    if (this.disposed) return;
    const win = this.containerEl.ownerDocument.defaultView;
    if (!win) { void this.refresh(); return; }
    if (this.timer !== null) win.clearTimeout(this.timer);
    this.timer = win.setTimeout(() => { this.timer = null; void this.refresh(); }, 40);
  }

  fallback() {
    zoneDebug('fallback', { path: this.path, tableKey: this.tableKey, connected: this.containerEl.isConnected === true, chain: this.ancestorChain() });
    if (this.renderOwner) this.removeChild(this.renderOwner);
    this.renderOwner = null;
    this.mountEl.replaceChildren();
    this.mountEl.hidden = true;
    this.sourceTable.hidden = false;
  }

  async refresh() {
    const revision = ++this.revision;
    try {
      const file = this.plugin.getZoneFile(this.path);
      const markdown = await this.plugin.app.vault.read(file);
      const boardTables = zones.parseBoards(markdown, this.path);
      const tables = boardTables.filter((table) => table.key === this.tableKey);
      zoneDebug('refresh', { path: this.path, tableKey: this.tableKey, tableCount: tables.length, rows: tables[0] ? tables[0].rows.length : -1, keys: boardTables.map((table) => table.key) });
      if (tables.length !== 1 || !tables[0].rows.length) throw new Error('原表定位变化');
      const table = tables[0];
      const targets = new Map();
      const reads = new Map();
      for (const row of table.rows) {
        // A broken original title/source stays native; do not invent a replacement record.
        const targetFile = this.plugin.resolveZoneTarget(this.path, row);
        this.bodyPaths.add(targetFile.path);
        if (!reads.has(targetFile.path)) reads.set(targetFile.path, this.plugin.app.vault.read(targetFile));
        const source = await reads.get(targetFile.path);
        targets.set(row, { path: targetFile.path, block: zones.extractBlock(source, row.link.fragment) });
      }
      if (this.disposed || revision !== this.revision || !this.plugin.enabled) return;
      this.bodyPaths = new Set([...targets.values()].map((target) => target.path));
      if (this.renderOwner) this.removeChild(this.renderOwner);
      this.renderOwner = this.addChild(new Component());
      this.mountEl.replaceChildren();
      this.mountEl.hidden = false;
      this.sourceTable.hidden = true;
      const archived = ZONE_PATHS.get(this.path).archived || table.archived;
      if (!archived && boardTables.find(item => item.rows.length) === table) {
        const browse = button(this.mountEl.ownerDocument, '查看认知选否条目', 'arcpunk-todo-progress-button');
        browse.addEventListener('click', () => new UnacceptedCognitionModal(this.plugin.app).open());
        this.mountEl.append(browse);
      }
      const jobs = table.rows.map((row) => this.renderRow(row, targets.get(row), archived));
      await Promise.all(jobs);
    } catch (_) {
      zoneDebug('refresh-fail', { path: this.path, tableKey: this.tableKey, revision, error: _ && _.message, stack: _ && String(_.stack || '').slice(0, 800) });
      if (!this.disposed && revision === this.revision) this.fallback();
    }
  }

  fold(card, key, label) {
    const doc = card.ownerDocument;
    const details = element(doc, 'details', 'arcpunk-todo-details arcpunk-zone-fold');
    details.open = this.openFolds.has(key);
    details.append(element(doc, 'summary', '', label));
    const body = element(doc, 'div', 'arcpunk-todo-detail-body');
    details.append(body);
    card.append(details);
    details.addEventListener('toggle', () => {
      if (details.open) this.openFolds.add(key); else this.openFolds.delete(key);
    });
    return { details, body };
  }

  async renderMarkdown(markdown, body, sourcePath = this.path) {
    try {
      await MarkdownRenderer.render(this.plugin.app, markdown || '（未填写）', body, sourcePath, this.renderOwner);
    } catch (error) {
      // 单段渲染失败不该让整节退回原生表格
      zoneDebug('row-render-fail', { path: this.path, tableKey: this.tableKey, sourcePath, error: error && error.message, stack: error && String(error.stack || '').slice(0, 800) });
      body.textContent = '（此段渲染失败，详见 zone-debug.log）';
      return;
    }
    // Body tasks are source material, not another task controller.
    for (const input of body.querySelectorAll('input[type="checkbox"]')) input.disabled = true;
  }

  async renderRow(row, target, archived) {
    const doc = this.mountEl.ownerDocument;
    const card = element(doc, 'article', 'arcpunk-todo-item arcpunk-zone-card');
    card.dataset.zoneRow = row.key;
    if (archived) card.classList.add('is-zone-archived');
    const header = element(doc, 'div', 'arcpunk-zone-header');
    const title = element(doc, 'div', 'arcpunk-todo-title arcpunk-zone-title');
    header.append(title);
    if (archived) header.append(element(doc, 'span', 'arcpunk-zone-badge', '已归档'));
    card.append(header);
    const time = element(doc, 'div', 'arcpunk-todo-times arcpunk-zone-time', row.time || '时间未填写');
    card.append(time);
    const description = element(doc, 'div', 'arcpunk-zone-description arcpunk-todo-detail-body');
    card.append(description);
    const choices = element(doc, 'div', 'arcpunk-zone-choices');
    for (const [field, label] of [['recognition', '是不是我的认知'], ['selection', '是否选为题']]) {
      if (row.indices[field] < 0) continue;
      if (archived || row.headers[row.indices.selection] !== '是否选为题') {
        choices.append(element(doc, 'span', 'arcpunk-zone-choice-value', `${label}：${row[field] || '未填写'}`));
        continue;
      }
      const wrap = element(doc, 'label', 'arcpunk-zone-choice');
      const input = element(doc, 'select');
      input.setAttribute('aria-label', label);
      input.dataset.zoneChoice = field;
      for (const value of ['', '是', '否']) {
        const option = element(doc, 'option', '', value || '未填写');
        option.value = value;
        input.append(option);
      }
      if (!['', '是', '否'].includes(row[field])) {
        const option = element(doc, 'option', '', '原值：' + row[field]);
        option.value = row[field];
        option.disabled = true;
        input.append(option);
      }
      input.value = row[field];
      wrap.append(element(doc, 'span', '', label), input);
      input.addEventListener('change', async () => {
        input.disabled = true;
        try { await this.plugin.setZoneChoice(this.path, row, field, input.value); }
        catch (err) { input.value = row[field]; new Notice(errorText(err)); }
        finally { input.disabled = false; this.scheduleRefresh(); }
      });
      choices.append(wrap);
    }
    card.append(choices);
    this.mountEl.append(card);
    const jobs = [this.renderMarkdown(row.title, title), this.renderMarkdown(row.description, description)];
    const original = this.fold(card, `${row.key}:original`, '原反馈与来源');
    for (const [label, value] of [[row.headers[row.indices.feedback], row.feedback], [row.headers[row.indices.source], row.source]]) {
      const group = element(doc, 'section', 'arcpunk-zone-original-field');
      group.append(element(doc, 'p', 'arcpunk-zone-field-label', label));
      const body = element(doc, 'div');
      group.append(body); original.body.append(group);
      jobs.push(this.renderMarkdown(value, body));
    }
    // Every manually added column remains visible, including archive destinations.
    const standardIndices = new Set(['selection', 'recognition', 'time', 'title', 'description', 'feedback', 'source'].map((field) => row.indices[field]));
    for (let i = 0; i < row.headers.length; i++) {
      if (standardIndices.has(i)) continue;
      const group = element(doc, 'section', 'arcpunk-zone-extra');
      group.append(element(doc, 'p', 'arcpunk-zone-field-label', row.headers[i]));
      const body = element(doc, 'div', 'arcpunk-todo-detail-body');
      group.append(body); card.append(group);
      jobs.push(this.renderMarkdown(row.cells[i], body));
    }
    const bodyFold = this.fold(card, `${row.key}:body`, '信息块正文');
    jobs.push(this.renderMarkdown(target.block.body, bodyFold.body, target.path));
    if (target.block.discussion.length) {
      const discussion = this.fold(card, `${row.key}:discussion`, `讨论记录（${target.block.discussion.length}）`);
      for (const entry of target.block.discussion) {
        const section = element(doc, 'section', 'arcpunk-todo-progress-entry');
        section.append(element(doc, 'p', 'arcpunk-todo-progress-heading', `${entry.recordedAt} · ${entry.author}`));
        const body = element(doc, 'div', 'arcpunk-todo-detail-body');
        section.append(body); discussion.body.append(section);
        jobs.push(this.renderMarkdown(entry.body, body, target.path));
      }
    }
    if (!archived && this.plugin.canWriteZoneTarget(this.path, row, target.path)) {
      const actions = element(doc, 'div', 'arcpunk-zone-actions');
      const add = button(doc, '追加讨论', 'arcpunk-todo-progress-button arcpunk-zone-discuss-button');
      add.addEventListener('click', () => new ZoneDiscussionModal(this.plugin, this.path, row, target).open());
      actions.append(add); card.append(actions);
    }
    await Promise.all(jobs);
  }

  onunload() {
    zoneDebug('child-unload', { path: this.path, tableKey: this.tableKey, revision: this.revision });
    this.disposed = true;
    this.revision++;
    const win = this.containerEl.ownerDocument.defaultView;
    if (win && this.timer !== null) win.clearTimeout(this.timer);
    this.plugin.zoneChildren.delete(this);
    this.sourceTable.hidden = false;
    delete this.sourceTable.dataset.arcpunkZoneMounted;
    if (this.sourceTable.parentElement === this.containerEl && this.containerEl.parentElement) this.containerEl.replaceWith(this.sourceTable);
  }
}

class LightAnnotationModal extends Modal {
  constructor(plugin, path, table, row, preferredField = '我的看法') {
    super(plugin.app);
    Object.assign(this, { plugin, path, table, row, preferredField });
  }
  onOpen() {
    this.modalEl.classList.add('arcpunk-todo-edit-modal', 'arcpunk-light-annotation-modal');
    this.titleEl.textContent = '追加批注';
    const doc = this.contentEl.ownerDocument;
    const form = element(doc, 'form', 'arcpunk-todo-edit-form');
    const title = this.row.values['材料与原文入口'] || this.row.values['资料与原文入口'] || this.row.values['兴趣点'] || '';
    const displayTitle = title.replace(/\[\[([^\]]+)\]\]/g, (_match, inner) => {
      const [target, ...alias] = inner.split('|');
      return alias.length ? alias.join('|') : target.split('/').pop();
    });
    this.contentEl.replaceChildren(element(doc, 'p', 'arcpunk-todo-edit-title', displayTitle), form);
    const fieldWrap = element(doc, 'label', 'arcpunk-todo-edit-field');
    const field = element(doc, 'select', 'arcpunk-light-select');
    field.setAttribute('aria-label', '批注写入栏');
    for (const name of __arcpunkLight.annotationFields(this.table.kind)) {
      const option = element(doc, 'option', '', name);
      option.value = name; field.append(option);
    }
    field.value = __arcpunkLight.annotationFields(this.table.kind).includes(this.preferredField)
      ? this.preferredField : '我的看法';
    fieldWrap.append(element(doc, 'span', '', '写入哪一栏'), field);
    const bodyWrap = element(doc, 'label', 'arcpunk-todo-edit-field');
    const content = element(doc, 'textarea');
    content.rows = 6;
    content.required = true;
    const updatePlaceholder = () => {
      content.placeholder = field.value === '我的看法'
        ? '写下你对整份材料的想法、疑问或可能用途'
        : '可写原话或章节位置，再补充你的点评和具体要求';
    };
    updatePlaceholder();
    field.addEventListener('change', updatePlaceholder);
    bodyWrap.append(element(doc, 'span', '', '批注正文'), content);
    const hint = element(doc, 'p', 'arcpunk-light-annotation-hint', '保存到本行所选栏，附上海时间；只追加批注，不执行分拣。');
    const error = element(doc, 'p', 'arcpunk-todo-edit-error');
    error.setAttribute('role', 'alert');
    const actions = element(doc, 'div', 'arcpunk-todo-edit-actions');
    const cancel = button(doc, '取消');
    const save = button(doc, '保存批注', 'mod-cta');
    save.type = 'submit';
    cancel.addEventListener('click', () => this.close());
    actions.append(cancel, save);
    form.append(fieldWrap, bodyWrap, hint, error, actions);
    let saving = false;
    form.addEventListener('submit', async event => {
      event.preventDefault(); event.stopPropagation();
      if (saving) return;
      error.textContent = '';
      if (!content.value.trim()) {
        error.textContent = '请填写批注正文'; content.focus(); return;
      }
      saving = true; save.disabled = true;
      try {
        await this.plugin.appendLightAnnotation(this.path, this.table.key, this.row, field.value, content.value);
        this.close();
      } catch (err) {
        // A stale row must never be reloaded and silently retried with the owner's draft.
        error.textContent = errorText(err);
      } finally {
        saving = false; save.disabled = false;
      }
    });
    content.focus();
  }
  onClose() { this.contentEl.replaceChildren(); }
}

class LightTableChild extends MarkdownRenderChild {
  constructor(slot, mount, sourceTable, plugin, path, tableKey) {
    super(slot);
    Object.assign(this, { mountEl: mount, sourceTable, plugin, path, tableKey });
    this.disposed = false;
    this.revision = 0;
    this.renderOwner = null;
    this.historyOpen = false;
    this.openIntakeMore = new Set();
  }
  onload() {
    const refresh = file => { if (file.path === this.path) void this.refresh(); };
    this.registerEvent(this.plugin.app.vault.on('modify', refresh));
    this.registerEvent(this.plugin.app.vault.on('delete', refresh));
    this.registerEvent(this.plugin.app.vault.on('rename', (file, oldPath) => {
      if (file.path === this.path || oldPath === this.path) void this.refresh();
    }));
    void this.refresh();
  }
  fallback() {
    if (this.renderOwner) this.removeChild(this.renderOwner);
    this.renderOwner = null;
    this.mountEl.replaceChildren();
    this.mountEl.hidden = true;
    this.sourceTable.hidden = false;
  }
  async refresh() {
    const revision = ++this.revision;
    try {
      const file = this.plugin.getLightFile(this.path);
      const markdown = await this.plugin.app.vault.read(file);
      const found = __arcpunkLight.parseTables(markdown, this.path).filter(t => t.key === this.tableKey);
      if (found.length !== 1) throw Error('原表定位变化');
      if (this.disposed || !this.plugin.enabled || revision !== this.revision) return;
      const table = found[0];
      if (this.renderOwner) this.removeChild(this.renderOwner);
      this.renderOwner = this.addChild(new Component());
      this.mountEl.replaceChildren();
      this.mountEl.hidden = false;
      this.sourceTable.hidden = true;
      let rows = [...table.rows];
      if (table.kind !== 'intake') rows.sort((a, b) => (b.values['日期'] || '').localeCompare(a.values['日期'] || ''));
      if (table.kind === 'rumination') {
        const active = rows.filter(row => row.values['继续反刍'] === '是');
        const ended = rows.filter(row => row.values['继续反刍'] === '否');
        const undecided = rows.filter(row => !['是', '否'].includes(row.values['继续反刍']));
        await this.renderTable(table, active, this.mountEl, '正在反刍');
        if (undecided.length) await this.renderTable(table, undecided, this.mountEl, '尚未明确');
        if (ended.length) {
          const details = element(this.mountEl.ownerDocument, 'details', 'arcpunk-light-history');
          details.open = this.historyOpen;
          details.append(element(this.mountEl.ownerDocument, 'summary', '', `已结束反刍（${ended.length}）`));
          details.addEventListener('toggle', () => { this.historyOpen = details.open; });
          this.mountEl.append(details);
          await this.renderTable(table, ended, details);
        }
      } else if (table.kind === 'intake') await this.renderIntake(table, rows, this.mountEl);
      else await this.renderTable(table, rows, this.mountEl);
    } catch (_) { if (!this.disposed && revision === this.revision) this.fallback(); }
  }
  async renderReadonlyMarkdown(markdown, container) {
    await MarkdownRenderer.render(this.plugin.app, markdown || '', container, this.path, this.renderOwner);
    // A checkbox quoted in a note is content, not an extra decision control.
    for (const input of container.querySelectorAll('input[type="checkbox"]')) input.disabled = true;
  }
  async renderIntake(table, rows, container) {
    const doc = container.ownerDocument;
    const workbench = element(doc, 'div', 'arcpunk-intake-workbench');
    workbench.setAttribute('aria-label', '每日资料批注工作台');
    container.append(workbench);
    if (!rows.length) {
      workbench.append(element(doc, 'p', 'arcpunk-todo-empty', '暂无资料'));
      return;
    }
    const jobs = [];
    for (const row of rows) {
      // A card is only a reading-mode view of this exact source row, not another record.
      const card = element(doc, 'article', 'arcpunk-todo-item arcpunk-intake-card');
      card.dataset.rowKey = row.key;
      const title = element(doc, 'div', 'arcpunk-intake-title');
      title.setAttribute('role', 'heading'); title.setAttribute('aria-level', '3');
      card.append(title);
      jobs.push(this.renderReadonlyMarkdown(row.values['材料与原文入口'], title));
      const hint = element(doc, 'div', 'arcpunk-intake-hint');
      hint.setAttribute('aria-label', '内容提示');
      card.append(hint);
      jobs.push(this.renderReadonlyMarkdown(row.values['内容提示'], hint));

      const controls = element(doc, 'div', 'arcpunk-intake-destination');
      const process = element(doc, 'label', 'arcpunk-intake-choice');
      process.append(element(doc, 'span', '', '本轮处理'));
      this.choice(process, table, row, '本轮处理', __arcpunkLight.PROCESS_OPTIONS);
      const rumination = element(doc, 'label', 'arcpunk-intake-choice');
      this.checkbox(rumination, table, row);
      rumination.append(element(doc, 'span', '', '待反刍'));
      controls.append(process, rumination); card.append(controls);

      jobs.push(this.renderIntakeField(table, row, '我的看法', card, {
        className: 'arcpunk-intake-overview', title: '整篇看法', action: '写整篇看法',
        empty: '先记下你对整份材料的想法。',
      }));
      const details = element(doc, 'section', 'arcpunk-intake-details');
      details.append(element(doc, 'h4', 'arcpunk-intake-section-title', '细节批注'));
      const grid = element(doc, 'div', 'arcpunk-intake-detail-grid');
      details.append(grid); card.append(details);
      const fields = [
        ['灵感', '材料触发了什么点子'],
        ['兴趣', '想留住的名词、人物、仓库或入口'],
        ['信息块', '准备提取的完整意思或值得保留的原话'],
      ];
      for (const [field, empty] of fields) jobs.push(this.renderIntakeField(table, row, field, grid, {
        className: 'arcpunk-intake-detail', title: field, action: `追加${field}`, empty,
      }));

      // Keep the fourth instruction field and every manually added column available.
      const extras = table.headers.map((field, index) => ({ field, index }))
        .filter(({ field }) => !__arcpunkLight.HEADERS.intake.includes(field));
      const hasTodo = !!row.values['待办'];
      if (hasTodo) jobs.push(this.renderIntakeField(table, row, '待办', card, {
        className: 'arcpunk-intake-todo', title: '待办线索', action: '追加待办线索',
      }));
      if (!hasTodo || extras.length) {
        const more = element(doc, 'details', 'arcpunk-intake-more');
        const foldKey = JSON.stringify([table.key, row.key]);
        more.open = this.openIntakeMore.has(foldKey);
        more.append(element(doc, 'summary', '', !hasTodo && extras.length
          ? '待办线索与附加字段' : !hasTodo ? '待办线索' : '附加字段'));
        more.addEventListener('toggle', () => {
          if (more.open) this.openIntakeMore.add(foldKey); else this.openIntakeMore.delete(foldKey);
        });
        card.append(more);
        if (!hasTodo) jobs.push(this.renderIntakeField(table, row, '待办', more, {
          className: 'arcpunk-intake-todo', title: '待办线索', action: '追加待办线索',
          empty: '有具体要办理或跟进的动作时再写。',
        }));
        for (const { field, index } of extras) {
          const extra = element(doc, 'section', 'arcpunk-intake-extra');
          extra.dataset.field = field;
          extra.append(element(doc, 'h4', 'arcpunk-intake-section-title', field));
          const body = element(doc, 'div', 'arcpunk-intake-feedback');
          extra.append(body); more.append(extra);
          if (row.cells[index]) jobs.push(this.renderReadonlyMarkdown(row.cells[index], body));
          else body.append(element(doc, 'p', 'arcpunk-intake-empty', '未填写'));
        }
      }
      workbench.append(card);
    }
    await Promise.all(jobs);
  }
  async renderIntakeField(table, row, field, parent, options) {
    const doc = parent.ownerDocument;
    const section = element(doc, 'section', options.className);
    section.dataset.field = field;
    const header = element(doc, 'div', 'arcpunk-intake-field-header');
    header.append(element(doc, 'h4', 'arcpunk-intake-section-title', options.title));
    this.annotationButton(header, table, row, field, options.action);
    const body = element(doc, 'div', 'arcpunk-intake-feedback');
    section.append(header, body); parent.append(section);
    if (row.values[field]) await this.renderReadonlyMarkdown(row.values[field], body);
    else body.append(element(doc, 'p', 'arcpunk-intake-empty', options.empty || '暂无批注'));
  }
  async renderTable(table, rows, container, heading) {
    const doc = container.ownerDocument;
    if (heading) container.append(element(doc, 'h3', 'arcpunk-light-heading', heading));
    if (!rows.length) { container.append(element(doc, 'p', 'arcpunk-todo-empty', '暂无条目')); return; }
    const wrap = element(doc, 'div', 'arcpunk-light-scroll');
    const node = element(doc, 'table', 'arcpunk-light-table');
    node.setAttribute('aria-label', table.kind === 'intake' ? '每日资料批注清单' : table.kind === 'interest' ? '兴趣清单' : '反刍清单');
    const head = element(doc, 'thead');
    const tr = element(doc, 'tr');
    for (const field of table.headers) tr.append(element(doc, 'th', '', field));
    head.append(tr); node.append(head);
    const body = element(doc, 'tbody');
    node.append(body); wrap.append(node); container.append(wrap);
    const jobs = [];
    for (const row of rows) {
      const tr = element(doc, 'tr');
      body.append(tr);
      for (let index = 0; index < table.headers.length; index++) {
        const field = table.headers[index];
        const td = element(doc, 'td'); tr.append(td);
        if (table.kind === 'intake' && field === '本轮处理') this.choice(td, table, row, field, __arcpunkLight.PROCESS_OPTIONS);
        else if (table.kind === 'rumination' && field === '继续反刍') this.choice(td, table, row, field, ['', '是', '否']);
        else if (table.kind === 'intake' && field === '待反刍') this.checkbox(td, table, row);
        else jobs.push(MarkdownRenderer.render(this.plugin.app, row.cells[index] || '', td, this.path, this.renderOwner).then(() => {
          // Content checkboxes belong to source text, not this selection controller.
          for (const input of td.querySelectorAll('input[type="checkbox"]')) input.disabled = true;
          const sourceField = table.kind === 'intake' ? '材料与原文入口'
            : table.kind === 'interest' ? '兴趣点' : '资料与原文入口';
          if (field === sourceField) this.annotationButton(td, table, row);
        }));
      }
    }
    await Promise.all(jobs);
  }
  annotationButton(cell, table, row, field = '我的看法', label = '追加批注') {
    if (!__arcpunkLight.annotationFields(table.kind).length) return;
    const add = button(cell.ownerDocument, label, 'arcpunk-todo-progress-button arcpunk-light-annotation-button');
    if (table.kind === 'intake') add.classList.add('arcpunk-intake-annotation-button');
    add.dataset.annotationField = field;
    add.setAttribute('aria-label', `${label}：${row.values['材料与原文入口'] || row.values['资料与原文入口'] || row.values['兴趣点'] || row.key}`);
    // Keep the host's table/source-edit click handlers away from this reading-mode action.
    for (const type of ['pointerdown', 'mousedown', 'dblclick']) add.addEventListener(type, event => event.stopPropagation());
    add.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      new LightAnnotationModal(this.plugin, this.path, table, row, field).open();
    });
    cell.append(add);
  }
  choice(cell, table, row, field, values) {
    const doc = cell.ownerDocument;
    const select = element(doc, 'select', 'arcpunk-light-select');
    select.setAttribute('aria-label', `${field}：${row.values['材料与原文入口'] || row.values['资料与原文入口'] || row.key}`);
    for (const value of values) {
      const option = element(doc, 'option', '', value || '未选择');
      option.value = value; select.append(option);
    }
    const prior = row.values[field];
    if (!values.includes(prior)) {
      const option = element(doc, 'option', '', `原值：${prior}`);
      option.value = prior; option.disabled = true; select.append(option);
    }
    select.value = prior;
    select.addEventListener('change', async () => {
      select.disabled = true;
      try { await this.plugin.setLightChoice(this.path, table.key, row, field, select.value); }
      catch (err) { select.value = prior; new Notice(errorText(err)); }
      finally { select.disabled = false; void this.refresh(); }
    });
    cell.append(select);
  }
  checkbox(cell, table, row) {
    const doc = cell.ownerDocument;
    const input = element(doc, 'input', 'arcpunk-light-check');
    input.type = 'checkbox';
    input.setAttribute('aria-label', `待反刍：${row.values['材料与原文入口']}`);
    input.checked = row.values['待反刍'] === '是';
    if (!['', '是', '否'].includes(row.values['待反刍'])) {
      input.disabled = true;
      cell.append(element(doc, 'span', 'arcpunk-light-original', `原值：${row.values['待反刍']}`));
    }
    input.addEventListener('change', async () => {
      input.disabled = true;
      try { await this.plugin.setLightChoice(this.path, table.key, row, '待反刍', input.checked ? '是' : ''); }
      catch (err) { input.checked = row.values['待反刍'] === '是'; new Notice(errorText(err)); }
      finally { input.disabled = false; void this.refresh(); }
    });
    cell.append(input);
  }
  onunload() {
    this.disposed = true; this.revision++;
    this.plugin.lightChildren.delete(this);
    this.sourceTable.hidden = false;
    delete this.sourceTable.dataset.arcpunkLightMounted;
    if (this.sourceTable.parentElement === this.containerEl && this.containerEl.parentElement) this.containerEl.replaceWith(this.sourceTable);
  }
}

function registerLightTables(plugin) {
  plugin.registerMarkdownPostProcessor(async (el, ctx) => {
    if (!plugin.enabled || !__arcpunkLight.kindFor(ctx.sourcePath) || el.closest(`.${MOUNT_CLASS}`) || el.closest('.arcpunk-light-slot') || el.closest('.markdown-source-view')) return;
    const candidates = [];
    if (el.matches('table')) candidates.push(el);
    candidates.push(...el.querySelectorAll('table'));
    const tables = candidates.filter(table => !table.dataset.arcpunkLightMounted && !table.dataset.arcpunkLightPending && !table.parentElement?.closest('table') && !table.closest('.arcpunk-light-slot') && !table.closest('.markdown-embed'));
    if (!tables.length) return;
    for (const table of tables) table.dataset.arcpunkLightPending = 'true';
    try {
      const path = ctx.sourcePath;
      const markdown = await plugin.app.vault.read(plugin.getLightFile(path));
      const parsed = __arcpunkLight.parseTables(markdown, path);
      const claimed = new Set();
      for (const table of tables) {
        if (!plugin.enabled) return;
        const headers = [...(table.querySelector('tr')?.children || [])].map(cell => cell.textContent.trim());
        const headerKey = JSON.stringify(headers);
        const sameHeaders = parsed.filter(item => JSON.stringify(item.headers) === headerKey);
        if (!sameHeaders.length) continue;
        const range = archiveSectionRange(markdown, typeof ctx.getSectionInfo === 'function' ? ctx.getSectionInfo(table) : null);
        let matches = range ? sameHeaders.filter(item => item.start < range.end && item.end > range.start) : [];
        if (matches.length !== 1) {
          // Relative embed/section offsets never justify guessing a row. Compare
          // the host-rendered table, including link destinations and every cell.
          matches = [];
          const owner = new Component(); owner.load();
          try {
            const expected = zoneTableSignature(table);
            for (const item of sameHeaders) {
              const parent = element(table.ownerDocument, 'div', MOUNT_CLASS);
              const temporary = element(table.ownerDocument, 'div'); parent.append(temporary);
              await MarkdownRenderer.render(plugin.app, markdown.slice(item.start, item.end), temporary, path, owner);
              const rendered = [...temporary.querySelectorAll('table')].filter(candidate => !candidate.parentElement?.closest('table'));
              if (rendered.length === 1 && zoneTableSignature(rendered[0]) === expected) matches.push(item);
            }
          } finally { owner.unload(); }
        }
        if (matches.length !== 1 || claimed.has(matches[0].key) || parsed.filter(item => item.key === matches[0].key).length !== 1) continue;
        const selected = matches[0];
        claimed.add(selected.key);
        table.dataset.arcpunkLightMounted = 'true';
        const slot = element(el.ownerDocument, 'div', 'arcpunk-light-slot');
        const mount = element(el.ownerDocument, 'div', `${MOUNT_CLASS} arcpunk-light-ui`);
        mount.dataset.sourcePath = path; mount.hidden = true;
        table.replaceWith(slot); slot.append(table, mount);
        const child = new LightTableChild(slot, mount, table, plugin, path, selected.key);
        plugin.lightChildren.add(child); ctx.addChild(child);
      }
    } catch (_) {
      for (const table of tables) if (!table.dataset.arcpunkLightMounted) table.hidden = false;
    } finally {
      for (const table of tables) delete table.dataset.arcpunkLightPending;
    }
  }, 100);
}

module.exports = class ArcPunkTodoPlugin extends Plugin {
  onload() {
    this.enabled = true;
    this.taskChildren = new Set();
    this.archiveChildren = new Set();
    this.archiveGuards = new Set();
    this.zoneChildren = new Set();
    this.lightChildren = new Set();
    registerLightTables(this);
    this.zoneVersions = new Map();
    this.addCommand({ id: 'show-unaccepted-cognition', name: '查看认知选否条目',
      callback: () => new UnacceptedCognitionModal(this.app).open() });
    const bumpBoard = (path) => {
      if (ZONE_PATHS.has(path)) this.zoneVersions.set(path, (this.zoneVersions.get(path) || 0) + 1);
    };
    this.registerEvent(this.app.vault.on('modify', (file) => bumpBoard(file.path)));
    this.registerEvent(this.app.vault.on('delete', (file) => bumpBoard(file.path)));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => { bumpBoard(oldPath); bumpBoard(file.path); }));
    this.viewGroups = new WeakMap();
    this.pendingUndo = new Map();
    this.registerMarkdownPostProcessor((el, ctx) => {
      if (!this.enabled || !allowed(ctx.sourcePath) || el.closest(`.${MOUNT_CLASS}`) || el.closest('.arcpunk-todo-slot') || el.closest('.markdown-source-view')) return;
      const candidates = [];
      if (el.matches('ul.contains-task-list')) candidates.push(el);
      candidates.push(...el.querySelectorAll('ul.contains-task-list'));
      const lists = candidates.filter((candidate) => !candidate.dataset.arcpunkTodoMounted && !candidate.parentElement?.closest('ul.contains-task-list') && !candidate.closest('.arcpunk-todo-slot'));
      for (const list of lists) {
        list.dataset.arcpunkTodoMounted = 'true';
        const slot = element(el.ownerDocument, 'div', 'arcpunk-todo-slot');
        const mount = element(el.ownerDocument, 'div', MOUNT_CLASS);
        mount.dataset.sourcePath = ctx.sourcePath;
        mount.hidden = true;
        list.replaceWith(slot);
        slot.append(list, mount);
        list.hidden = true;
        const child = new TaskListChild(slot, mount, list, this, ctx.sourcePath);
        this.taskChildren.add(child);
        ctx.addChild(child);
      }
    }, 100);
    this.registerMarkdownPostProcessor(async (el, ctx) => {
      if (!this.enabled || !archiveAllowed(ctx.sourcePath) || el.closest(`.${MOUNT_CLASS}`) || el.closest('.arcpunk-todo-archive-slot') || el.closest('.markdown-source-view')) return;
      const candidates = [];
      if (el.matches('ul')) candidates.push(el);
      candidates.push(...el.querySelectorAll('ul'));
      const lists = candidates.filter((list) => !list.dataset.arcpunkTodoArchiveMounted && !list.dataset.arcpunkTodoArchivePending && !list.parentElement?.closest('ul') && !list.closest('.arcpunk-todo-archive-slot'));
      if (!lists.length) return;
      for (const list of lists) {
        list.dataset.arcpunkTodoArchivePending = 'true';
        if (!list.dataset.arcpunkTodoArchiveGuarded) {
          list.dataset.arcpunkTodoArchiveGuarded = 'true';
          const guard = new ArchiveCheckboxGuard(list, this);
          this.archiveGuards.add(guard);
          ctx.addChild(guard);
        }
      }
      try {
        const file = this.getArchiveFile(ctx.sourcePath);
        const markdown = await this.app.vault.read(file);
        if (!this.enabled) return;
        const records = core.parseArchiveRecords(markdown);
        const claimed = new Set();
        for (const list of lists) {
          const range = archiveSectionRange(markdown, typeof ctx.getSectionInfo === 'function' ? ctx.getSectionInfo(list) : null);
          if (!range) continue;
          let selected = records.filter((record) => record.start < range.end && record.end > range.start);
          const taskList = list.matches('ul.contains-task-list');
          // CommonMark may merge legacy metadata and a following [x] task into one UL.
          // A task-list UL must retain every overlapping archive record, including headings.
          if (!taskList) selected = selected.filter((record) => !!record.heading);
          if (!selected.length || (!taskList && selected.length !== 1)) continue;
          // Never merge ambiguous archive titles or label non-completed native states as done.
          if (selected.some((record) => record.state !== 'x' || records.filter((other) => other.key === record.key).length !== 1)) {
            for (const input of list.querySelectorAll('input[type="checkbox"]')) input.disabled = true;
            continue;
          }
          if (selected.some((record) => claimed.has(record.key))) continue;
          for (const record of selected) claimed.add(record.key);
          list.dataset.arcpunkTodoArchiveMounted = 'true';
          const slot = element(el.ownerDocument, 'div', 'arcpunk-todo-archive-slot');
          const mount = element(el.ownerDocument, 'div', `${MOUNT_CLASS} arcpunk-todo-archive-ui`);
          mount.dataset.sourcePath = ctx.sourcePath;
          list.replaceWith(slot);
          slot.append(list, mount);
          list.hidden = true;
          const child = new ArchiveRenderChild(slot, mount, list, this, ctx.sourcePath, selected.map((record) => record.key));
          this.archiveChildren.add(child);
          ctx.addChild(child);
        }
      } catch (_) {
        // Unmapped/temporarily incomplete source remains readable as native Markdown.
        for (const list of lists) if (!list.dataset.arcpunkTodoArchiveMounted) list.hidden = false;
      } finally {
        for (const list of lists) delete list.dataset.arcpunkTodoArchivePending;
      }
    }, 100);
    this.registerMarkdownPostProcessor(async (el, ctx) => {
      if (!this.enabled || el.closest(`.${MOUNT_CLASS}`) || el.closest('.arcpunk-zone-slot') || el.closest('.markdown-source-view')) return;
      const candidates = [];
      if (el.matches('table')) candidates.push(el);
      candidates.push(...el.querySelectorAll('table'));
      const tables = candidates.filter((table) => !table.dataset.arcpunkZoneMounted && !table.dataset.arcpunkZonePending && !table.parentElement?.closest('table') && !table.closest('.arcpunk-zone-slot') && zoneTableSource(table, ctx.sourcePath));
      if (candidates.length) zoneDebug('candidates', { sourcePath: ctx.sourcePath, elTag: el.tagName, native: candidates.length, zone: tables.length, excluded: candidates.filter((table) => !tables.includes(table)).map((table) => { const row = table.querySelector('tr'); return row ? [...row.children].map((cell) => cell.textContent.trim()).join('|') : '(no row)'; }) });
      if (!tables.length) return;
      for (const table of tables) table.dataset.arcpunkZonePending = 'true';
      try {
        const sources = new Map();
        const claimed = new Set();
        const headersFor = (table) => {
          const first = table.querySelector('tr');
          return first ? [...first.children].map((cell) => cell.textContent.trim()) : [];
        };
        const headingAbove = (table) => {
          const headings = [...el.querySelectorAll('h1, h2, h3')].filter((heading) => (heading.compareDocumentPosition(table) & 4) !== 0);
          return headings.length ? headings[headings.length - 1].textContent.trim() : '';
        };
        for (const table of tables) {
          const sourcePath = zoneTableSource(table, ctx.sourcePath);
          if (!sourcePath) continue;
          if (!sources.has(sourcePath)) {
            const markdown = await this.app.vault.read(this.getZoneFile(sourcePath));
            sources.set(sourcePath, { markdown, parsed: zones.parseBoards(markdown, sourcePath) });
          }
          if (!this.enabled) return;
          const { markdown, parsed } = sources.get(sourcePath);
          const headerKey = JSON.stringify(headersFor(table));
          const readonly = ZONE_PATHS.get(sourcePath).archived;
          let matches;
          if (readonly) {
            matches = await matchReadonlyZoneTable(this.app, markdown, sourcePath, table, parsed);
            if (!this.enabled) return;
          } else {
            const info = typeof ctx.getSectionInfo === 'function' ? ctx.getSectionInfo(table) : null;
            const range = archiveSectionRange(markdown, info);
            zoneDebug('table', {
              sourcePath,
              headerKey,
              info: info ? {
                lineStart: info.lineStart,
                lineEnd: info.lineEnd,
                textLength: typeof info.text === 'string' ? info.text.length : -1,
                textIsWholeDoc: typeof info.text === 'string' ? info.text.replace(/\r\n|\r/g, '\n').trim() === markdown.replace(/\r\n|\r/g, '\n').trim() : null,
              } : null,
              range,
            });
            matches = range ? parsed.filter((item) => item.start < range.end && item.end > range.start && JSON.stringify(item.headers) === headerKey) : [];
            if (!matches.length) {
              // 宿主没给出可用区间、或表头对不上时，用本块前面最近的标题兜底定位。
              const heading = headingAbove(table);
              const byHeading = heading ? parsed.filter((item) => item.category === heading) : [];
              zoneDebug('match-fallback', {
                sourcePath,
                headerKey,
                heading,
                byHeading: byHeading.map((item) => [item.category, item.headers.length, item.rows.length]),
                headersSeen: parsed.map((item) => JSON.stringify(item.headers) === headerKey),
                categories: parsed.map((item) => item.category),
              });
              if (byHeading.length === 1) matches = byHeading;
            }
            if (!matches.length) { zoneDebug('skip:no-match', { sourcePath, headerKey, headerCounts: parsed.map((item) => item.headers.length) }); continue; }
          }
          const available = matches.filter((item) => !claimed.has(item));
          // Some host sections contain several tables. Only use their native order when
          // every matching source table is represented in this same DOM section.
          const nativeCount = tables.filter((other) => zoneTableSource(other, ctx.sourcePath) === sourcePath && JSON.stringify(headersFor(other)) === headerKey).length;
          if (!available.length || (matches.length > 1 && nativeCount !== matches.length)) {
            zoneDebug('skip:count', { sourcePath, headerKey, matches: matches.length, available: available.length, nativeCount });
            continue;
          }
          const selected = available[0];
          if (!selected.rows.length || parsed.filter((item) => item.key === selected.key).length !== 1) {
            zoneDebug('skip:rows', { sourcePath, headerKey, category: selected.category, rows: selected.rows.length, keyCount: parsed.filter((item) => item.key === selected.key).length });
            continue;
          }
          claimed.add(selected);
          table.dataset.arcpunkZoneMounted = 'true';
          const slot = element(el.ownerDocument, 'div', 'arcpunk-zone-slot');
          const mount = element(el.ownerDocument, 'div', `${MOUNT_CLASS} arcpunk-zones-ui`);
          mount.dataset.sourcePath = sourcePath;
          mount.hidden = true;
          table.replaceWith(slot);
          slot.append(table, mount);
          const child = new ZoneTableChild(slot, mount, table, this, sourcePath, selected.key);
          this.zoneChildren.add(child);
          ctx.addChild(child);
        }
      } catch (_) {
        // Missing sources or uncertain source ranges retain the actual native table.
        zoneDebug('post-processor-error', { sourcePath: ctx.sourcePath, error: _ && _.message, stack: _ && String(_.stack || '').slice(0, 600) });
        for (const table of tables) if (!table.dataset.arcpunkZoneMounted) table.hidden = false;
      } finally {
        for (const table of tables) delete table.dataset.arcpunkZonePending;
      }
    }, 100);
  }

  getLightFile(path) {
    if (!this.enabled || !__arcpunkLight.kindFor(path)) throw Error('此处不是可操作的资料看板');
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.path !== path) throw Error('看板文件已变更，请重新打开');
    return file;
  }
  async setLightChoice(path, tableKey, row, field, value) {
    const file = this.getLightFile(path);
    let result;
    await this.app.vault.process(file, current => {
      this.getLightFile(path);
      result = __arcpunkLight.setCell(current, path, tableKey, row.key, field, value, row.raw);
      return result.text;
    });
    const persisted = await this.app.vault.read(file);
    const check = __arcpunkLight.parseTables(persisted, path).filter(t => t.key === tableKey).flatMap(t => t.rows).filter(r => r.key === row.key);
    if (check.length !== 1 || check[0].values[field] !== value) throw Error('保存后出现更新，请刷新核对当前值');
    return result;
  }

  async appendLightAnnotation(path, tableKey, row, field, content) {
    const file = this.getLightFile(path);
    let result;
    await this.app.vault.process(file, current => {
      this.getLightFile(path);
      // Time is the real write attempt in Asia/Shanghai, never the material's content date.
      result = __arcpunkLight.appendAnnotation(current, path, tableKey, row.key, field, content, core.nowLocal(), row.raw);
      return result.text;
    });
    const persisted = await this.app.vault.read(file);
    const check = __arcpunkLight.parseTables(persisted, path).filter(table => table.key === tableKey)
      .flatMap(table => table.rows).filter(current => current.key === row.key);
    const cell = check.length === 1 ? check[0].ranges[check[0].headers.indexOf(field)] : null;
    if (!cell || !cell.raw.includes(result.appended)) throw Error('保存后未能确认批注仍在；输入已保留，请先核对原文，勿重复提交');
    return result;
  }

  getZoneFile(path, write = false) {
    const spec = ZONE_PATHS.get(path);
    if (!this.enabled || !spec || (write && spec.archived)) throw new Error('仅允许在当前信息块或灵感看板选择，归档只读');
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.path !== path) throw new Error('看板文件已变更，请重新打开');
    return file;
  }

  resolveZoneTarget(path, row) {
    this.getZoneFile(path);
    if (!row.link || !row.link.path) throw new Error('原信息块链接缺失，请查看原表');
    const file = this.app.metadataCache.getFirstLinkpathDest(row.link.path, path);
    if (!(file instanceof TFile) || !file.path.endsWith('.md')) throw new Error('原信息块文件缺失，请查看原表');
    return file;
  }

  canWriteZoneTarget(path, row, targetPath) {
    const spec = ZONE_PATHS.get(path);
    if (!spec || spec.archived || !row.link?.fragment || typeof targetPath !== 'string') return false;
    if (spec.test) return targetPath === ZONE_TEST_BODY;
    if (!targetPath.startsWith(`${spec.dir}/`) || !targetPath.endsWith('.md')) return false;
    const name = targetPath.slice(spec.dir.length + 1);
    return !!name && !name.includes('/') && !name.includes('\\') && !/(?:raw|templates|看板|归档|核验_临时)/i.test(name) && !ZONE_PATHS.has(targetPath);
  }

  async setZoneChoice(path, row, field, value) {
    const file = this.getZoneFile(path, true);
    let result;
    await this.app.vault.process(file, (current) => {
      this.getZoneFile(path, true);
      result = zones.setChoice(current, row.key, field, value, row.raw);
      return result.text;
    });
    for (const child of this.zoneChildren) if (child.path === path) child.scheduleRefresh();
    return result;
  }

  async appendZoneDiscussion(path, row, target, entry) {
    const boardFile = this.getZoneFile(path, true);
    const version = this.zoneVersions.get(path) || 0;
    const stamp = { mtime: boardFile.stat?.mtime, size: boardFile.stat?.size };
    const assertBoardUnchanged = () => {
      const latest = this.getZoneFile(path, true);
      if ((this.zoneVersions.get(path) || 0) !== version || latest.stat?.mtime !== stamp.mtime || latest.stat?.size !== stamp.size) {
        throw new Error('原看板刚被修改或条目已移走，请核对后重新打开讨论');
      }
    };
    const board = await this.app.vault.read(boardFile);
    assertBoardUnchanged();
    const rows = zones.parseBoards(board, path).filter((table) => !table.archived).flatMap((table) => table.rows).filter((item) => item.key === row.key);
    if (rows.length !== 1) throw new Error('原条目已变更或不唯一，请重新打开讨论');
    const file = this.resolveZoneTarget(path, rows[0]);
    if (file.path !== target.path || !this.canWriteZoneTarget(path, rows[0], file.path)) throw new Error('仅允许追加到本区原信息块正文，不能写入raw、看板或归档');
    let result;
    await this.app.vault.process(file, (current) => {
      assertBoardUnchanged();
      if (!this.canWriteZoneTarget(path, rows[0], file.path)) throw new Error('讨论目标不可写');
      result = zones.appendDiscussion(current, row.link.fragment, entry, target.block.raw);
      return result.text;
    });
    for (const child of this.zoneChildren) if (child.bodyPaths.has(file.path)) child.scheduleRefresh();
    new Notice('已追加讨论');
    return result;
  }

  attachToPreview(child) {
    const preview = child.containerEl.closest('.markdown-preview-view');
    if (!preview || child.containerEl.closest('.markdown-source-view')) return false;
    let paths = this.viewGroups.get(preview);
    if (!paths) { paths = new Map(); this.viewGroups.set(preview, paths); }
    let group = paths.get(child.path);
    if (!group) { group = { preview, members: new Set() }; paths.set(child.path, group); }
    child.viewGroup = group;
    group.members.add(child);
    this.reconcilePreview(group);
    return true;
  }

  reconcilePreview(group) {
    const members = [...group.members].filter((child) => !child.disposed && child.containerEl.closest('.markdown-preview-view') === group.preview);
    members.sort((a, b) => {
      if (a === b) return 0;
      if (typeof a.containerEl.compareDocumentPosition !== 'function') return 0;
      return a.containerEl.compareDocumentPosition(b.containerEl) & 4 ? -1 : 1;
    });
    const leader = this.enabled ? members[0] : null;
    for (const child of group.members) child.setLeader(child === leader);
  }

  detachFromPreview(child) {
    const group = child.viewGroup;
    if (!group) return;
    group.members.delete(child);
    child.viewGroup = null;
    this.reconcilePreview(group);
  }

  getFile(path) {
    if (!this.enabled || !allowed(path)) throw new Error('仅允许操作总待办或工作区根的待办事项.md');
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.path !== path) throw new Error('待办文件已变更，请重新打开清单');
    return file;
  }

  getArchiveFile(path) {
    if (!this.enabled || !archiveAllowed(path)) throw new Error('仅允许读取总待办或工作区同目录的待办归档');
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.path !== path) throw new Error('归档文件已变更，请重新打开');
    return file;
  }

  refreshPath(path) {
    for (const child of this.taskChildren) if (child.path === path) child.scheduleRefresh();
  }

  async updateTask(path, task, patch) {
    const file = this.getFile(path);
    let result;
    await this.app.vault.process(file, (current) => {
      this.getFile(path);
      result = core.mutateTask(current, task.key, patch, task.block);
      return result.text;
    });
    if (patch.state === 'x' || patch.state === '-') {
      const record = { path, key: task.key, title: task.title, before: result.before, after: result.after,
        message: patch.state === 'x' ? '已完成' : '已舍弃', undone: false, pending: false };
      this.pendingUndo.set(path, record);
      this.showUndo(record);
    }
    this.refreshPath(path);
    return result;
  }

  async appendProgress(path, task, entry) {
    const file = this.getFile(path);
    let result;
    await this.app.vault.process(file, (current) => {
      this.getFile(path);
      result = core.appendProgress(current, task.key, entry, task.block);
      return result.text;
    });
    this.refreshPath(path);
    new Notice('已追加进度');
    return result;
  }

  showUndo(record) {
    const doc = globalThis.document;
    const fragment = doc.createDocumentFragment();
    const content = element(doc, 'span', 'arcpunk-todo-notice');
    const undo = button(doc, '撤销', 'arcpunk-todo-undo');
    content.append(element(doc, 'span', '', `${record.message}：${record.title}`), undo);
    fragment.append(content);
    const notice = new Notice(fragment, 12000);
    undo.addEventListener('click', async () => {
      undo.disabled = true;
      try { await this.undoTask(record); notice.hide(); }
      catch (err) { new Notice(errorText(err)); undo.disabled = false; }
    });
  }

  async undoTask(record) {
    if (record.undone || record.pending) return;
    const file = this.getFile(record.path);
    record.pending = true;
    try {
      await this.app.vault.process(file, (current) => {
        this.getFile(record.path);
        return core.restoreTask(current, record.key, record.after, record.before);
      });
      record.undone = true;
      if (this.pendingUndo.get(record.path) === record) this.pendingUndo.delete(record.path);
      this.refreshPath(record.path);
      new Notice('已撤销');
    } finally {
      record.pending = false;
    }
  }

  onunload() {
    this.enabled = false;
    for (const child of [...this.taskChildren]) child.unload();
    for (const child of [...this.archiveChildren]) child.unload();
    for (const child of [...this.archiveGuards]) child.unload();
    for (const child of [...this.zoneChildren]) child.unload();
    for (const child of [...this.lightChildren]) child.unload();
    this.taskChildren.clear();
    this.archiveChildren.clear();
    this.archiveGuards.clear();
    this.zoneChildren.clear();
    this.lightChildren.clear();
    this.zoneVersions.clear();
    this.pendingUndo.clear();
    // Public preview API restores native Markdown from the actual file, not an old DOM snapshot.
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      if (view instanceof MarkdownView && (allowed(view.file?.path) || archiveAllowed(view.file?.path) || ZONE_PATHS.has(view.file?.path) || __arcpunkLight.kindFor(view.file?.path))) view.previewMode.rerender(true);
    }
  }
};
