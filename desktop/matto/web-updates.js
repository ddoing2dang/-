const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const api='https://api.github.com/repos/ddoing2dang/-/git/';
module.exports=function(root){
 async function current(){try{const version=(await fs.readFile(path.join(root,'current'),'utf8')).trim();if(!/^[a-f0-9]{40}$/.test(version))return null;const dir=path.join(root,version);await fs.access(path.join(dir,'.complete'));return dir;}catch{return null;}}
 async function get(url,limit=4*1024*1024){const r=await fetch(url,{headers:{'User-Agent':'Matto-Helper-Windows','Cache-Control':'no-cache'},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Update unavailable');const chunks=[];let total=0;for await(const chunk of r.body){total+=chunk.length;if(total>limit)throw Error('Update too large');chunks.push(chunk);}return Buffer.concat(chunks);}
 async function refresh(){
  const ref=JSON.parse(await get(api+'ref/heads/main')),revision=ref.object.sha;
  if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Invalid revision');
  const tree=JSON.parse(await get(api+'trees/'+revision+'?recursive=1'));
  if(tree.truncated)throw Error('Incomplete tree');
  const version=tree.tree.find(e=>e.path==='web'&&e.type==='tree')?.sha;
  if(!/^[a-f0-9]{40}$/.test(version||''))throw Error('Missing web tree');
  const previous=await current(),destination=path.join(root,version);
  if(destination===previous)return false;
  await fs.mkdir(root,{recursive:true});const staging=await fs.mkdtemp(path.join(root,'pending-'));
  try{
   const files=tree.tree.filter(e=>e.path.startsWith('web/')&&e.type==='blob');let total=0;
   if(files.length>200)throw Error('Too many files');
   for(const entry of files){
    const relative=entry.path.slice(4);
    if(!/^[a-zA-Z0-9_./-]+$/.test(relative)||relative.includes('..')||relative.startsWith('/'))throw Error('Invalid path');
    const bytes=await get('https://raw.githubusercontent.com/ddoing2dang/-/'+revision+'/'+entry.path,12*1024*1024);
    total+=bytes.length;if(total>40*1024*1024)throw Error('Update too large');
    const hash=crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
    if(hash!==entry.sha)throw Error('File mismatch');
    const file=path.join(staging,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);
   }
   for(const name of ['index.html','app.js','engine.js','data.js','items.js','codes.js','board-data.js','style.css','desktop-tools.js','pc-mini.html','pc-mini.js','pc-mini.css'])await fs.access(path.join(staging,name));
   await fs.writeFile(path.join(staging,'config.js'),"window.APP_CONFIG={theme:'matto',platform:'desktop'};");
   await fs.writeFile(path.join(staging,'.complete'),'');
   await fs.rm(destination,{recursive:true,force:true});await fs.rename(staging,destination);
   await fs.writeFile(path.join(root,'current.next'),version);await fs.rename(path.join(root,'current.next'),path.join(root,'current'));
   // Keep the previous snapshot while the current window may still be using it.
   for(const name of await fs.readdir(root)){const dir=path.join(root,name);if(/^[a-f0-9]{40}$/.test(name)&&dir!==destination&&dir!==previous)await fs.rm(dir,{recursive:true,force:true});}
   return true;
  }finally{await fs.rm(staging,{recursive:true,force:true});}
 }
 return {current,refresh};
};

