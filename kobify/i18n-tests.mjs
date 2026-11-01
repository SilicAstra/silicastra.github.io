import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const source=html.match(/<script id="i18n-source">([\s\S]*?)<\/script>/)[1].replace('I18n.init();','');
function setup(languages,saved,blocked=false){const ctx=vm.createContext({navigator:{languages,language:languages[0]},window:{addEventListener(){}},localStorage:{getItem(){if(blocked)throw Error('blocked');return saved;}},console});vm.runInContext(source+';this.api=I18n;',ctx);return ctx.api;}
for(const [langs,saved,expected] of [[['ja-JP'],null,'ja'],[['en-GB'],null,'en'],[['zh-TW'],null,'zh-CN'],[['fr-FR'],null,'en'],[['fr-FR','ja-JP'],null,'ja'],[['ja-JP'],'en','en'],[['en-US'],'zh-CN','zh-CN'],[['ja-JP'],'invalid','ja']])assert.equal(setup(langs,saved).locale,expected);
assert.equal(setup(['ja-JP'],null,true).locale,'ja');
for(const lang of ['en','ja']){
 const api=setup([lang]);assert.notEqual(api.t('请上传图片'),'请上传图片');
 for(const message of ['高 · 128 × 128','极高，192 × 192 像素','256 × 256 · 65,536 个像素','正在重排 65536 个色块，可以随时取消。','正在计算 · 31%','计算完成，用时 2.5 秒。可拖动进度、对照原图或导出结果。','验证通过，已精确还原 256 × 256 输入像素图。','无法还原：图片不含还原密钥，请选择本站下载的图钥一体 PNG','感谢反馈，已送达作者的反馈箱。 编号：12345678'])if(!(lang==='ja'&&message==='高 · 128 × 128'))assert.notEqual(api.t(message),message,message);
 assert.equal(api.t('用户照片.png'),'用户照片.png');assert.equal(api.t('kobify-076f6ce6f8ba-image-key.png'),'kobify-076f6ce6f8ba-image-key.png');assert.equal(api.t('  请上传图片  ').startsWith('  '),true);
}
assert.equal(setup(['zh-CN']).t('请上传图片'),'请上传图片');
console.log('PASS: browser language negotiation, regional variants, fallback, saved preference, blocked storage, dynamic progress/recovery/error strings and filename preservation.');
