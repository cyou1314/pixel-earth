// Pure landmark-to-view mapping, shared with deterministic input checks.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class GestureInput {
  reset(){this.previous=null;this.pinch=null;}
  constructor(){this.reset();}
  update(points,view){
    if(!points||points.length!==21||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))){this.reset();return {mode:'missing'};}
    const width=distance(points[5],points[17]);
    if(width<.035){this.reset();return {mode:'missing'};}
    const ratio=distance(points[4],points[8])/width;
    if(ratio<(this.pinch ? .5 : .34)){
      if(!this.pinch)this.pinch={width,distance:view.distance};
      this.previous=null;
      return {mode:'pinch',distance:clamp(this.pinch.distance*this.pinch.width/width,1.65,6.8)};
    }
    this.pinch=null;
    // A finger counts as extended only when the tip is clearly beyond both the
    // PIP and the MCP joints: curled fingers hovering in front of the palm
    // otherwise read as extended and fight the fist-to-pause gesture.
    const extended=[[8,6,5],[12,10,9],[16,14,13],[20,18,17]].filter(([tip,pip,mcp])=>{
      const dTip=distance(points[tip],points[0]);
      return dTip>distance(points[pip],points[0])*1.12&&dTip>distance(points[mcp],points[0])*1.32;
    }).length;
    if(extended<3){this.previous=null;return{mode:'rest'};}
    const center={x:1-[0,5,9,13,17].reduce((s,i)=>s+points[i].x,0)/5,y:[0,5,9,13,17].reduce((s,i)=>s+points[i].y,0)/5};
    const previous=this.previous;this.previous=center;
    if(!previous)return {mode:'palm'};
    const dx=clamp(center.x-previous.x,-.08,.08),dy=clamp(center.y-previous.y,-.08,.08);
    return {mode:'palm',yaw:view.yaw+dx*3.8,pitch:clamp(view.pitch+dy*3.8,-1.45,1.45)};
  }
}
