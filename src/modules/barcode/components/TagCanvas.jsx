import React, { useRef } from "react";
import QRImage from "../../../components/QRImage";
import { SCALE, resolveField } from "../lib/barcodeTemplate";
import { code128SVG } from "../lib/code128";
import { itemCode } from "@shared/itemCode";

function Box({ el, product, shop, selected, onClick }) {
  const style = { position:"absolute", left:(el.x||0)*SCALE, top:(el.y||0)*SCALE,
    width:(el.w||10)*SCALE, height:(el.h||6)*SCALE,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined, transformOrigin: "0 0",
    boxSizing: "border-box", fontSize: el.fontSize||8, fontWeight: el.fontWeight||400,
    color: el.color||"#000", textAlign: el.align||"left", lineHeight: 1.05, overflow: "hidden",
    cursor: onClick?"pointer":"default",
    outline: selected?"1.5px solid #2962FF":"1px dashed transparent", outlineOffset:-1 };
  let body=null;
  switch(el.type){
    case "text": body = el.label||"Text"; break;
    case "field": body = resolveField(el.field, product, shop) || `{${el.field}}`; break;
    case "logo":
      body = shop?.company?.logoUrl
        ? <img src={shop.company.logoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}}/>
        : <div style={{width:"100%",height:"100%",border:"1px dashed #aaa",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#888"}}>logo</div>;
      break;
    case "barcode": {
      const v=(product?.barcode||product?.sku||product?.id||"SAMPLE").toString().slice(0,32);
      const svg=code128SVG(v,{widthMm:el.w||30,heightMm:el.h||8,quietZoneMm:el.quietZone??1,showText:!!el.showText,fontSize:el.fontSize||6});
      body=<span style={{display:"block",width:"100%",height:"100%"}} dangerouslySetInnerHTML={{__html:svg}}/>;
      break;
    }
    case "qr": {
      const v=(itemCode(product)||product?.sku||product?.id||"SAMPLE").toString();
      const sz=Math.min((el.w||10)*SCALE,(el.h||10)*SCALE);
      body=<span style={{display:"block"}}><QRImage value={v} size={sz}/></span>;
      break;
    }
    case "rule": body=<div style={{borderTop:`${Math.max(1,(el.h||0.4)*SCALE)}px solid ${el.color||"#000"}`,width:"100%"}}/>; break;
    default: body=null;
  }
  return <div style={style} onClick={onClick}>{body}</div>;
}

export default function TagCanvas({ template, product, shop, selectedId, onSelect, showSafeArea=false, showFeatures=false, zoom=1 }){
  const ref = useRef(null);
  if(!template) return null;
  const wMm=template?.dimensions?.widthMm||50, hMm=template?.dimensions?.heightMm||25;
  const f=template.features||{}, pr=template.printable||{x:0,y:0,w:wMm,h:hMm};
  return (
    <div style={{position:"relative",width:wMm*SCALE*zoom,height:hMm*SCALE*zoom,background:"#fff",boxShadow:"0 1px 6px rgba(0,0,0,0.08)",border:"1px solid #888",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,transform:`scale(${zoom})`,transformOrigin:"0 0",width:wMm*SCALE,height:hMm*SCALE}}>
        {showSafeArea && <div style={{position:"absolute",left:pr.x*SCALE,top:pr.y*SCALE,width:pr.w*SCALE,height:pr.h*SCALE,border:"1px dashed #2962FF",pointerEvents:"none"}}/>}
        {showFeatures && f.foldX>0 && <div style={{position:"absolute",left:f.foldX*SCALE,top:0,height:"100%",borderLeft:"1px dashed #888",pointerEvents:"none"}}><span style={{position:"absolute",top:-10,left:-8,fontSize:8,color:"#888"}}>fold</span></div>}
        {showFeatures && f.perforationX>0 && <div style={{position:"absolute",left:f.perforationX*SCALE,top:0,height:"100%",borderLeft:"1px dotted #C62828",pointerEvents:"none"}}><span style={{position:"absolute",top:-10,left:-10,fontSize:8,color:"#C62828"}}>perf</span></div>}
        {showFeatures && f.holeR>0 && <div style={{position:"absolute",left:(f.holeX-f.holeR)*SCALE,top:(f.holeY-f.holeR)*SCALE,width:f.holeR*2*SCALE,height:f.holeR*2*SCALE,borderRadius:"50%",border:"1px dashed #888",background:"#fafafa",pointerEvents:"none"}}/>}
        {(template.elements||[]).map(el=> <Box key={el.id} el={el} product={product||{}} shop={shop} selected={onSelect&&selectedId===el.id} onClick={onSelect?()=>onSelect(el.id):undefined}/> )}
      </div>
    </div>
  );
}
