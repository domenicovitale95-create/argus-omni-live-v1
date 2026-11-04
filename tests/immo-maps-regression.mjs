import assert from 'node:assert/strict';
import {getMapListings} from '../api/immo-map-listings.js';
const listing=(id,extra={})=>({id,area:'21009A',property_type:'building',price_eur:600000,lat:50.83,lon:4.37,...extra});
const calls=[];
const result=await getMapListings(async url=>{
 calls.push(new URL(url));
 assert.equal(url.origin,'https://api.agimo.be');assert.equal(url.searchParams.get('exclude_under_option'),'true');
 const items=[listing(1),listing(2,{area:'23001A'}),listing(3,{under_option:true}),listing(4,{price_eur:2000001}),listing(5,{price_eur:449999}),listing(6,{property_type:'apartment'}),listing(7,{lat:null,lon:null,area:'21009'})];
 return {ok:true,json:async()=>({items,count:items.length,count_capped:false})};
});
assert.deepEqual(result.items.map(x=>x.id),[1,7]);
assert.equal(result.items[0].lat,50.83);assert.equal(result.items[1].lat,null);
assert.equal(calls.length,2);assert.equal(calls.filter(u=>u.searchParams.has('areas')).length,1);assert.equal(calls.find(u=>u.searchParams.has('areas')).searchParams.get('areas').split(',').length,19);
const offsets=[];await getMapListings(async url=>{const offset=Number(url.searchParams.get('offset'));offsets.push(offset);return {ok:true,json:async()=>({count:101,items:offset?[listing(200)]:Array.from({length:100},(_,i)=>listing(i)),count_capped:false})}});
assert.equal(offsets.filter(x=>x===100).length,2);
await assert.rejects(getMapListings(async()=>({ok:false,status:503})),/AGIMO_HTTP_503/);
console.log('PASS Maps: Brussels area suffixes preserve coordinates, deduplication, options and budget exclusions, missing positions, pagination and source failures');
