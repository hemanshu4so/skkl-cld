import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@fb/client";
import { collection, addDoc, deleteDoc, onSnapshot, query, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@app/providers/AuthProvider";
import { useToast } from "../../../hooks/useToast";
import { assertShopId } from "../../../lib/utils";
import { safeNumber } from "@shared/safe";
import { logActivity } from "../../../lib/activityLog";
import { PRESET_TEMPLATES, ELEMENT_TYPES, FIELD_KEYS, makeElement, newTemplate, pickDefaultBarcode } from "../../../lib/barcodeTemplate";
import SafePage from "@shared/safe/SafePage";
import TagCanvas from "../components/TagCanvas";

const SAMPLE = { id:"sample123", name:"Gold Chain 22K", sku:"SKKL-G-XYZ123", barcode:"SKKL-G-XYZ123", huid:"ABC123", category:"Gold", karat:"22K", weight:12.5, netWeight:12.0, stoneWeight:0.4, stoneCount:4, price:81250, mrp:89500 };
export default function BarcodeDesigner(){ return <SafePage title="Barcode Designer"><Inner/></SafePage>; }

function Inner(){
  const { userData, shopId, shopData } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const subRef = useRef(null);
  const [draft, setDraft] = useState(()=>newTemplate());
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [zoom, setZoom] = useState(2);

  useEffect(()=>{
    if(subRef.current){try{subRef.current();}catch{}subRef.current=null;}
    if(!shopId) return undefined;
    const u = onSnapshot(query(collection(db,"barcodeTemplates"),where("shopId","==",shopId)),
      (snap)=>{setTemplates(snap.docs.map(d=>({id:d.id,...d.data()})));setLoading(false);},
      (err)=>{console.warn("[barcodeTemplates]",err.message);setLoading(false);toast("Could not load templates","error");});
    subRef.current=u;
    return ()=>{ if(subRef.current){try{subRef.current();}catch{}subRef.current=null;} };
  },[shopId,toast]);

  const defaultTpl = useMemo(()=>pickDefaultBarcode(templates),[templates]);
  const selectedEl = useMemo(()=>(draft?.elements||[]).find(e=>e.id===selectedId)||null,[draft,selectedId]);

  const save = async () => {
    if(!assertShopId(shopId,toast,"BarcodeDesigner.save")) return;
    if(!draft.name){toast("Template name required","warn");return;}
    try{
      const data = { ...draft, shopId, updatedAt: serverTimestamp() };
      if(editingId){
        if(data.isDefault) await Promise.all(templates.filter(t=>t.id!==editingId&&t.isDefault).map(t=>updateDoc(doc(db,"barcodeTemplates",t.id),{isDefault:false})));
        await updateDoc(doc(db,"barcodeTemplates",editingId),data);
        await logActivity({shopId,action:"update",entity:"barcodeTemplate",entityId:editingId,uid:userData?.id,name:userData?.name});
        toast("Updated","success");
      } else {
        data.createdAt = serverTimestamp();
        if(data.isDefault) await Promise.all(templates.filter(t=>t.isDefault).map(t=>updateDoc(doc(db,"barcodeTemplates",t.id),{isDefault:false})));
        const r = await addDoc(collection(db,"barcodeTemplates"),data);
        setEditingId(r.id);
        await logActivity({shopId,action:"create",entity:"barcodeTemplate",entityId:r.id,uid:userData?.id,name:userData?.name,meta:{name:data.name}});
        toast("Saved","success");
      }
    } catch(err){ toast("Save failed: "+err.message,"error"); }
  };
  const remove = async (t) => {
    if(!window.confirm(`Delete template "${t.name}"?`)) return;
    await deleteDoc(doc(db,"barcodeTemplates",t.id));
    await logActivity({shopId,action:"delete",entity:"barcodeTemplate",entityId:t.id,uid:userData?.id,name:userData?.name});
    if(editingId===t.id){setEditingId(null);setDraft(newTemplate());}
    toast("Deleted","success");
  };
  const setDefault = async (t) => {
    await Promise.all(templates.filter(x=>x.id!==t.id&&x.isDefault).map(x=>updateDoc(doc(db,"barcodeTemplates",x.id),{isDefault:false})));
    await updateDoc(doc(db,"barcodeTemplates",t.id),{isDefault:true});
    toast("Default set","success");
  };
  const duplicate = (t) => { setEditingId(null); const c=JSON.parse(JSON.stringify(t)); delete c.id; c.name=(c.name||"Untitled")+" (copy)"; c.isDefault=false; setDraft(c); toast("Cloned","success"); };
  const upEl = (id,patch) => setDraft(d=>({...d,elements:d.elements.map(e=>e.id===id?{...e,...patch}:e)}));
  const rmEl = (id) => { setDraft(d=>({...d,elements:d.elements.filter(e=>e.id!==id)})); setSelectedId(null); };

  const F = ({label,value,onChange,suffix="mm",step=0.1}) => (
    <label style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,color:"#555",padding:"3px 0"}}>
      <span>{label}</span>
      <span style={{display:"flex",alignItems:"center",gap:4}}>
        <input type="number" step={step} value={Number.isFinite(Number(value))?value:0} onChange={e=>onChange(e.target.value)} style={{width:70,padding:4,border:"1px solid #ddd",borderRadius:4,fontSize:11}}/>
        <span style={{color:"#888"}}>{suffix}</span>
      </span>
    </label>
  );

  return (
    <div style={{padding:20,maxWidth:1400}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700,color:"#1a1a2e",margin:0}}>🏷 Barcode Designer</h1>
          <p style={{color:"#888",fontSize:12,margin:"4px 0 0"}}>{templates.length} saved · default: <strong>{defaultTpl?.name||"built-in"}</strong></p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <select onChange={e=>{const i=Number(e.target.value);if(i>=0){setEditingId(null);setDraft(newTemplate(PRESET_TEMPLATES[i]));setSelectedId(null);}}} value="" style={{padding:"8px 12px",borderRadius:8,border:"1.5px solid #ddd",fontSize:13,background:"#fff"}}>
            <option value="">+ Start from preset…</option>
            {PRESET_TEMPLATES.map((p,i)=><option key={p.name} value={i}>{p.name}</option>)}
          </select>
          <button onClick={()=>{setEditingId(null);setDraft(newTemplate({name:"Custom tag",dimensions:{widthMm:50,heightMm:25},printable:{x:1,y:1,w:48,h:23},features:{},thermal:{dpi:203},elements:[]}));setSelectedId(null);}} className="btn btn-secondary">+ Blank</button>
        </div>
      </div>
      {loading ? <div style={{padding:30,color:"#888"}}>Loading…</div> : (
        <div style={{display:"grid",gridTemplateColumns:"300px minmax(0,1fr) 320px",gap:14,alignItems:"start"}}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {!templates.length ? <div className="card p-3" style={{fontSize:12,color:"#666"}}><strong style={{color:"#1a1a2e"}}>Saved templates</strong><div style={{marginTop:8}}>None yet — pick a preset above.</div></div>
              : <div className="card" style={{overflow:"hidden"}}>
                <div style={{padding:"8px 12px",borderBottom:"1px solid #eee",fontSize:12,fontWeight:700}}>Saved templates</div>
                {templates.map(t=>(
                  <div key={t.id} style={{padding:"8px 12px",borderTop:"1px solid #f5f5f5",display:"flex",justifyContent:"space-between",alignItems:"center",background:editingId===t.id?"#FFFDE7":"#fff"}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:600}}>{t.name}</div>
                      <div style={{fontSize:10,color:"#888"}}>{safeNumber(t?.dimensions?.widthMm,0)} × {safeNumber(t?.dimensions?.heightMm,0)} mm{t.isDefault && <span style={{marginLeft:6,color:"#1B5E20",fontWeight:700}}>· default</span>}</div>
                    </div>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>{setEditingId(t.id);setDraft(JSON.parse(JSON.stringify(t)));setSelectedId(null);}} style={{padding:"3px 8px",fontSize:10,background:"#E3F2FD",color:"#1565C0",border:"none",borderRadius:4,cursor:"pointer"}}>edit</button>
                      <button onClick={()=>duplicate(t)} style={{padding:"3px 8px",fontSize:10,background:"#F5F5F5",color:"#555",border:"none",borderRadius:4,cursor:"pointer"}}>copy</button>
                      {!t.isDefault && <button onClick={()=>setDefault(t)} style={{padding:"3px 8px",fontSize:10,background:"#E8F5E9",color:"#1B5E20",border:"none",borderRadius:4,cursor:"pointer"}}>★</button>}
                      <button onClick={()=>remove(t)} style={{padding:"3px 8px",fontSize:10,background:"#FFEBEE",color:"#C62828",border:"none",borderRadius:4,cursor:"pointer"}}>×</button>
                    </div>
                  </div>
                ))}
              </div>}
            <div className="card p-3">
              <strong style={{color:"#1a1a2e",fontSize:12}}>Add element</strong>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:8}}>
                {Object.entries(ELEMENT_TYPES).map(([type,cfg])=>(
                  <button key={type} onClick={()=>{const el=makeElement(type);setDraft(d=>({...d,elements:[...(d.elements||[]),el]}));setSelectedId(el.id);}} style={{padding:"6px 8px",fontSize:11,fontWeight:600,background:"#fff",border:"1.5px solid #ddd",borderRadius:6,cursor:"pointer",textAlign:"left"}}>+ {cfg.label}</button>
                ))}
              </div>
            </div>
            <div className="card p-3">
              <strong style={{color:"#1a1a2e",fontSize:12}}>Tag dimensions &amp; calibration</strong>
              <div style={{marginTop:8,paddingBottom:8,borderBottom:"1px solid #eee"}}>
                <div style={{fontSize:10,color:"#888",textTransform:"uppercase",marginBottom:4}}>label</div>
                <F label="width" value={draft?.dimensions?.widthMm} onChange={v=>setDraft(d=>({...d,dimensions:{...d.dimensions,widthMm:safeNumber(v,0)}}))}/>
                <F label="height" value={draft?.dimensions?.heightMm} onChange={v=>setDraft(d=>({...d,dimensions:{...d.dimensions,heightMm:safeNumber(v,0)}}))}/>
              </div>
              <div style={{paddingTop:8,paddingBottom:8,borderBottom:"1px solid #eee"}}>
                <div style={{fontSize:10,color:"#888",textTransform:"uppercase",marginBottom:4}}>safe area</div>
                {["x","y","w","h"].map(k=><F key={k} label={k} value={draft?.printable?.[k]} onChange={v=>setDraft(d=>({...d,printable:{...d.printable,[k]:safeNumber(v,0)}}))}/>)}
              </div>
              <div style={{paddingTop:8,paddingBottom:8,borderBottom:"1px solid #eee"}}>
                <div style={{fontSize:10,color:"#888",textTransform:"uppercase",marginBottom:4}}>features</div>
                {["foldX","perforationX","holeX","holeY","holeR"].map(k=><F key={k} label={k} value={draft?.features?.[k]} onChange={v=>setDraft(d=>({...d,features:{...d.features,[k]:safeNumber(v,0)}}))}/>)}
              </div>
              <div style={{paddingTop:8}}>
                <div style={{fontSize:10,color:"#888",textTransform:"uppercase",marginBottom:4}}>thermal printer</div>
                <F label="DPI" value={draft?.thermal?.dpi} onChange={v=>setDraft(d=>({...d,thermal:{...d.thermal,dpi:safeNumber(v,0)}}))} suffix="dpi" step={1}/>
                <F label="density" value={draft?.thermal?.density} onChange={v=>setDraft(d=>({...d,thermal:{...d.thermal,density:safeNumber(v,0)}}))} suffix="" step={1}/>
                <F label="offset X" value={draft?.thermal?.offsetX} onChange={v=>setDraft(d=>({...d,thermal:{...d.thermal,offsetX:safeNumber(v,0)}}))}/>
                <F label="offset Y" value={draft?.thermal?.offsetY} onChange={v=>setDraft(d=>({...d,thermal:{...d.thermal,offsetY:safeNumber(v,0)}}))}/>
              </div>
            </div>
          </div>
          <div className="card p-3" style={{background:"#f1f3f5"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <strong style={{fontSize:13,color:"#1a1a2e"}}>Live preview</strong>
                <span style={{fontSize:11,color:"#666"}}>{safeNumber(draft?.dimensions?.widthMm,0)} × {safeNumber(draft?.dimensions?.heightMm,0)} mm</span>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span style={{fontSize:11}}>zoom</span>
                {[1,1.5,2,3,4].map(z=><button key={z} onClick={()=>setZoom(z)} style={{padding:"3px 8px",fontSize:11,borderRadius:4,border:"1px solid",cursor:"pointer",borderColor:zoom===z?"#1a1a2e":"#ccc",background:zoom===z?"#1a1a2e":"#fff",color:zoom===z?"#fff":"#333"}}>{z}×</button>)}
                <button onClick={()=>window.print()} className="btn btn-secondary" style={{padding:"4px 10px",fontSize:11}}>🖨️ Test print</button>
              </div>
            </div>
            <div id="printArea" style={{display:"flex",justifyContent:"center",padding:20,background:"#fff",borderRadius:6,overflowX:"auto"}}>
              <TagCanvas
                template={draft}
                item={SAMPLE}
                zoom={zoom}
                onSelect={(id)=>setSelectedId(id)}
              />
            </div>
            <style>{`@media print { body * { visibility: hidden; } #printArea, #printArea * { visibility: visible; } #printArea { position: absolute; left: 0; top: 0; } }`}</style>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:10,gap:8,flexWrap:"wrap"}}>
              <div style={{fontSize:11,color:"#888"}}>Click any element on the canvas to edit it →{selectedEl && <span> Editing <strong style={{color:"#1a1a2e"}}>{ELEMENT_TYPES[selectedEl.type]?.label||selectedEl.type}</strong></span>}</div>
              <div style={{display:"flex",gap:8}}>
                <input value={draft.name||""} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder="Template name" className="input" style={{width:200}}/>
                <label style={{display:"flex",gap:4,alignItems:"center",fontSize:11}}><input type="checkbox" checked={!!draft.isDefault} onChange={e=>setDraft(d=>({...d,isDefault:e.target.checked}))}/> Default</label>
                <button onClick={save} className="btn btn-primary">{editingId?"💾 Update":"💾 Save"}</button>
              </div>
            </div>
          </div>
          {!selectedEl ? <div className="card p-3" style={{fontSize:12,color:"#666",lineHeight:1.5}}><strong style={{color:"#1a1a2e",fontSize:13}}>Element inspector</strong><div style={{marginTop:8}}>Click any element on the canvas to edit it. Use the palette on the left to add new elements.</div></div>
            : <div className="card p-3">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <strong style={{fontSize:13,color:"#1a1a2e"}}>{ELEMENT_TYPES[selectedEl.type]?.label||selectedEl.type}</strong>
                <button onClick={()=>rmEl(selectedEl.id)} style={{padding:"3px 8px",fontSize:10,background:"#FFEBEE",color:"#C62828",border:"none",borderRadius:4,cursor:"pointer"}}>delete</button>
              </div>
              <div style={{paddingTop:8}}>
                <div style={{fontSize:10,color:"#888",textTransform:"uppercase",marginBottom:4}}>position &amp; size</div>
                {["x","y","w","h"].map(k=><F key={k} label={k} value={selectedEl[k]} onChange={v=>upEl(selectedEl.id,{[k]:safeNumber(v,0)})}/>)}
                <F label="rotation" value={selectedEl.rotation||0} onChange={v=>upEl(selectedEl.id,{rotation:safeNumber(v,0)})} suffix="°"/>
              </div>
              {(selectedEl.type==="text"||selectedEl.type==="field") && (
                <div style={{paddingTop:8,borderTop:"1px solid #eee"}}>
                  <div style={{fontSize:10,color:"#888",textTransform:"uppercase",marginBottom:4}}>text</div>
                  {selectedEl.type==="text" && <label style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,color:"#555",padding:"3px 0"}}><span>content</span><input value={selectedEl.label||""} onChange={e=>upEl(selectedEl.id,{label:e.target.value})} style={{width:140,padding:4,border:"1px solid #ddd",borderRadius:4,fontSize:11}}/></label>}
                  {selectedEl.type==="field" && <label style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,color:"#555",padding:"3px 0"}}><span>field</span><select value={selectedEl.field||"name"} onChange={e=>upEl(selectedEl.id,{field:e.target.value})} style={{padding:4,border:"1px solid #ddd",borderRadius:4,fontSize:11,width:150}}>{FIELD_KEYS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></label>}
                  <F label="font size" value={selectedEl.fontSize||8} onChange={v=>upEl(selectedEl.id,{fontSize:safeNumber(v,8)})} suffix="px" step={0.5}/>
                  <label style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,color:"#555",padding:"3px 0"}}><span>weight</span><select value={selectedEl.fontWeight||400} onChange={e=>upEl(selectedEl.id,{fontWeight:Number(e.target.value)})} style={{padding:4,border:"1px solid #ddd",borderRadius:4,fontSize:11}}>{[300,400,600,700,800].map(w=><option key={w}>{w}</option>)}</select></label>
                  <label style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,color:"#555",padding:"3px 0"}}><span>align</span><select value={selectedEl.align||"left"} onChange={e=>upEl(selectedEl.id,{align:e.target.value})} style={{padding:4,border:"1px solid #ddd",borderRadius:4,fontSize:11}}><option value="left">left</option><option value="center">center</option><option value="right">right</option></select></label>
                </div>
              )}
              {selectedEl.type==="barcode" && (
                <div style={{paddingTop:8,borderTop:"1px solid #eee"}}>
                  <div style={{fontSize:10,color:"#888",textTransform:"uppercase",marginBottom:4}}>barcode</div>
                  <label style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,color:"#555",padding:"3px 0"}}><span>format</span><select value={selectedEl.barcodeFormat||"CODE128"} onChange={e=>upEl(selectedEl.id,{barcodeFormat:e.target.value})} style={{padding:4,border:"1px solid #ddd",borderRadius:4,fontSize:11}}><option value="CODE128">CODE128</option><option value="QR">QR</option></select></label>
                  <F label="quiet zone" value={selectedEl.quietZone??1} onChange={v=>upEl(selectedEl.id,{quietZone:safeNumber(v,1)})}/>
                  <label style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,color:"#555",padding:"3px 0"}}><span>show text</span><input type="checkbox" checked={!!selectedEl.showText} onChange={e=>upEl(selectedEl.id,{showText:e.target.checked})}/></label>
                </div>
              )}
            </div>}
        </div>
      )}
    </div>
  );
}
