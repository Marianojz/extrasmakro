const fs = require('fs');
const s = fs.readFileSync('src/app.js', 'utf8');
let inS=false,inD=false,inT=false,inC1=false,inC2=false,esc=false;
let paren=0;
for(let i=0;i<s.length;i++){
  const c = s[i];
  if(esc){ esc=false; continue; }
  if(inS){ if(c==='\\') { esc=true; } else if(c==="'") inS=false; continue; }
  if(inD){ if(c==='\\') { esc=true; } else if(c==='"') inD=false; continue; }
  if(inT){ if(c==='\\') { esc=true; } else if(c==='`') inT=false; continue; }
  if(inC1){ if(c==='\n') inC1=false; continue; }
  if(inC2){ if(c==='*' && s[i+1]==='/'){ inC2=false; i++; } continue; }
  if(c==="'") { inS=true; continue; }
  if(c==='"') { inD=true; continue; }
  if(c==='`') { inT=true; continue; }
  if(c==='/' && s[i+1]==='/'){ inC1=true; continue; }
  if(c==='/' && s[i+1]==='*'){ inC2=true; i++; continue; }
  if(c==='(') paren++; else if(c===')') paren--;
}
console.log('paren balance', paren);

// find first position where paren is highest
inS=inD=inT=inC1=inC2=esc=false;
let p=0, max=0, maxIdx=0;
for(let i=0;i<s.length;i++){
  const c = s[i];
  if(esc){ esc=false; continue; }
  if(inS){ if(c==='\\') esc=true; else if(c==="'") inS=false; continue; }
  if(inD){ if(c==='\\') esc=true; else if(c==='"') inD=false; continue; }
  if(inT){ if(c==='\\') esc=true; else if(c==='`') inT=false; continue; }
  if(inC1){ if(c==='\n') inC1=false; continue; }
  if(inC2){ if(c==='*' && s[i+1]==='/'){ inC2=false; i++; } continue; }
  if(c==="'") { inS=true; continue; }
  if(c==='"') { inD=true; continue; }
  if(c==='`') { inT=true; continue; }
  if(c==='/' && s[i+1]==='/'){ inC1=true; continue; }
  if(c==='/' && s[i+1]==='*'){ inC2=true; i++; continue; }
  if(c==='(') p++; else if(c===')') p--;
  if(p>max){ max=p; maxIdx=i; }
}
// convert maxIdx to line/col
const upto = s.slice(0, maxIdx+1);
const lines = upto.split('\n');
console.log('max paren', max, 'at line', lines.length, 'col', lines[lines.length-1].length+1);
