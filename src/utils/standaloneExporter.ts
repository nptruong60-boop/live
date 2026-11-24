import type { StudioProject } from '../types/studio';

function safeJsonForHtmlScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Generates a self-contained, zero-editor-overhead standalone HTML desktop Live Player
 * containing the saved scenes and products baked in so staff can double-click and run
 * locally on Windows/Mac without loading the Canva editor.
 *
 * Also supports `?view=output` (and `&cam=1`) synced in real time via BroadcastChannel
 * so it can be paired directly with TikTok LIVE Studio / OBS Window Capture or local server.
 */
export function generateStandaloneLiveHtml(project: StudioProject): string {
  const embedded = safeJsonForHtmlScript({
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    activeSceneId: project.activeSceneId,
    scenes: project.scenes,
    products: project.products,
  });

  const safeTitle = (project.name || 'PocketLive Player')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="vi" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} — Live Player Siêu Nhẹ</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#0b0e14;color:#f4f4f5;height:100vh;display:flex;overflow:hidden}
    .stage-wrap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;background:#0b0e14;position:relative}
    .stage{position:relative;width:360px;height:640px;transform-origin:center center;overflow:hidden;border-radius:24px;border:2px solid rgba(255,255,255,0.14);background:#11151e;flex-shrink:0}
    .panel{width:356px;background:#11151e;border-left:1px solid rgba(255,255,255,0.1);padding:14px;display:flex;flex-direction:column;gap:12px;overflow-y:auto}
    .btn{padding:8px 11px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:#1b2230;color:#fff;font-size:12px;font-weight:700;cursor:pointer}
    .btn:hover{background:#263044}
    .btn-primary{background:#4f46e5;border-color:#6366f1}
    .btn-emerald{background:#059669;border-color:#10b981}
    .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .prod-item{width:100%;text-align:left;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:#0d1017;color:#fff;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px}
    .prod-item.active{border-color:#6366f1;background:rgba(79,70,229,0.2)}
    .el{position:absolute;transform-origin:center center}
    .glass{background:rgba(255,255,255,0.82);color:#18181b;border:1px solid rgba(255,255,255,0.9);box-shadow:0 8px 24px rgba(0,0,0,0.16);border-radius:16px}
    .dark-glass .glass{background:rgba(15,20,32,0.78);color:#fff;border-color:rgba(255,255,255,0.2)}
    .output-bar{position:fixed;top:12px;right:12px;z-index:90;display:none;gap:6px;background:rgba(13,16,23,0.9);border:1px solid rgba(255,255,255,0.15);padding:6px 10px;border-radius:12px;transition:opacity .25s}
    body.output-mode .panel{display:none}
    body.output-mode .stage-wrap{padding:0;background:transparent}
    body.output-mode .stage{border:0;border-radius:0}
    body.output-mode .output-bar{display:flex}
    body.clean .panel{display:none}
    body.clean .stage-wrap{padding:0;background:#000}
    body.clean .stage{border:0;border-radius:0}
    select{background:#161c28;color:#e4e4e7;border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:6px 8px;font-size:12px}
  </style>
</head>
<body>
  <div id="output-bar" class="output-bar">
    <button class="btn btn-emerald" id="out-cam-btn" onclick="toggleCam()">Bật Camera</button>
    <select id="out-cam-select" aria-label="Chọn Camera" onchange="switchCam(this.value)"></select>
    <button class="btn" onclick="toggleMirror()">Lật gương</button>
  </div>
  <main class="stage-wrap">
    <div id="stage" class="stage"></div>
  </main>
  <aside class="panel">
    <h1 style="font-size:15px;font-weight:800">${safeTitle}</h1>
    <p style="font-size:11px;color:#94a3b8;line-height:1.45">Bản Live Offline Siêu Nhẹ • Phím 1-9 đổi SP • 0 ẩn • F Flash Sale • ESC thoát Clean View</p>
    <div class="row">
      <button class="btn btn-emerald" id="cam-btn" onclick="toggleCam()">Bật Camera</button>
      <button class="btn btn-primary" onclick="openOutputPopup()">Mở Cửa Sổ Output 9:16</button>
      <button class="btn" onclick="document.body.classList.toggle('clean');fitStage()">Clean View</button>
    </div>
    <div class="row">
      <select id="cam-select" aria-label="Chọn Camera UVC" onchange="switchCam(this.value)" style="flex:1"></select>
      <button class="btn" onclick="toggleMirror()">Lật gương</button>
    </div>
    <div style="font-size:11px;font-weight:700;color:#cbd5e1;margin-top:4px">Chọn Scene đã lưu</div>
    <div id="scene-list" class="row"></div>
    <div style="font-size:11px;font-weight:700;color:#cbd5e1;margin-top:4px">Sản phẩm Live (Phím 1-9)</div>
    <div id="prod-list" style="display:flex;flex-direction:column;gap:6px"></div>
  </aside>
  <script>
    const PROJECT = ${embedded};
    const params = new URLSearchParams(window.location.search);
    const isOutputMode = params.get('view') === 'output';
    if(isOutputMode) document.body.classList.add('output-mode');

    let activeSceneId = PROJECT.activeSceneId || (PROJECT.scenes[0] && PROJECT.scenes[0].id);
    let activeProductId = PROJECT.products[0] ? PROJECT.products[0].id : null;
    let camStream = null;
    let camMirrored = true;
    let selectedDeviceId = '';

    const fmt = (n) => (Number(n)||0).toLocaleString('vi-VN') + 'đ';
    const esc = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pocketlive-offline-sync') : null;
    function broadcastState(){
      if(bc && !isOutputMode){
        bc.postMessage({ type:'STATE', activeSceneId, activeProductId });
      }
    }
    if(bc){
      bc.onmessage = (ev) => {
        const msg = ev.data || {};
        if(msg.type === 'STATE' && isOutputMode){
          activeSceneId = msg.activeSceneId;
          activeProductId = msg.activeProductId;
          renderStage();
        } else if(msg.type === 'CLAIM_CAM' && !isOutputMode && camStream){
          stopCam();
        }
      };
    }

    let ws = null;
    if(window.location.protocol.startsWith('http')){
      try{
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(proto + '//' + window.location.host + '/ws');
        ws.onmessage = (ev) => {
          try{
            const msg = JSON.parse(ev.data);
            if(msg.type === 'STATE'){
              activeSceneId = msg.activeSceneId;
              activeProductId = msg.activeProductId;
              renderControls();
              renderStage();
            }
          }catch(e){}
        };
      }catch(e){}
    }
    function syncRemote(){
      broadcastState();
      if(ws && ws.readyState === 1){
        ws.send(JSON.stringify({ type:'STATE', activeSceneId, activeProductId }));
      }
    }

    function openOutputPopup(){
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'output');
      url.searchParams.set('cam', '1');
      window.open(url.toString(), 'PocketLiveOutput', 'width=460,height=820');
    }

    function fitStage(){
      const st = document.getElementById('stage');
      const wrap = st.parentElement;
      const pad = (isOutputMode || document.body.classList.contains('clean')) ? 0 : 16;
      const scale = Math.min((wrap.clientWidth-pad)/360, (wrap.clientHeight-pad)/640);
      st.style.transform = 'scale(' + Math.max(0.25, scale) + ')';
    }

    async function refreshCameras(){
      if(!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      try{
        const list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
        const html = list.map((d,i)=>'<option value="'+esc(d.deviceId)+'">'+esc(d.label || ('Camera '+(i+1)))+'</option>').join('');
        ['cam-select','out-cam-select'].forEach(id => {
          const el = document.getElementById(id);
          if(el){ el.innerHTML = html || '<option value="">Camera mặc định</option>'; if(selectedDeviceId) el.value = selectedDeviceId; }
        });
      }catch(e){}
    }

    function stopCam(){
      if(camStream){ camStream.getTracks().forEach(t=>t.stop()); camStream=null; }
      updateCamButtons();
      renderStage();
    }

    function updateCamButtons(){
      const label = camStream ? 'Tắt Camera' : 'Bật Camera';
      const b1 = document.getElementById('cam-btn'); if(b1) b1.textContent = label;
      const b2 = document.getElementById('out-cam-btn'); if(b2) b2.textContent = label;
    }

    async function startCam(deviceId){
      if(isOutputMode && bc) bc.postMessage({ type:'CLAIM_CAM' });
      if(camStream){ camStream.getTracks().forEach(t=>t.stop()); camStream=null; }
      try{
        const constraints = deviceId ? { video:{ deviceId:{ exact:deviceId } }, audio:false } : { video:{ width:{ ideal:1080 }, height:{ ideal:1920 } }, audio:false };
        camStream = await navigator.mediaDevices.getUserMedia(constraints);
        await refreshCameras();
        updateCamButtons();
        renderStage();
      }catch(e){}
    }

    function toggleCam(){
      if(camStream) stopCam(); else startCam(selectedDeviceId);
    }
    function switchCam(id){
      selectedDeviceId = id;
      if(camStream) startCam(id);
    }
    function toggleMirror(){
      camMirrored = !camMirrored;
      renderStage();
    }

    function renderStage(){
      const scene = PROJECT.scenes.find(s=>s.id===activeSceneId) || PROJECT.scenes[0];
      const prod = PROJECT.products.find(p=>p.id===activeProductId);
      const st = document.getElementById('stage');
      if(!scene) return;
      st.className = 'stage ' + (scene.glassFinish==='dark' ? 'dark-glass' : '');
      if(isOutputMode && scene.backdrop === 'transparent'){
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
        st.style.background = 'transparent';
      } else {
        st.style.background = scene.backdrop==='chroma-green' ? '#00ff00' : scene.backdrop==='custom-color' ? scene.backdropColor : '#eef1f9';
      }
      const order = {background:0, midground:1, foreground:2};
      const els = [...scene.elements].filter(e=>e.visible).sort((a,b)=>(order[a.layer]-order[b.layer])||(a.zIndex-b.zIndex));
      const renderEl = (el) => {
        const style = 'left:'+el.x+'px;top:'+el.y+'px;width:'+el.width+'px;height:'+el.height+'px;opacity:'+el.opacity+';transform:rotate('+(el.rotation||0)+'deg)';
        if(el.kind==='image' && el.props.src){
          return '<div class="el" style="'+style+'"><img src="'+el.props.src+'" style="width:100%;height:100%;object-fit:'+(el.props.objectFit||'contain')+';border-radius:'+(el.props.borderRadius||0)+'px"/></div>';
        }
        if(el.kind==='header'){
          return '<div class="el" style="'+style+';text-align:center"><div class="glass" style="display:inline-block;padding:3px 10px;font-size:9px;font-weight:800">'+esc(el.props.shopName)+'</div><div style="font-size:20px;font-weight:900;margin-top:4px;color:'+scene.accentColor+'">'+esc(el.props.title)+'</div></div>';
        }
        if(el.kind==='voucher'){
          return '<div class="el glass" style="'+style+';padding:6px;text-align:center;display:flex;flex-direction:column;justify-content:center"><div style="font-size:8px;font-weight:800;opacity:.75">'+esc(el.props.topLabel)+'</div><div style="font-size:13px;font-weight:900;color:'+scene.accentColor+'">'+esc(el.props.mainValue)+'</div></div>';
        }
        if((el.kind==='product-spotlight'||el.kind==='product-pill'||el.kind==='product-shelf') && prod){
          return '<div class="el glass" style="'+style+';padding:8px;display:flex;flex-direction:column;justify-content:center"><div style="font-size:9px;font-weight:800;color:'+scene.accentColor+'">'+esc(prod.code)+'</div><div style="font-size:11px;font-weight:700">'+esc(prod.name)+'</div><div style="font-size:15px;font-weight:900;color:'+scene.accentColor+'">'+fmt(prod.livePrice)+'</div></div>';
        }
        if(el.kind==='text'){
          return '<div class="el" style="'+style+';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:'+(el.props.fontSize||14)+'px;color:'+(el.props.color||'#18181b')+'">'+esc(el.props.text)+'</div>';
        }
        if(el.kind==='trust-bar'){
          return '<div class="el glass" style="'+style+';display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;text-align:center;font-size:8.5px;font-weight:700"><span>'+esc(el.props.trust1)+'</span><span>'+esc(el.props.trust2)+'</span><span>'+esc(el.props.trust3)+'</span></div>';
        }
        return '';
      };
      const bgMid = els.filter(e=>e.layer!=='foreground').map(renderEl).join('');
      const fg = els.filter(e=>e.layer==='foreground').map(renderEl).join('');
      const mirrorCss = camMirrored ? 'transform:scaleX(-1);' : '';
      st.innerHTML = bgMid + '<video id="cam-vid" autoplay playsinline muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'+mirrorCss+'display:'+(camStream?'block':'none')+'"></video>' + fg;
      if(camStream){ const v=document.getElementById('cam-vid'); if(v) v.srcObject=camStream; }
    }

    function renderControls(){
      const sl = document.getElementById('scene-list');
      const pl = document.getElementById('prod-list');
      if(sl) sl.innerHTML = PROJECT.scenes.map(s=>'<button class="btn '+(s.id===activeSceneId?'btn-primary':'')+'" onclick="activeSceneId=\\''+s.id+'\\';syncRemote();renderControls();renderStage()">'+esc(s.name)+'</button>').join('');
      if(pl) pl.innerHTML = PROJECT.products.map((p,i)=>'<button class="prod-item '+(p.id===activeProductId?'active':'')+'" onclick="activeProductId=activeProductId===\\''+p.id+'\\'?null:\\''+p.id+'\\';syncRemote();renderControls();renderStage()"><span>['+(i+1)+'] '+esc(p.code)+' · '+esc(p.name.slice(0,22))+'</span><strong>'+fmt(p.livePrice)+'</strong></button>').join('');
    }

    if(isOutputMode){
      let hideT = null;
      const bar = document.getElementById('output-bar');
      const showBar = () => { if(bar) bar.style.opacity='1'; clearTimeout(hideT); hideT=setTimeout(()=>{ if(bar) bar.style.opacity='0'; }, 2500); };
      window.addEventListener('mousemove', showBar);
      showBar();
      if(params.get('cam') === '1') setTimeout(() => startCam(''), 250);
    }

    window.addEventListener('keydown', (e)=>{
      if(e.key==='Escape'){ document.body.classList.remove('clean'); fitStage(); }
      if(e.key>='1'&&e.key<='9'){ const p=PROJECT.products[Number(e.key)-1]; if(p){ activeProductId=p.id; syncRemote(); renderControls(); renderStage(); } }
      if(e.key==='0'){ activeProductId=null; syncRemote(); renderControls(); renderStage(); }
    });
    window.addEventListener('resize', fitStage);
    refreshCameras(); renderControls(); renderStage(); fitStage();
  </script>
</body>
</html>`;
}
