export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({error:'Not found'});
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});

  const captured=[];
  const onWarning=(warning)=>{
    if(warning?.code==='DEP0169'){
      const row={name:warning.name,code:warning.code,message:warning.message,stack:warning.stack||null};
      captured.push(row);
      console.warn('[ARGUS_DEP0169_TRACE]',JSON.stringify(row));
    }
  };
  process.on('warning',onWarning);
  try{
    const blob=await import('@vercel/blob');
    let blobResult='SKIPPED_NO_STORE';
    if(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN){
      const result=await blob.list({prefix:'argus/',limit:1});
      blobResult=`OK:${Array.isArray(result?.blobs)?result.blobs.length:0}`;
    }
    await new Promise(resolve=>setTimeout(resolve,25));
    return res.status(200).json({ok:true,blobResult,captured});
  }catch(error){
    return res.status(200).json({ok:false,error:String(error?.message||error),captured});
  }finally{
    process.off('warning',onWarning);
  }
}
