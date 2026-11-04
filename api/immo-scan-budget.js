// Share the network budget across every source in one scan.
export function createScanBudget({concurrency=24,durationMs=235000,now=Date.now}={}){
 const started=now(),queue=[];let active=0;
 const run=()=>{while(active<concurrency&&queue.length){const {task,resolve,reject}=queue.shift();if(now()-started>=durationMs){reject(new Error('SCAN_TIME_BUDGET_EXHAUSTED'));continue}active++;Promise.resolve().then(task).then(resolve,reject).finally(()=>{active--;run()})}};
 return task=>new Promise((resolve,reject)=>{queue.push({task,resolve,reject});run()});
}
