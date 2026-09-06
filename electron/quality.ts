// Conservative technical assessment, not an aesthetic or subject-recognition model.
export function assessQuality(focus:number,exposure:number,noise:number,hasReliableEyes:boolean){
 const clamp=(v:number)=>Math.max(0,Math.min(1,v))
 const f=clamp(focus),e=clamp(exposure),n=clamp(noise)
 const combined=1+4*(f*.8+e*.12+(1-n)*.08)
 const score=Math.min(combined,1+4*f,hasReliableEyes?5:3)
 return {score:+score.toFixed(2),review:!hasReliableEyes||f<.65}
}
