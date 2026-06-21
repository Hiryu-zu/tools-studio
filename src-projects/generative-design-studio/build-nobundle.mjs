import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
const THREE_VER='0.169.0';
function walk(d){let r=[];for(const f of readdirSync(d)){const p=join(d,f);if(statSync(p).isDirectory())r=r.concat(walk(p));else if(p.endsWith('.js'))r.push(p);}return r;}
for(const file of walk('_jsbuild')){
  let s=readFileSync(file,'utf8');
  // remove css side-effect import
  s=s.replace(/^\s*import\s+['"]\.\/style\.css['"];?\s*$/gm,'');
  // three addons -> esm.sh with external three
  s=s.replace(/(from\s*['"])three\/(examples\/jsm\/[^'"]+?)(['"])/g,(m,a,p,b)=>`${a}https://esm.sh/three@${THREE_VER}/${p}?external=three${b}`);
  // relative imports without extension -> add .js  (skip ones already having .js/.json/.css or query)
  s=s.replace(/(from\s*['"])(\.\.?\/[^'"]+?)(['"])/g,(m,a,spec,b)=>{
    if(/\.(js|json|css|mjs)$/.test(spec)) return m;
    return `${a}${spec}.js${b}`;
  });
  writeFileSync(file,s);
}
console.log('rewrite done');
