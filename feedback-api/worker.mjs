const ALLOWED_ORIGIN='https://silicastra.github.io';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validateFeedback(body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('请求格式不正确');
  if(typeof body.website==='string'&&body.website.trim())return {spam:true};
  if(!UUID.test(body.id||''))throw new Error('提交编号不正确，请刷新后重试');
  if(!['bug','suggestion','other'].includes(body.category))throw new Error('请选择反馈类型');
  if(typeof body.message!=='string'||body.message.trim().length<5||body.message.trim().length>2000)throw new Error('反馈内容请填写 5～2000 个字符');
  if(typeof body.contact!=='string'||body.contact.trim().length>120)throw new Error('联系方式最多 120 个字符');
  if(!['home','result'].includes(body.page))throw new Error('页面信息不正确');
  return {id:body.id,category:body.category,message:body.message.trim(),contact:body.contact.trim(),page:body.page};
}
async function readBody(request){
  const reader=request.body?.getReader();if(!reader)throw new Error('请求不能为空');
  const chunks=[];let bytes=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();throw new Error('反馈内容过长');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(joined));
}
export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('Origin');
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if(origin===ALLOWED_ORIGIN)headers['Access-Control-Allow-Origin']=origin;
    const reply=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
    if(url.pathname==='/health'&&request.method==='GET')return reply({ok:true,service:'kobify-feedback'});
    if(url.pathname!=='/feedback')return reply({ok:false,error:'Not found'},404);
    if(origin!==ALLOWED_ORIGIN)return reply({ok:false,error:'不允许的请求来源'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
    if(request.method!=='POST')return reply({ok:false,error:'Method not allowed'},405,{'Allow':'POST, OPTIONS'});
    if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return reply({ok:false,error:'请使用 JSON 请求'},415);
    let feedback;try{feedback=validateFeedback(await readBody(request));}catch(error){return reply({ok:false,error:error instanceof SyntaxError?'请求内容格式错误':error.message},400);}
    if(feedback.spam)return reply({ok:true,id:null},201);
    if(!env.DB)return reply({ok:false,error:'反馈服务暂不可用，请稍后重试'},503);
    const now=Math.floor(Date.now()/1000),day=Math.floor(now/86400)*86400;
    // Rotate the pseudonymous hash daily. Raw IP addresses are not stored.
    const ip=request.headers.get('CF-Connecting-IP')||'unknown';
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(day+'|'+ip));
    const visitor=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    try{
      const existing=await env.DB.prepare('SELECT id FROM feedback WHERE id = ?').bind(feedback.id).first();
      if(existing)return reply({ok:true,id:existing.id,duplicate:true});
      // One atomic statement enforces both limits, including concurrent posts.
      const result=await env.DB.prepare(`INSERT INTO feedback (id,created_at,category,message,contact,page,visitor_hash)
        SELECT ?,?,?,?,?,?,? WHERE
        (SELECT COUNT(*) FROM feedback WHERE visitor_hash=? AND created_at>=?)<5
        AND (SELECT COUNT(*) FROM feedback WHERE created_at>=?)<200
        ON CONFLICT(id) DO NOTHING`).bind(feedback.id,now,feedback.category,feedback.message,feedback.contact,feedback.page,visitor,visitor,Math.max(day,now-600),day).run();
      if(result.meta.changes)return reply({ok:true,id:feedback.id},201);
      const retry=await env.DB.prepare('SELECT id FROM feedback WHERE id = ?').bind(feedback.id).first();
      if(retry)return reply({ok:true,id:retry.id,duplicate:true});
      return reply({ok:false,error:'提交较频繁或今日额度已满，请稍后重试'},429,{'Retry-After':'600'});
    }catch{return reply({ok:false,error:'暂时无法保存反馈，请稍后重试'},503);}
  }
};
