export const SCALE = 96 / 25.4;
export const ELEMENT_TYPES = {
  text:{label:"Static text",defaults:{w:30,h:6,fontSize:8,fontWeight:400,align:"left",color:"#000"}},
  field:{label:"Dynamic field",defaults:{w:30,h:6,fontSize:8,fontWeight:600,align:"left",color:"#000"}},
  logo:{label:"Shop logo",defaults:{w:14,h:10}},
  barcode:{label:"Barcode",defaults:{w:36,h:8,barcodeFormat:"CODE128",quietZone:1,showText:true}},
  qr:{label:"QR code",defaults:{w:12,h:12}},
  rule:{label:"Divider",defaults:{w:60,h:0.4,color:"#000"}},
};
export const FIELD_KEYS = [
  {value:"name",label:"Item name"},{value:"sku",label:"SKU / barcode"},{value:"huid",label:"HUID"},
  {value:"category",label:"Category"},{value:"karat",label:"Karat / Purity"},
  {value:"weight",label:"Gross weight (g)"},{value:"netWeight",label:"Net weight (g)"},
  {value:"stoneWeight",label:"Stone weight (ct)"},{value:"stoneCount",label:"Stone count"},
  {value:"price",label:"Price (₹)"},{value:"mrp",label:"MRP (₹)"},{value:"shopName",label:"Shop name"},
];
export const PRESET_TEMPLATES=[
  {name:"Hanging tag (81 × 12 mm)",dimensions:{widthMm:81,heightMm:12},printable:{x:2,y:1,w:77,h:10},features:{foldX:0,perforationX:27,holeX:4,holeY:6,holeR:1.5},thermal:{dpi:203,density:8,offsetX:0,offsetY:0},elements:[{id:"e1",type:"field",field:"name",x:9,y:1.5,w:16,h:4,fontSize:7,fontWeight:700,align:"left",color:"#000"},{id:"e2",type:"field",field:"weight",x:9,y:6,w:16,h:4,fontSize:7,align:"left",color:"#000"},{id:"e3",type:"barcode",x:30,y:1.5,w:32,h:6,barcodeFormat:"CODE128",quietZone:1,showText:false},{id:"e4",type:"field",field:"sku",x:30,y:8,w:32,h:3,fontSize:6,align:"center",color:"#000"},{id:"e5",type:"field",field:"price",x:64,y:1.5,w:15,h:4,fontSize:8,fontWeight:800,align:"right",color:"#000"},{id:"e6",type:"field",field:"huid",x:64,y:6.5,w:15,h:4,fontSize:6,align:"right",color:"#666"}]},
  {name:"Retail tag (50 × 25 mm)",dimensions:{widthMm:50,heightMm:25},printable:{x:2,y:2,w:46,h:21},features:{foldX:0,perforationX:0,holeX:0,holeY:0,holeR:0},thermal:{dpi:203,density:8,offsetX:0,offsetY:0},elements:[{id:"e1",type:"logo",x:2,y:2,w:12,h:7},{id:"e2",type:"field",field:"shopName",x:16,y:3,w:32,h:4,fontSize:9,fontWeight:800,align:"left",color:"#000"},{id:"e3",type:"rule",x:2,y:10,w:46,h:0.3},{id:"e4",type:"field",field:"name",x:2,y:11,w:30,h:4,fontSize:8,fontWeight:700,align:"left",color:"#000"},{id:"e5",type:"field",field:"weight",x:2,y:16,w:22,h:3,fontSize:7,align:"left",color:"#000"},{id:"e6",type:"field",field:"huid",x:2,y:20,w:22,h:3,fontSize:6,align:"left",color:"#666"},{id:"e7",type:"qr",x:36,y:11,w:12,h:12},{id:"e8",type:"field",field:"price",x:24,y:16,w:12,h:5,fontSize:12,fontWeight:800,align:"right",color:"#000"}]},
  {name:"Mini sticker (30 × 20 mm)",dimensions:{widthMm:30,heightMm:20},printable:{x:1,y:1,w:28,h:18},features:{foldX:0,perforationX:0,holeX:0,holeY:0,holeR:0},thermal:{dpi:203,density:8,offsetX:0,offsetY:0},elements:[{id:"e1",type:"field",field:"name",x:1,y:1,w:28,h:4,fontSize:7,fontWeight:700,align:"center",color:"#000"},{id:"e2",type:"field",field:"weight",x:1,y:5.5,w:14,h:3,fontSize:6,align:"left",color:"#000"},{id:"e3",type:"field",field:"price",x:15,y:5.5,w:14,h:3,fontSize:7,fontWeight:800,align:"right",color:"#000"},{id:"e4",type:"barcode",x:1,y:9,w:28,h:7,barcodeFormat:"CODE128",quietZone:1,showText:true},{id:"e5",type:"field",field:"sku",x:1,y:16,w:28,h:3,fontSize:5,align:"center",color:"#666"}]},
];
export function newTemplate(preset=PRESET_TEMPLATES[1]){return JSON.parse(JSON.stringify({name:preset.name,...preset,isDefault:false}));}
export function pickDefaultBarcode(templates){return (templates||[]).find(t=>t.isDefault)||(templates||[])[0]||null;}
export function makeElement(type){const cfg=ELEMENT_TYPES[type]||ELEMENT_TYPES.text;return {id:"el_"+Math.random().toString(36).slice(2,8),type,x:5,y:2,rotation:0,...cfg.defaults,field:type==="field"?"name":undefined,label:type==="text"?"Text":undefined};}
export function resolveField(field,product,shop){const m={name:product?.name||"",sku:product?.barcode||product?.sku||"",huid:product?.huid||"",category:product?.category||"",karat:product?.karat||"",weight:product?.weight!=null?product.weight+"g":"",netWeight:product?.netWeight!=null?product.netWeight+"g":"",stoneWeight:product?.stoneWeight!=null?product.stoneWeight+"ct":"",stoneCount:product?.stoneCount!=null?String(product.stoneCount):"",price:product?.price!=null?`₹${Number(product.price).toLocaleString("en-IN")}`:"",mrp:product?.mrp!=null?`₹${Number(product.mrp).toLocaleString("en-IN")}`:"",shopName:shop?.company?.name||shop?.name||""};return m[field]??"";}
