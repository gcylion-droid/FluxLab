#!/usr/bin/env python3
"""Playwright interaction smoke suite. Default: serve and navigate the real modular app.
--memory renders the standalone bundle without navigation, for managed environments.
The app itself selects its real cooperative solver if the browser blocks GPU/workers.
No browser policy is changed and no numerical backend is mocked.
Install test tooling: python3 -m pip install playwright && playwright install chromium
"""
import argparse, asyncio, importlib.util, json, os, subprocess, time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--memory',action='store_true');parser.add_argument('--output',default=str(ROOT/'test-results'));args=parser.parse_args()
OUT=Path(args.output);OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('standalone',ROOT/'tools/build-standalone.py');build=importlib.util.module_from_spec(spec);spec.loader.exec_module(build)
async def main():
 server=None;checks=[];errors=[]
 def passed(name,details=None):checks.append({'check':name,'status':'passed','details':details});print('PASS',name,details or '',flush=True)
 if not args.memory:
  env=os.environ.copy();env['PORT']='4174';server=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL);time.sleep(.5)
 try:
  async with async_playwright() as pw:
   kwargs={'headless':True,'args':['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--disable-dev-shm-usage']}
   if os.environ.get('CHROMIUM_PATH'):kwargs['executable_path']=os.environ['CHROMIUM_PATH']
   browser=await pw.chromium.launch(**kwargs)
   page=await browser.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1)
   page.on('pageerror',lambda e:errors.append(str(e)))
   if args.memory:
    html,bundle=build.build();base=html[:html.rfind('<script>')]+html[html.rfind('</script>')+9:]
    await page.set_content(base,wait_until='domcontentloaded');await page.add_script_tag(content=bundle)
   else:await page.goto('http://127.0.0.1:4174/?fresh&paused',wait_until='networkidle')
   await page.wait_for_function('window.fluxlab && !fluxlab.state.loading && fluxlab.state.engine',timeout=30000)
   await page.evaluate('async()=>{if(fluxlab.state.running)await fluxlab.action("run");}')
   await page.wait_for_function('!fluxlab.state.busy')
   backend=await page.evaluate('fluxlab.state.backend');passed('Application initializes a real numerical backend',backend)
   # Use a smaller mesh for the interaction suite, not altered physical viscosity.
   await page.evaluate('async()=>{const c=fluxlab.preset("airfoil");c.domain.nx=192;await fluxlab.loadCase(c,{run:false,fit:true});for(let i=0;i<10;i++)await fluxlab.advance(32);await fluxlab.takeSnapshot();}')
   assert await page.evaluate('fluxlab.state.iteration>=320 && fluxlab.state.diag.finite && !fluxlab.state.diag.unstable')
   passed('Airfoil solver advances and remains finite')
   await page.locator('.viewport-actions [data-toggle="mesh"]').click();assert await page.evaluate('fluxlab.state.case.display.mesh');await page.locator('.viewport-actions [data-toggle="mesh"]').click();passed('Mesh overlay toggles')
   await page.locator('#field-select').select_option('pressure');assert await page.locator('#legend-unit').inner_text()=='Pa';await page.locator('#field-select').select_option('speed');passed('Scalar field and scientific legend update')
   body=await page.evaluate('fluxlab.state.case.bodies[0].id');await page.locator(f'.tree [data-node="{body}"]').click();await page.locator('[data-config="body.angle"]').fill('-5');await page.locator('#inspector [data-action="apply"]').click();await page.wait_for_function('!fluxlab.state.loading && fluxlab.state.case.bodies[0].angle===-5');assert await page.evaluate('fluxlab.state.iteration===0');passed('Body inspector commits and reinitializes')
   await page.evaluate('fluxlab.action("undo")');assert await page.evaluate('fluxlab.state.case.bodies[0].angle===-9');await page.evaluate('fluxlab.action("redo")');assert await page.evaluate('fluxlab.state.case.bodies[0].angle===-5');passed('Undo and redo preserve case transactions')
   await page.evaluate('fluxlab.action("add-circle")');assert await page.evaluate('fluxlab.state.case.bodies.length===2');await page.evaluate('fluxlab.action("delete")');assert await page.evaluate('fluxlab.state.case.bodies.length===1');passed('Create, select, and delete a solid body')
   await page.evaluate('fluxlab.action("draw-circle")');pos=await page.evaluate('fluxlab.viewport.screen(.085,.026)');box=await page.locator('#overlay-canvas').bounding_box();x=box['x']+pos[0];y=box['y']+pos[1];await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+19,y+10,steps=5);await page.mouse.up();await page.wait_for_function('!fluxlab.state.loading && fluxlab.state.case.bodies.length===2');passed('Pointer-driven cylinder creation')
   await page.evaluate('fluxlab.action("probe-tool")');pos=await page.evaluate('fluxlab.viewport.screen(.09,.04)');await page.mouse.click(box['x']+pos[0],box['y']+pos[1]);assert await page.evaluate('fluxlab.state.case.probes.length===1');assert await page.locator('.data-table tbody tr').count()==1;passed('Probe placement and measured data table')
   # Reset with an existing probe and an open probe table: exercises asynchronous view safety.
   await page.evaluate('fluxlab.action("initialize")');assert await page.evaluate('!fluxlab.state.loading && fluxlab.state.case.probes.length===1');passed('Reinitialization while probe views are open')
   # Capture generated blobs before navigation; the browser environment may prohibit downloads.
   await page.evaluate('''()=>{window.__exports=[];const create=URL.createObjectURL.bind(URL);window.__exportBlobs=new Map();URL.createObjectURL=b=>{const u=create(b);__exportBlobs.set(u,b);return u;};HTMLAnchorElement.prototype.click=function(){if(this.download)__exports.push({name:this.download,blob:__exportBlobs.get(this.href)});};}''')
   for action in ['save','csv','vtk','export-monitor','export-probes','export-report','screenshot']:
    await page.evaluate('(a)=>fluxlab.action(a)',action)
   exported=await page.evaluate('async()=>Promise.all(__exports.map(async e=>({name:e.name,size:e.blob.size,type:e.blob.type,head:e.blob.type.includes("image")?"PNG":(await e.blob.text()).slice(0,130)})))')
   assert len(exported)==7 and all(e['size']>30 for e in exported)
   assert any('gauge_pressure_Pa' in e['head'] for e in exported);assert any(e['head'].startswith('# vtk') for e in exported)
   passed('Case, CSV, VTK, monitor, probe, report and PNG export generation',exported)
   # Case round trip through the real file input.
   case=await page.evaluate('JSON.stringify(fluxlab.state.case)')
   await page.locator('#case-file').set_input_files({'name':'roundtrip.fluxlab.json','mimeType':'application/json','buffer':case.encode()})
   await page.wait_for_function('!fluxlab.state.loading');assert await page.evaluate('fluxlab.state.case.probes.length===1');passed('Case JSON file round trip')
   svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="20,20 70,25 50,65"/><script>throw new Error("must never execute")</script></svg>'
   count=await page.evaluate('fluxlab.state.case.bodies.length');await page.locator('#geometry-file').set_input_files({'name':'shape.svg','mimeType':'image/svg+xml','buffer':svg.encode()});await page.wait_for_function(f'!fluxlab.state.loading && fluxlab.state.case.bodies.length==={count+1}');passed('Sanitized SVG primitive geometry import')
   # Exercise every layout and each example using the real numerical engine.
   for tab in ['home','geometry','mesh','setup','solution','results','view']:
    await page.locator(f'[data-tab="{tab}"]').click()
   passed('All seven workflow ribbons and task-page routes')
   for name in ['airfoil','cylinder','cavity','channel','nozzle','array']:
    result=await page.evaluate('''async name=>{const c=fluxlab.preset(name);c.domain.nx=96;await fluxlab.loadCase(c,{run:false,fit:true});await fluxlab.advance(80);await fluxlab.takeSnapshot();return {finite:fluxlab.state.diag.finite,unstable:fluxlab.state.diag.unstable,iteration:fluxlab.state.iteration};}''',name)
    assert result['finite'] and not result['unstable'] and result['iteration']==80
   passed('All six example configurations initialize and advance')
   await page.evaluate('fluxlab.action("gallery")');assert await page.locator('.preset-card').count()==6;await page.locator('[data-action="close-modal"]').click();passed('Example library dialog')
   await page.evaluate('async()=>{const c=fluxlab.preset("airfoil");c.domain.nx=192;await fluxlab.loadCase(c,{run:false,fit:true});}')
   await page.keyboard.press('Space');await page.wait_for_function('fluxlab.state.iteration>=12');await page.keyboard.press('Space');await page.wait_for_function('!fluxlab.state.busy');assert await page.evaluate('!fluxlab.state.running');passed('Keyboard run / pause and asynchronous stepping')
   # A GPU parity test is meaningful only when a real adapter was obtained.
   if backend=='WebGPU' and not args.memory:
    gpu=await page.evaluate('''async()=>{const {CPUSolver}=await import('./src/cpu.js');const c=fluxlab.preset('cylinder');c.domain.nx=96;await fluxlab.loadCase(c,{run:false});const s=fluxlab.state,ref=new CPUSolver(s.p,s.mask);ref.step(128);await fluxlab.advance(128);await fluxlab.takeSnapshot();let max=0,rms=0;for(let i=0;i<ref.field.length;i++){const d=Math.abs(ref.field[i]-s.field[i]);max=Math.max(max,d);rms+=d*d;}return {max,rms:Math.sqrt(rms/ref.field.length)};}''')
    assert gpu['max']<.0001;passed('WebGPU compute vs CPU reference parity',gpu)
   else:checks.append({'check':'Browser WebGPU execution and GPU/CPU parity','status':'not-executed','details':'No WebGPU adapter is exposed in this managed browser context. GPU source remains unverified on a device in this run.'})
   if args.memory:
    await page.evaluate('fluxlab.action("help")')
    await page.locator('#modal a[href="./docs/NUMERICS.md"]').click()
    assert 'Time-step ordering' in await page.locator('.embedded-document pre').inner_text()
    await page.locator('.embedded-document button').click()
    await page.locator('[data-action="close-modal"]').click()
   # Final screenshots represent the actual CPU-computed field, never synthetic render data.
   await page.evaluate('async()=>{const c=fluxlab.preset("airfoil");c.domain.nx=384;await fluxlab.loadCase(c,{run:false,fit:true});for(let i=0;i<20;i++)await fluxlab.advance(32);await fluxlab.takeSnapshot();}')
   await page.locator('[data-tab="home"]').click();await page.locator('[data-tool="select"]').click();await page.evaluate('fluxlab.action("monitors")');await page.wait_for_timeout(400)
   await page.screenshot(path=str(OUT/'fluxlab-desktop.png'),full_page=True)
   await page.evaluate('fluxlab.action("theme")');await page.wait_for_timeout(200);await page.screenshot(path=str(OUT/'fluxlab-dark.png'),full_page=True)
   for size in [{'width':1024,'height':768},{'width':390,'height':844}]:
    await page.set_viewport_size(size);await page.wait_for_timeout(150);assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   await page.screenshot(path=str(OUT/'fluxlab-mobile.png'),full_page=True);passed('Desktop, tablet and mobile layouts, light and dark themes')
   assert not errors,errors;passed('No uncaught JavaScript errors')
   await browser.close()
 finally:
  if server:server.terminate()
  (OUT/'browser-results.json').write_text(json.dumps({'mode':'in-memory' if args.memory else 'served','checks':checks,'uncaughtErrors':errors},indent=2))
 print(json.dumps({'passed':sum(c['status']=='passed' for c in checks),'notExecuted':sum(c['status']=='not-executed' for c in checks),'errors':errors}),flush=True)
asyncio.run(main())
