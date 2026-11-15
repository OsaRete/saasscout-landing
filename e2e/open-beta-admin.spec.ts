import { test, expect, type Page } from "@playwright/test";
const base=process.env.BETA_MEMBERSHIP_UI_BASE;
test.skip(!base,"Local synthetic Open Beta UI required");
test.use({launchOptions:{executablePath:process.env.BETA_MEMBERSHIP_CHROMIUM_PATH||undefined}});
async function session(page:Page,owner=false) {
  await page.addInitScript(()=>localStorage.setItem('sb-placeholder-auth-token',JSON.stringify({
    access_token:'synthetic-token',token_type:'bearer',refresh_token:'synthetic-refresh',expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'fixture-owner',email:'fixture@example.test'},
  })));
  await page.route('**/auth/v1/user',route=>route.fulfill({json:{id:'fixture-owner',email:'fixture@example.test'}}));
  await page.route('**/api/user/capabilities',route=>route.fulfill({json:{capabilities:{isOwnerAdministrator:owner}}}));
}
test('ordinary Weekly user reads reports without a manual generation control',async({page})=>{
  await session(page);
  let writes=0;
  await page.route('**/api/weekly-intelligence',route=>{
    if(route.request().method()!=='GET') writes++;
    return route.fulfill({json:{runs:[],problems:[],externalSources:[]}});
  });
  await page.goto(`${base}/weekly`);
  await expect(page.getByRole('heading',{name:'Evidence-grounded weekly market intelligence.',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Refresh Weekly Intelligence'})).toHaveCount(0);
  await expect(page.getByText('Your report will appear after the next scheduled generation.')).toBeVisible();
  expect(writes).toBe(0);
});
test('owner deletion control confirms the UUID and reports review rather than erasure',async({page})=>{
  await session(page,true);
  const id='00000000-0000-4000-8000-000000000002';
  let requested=false;
  await page.route('**/api/admin/users*',async route=>{
    if(route.request().method()==='POST') {
      expect(route.request().postDataJSON()).toEqual({userId:id,action:'request_deletion',confirmation:id});
      requested=true;
      return route.fulfill({json:{status:'deletion_review_required',deleted:false}});
    }
    return route.fulfill({json:{users:[{user_id:id,email:'synthetic@example.test',verified:true,
      suspended:requested,owner_administrator:false,deletion_requested_at:requested?'2026-11-15T00:00:00Z':null,
      scans_used:2,scan_limit:3,scans_this_month:2,discoveries_this_month:1}],page:1}});
  });
  await page.goto(`${base}/admin/users`);
  await page.getByRole('button',{name:'Request deletion review'}).click();
  await expect(page.getByRole('button',{name:'Confirm action'})).toBeDisabled();
  await page.getByLabel('Confirm account UUID').fill(id);
  await page.getByRole('button',{name:'Confirm action'}).click();
  await expect(page.getByText('Access suspended. Deletion review recorded; no data or Auth account has been deleted.')).toBeVisible();
  expect(requested).toBe(true);
  await expect(page.getByRole('button',{name:'Re-enable'})).toBeDisabled();
});
