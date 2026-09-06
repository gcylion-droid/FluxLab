#!/usr/bin/env python3
"""Project-scoped ESM linker for FluxLab's dependency-free source graph.

Only relative, named imports and declaration exports are accepted. Unknown syntax
fails closed rather than silently emitting an invalid bundle. No third-party
build package or network connection is needed.
"""
from pathlib import Path
import re, json
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'src'
IMPORT=re.compile(r"^import\s*\{([^}]+)\}\s*from\s*['\"]\./([^'\"]+)['\"];\s*", re.M)
EXPORT=re.compile(r'^export\s+(?:(?:async\s+)?function|class|const|let)\s+(\w+)',re.M)
def module(name, worker=False):
    text=(SOURCE/name).read_text()
    names=EXPORT.findall(text)
    def replace(match):
        members=re.sub(r'\s+as\s+', ':', match[1])
        return 'const {'+members+'}=__modules['+json.dumps(match[2])+'];\n'
    text=IMPORT.sub(replace,text)
    text=re.sub(r'^export\s+(?=(?:async\s+)?function|class|const|let)', '',text,flags=re.M)
    if re.search(r'^\s*(?:import|export)\b',text,re.M):
        raise ValueError(f'Unsupported module syntax in {name}')
    if name=='gpu.js':
        text=text.replace('fetch(new URL(path,import.meta.url))','Promise.resolve({ok:true,text:async()=>__shaderSources[path]})')
        text=text.replace("new URL('./worker.js',import.meta.url)",'__workerURL')
    if 'import.meta' in text: raise ValueError(f'Unresolved import.meta in {name}')
    return '__modules['+json.dumps(name)+']=(()=>{\n'+text+'\nreturn {'+','.join(names)+'};\n})();\n'
def build():
    worker='const __modules=Object.create(null);\n'+''.join(module(n,True) for n in ['model.js','cpu.js','worker.js'])
    shaders={f'./{name}':(SOURCE/name).read_text() for name in ['solver.wgsl','render.wgsl']}
    bundle='(()=>{\n"use strict";\nconst __modules=Object.create(null);\n'
    bundle+='const __shaderSources='+json.dumps(shaders)+';\n'
    bundle+='const __workerURL=URL.createObjectURL(new Blob(['+json.dumps(worker)+'],{type:"text/javascript"}));\n'
    docs = { './README.md': (ROOT/'README.md').read_text(),
             './docs/NUMERICS.md': (ROOT/'docs/NUMERICS.md').read_text() }
    bundle += 'const __docSources=' + json.dumps(docs) + ';\n'
    # Embed text-only documentation, without navigation or external requests.
    bundle += r'''document.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      const key = link?.getAttribute('href');
      if (!Object.hasOwn(__docSources, key)) return;
      event.preventDefault();
      const dialog = document.createElement('dialog');
      dialog.className = 'embedded-document';
      dialog.style.cssText = 'width:min(880px,92vw);max-height:86vh;padding:24px;border:1px solid #98a0ae;border-radius:12px;background:#fff;color:#172334;';
      const close = document.createElement('button');
      close.textContent = 'Close documentation';
      close.style.cssText = 'position:sticky;top:0;padding:10px 18px;background:#efae36;border:0;border-radius:6px;cursor:pointer';
      close.addEventListener('click', () => dialog.close());
      const pre = document.createElement('pre');
      pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.7 ui-monospace,monospace;';
      pre.textContent = __docSources[key];
      dialog.append(close, pre);document.body.append(dialog);
      dialog.addEventListener('close', () => dialog.remove(), {once:true});
      dialog.showModal();
    });
'''
    bundle+=''.join(module(n) for n in ['model.js','cpu.js','diagnostics.js','icons.js','viewport.js','ui.js','gpu.js','app.js'])
    bundle+='\n})();\n'
    html=(ROOT/'index.html').read_text()
    html=html.replace('<link rel="icon" type="image/svg+xml" href="./favicon.svg"><link rel="stylesheet" href="./style.css">','<style>'+ (ROOT/'style.css').read_text()+'</style>')
    html=html.replace('<script type="module" src="./src/app.js"></script>','<script>'+bundle.replace('</script','<\\/script')+'</script>')
    (ROOT/'fluxlab-standalone.html').write_text(html)
    print(f'Created fluxlab-standalone.html ({len(html.encode()):,} bytes)')
    return html,bundle
if __name__=='__main__': build()
