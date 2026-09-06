import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT??4173);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.wgsl':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=path.resolve(root,'.'+requested);if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end('Forbidden');return;}if((await stat(file)).isDirectory())file=path.join(file,'index.html');const content=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(content);}catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}});
server.listen(port,process.env.HOST??'127.0.0.1',()=>console.log(`FluxLab is available at http://localhost:${port}`));
