import sys, asyncio, json
from playwright.async_api import async_playwright
FILE = sys.argv[1]; OUT = sys.argv[2]; PREFIX = sys.argv[3]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        for (w, h, scheme, tag) in [(1360, 900, 'light', 'desk'), (400, 860, 'dark', 'phone')]:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme)
            pg = await ctx.new_page()
            pg.on('console', lambda m: errs.append(f'{tag} console {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
            pg.on('pageerror', lambda e: errs.append(f'{tag} pageerror: {e}'))
            await pg.goto('file://' + FILE)
            await pg.wait_for_timeout(800)
            await pg.screenshot(path=f'{OUT}/{PREFIX}-{tag}-step1.png', full_page=False)
            await pg.click('#runAll')
            await pg.wait_for_function('window.__app && window.__app.S.tests', timeout=240000)
            await pg.wait_for_timeout(500)
            summ = await pg.evaluate('window.__app.S.tests.summary')
            print(tag, 'summary', summ)
            sw = await pg.evaluate('document.documentElement.scrollWidth')
            for i in range(7):
                await pg.evaluate(f'document.querySelector("[data-step=\\"{i}\\"]").click()')
                await pg.wait_for_timeout(300)
                sw = max(sw, await pg.evaluate('document.documentElement.scrollWidth'))
                await pg.screenshot(path=f'{OUT}/{PREFIX}-{tag}-step{i+1}.png', full_page=(tag == 'desk'))
                if i == 5:
                    await pg.click('#regen'); await pg.wait_for_timeout(400)
                    await pg.screenshot(path=f'{OUT}/{PREFIX}-{tag}-chapter.png', full_page=True)
            print(tag, 'max scrollWidth', sw, 'viewport', w)
            # help + tour + tip
            await pg.keyboard.press('?'); await pg.wait_for_timeout(200); await pg.screenshot(path=f'{OUT}/{PREFIX}-{tag}-help.png')
            await pg.keyboard.press('Escape'); await pg.keyboard.press('t'); await pg.wait_for_timeout(200); await pg.screenshot(path=f'{OUT}/{PREFIX}-{tag}-tour.png')
            await ctx.close()
        print('\n'.join(errs) or 'no console errors')
        await b.close()
asyncio.run(main())
