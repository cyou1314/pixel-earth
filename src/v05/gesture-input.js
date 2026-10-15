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
    const extended=[[8,6],[12,10],[16,14],[20,18]].filter(([tip,pip])=>distance(points[tip],points[0])>distance(points[pip],points[0])*1.12).length;
    if(extended<3){this.previous=null;return{mode:'rest'};}
    const center={x:1-[0,5,9,13,17].reduce((s,i)=>s+points[i].x,0)/5,y:[0,5,9,13,17].reduce((s,i)=>s+points[i].y,0)/5};
    const previous=this.previous;this.previous=center;
    if(!previous)return {mode:'palm'};
    const dx=clamp(center.x-previous.x,-.08,.08),dy=clamp(center.y-previous.y,-.08,.08);
    return {mode:'palm',yaw:view.yaw+dx*3.8,pitch:clamp(view.pitch+dy*3.8,-1.45,1.45)};
  }
}
