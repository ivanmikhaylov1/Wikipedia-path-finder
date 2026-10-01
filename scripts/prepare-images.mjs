import sharp from 'sharp';
import { chromium } from 'playwright';
import { readFile, mkdir, stat, writeFile } from 'node:fs/promises';
// Deterministic procedural equivalents; no external originals or image service.
const C = { charcoal: '#1e2327', cream: '#efe6d6', accent: '#e8703f' };
let seed = 1973;
const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
const nodes = Array.from({length:150},()=>({x:60+random()*2280,y:100+random()*1120}));
const lines = nodes.flatMap((p,i)=>nodes.map((q,j)=>({q,j,d:Math.hypot(p.x-q.x,p.y-q.y)})).filter(v=>v.j>i).sort((a,b)=>a.d-b.d).slice(0,2).map(({q})=>`<path d="M${p.x},${p.y} L${q.x},${q.y}"/>`)).join('');
const dots = nodes.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="${1+random()*3}"/>`).join('');
const glow='<defs><filter id="glow"><feGaussianBlur stdDeviation="10"/></filter></defs>';
const svg = (w,h,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const thread='M180 780 C500 120 660 1050 1020 660 S1560 250 1800 630 S2180 900 2310 580';
await mkdir('public/images',{recursive:true});
const images = {
 'knowledge-map': svg(2400,1400,`${glow}<path fill="${C.charcoal}" d="M0 0h2400v1400H0z"/><g fill="none" stroke="${C.cream}" opacity=".09" stroke-width="1">${lines}</g><g fill="${C.cream}" opacity=".3">${dots}</g><path d="${thread}" fill="none" stroke="${C.accent}" stroke-width="13" opacity=".35" filter="url(#glow)"/><path d="${thread}" fill="none" stroke="${C.accent}" stroke-width="4"/>`),
 empty: svg(800,500,`${glow}<g fill="${C.cream}" opacity=".55"><circle cx="100" cy="250" r="4"/><circle cx="170" cy="100" r="3"/><circle cx="270" cy="350" r="3"/></g><path d="M100 250Q280 60 440 250T650 250" fill="none" stroke="${C.accent}" stroke-width="3"/><path d="M650 250h100" fill="none" stroke="${C.accent}" stroke-width="2" stroke-dasharray="8 10" opacity=".4"/>`),
};
const sizes=[];
async function record(name,input){const file=`public/images/${name}.webp`;await sharp(input).webp({quality:78,effort:6}).toFile(file);const bytes=(await stat(file)).size;if(bytes>150000)throw Error(`${file}: ${bytes} >150000`);sizes.push({file,bytes});}
for(const [name,source] of Object.entries(images))await record(name,Buffer.from(source));
const noise=Buffer.alloc(512*512*4);for(let i=0;i<noise.length;i+=4){const value=Math.round(128+(random()-.5)*70);noise[i]=value+3;noise[i+1]=value+1;noise[i+2]=value;noise[i+3]=90;}
await record('grain',await sharp(noise,{raw:{width:512,height:512,channels:4}}).png().toBuffer());
const icon=svg(512,512,`<rect width="512" height="512" rx="100" fill="${C.charcoal}"/><path d="M116 330C170 330 160 140 250 210S340 250 396 174" fill="none" stroke="${C.accent}" stroke-width="24" stroke-linecap="round"/><g fill="${C.cream}"><circle cx="116" cy="330" r="32"/><circle cx="396" cy="174" r="32"/></g>`);
await writeFile('public/favicon.svg',icon);await writeFile('public/icon.svg',icon);
for(const [name,size]of[['apple-touch-icon',180],['icon-192',192],['icon-512',512]])await sharp(Buffer.from(icon)).resize(size,size).png().toFile(`public/${name}.png`);
const browser=await chromium.launch({args:['--no-sandbox']});
try{const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});const font=(await readFile('src/assets/fonts/Yq6W-LOTXCb04q32xlpwv8ZfrxE.woff2')).toString('base64');await page.setContent(`<style>@font-face{font-family:Unbounded;src:url(data:font/woff2;base64,${font});font-weight:400 600}body{margin:0;background:${C.charcoal};color:${C.cream}}h1{position:absolute;left:72px;top:170px;margin:0;font:600 78px Unbounded}</style><h1>Переходы</h1>${svg(1200,630,`${glow}<path d="M75 370C400 460 670 180 1120 315" stroke="${C.accent}" stroke-width="7" opacity=".3" fill="none" filter="url(#glow)"/><path d="M75 370C400 460 670 180 1120 315" stroke="${C.accent}" stroke-width="3" fill="none"/><circle cx="1120" cy="315" r="7" fill="${C.cream}"/>`)}`);await page.evaluate(()=>document.fonts.ready);await record('og',await page.screenshot());}finally{await browser.close();}
await writeFile('docs/image-sizes.json',JSON.stringify(sizes,null,2)+'\n');console.log(sizes);
