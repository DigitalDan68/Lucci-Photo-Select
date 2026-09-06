const {test}=require('node:test'),assert=require('node:assert/strict')
const {dcpIdentity,cameraMatches,profileSettings}=require('../dist-electron/profiles')
test('DCP identity reads camera-specific profile tags and rejects malformed input',()=>{
 const b=Buffer.alloc(160);b.write('II');b.writeUInt16LE(0x4352,2);b.writeUInt32LE(8,4);b.writeUInt16LE(3,8)
 const entry=(at,tag,type,count,offset)=>{b.writeUInt16LE(tag,at);b.writeUInt16LE(type,at+2);b.writeUInt32LE(count,at+4);b.writeUInt32LE(offset,at+8)}
 entry(10,50708,2,14,60);b.write('Sony ILCE-7M5\0',60);entry(22,50936,2,10,90);b.write('Camera PT\0',90);entry(34,50721,10,9,100)
 assert.deepEqual(dcpIdentity(b),{camera:'Sony ILCE-7M5',name:'Camera PT'});b.writeUInt16LE(18246,22);assert.equal(dcpIdentity(b).name,'Camera PT');assert.throws(()=>dcpIdentity(Buffer.from('not a profile')))
 assert(cameraMatches('Sony ILCE-7M5','ILCE-7M5'));assert(!cameraMatches('Sony ILCE-7M4','ILCE-7M5'))
})
test('DCP processing enables matrix correction, look table, tone curve, and exposure offset',()=>{const settings=profileSettings('C:\\Camera profiles\\Camera PT.dcp');assert(settings.includes('InputProfile=file:C:/Camera profiles/Camera PT.dcp'));for(const name of ['ToneCurve','ApplyHueSatMap','ApplyLookTable','ApplyBaselineExposureOffset'])assert(settings.includes(name+'=true'));assert(settings.includes('[Crop]\nEnabled=false'))})
