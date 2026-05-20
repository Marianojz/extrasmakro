const fs = require('fs');
const s = fs.readFileSync('src/app.js', 'utf8');
let inS=false,inD=false,inT=false,inC1=false,inC2=false,esc=false;
let stack=[];
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
  if(c==='(') stack.push(i);
  else if(c===')') stack.pop();
}
console.log('unmatched paren count', stack.length);
if(stack.length){
  const idx = stack[stack.length-1];
  const upto = s.slice(0, idx+1);
  const lines = upto.split('\n');
  console.log('last unmatched at line', lines.length, 'col', lines[lines.length-1].length+1);
  const context = s.split('\n').slice(Math.max(0, lines.length-6), lines.length+6).join('\n');
  console.log('context:\n' + context);
}
