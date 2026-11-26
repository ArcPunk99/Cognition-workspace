window.__ModuleLoader__.load({
 id:'personal-workspace-native',
 factory:()=>({
  inject:['sessions','uiWorkspace'],
  apply(ctx){
   ctx.effect(()=>{
    const board='http://127.0.0.1:48732', protocol='personal-workspace-v1'
    const el=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text||''})
    const button=(text,handler)=>{const b=el('button',text);b.onclick=handler;return b}
    async function api(op,data={}) {
      const res=await fetch('api/personal-workspace',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...data})})
      if(!res.ok)throw Error('DSH 服务不可用 · '+res.status)
      const json=await res.json()
      if(!json.ok)throw Object.assign(Error(json.error),{errors:json.errors})
      return json.value
    }
    const opener=button('项目工作台',()=>open())
    opener.className='pn-launch'
    const style=el('style');style.textContent=`
      .pn-launch{position:fixed;right:16px;bottom:12px;z-index:440;padding:6px 12px}
      .pn-ui{font:14px/1.4 "Segoe UI","Microsoft YaHei",sans-serif;color:#24382f;background:#fafaf6}
      .pn-left,.pn-controls,.pn-wait{position:fixed;z-index:550;box-sizing:border-box}
      .pn-left{inset:var(--dsh-windows-titlebar-height,0px) 44% 0 0;display:flex;flex-direction:column;border-right:1px solid #cdd5ce}
      .pn-left iframe{flex:1;min-height:0;width:100%;border:0}.pn-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px}
      .pn-controls{top:var(--dsh-windows-titlebar-height,0px);right:0;width:44%;max-height:40vh;overflow:auto;border-bottom:1px solid #cdd5ce}
      .pn-ui button,.pn-ui select,.pn-ui input{font:inherit;color:#24382f;background:white;border:1px solid #bac8bd;border-radius:6px;padding:4px 8px}
      .pn-ui button{cursor:pointer}.pn-ui button:disabled{opacity:.5}.pn-ui details{padding:4px 10px}.pn-ui summary{cursor:pointer}
      .pn-wait{inset:calc(var(--pn-h,48px) + var(--dsh-windows-titlebar-height,0px)) 0 0 56%;display:grid;place-items:center;text-align:center}.pn-wait[hidden]{display:none}
      body:has(.pn-left) [class*="_centerCol"]{position:fixed!important;inset:calc(var(--pn-h,48px) + var(--dsh-windows-titlebar-height,0px)) 0 0 56%!important;width:44%!important;margin:0!important;min-width:0!important}
      body:has(.pn-left) .pn-launch{display:none}.pn-ui pre{white-space:pre-wrap}
      .pn-task{width:min(460px,90vw);max-height:82vh;border:1px solid #bac8bd;border-radius:12px;padding:20px}.pn-task::backdrop{background:#162b2259}.pn-task form,.pn-task label{display:grid;gap:5px}.pn-task form{gap:12px}.pn-task textarea{font:inherit;resize:vertical;padding:6px}.pn-task small,.pn-task [role=alert]{color:#993c24}.pn-task [aria-invalid=true]{outline:2px solid #a54632}.pn-task h2{margin:0 0 4px}
    `;document.head.append(style);document.body.append(opener)
    let shutdown
    function open(){
      if(shutdown)return
      let scope=null, sessions=[],selected='', epoch=0,busy=false, signature='',polling=false
      const left=el('section');left.className='pn-left pn-ui'
      const top=el('div');top.className='pn-bar'
      const msg=el('span','正在读取看板…');msg.setAttribute('role','status')
      const frame=el('iframe');frame.title='项目、任务与资料';frame.src=board+'/?native=1'
      const panel=el('aside');panel.className='pn-controls pn-ui'
      const toolbar=el('div');toolbar.className='pn-bar'
      const chooser=el('select');chooser.setAttribute('aria-label','当前范围的 DSH 会话')
      const cards=el('div'),form=el('form'),input=el('input')
      form.className='pn-bar';form.hidden=true;form.style.display='none';input.placeholder='本次讨论主题';input.maxLength=120
      const toggleForm=show=>{form.hidden=!show;form.style.display=show?'flex':'none';if(show)input.focus()}
      const fresh=button('＋ 新对话',()=>{input.value=scope?.title||'';toggleForm(true);input.select()})
      const submit=el('button','创建并进入');submit.type='submit'
      const cancel=button('取消',()=>toggleForm(false));cancel.type='button'
      form.append(input,submit,cancel)
      const wait=el('aside');wait.className='pn-wait pn-ui'
      const current=()=>Object.values(ctx.sessions.list.getSnapshot().byId||{}).find(s=>(s.retainedBy?.mainView||0)>0)?.id
      function sync(){
        wait.hidden=Boolean(scope?.key&&selected&&current()===selected)
        wait.textContent=scope?.key?'选择已有讨论，或点击「＋ 新对话」。':'请在看板中选择任务或 Markdown 文档。'
        fresh.disabled=!scope?.key||busy
      }
      async function enter(id,version=epoch){
        if(!id||version!==epoch)return
        await api('open',{key:scope.key,id})
        for(let n=0;n<25&&!ctx.sessions.list.getSnapshot().byId[id];n++){
          await ctx.sessions.refresh?.();await new Promise(resolve=>setTimeout(resolve,100))
        }
        if(version!==epoch)return
        ctx.uiWorkspace.openSession(id);selected=id;chooser.value=id;sessionStorage.setItem('pw-native:'+scope.key,id);signature='';sync();draw()
      }
      const act=async fn=>{if(busy)return;busy=true;sync();try{await fn()}catch(e){msg.textContent=e.message}finally{busy=false;sync()}}
      async function editTask(ref,child=false){
        const {draft,errors}=await api('task-draft',ref)
        if(scope?.key!==ref.key||selected!==ref.id)return
        const dialog=el('dialog');dialog.className='pn-ui pn-task';dialog.setAttribute('aria-label','从候选创建任务')
        const fields=el('form');fields.noValidate=true
        fields.append(el('h2',child?'创建子任务':'创建任务'),el('span','所属项目：'+scope.project+' · 以下字段均为必填'))
        if(child)fields.append(el('span','父任务：'+(scope.task||scope.source||'').split('/').at(-2)))
        const controls={},hints={}
        function showErrors(map){
          for(const key of Object.keys(controls)){hints[key].textContent=map[key]||'';controls[key].setAttribute('aria-invalid',String(Boolean(map[key])))}
          controls[Object.keys(map)[0]]?.focus()
        }
        for(const [key,title] of [['name','任务名称'],['intent','任务目的'],['goal','预期成果'],['context','来源与上下文'],['status','状态']]){
          const label=el('label',title)
          const input=el(key==='status'?'select':key==='name'?'input':'textarea')
          if(key==='status')for(const value of ['待推进','进行中','已完成'])input.add(new Option(value,value))
          if(key==='name')input.maxLength=80
          input.name=key;input.required=true;input.value=draft[key];input.setAttribute('aria-label',title)
          const hint=el('small');hint.id='pn-error-'+key;input.setAttribute('aria-describedby',hint.id)
          input.oninput=()=>{hint.textContent='';input.removeAttribute('aria-invalid')}
          controls[key]=input;hints[key]=hint;label.append(input,hint);fields.append(label)
        }
        const notice=el('span');notice.setAttribute('role','alert')
        const submit=el('button','确认创建'),cancel=button('取消',()=>dialog.close());cancel.type='button'
        const buttons=el('div');buttons.className='pn-bar';buttons.append(submit,cancel)
        fields.append(notice,buttons);dialog.append(fields);document.body.append(dialog)
        dialog.onclose=()=>dialog.remove();dialog.oncancel=e=>{if(submit.disabled)e.preventDefault()}
        dialog.showModal();showErrors(errors)
        fields.onsubmit=async e=>{
          e.preventDefault();if(submit.disabled)return
          const values=Object.fromEntries(new FormData(fields))
          submit.disabled=true;cancel.disabled=true;notice.textContent=''
          try{
            await api('decide',{...ref,action:'task',draft:values})
            dialog.close();msg.textContent='已创建任务：'+values.name.trim();await refresh()
            frame.contentWindow.postMessage({protocol,type:'refresh'},board)
          }catch(err){showErrors(err.errors||{});notice.textContent=err.message}
          finally{submit.disabled=false;cancel.disabled=false}
        }
      }
      function draw(){
        const active=sessions.find(s=>s.id===selected)
        const state=JSON.stringify([selected,sessions.map(s=>[s.id,s.title]),active?.cards])
        if(state===signature)return
        signature=state
        chooser.replaceChildren(new Option('选择讨论',''),...sessions.map(s=>new Option(s.title,s.id)));chooser.value=selected
        const expanded=new Set([...cards.querySelectorAll('details[open]')].map(d=>d.dataset.key))
        cards.replaceChildren()
        if(!active)return
        const block=(key,title)=>{const d=el('details');d.dataset.key=key;d.open=expanded.has(key);d.append(el('summary',title));cards.append(d);return d}
        block('sources','已注入 '+active.sources.length+' 份上下文').append(el('pre',active.sources.join('\n')))
        for(const c of active.cards.slice().reverse()){
          const labels={candidate:'候选',clarifying:'澄清中',accepted:'已转化',dismissed:'已取消'}
          const d=block(c.id,[(c.type==='completion'&&c.status==='dismissed'?'已选择继续聊':labels[c.status]),({completion:'结束任务建议',subtask:'子任务建议',knowledge:'认知里程碑'})[c.type],c.title].filter(Boolean).join(' · '))
          d.append(el('p',c.intent));if(c.context)d.append(el('p',c.context))
          const ref={id:active.id,key:scope.key,card:c.id}
          const evidence=el('pre')
          d.append(button('看原话',()=>act(async()=>{const rows=await api('sources',ref);evidence.textContent=rows.map(r=>'#'+r.seq+' '+r.text).join('\n')})),evidence)
          const actions=c.status==='dismissed'?[['恢复候选','undo-dismiss']]:c.status==='accepted'?[]:({completion:[['确认结束任务','complete'],['继续聊','dismiss']],subtask:[['创建子任务','task'],['暂不创建','dismiss']],knowledge:[['确认里程碑','milestone'],['取消候选','dismiss']],action:[['创建任务','task'],['取消候选','dismiss']]}[c.type] || [['创建任务','task'],['确认里程碑','milestone'],['取消候选','dismiss']])
          for(const [label,action] of actions)d.append(button(label,()=>act(async()=>{if(action==='task')return editTask(ref,c.type==='subtask');await api('decide',{...ref,action});await refresh();frame.contentWindow.postMessage({protocol,type:'refresh'},board)})))
          if(c.target)d.append(button('打开成果',()=>frame.contentWindow.postMessage({protocol,type:'open-target',key:scope.key,id:c.target.id},board)))
        }
      }
      async function refresh(){
        const key=scope?.key, version=epoch
        if(!key){sessions=[];draw();return}
        const result=await api('list',{key})
        if(version!==epoch)return
        sessions=result;draw()
      }
      form.onsubmit=e=>{e.preventDefault();const v=epoch,key=scope?.key,title=input.value.trim();if(!key||!title)return
        act(async()=>{const {id}=await api('create',{key,title});if(v!==epoch)return;toggleForm(false);await refresh();await enter(id,v);msg.textContent=title})}
      chooser.onchange=()=>{const id=chooser.value;if(id)act(()=>enter(id));else{selected='';draw();sync()}}
      const recycle=el('details');recycle.append(el('summary','任务回收站'));const bin=el('div');recycle.append(bin)
      recycle.ontoggle=()=>{if(recycle.open&&scope?.project){const project=scope.project;act(async()=>{const rows=await api('trash',{project});bin.replaceChildren();if(!rows.length)bin.append(el('span','回收站为空'));for(const r of rows)bin.append(button('恢复 '+r.title,()=>act(async()=>{await api('restore',{project,token:r.id});recycle.open=false;frame.contentWindow.postMessage({protocol,type:'refresh'},board)})))})}}
      const del=button('删除任务',()=>{if(!scope?.task)return;const {project,task}=scope;const confirm=button('移入回收站',()=>act(async()=>{await api('remove',{project,task});removal.replaceChildren();frame.contentWindow.postMessage({protocol,type:'task-removed',project},board)}));removal.replaceChildren(el('span','移除「'+task.split('/').at(-2)+'」及其资料？'),confirm,button('保留',()=>removal.replaceChildren()))})
      const removal=el('div')
      toolbar.append(chooser,fresh);panel.append(toolbar,form,cards)
      top.append(button('返回 DSH',()=>shutdown()),del,recycle,msg);left.append(top,removal,frame);document.body.append(left,panel,wait)
      const size=new ResizeObserver(()=>document.body.style.setProperty('--pn-h',panel.offsetHeight+'px'));size.observe(panel)
      const onMessage=async e=>{
        if(e.origin!==board||e.source!==frame.contentWindow||e.data?.protocol!==protocol)return
        const m=e.data
        if(m.type==='context'){
          frame.contentWindow.postMessage({protocol,type:'binding',key:m.key,room:selected||null},board)
          if(scope && scope.key===m.key && scope.project===m.project)return
          const v=++epoch;scope=m;selected='';sessions=[];signature='';toggleForm(false);removal.replaceChildren();recycle.open=false
          del.hidden=!m.task;recycle.hidden=!m.project;msg.textContent=m.title||'项目工作台';sync();draw()
          try{await refresh();if(epoch===v&&sessions.length){
            const last=sessionStorage.getItem('pw-native:'+m.key)
            await enter((sessions.find(s=>s.id===last)||sessions[0]).id,v)
          }}catch(err){msg.textContent=err.message}
        }else if(m.type==='trigger'&&m.key===scope?.key){
          if(!selected||current()!==selected){msg.textContent='请先创建或选择本次讨论';return}
          act(()=>api('trigger',{key:scope.key,id:selected,flow:m.flow,quote:m.quote}))
        }
      }
      window.addEventListener('message',onMessage)
      const interval=setInterval(async()=>{if(polling||!scope?.key||busy)return;polling=true;try{await refresh()}catch(e){msg.textContent=e.message}finally{polling=false}},1300)
      const off=ctx.sessions.list.subscribe(sync)
      sync();shutdown=()=>{epoch++;clearInterval(interval);off();size.disconnect();window.removeEventListener('message',onMessage);left.remove();panel.remove();wait.remove();document.body.style.removeProperty('--pn-h');shutdown=null}
    }
    if(location.hash==='#workbench')open()
    return ()=>{shutdown?.();opener.remove();style.remove()}
   },'personal-workspace: native conversations')
  }
 })
})

