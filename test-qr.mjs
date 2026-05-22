import { buildItemQrMatrix, qrPayload, decodeScan } from './src/modules/inventory/lib/qrIdentity.js';

const id = "SKKL-ITM-000001";

console.log("payload:", qrPayload(id));

const matrix = buildItemQrMatrix(id);

console.log("matrix rows:", matrix.length);
console.log("matrix cols:", matrix[0].length);

console.log("decoded:", decodeScan(" skkl-itm-000001 "));
