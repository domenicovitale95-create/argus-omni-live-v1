import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const dossier=await readFile(new URL('../immo-bien.html',import.meta.url),'utf8');
const opportunities=await readFile(new URL('../immo-opportunities.html',import.meta.url),'utf8');

assert.match(opportunities,/Voir le dossier ARGUS/,'Opportunity cards must link to the ARGUS dossier');
assert.match(opportunities,/\/immo-bien\?id=/,'Dossier link must carry the listing id');
assert.match(dossier,/api\/immo-curated-active/,'Dossier must re-check active availability through curated active API');
assert.match(dossier,/Bien non affiché/,'Dossier must fail closed when the listing is not confirmed active');
assert.match(dossier,/ARGUS ne peut pas confirmer que cette annonce est encore active/,'Fail-closed explanation must be visible');
assert.match(dossier,/01 · VALEUR/,'Value section missing');
assert.match(dossier,/02 · RISQUES/,'Risk section missing');
assert.match(dossier,/03 · DONNÉES/,'Data section missing');
assert.match(dossier,/04 · QUARTIER/,'Neighborhood section missing');
assert.match(dossier,/05 · COMPARABLES/,'Comparables section missing');
assert.match(dossier,/06 · DOCUMENTS MANQUANTS/,'Missing-documents section missing');
assert.doesNotMatch(dossier,/Buy Box|Strategic Brussels|LIVE DISCOVERY/i,'Visible dossier labels must remain French');

console.log(JSON.stringify({ok:true,dossier:true},null,2));
