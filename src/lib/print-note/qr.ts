/**
 * Tiny dependency-free QR encoder for the case-note print artifact.
 *
 * Fixed Version 4 / ECC-L keeps the case-note QR compact and deterministic.
 */
const VERSION = 4;
const SIZE = 17 + VERSION * 4;
const DATA_CODEWORDS = 80;
const ECC_CODEWORDS = 20;
const MAX_PAYLOAD_BYTES = 78;

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function reedSolomonGenerator(degree: number): number[] {
  let result = [1], root = 1;
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(result.length + 1).fill(0);
    for (let j = 0; j < result.length; j += 1) {
      next[j] ^= result[j];
      next[j + 1] ^= gfMultiply(result[j], root);
    }
    result = next;
    root = gfMultiply(root, 0x02);
  }
  return result;
}
function reedSolomonRemainder(data: number[], degree: number): number[] {
  const generator = reedSolomonGenerator(degree);
  const result = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift(); result.push(0);
    for (let i = 0; i < degree; i += 1) result[i] ^= gfMultiply(generator[i + 1], factor);
  }
  return result;
}
function appendBits(target: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) target.push((value >>> i) & 1);
}
function makeCodewords(payload: string): number[] {
  const bytes = [...new TextEncoder().encode(payload)];
  if (bytes.length > MAX_PAYLOAD_BYTES) throw new Error(`QR payload muito longo (${bytes.length} bytes; máximo ${MAX_PAYLOAD_BYTES}).`);
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4); appendBits(bits, bytes.length, 8);
  bytes.forEach((b) => appendBits(bits, b, 8));
  const cap = DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, cap - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) value = (value << 1) | bits[i + j];
    data.push(value);
  }
  for (let pad = 0; data.length < DATA_CODEWORDS; pad += 1) data.push((pad & 1) === 0 ? 0xec : 0x11);
  return [...data, ...reedSolomonRemainder(data, ECC_CODEWORDS)];
}
type Matrix = boolean[][];
function blankMatrix(): { modules: Matrix; isFunction: Matrix } {
  return { modules: Array.from({ length: SIZE }, () => Array(SIZE).fill(false)), isFunction: Array.from({ length: SIZE }, () => Array(SIZE).fill(false)) };
}
function drawFunctionPatterns(modules: Matrix, isFunction: Matrix) {
  const set = (x:number,y:number,dark:boolean) => {
    if (x<0||y<0||x>=SIZE||y>=SIZE) return;
    modules[y][x]=dark; isFunction[y][x]=true;
  };
  const drawFinder=(cx:number,cy:number)=>{
    for(let dy=-4;dy<=4;dy+=1) for(let dx=-4;dx<=4;dx+=1){
      const x=cx+dx,y=cy+dy;
      if(x<0||y<0||x>=SIZE||y>=SIZE) continue;
      const dist=Math.max(Math.abs(dx),Math.abs(dy));
      set(x,y,dist!==2&&dist!==4);
    }
  };
  drawFinder(3,3); drawFinder(SIZE-4,3); drawFinder(3,SIZE-4);
  for(let i=0;i<SIZE;i+=1){
    if(!isFunction[6][i]) set(i,6,i%2===0);
    if(!isFunction[i][6]) set(6,i,i%2===0);
  }
  for(const cy of [6,26]) for(const cx of [6,26]){
    if(isFunction[cy][cx]) continue;
    for(let dy=-2;dy<=2;dy+=1) for(let dx=-2;dx<=2;dx+=1) set(cx+dx,cy+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
  }
  drawFormatBits(modules,isFunction,0);
}
function getFormatBits(mask:number):number {
  const data=(0b01<<3)|mask; let rem=data<<10; const generator=0x537;
  for(let i=14;i>=10;i-=1) if(((rem>>>i)&1)!==0) rem^=generator<<(i-10);
  return ((data<<10)|rem)^0x5412;
}
function drawFormatBits(modules:Matrix,isFunction:Matrix,mask:number){
  const bits=getFormatBits(mask);
  const set=(x:number,y:number,dark:boolean)=>{modules[y][x]=dark;isFunction[y][x]=true;};
  const bit=(i:number)=>((bits>>>i)&1)!==0;
  for(let i=0;i<=5;i+=1)set(8,i,bit(i));
  set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));
  for(let i=9;i<15;i+=1)set(14-i,8,bit(i));
  for(let i=0;i<8;i+=1)set(SIZE-1-i,8,bit(i));
  for(let i=8;i<15;i+=1)set(8,SIZE-15+i,bit(i));
  set(8,SIZE-8,true);
}
function placeCodewords(modules:Matrix,isFunction:Matrix,codewords:number[]){
  const bits:number[]=[]; codewords.forEach((b)=>appendBits(bits,b,8)); let bitIndex=0;
  for(let right=SIZE-1;right>=1;right-=2){
    if(right===6)right=5;
    for(let vert=0;vert<SIZE;vert+=1){
      const upward=((right+1)&2)===0; const y=upward?SIZE-1-vert:vert;
      for(let j=0;j<2;j+=1){
        const x=right-j; if(isFunction[y][x])continue;
        let dark=bitIndex<bits.length?bits[bitIndex]!==0:false; bitIndex+=1;
        if((x+y)%2===0)dark=!dark; modules[y][x]=dark;
      }
    }
  }
}
export function createQrMatrix(payload:string):Matrix{
  const codewords=makeCodewords(payload); const {modules,isFunction}=blankMatrix();
  drawFunctionPatterns(modules,isFunction); placeCodewords(modules,isFunction,codewords); return modules;
}
export function createQrSvg(payload:string,options?:{quietZone?:number;className?:string}):string{
  const matrix=createQrMatrix(payload),quiet=options?.quietZone??4,dimension=SIZE+quiet*2,path:string[]=[];
  matrix.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)path.push(`M${x+quiet},${y+quiet}h1v1h-1z`);}));
  const classAttr=options?.className?` class="${options.className}"`:"";
  return `<svg${classAttr} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="100%" height="100%" fill="#fff"/><path d="${path.join("")}" fill="#000"/></svg>`;
}
