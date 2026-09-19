// Requires Playwright. Checks the real GetCourse form without submitting it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browserName = process.env.BROWSER || 'chromium';
const shortBase = process.env.SHORT_BASE || 'https://2.tvaity.ru/reg-short/';
const query = '?UTM_Source=qa_vk&utm_MEDIUM=cpc&UTM_Campaign=QA%20campaign&utm_content=creative&utm_term=term&utm_extra=custom&REF=partner7&id=wrong';
const expected = {utm_source:'qa_vk',utm_medium:'cpc',utm_campaign:'QA campaign',utm_content:'creative',utm_term:'term',utm_extra:'custom',ref:'partner7'};
const fields = {utm_source:11222149,utm_medium:11222150,utm_campaign:11222151,utm_content:11222152,utm_term:11222153,ref:12011054};
const screenshots = process.env.SCREENSHOTS;
if (screenshots) fs.mkdirSync(screenshots, {recursive:true});

async function checkTracking(page, expectedId) {
  const iframe = page.locator('iframe[src*="/pl/lite/widget/widget"]').first();
  await iframe.waitFor({state:'attached', timeout:45000});
  const source = new URL(await iframe.getAttribute('src'));
  assert.equal(source.searchParams.get('id'), expectedId);
  assert.equal(source.searchParams.getAll('id').length, 1);
  assert.equal(source.searchParams.get('loc'), page.url());
  for (const [name,value] of Object.entries(expected)) assert.equal(source.searchParams.get(name),value,name);
  assert.equal([...source.searchParams.keys()].some(k=>/^utm_/i.test(k) && k!==k.toLowerCase()),false);
  const frame = await (await iframe.elementHandle()).contentFrame();
  for (const [name,id] of Object.entries(fields)) {
    await frame.waitForFunction(({id,value})=>document.getElementById('field-input-'+id)?.value===value,
      {id,value:expected[name]}, {timeout:45000});
  }
  return frame;
}

async function setupPage(browser, width, height) {
  const context = await browser.newContext({viewport:{width,height},isMobile:width<=480,hasTouch:width<=480});
  const page = await context.newPage();
  if (process.env.LEGACY_OVERLAY) {
    await page.route('https://2.tvaity.ru/**', async route=>{
      let file = path.join(process.env.LEGACY_OVERLAY,decodeURIComponent(new URL(route.request().url()).pathname));
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.txt':'text/plain'};
        return route.fulfill({path:file,contentType:types[path.extname(file)]});
      }
      return route.continue();
    });
  }
  return {context,page};
}

(async()=>{
  const browser=await playwright[browserName].launch({headless:true});
  try {
    const sizes = browserName==='chromium'
      ? [[320,568],[360,640],[390,844],[430,932],[768,1024],[844,390],[1024,768],[1366,768],[1920,1080]]
      : [[390,844],[1366,768]];
    for (const [width,height] of sizes) {
      const {context,page}=await setupPage(browser,width,height);
      try {
        await page.goto(shortBase+query,{waitUntil:'domcontentloaded'});
        await page.evaluate(()=>document.fonts.ready);
        const layout=await page.evaluate(()=>{
          const hero=document.querySelector('.hero').getBoundingClientRect();
          const footer=document.querySelector('.footer').getBoundingClientRect();
          const timer=document.querySelector('.countdown').getBoundingClientRect();
          return {overflow:document.documentElement.scrollWidth>innerWidth,footerGap:footer.top-hero.bottom,timerGap:footer.top-timer.bottom};
        });
        assert.equal(layout.overflow,false,`${width}: page overflow`);
        if(width<1024){assert.ok(layout.footerGap<=1);assert.ok(layout.timerGap<=57);}
        if(screenshots && [390,1366].includes(width)) await page.screenshot({path:path.join(screenshots,`${browserName}-page-${width}.png`),fullPage:true});
        await page.locator('[data-gc-open]').click();
        const frame=await checkTracking(page,'1657350');
        await page.locator('#gc-layer[data-gc-sized]').waitFor({state:'attached'});
        // Wait for the live widget's postMessage size to converge, including fonts.
        await frame.waitForFunction(()=>document.documentElement.scrollHeight<=innerHeight+1,null,{timeout:15000});
        assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}: iframe overflow`);
        await frame.locator('form button[type="submit"]').scrollIntoViewIfNeeded();
        const button=await frame.locator('form button[type="submit"]').boundingBox();
        assert.ok(button.x>=-1 && button.x+button.width<=width+1,`${width}: submit clipped horizontally`);
        assert.ok(button.y>=-1 && button.y+button.height<=height+1,`${width}: submit unreachable`);
        if(screenshots && [390,1366].includes(width)) await page.screenshot({path:path.join(screenshots,`${browserName}-widget-${width}.png`)});
        await page.locator('.gc-layer__close').click();
        assert.equal(await page.locator('#gc-layer').getAttribute('aria-hidden'),'true');
        await page.locator('[data-gc-open]').click();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#gc-layer').getAttribute('aria-hidden'),'true');
        console.log(`PASS ${browserName} short ${width}x${height}: layout, form size, UTM fields, open/close`);
      } finally {await context.close();}
    }
    if(process.env.SKIP_LEGACY!=='1') {
      for(const [route,ids] of [['reg',['1657350','1657351']],['reg-01',['1657552','1657553']]]) {
        const {context,page}=await setupPage(browser,1366,768);
        try {
          await page.goto(`https://2.tvaity.ru/${route}/`+query,{waitUntil:'domcontentloaded'});
          for(let i=0;i<2;i++) {
            await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).nth(i).click();
            await checkTracking(page,ids[i]);
            await page.getByRole('button',{name:'Закрыть',exact:true}).click();
            console.log(`PASS ${browserName} /${route}/ widget ${ids[i]}: UTM URL and actual GetCourse fields`);
          }
        } finally {await context.close();}
      }
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
