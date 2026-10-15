let scriptPromise;
async function closeHands(hands){try{await hands?.close();}catch{}}
function loadHands(){
  if(globalThis.Hands)return Promise.resolve();
  if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='./assets/hands/hands.js';
    script.onload=()=>globalThis.Hands?resolve():reject(new Error('Hands constructor unavailable'));
    script.onerror=()=>{script.remove();scriptPromise=null;reject(new Error('Hands script unavailable'));};
    document.head.append(script);
  });
  return scriptPromise;
}
export class HandCamera {
  phase='idle';generation=0;stream=null;hands=null;frame=0;pending=null;
  startingHands=null;initializing=null;settling=Promise.resolve();
  constructor(video,{onPoints,onStatus,onState,onError}){Object.assign(this,{video,onPoints,onStatus,onState,onError});}
  get active(){return this.phase!=='idle';}
  async start(){
    if(this.active)return;
    if(!navigator.mediaDevices?.getUserMedia){this.onError('当前窗口无法访问摄像头，请在独立浏览器标签页打开网页。');return;}
    const generation=++this.generation;
    this.phase='starting';this.onState(true);this.onStatus('等待摄像头授权…');
    let localHands;
    try{
      await this.settling;
      if(generation!==this.generation)return;
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:320},height:{ideal:240}}});
      if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return;}
      this.stream=stream;this.video.srcObject=stream;await this.video.play();
      if(generation!==this.generation)return;
      this.onStatus('正在准备手势识别，首次开启稍慢…');
      await loadHands();
      if(generation!==this.generation)return;
      localHands=new globalThis.Hands({locateFile:file=>new URL('./assets/hands/'+file,location.href).href});
      this.startingHands=localHands;
      localHands.setOptions({maxNumHands:1,modelComplexity:0,selfieMode:false,minDetectionConfidence:.65,minTrackingConfidence:.65});
      localHands.onResults(result=>{if(generation===this.generation&&this.phase==='running')this.onPoints(result.multiHandLandmarks?.[0]??null);});
      this.initializing=localHands.initialize();await this.initializing;
      if(generation!==this.generation)return;
      this.hands=localHands;this.startingHands=null;this.initializing=null;
      this.phase='running';this.onStatus('把一只手放进画面');
      let last=0;
      const tick=async now=>{
        if(generation!==this.generation||this.phase!=='running')return;
        if(now-last>=80&&this.video.readyState>=2&&!document.hidden){
          last=now;
          try{this.pending=this.hands.send({image:this.video});await this.pending;}
          catch(error){if(generation===this.generation){await this.stop();this.onError('手势识别暂时中断，请重新开启。');}return;}
          finally{this.pending=null;}
        }
        if(generation===this.generation&&this.phase==='running')this.frame=requestAnimationFrame(tick);
      };
      this.frame=requestAnimationFrame(tick);
    }catch(error){
      if(generation!==this.generation)return;
      await this.stop();
      const message=error.name==='NotAllowedError'?'摄像头未获授权。请允许访问，或在独立浏览器标签页打开后重试。':
        error.name==='NotFoundError'?'没有找到可用的摄像头。':error.name==='NotReadableError'?'摄像头正被其他应用占用，请关闭后重试。':'手势模型没有加载成功，请重新开启。';
      this.onError(message);
    }
  }
  async stop(){
    ++this.generation;this.phase='idle';cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    this.video.pause();this.video.srcObject=null;this.onState(false);
    const hands=this.hands??this.startingHands,initializing=this.initializing,pending=this.pending,previous=this.settling;
    this.hands=null;this.startingHands=null;this.initializing=null;
    this.settling=(async()=>{
      await previous;
      if(initializing)await initializing.catch(()=>{});
      if(pending)await pending.catch(()=>{});
      await closeHands(hands);
    })();
    await this.settling;
  }
}
