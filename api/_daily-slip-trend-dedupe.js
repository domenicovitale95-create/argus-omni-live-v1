function normName(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}

export function trendIdentity(row){
  const fixture=row?.fixtureId!=null?String(row.fixtureId):`${row?.kickoff||''}|${normName(row?.opponent)}`;
  return `${fixture}|${normName(row?.team)}|${String(row?.condition||'').toUpperCase()}`;
}

export function dedupeTrendRows(rows){
  const seen=new Set();
  return (rows||[]).filter(row=>{
    const key=trendIdentity(row);
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}
