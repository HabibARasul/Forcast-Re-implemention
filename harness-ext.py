import sys, asyncio
from playwright.async_api import async_playwright
F='file:///home/claude/reimpl/forecast-to-cost-lab.html'; OUT='/home/claude/reimpl/shots'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs=[]
        for (w,h,scheme,tag) in [(1360,900,'light','desk'),(400,860,'dark','phone')]:
            ctx = await b.new_context(viewport={'width':w,'height':h}, color_scheme=scheme); pg = await ctx.new_page()
            pg.on('console', lambda m, tag=tag: errs.append(f'{tag} {m.type}: {m.text}') if m.type=='error' and 'ERR_TUNNEL' not in m.text else None)
            pg.on('pageerror', lambda e, tag=tag: errs.append(f'{tag} pageerror: {e}'))
            await pg.add_init_script("try{localStorage.clear()}catch(e){}")
            await pg.goto(F); await pg.wait_for_timeout(700); sw=0
            async def snap(name, full=True):
                nonlocal sw; sw=max(sw, await pg.evaluate('document.documentElement.scrollWidth')); await pg.screenshot(path=f'{OUT}/lab-{tag}-{name}.png', full_page=full and tag=='desk')
            await pg.click('[data-tab=library]'); await snap('library')
            await pg.click('[data-tab=cost]'); await pg.wait_for_timeout(300); await snap('cost-thesis')
            await pg.click('[data-tab=model]'); await pg.wait_for_timeout(300); await snap('model')
            # introduce an error
            await pg.click('[data-table=modes]'); await pg.fill('#code', 'mode,fixed_cost,per_km\nStandard Class,-2,abc\n'); await pg.wait_for_timeout(700); await snap('model-errors')
            await pg.click('[data-tab=library]'); await pg.click('[data-ex=gulf]'); await pg.wait_for_timeout(800); await snap('cost-gulf')
            await pg.click('[data-tab=simulate]'); await pg.wait_for_timeout(300); await pg.click('#simPlay'); await pg.wait_for_timeout(2500); await pg.click('#simDelay'); await pg.click('#simPlay'); await pg.wait_for_timeout(1500); await snap('simulate', False)
            await pg.click('#runRepl'); await pg.wait_for_timeout(2500); await snap('simulate-repl')
            await pg.click('[data-tab=scenarios]'); await pg.click('#runScen'); await pg.wait_for_function('window.__lab.S.scen', timeout=60000); await pg.wait_for_timeout(300); await snap('scenarios')
            await pg.click('[data-tab=library]'); await pg.click('[data-ex=rq4]'); await pg.wait_for_timeout(600); await pg.click('[data-tab=forecast]'); await pg.click('#runFc'); await pg.wait_for_function('window.__lab.S.fc', timeout=120000); await pg.wait_for_timeout(300); await snap('forecast')
            if tag=='desk':
                await pg.click('[data-tab=library]'); await pg.click('[data-ex=fc2cost]'); await pg.wait_for_function('window.__lab.S.res && window.__lab.S.fc && window.__lab.S.ex=="fc2cost" && !window.__lab.S.busy', timeout=180000); await pg.wait_for_timeout(300); await snap('fc2cost-cost')
                await pg.click('[data-tab=validate]'); await pg.click('#runSuite'); await pg.wait_for_function('window.__lab.S.suite', timeout=300000); await pg.wait_for_timeout(300); await snap('validate')
                print('suite', await pg.evaluate('[window.__lab.S.suite.length, window.__lab.S.suite.filter(r=>!r.ok).length]'))
            await pg.keyboard.press('?'); await pg.wait_for_timeout(200); await pg.screenshot(path=f'{OUT}/lab-{tag}-help.png')
            print(tag,'max scrollWidth',sw,'viewport',w); await ctx.close()
        print('\n'.join(errs) or 'no console errors'); await b.close()
asyncio.run(main())
