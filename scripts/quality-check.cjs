const sharp=require('sharp');const {imageJob}=require('../dist-electron/jobs');
async function run(){const file=process.argv[2];await sharp(file).rotate().resize(1200).blur(6).jpeg().toFile('/private/tmp/lpv-soft.jpg');for(const [label,f] of [['Original',file],['Blurred','/private/tmp/lpv-soft.jpg']]){const r=await imageJob('analyze',f,`/private/tmp/lpv-quality-${label}.jpg`);console.log(label,JSON.stringify({...r,signature:undefined}))}}
run().catch(e=>{console.error(e);process.exitCode=1})
