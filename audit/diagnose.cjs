const {launch, fixture, fill, events, site} = require('../tests/browser/fixture.cjs');
(async () => {
 const b=await launch();
 try {
 const {page,context,posts,nextPost}=await fixture(b,{width:390,height:844,touch:true});
 await page.goto(site+'/?service=sprinkler&request=prv-service#contact');
 console.log('initial',page.url(),await page.locator('#service').inputValue());
 await fill(page);
 const button=page.locator('.submit-btn');
 await context.setOffline(true);
 await button.tap();
 console.log('offline',await page.evaluate(()=>[document.activeElement.id,navigator.onLine,document.querySelector('#enquiry-offline').hidden]));
 await context.setOffline(false);
 await page.waitForTimeout(80);
 console.log('reconnected',await page.evaluate(()=>[document.activeElement.tagName,document.activeElement.className]));
 const data=[];
 page.on('console',m=>{if(m.text().startsWith('qa:')) console.log(m.text());});
 await page.evaluate(()=>{
  if(window.navigation)navigation.addEventListener('navigate',e=>{
   console.log('qa:navigate',e.destination.url,e.canIntercept,e.formData!==null);
   e.signal.addEventListener('abort',()=>console.log('qa:abort'));
  });
  document.addEventListener('submit',e=>console.log('qa:submit',e.defaultPrevented));
 });
 await button.focus();
 const post=nextPost();
 await page.keyboard.press('Enter');
 await post; console.log('provider received');
 await page.keyboard.press('Enter');
 await page.waitForTimeout(400); console.log('dup',posts.length);
 for (const {route} of posts) await route.fulfill({status:204}).catch(()=>{});
 await page.waitForTimeout(200); console.log('204 finished');
 } finally {await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
