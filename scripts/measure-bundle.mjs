import { readFile, readdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const baseline=JSON.parse(await readFile('docs/bundle-baseline.json','utf8'));
const assets=await readdir('dist/assets');
const files=await Promise.all(assets.filter(file=>/\.(js|css|woff2)$/.test(file)).map(async file=>({file,gzip:gzipSync(await readFile(`dist/assets/${file}`)).length})));
const totalBytes=files.reduce((n,f)=>n+f.gzip,0);
const result={baselineCommit:baseline.commit,baselineBytes:baseline.totalBytes,totalBytes,deltaBytes:totalBytes-baseline.totalBytes,maxGrowthBytes:30000,files};
await writeFile('docs/bundle-final.json',JSON.stringify(result,null,2)+'\n');console.log(result);
if(result.deltaBytes>result.maxGrowthBytes)throw Error('Bundle growth exceeds 30 KB gzip');
