export const safeNumber=(v,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f;};
export const safeStr=(v,f="")=>(v===null||v===undefined)?f:String(v);
export const pick=(obj,path,fb)=>{if(!obj||!path)return fb;const o=path.split(".").reduce((a,k)=>a?.[k],obj);return o===undefined||o===null?fb:o;};
export const toDate=(v)=>{if(!v)return null;try{if(typeof v?.toDate==="function")return v.toDate();if(v?.seconds!=null)return new Date(v.seconds*1000);if(v instanceof Date)return v;if(typeof v==="number")return new Date(v);return null;}catch{return null;}};
