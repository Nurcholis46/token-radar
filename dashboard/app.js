(function(){
'use strict';
var DATA = window.RADAR;
if(!DATA)return;
function expandRow(a){
return{rank:a[0],slug:a[1],name:a[2],category:a[3]< 0 ? null:DATA.categories[a[3]],chains:a[4].map(function(i){return DATA.chains[i];}),chain_count:a[5],tvl_usd:a[6],change_7d:a[7],age_days:a[8],implied_value_usd:a[9],category_multiple:a[10],multiple_peers:a[11],growth_multiplier:a[12],maturity_multiplier:a[13]};
}
DATA.rows = DATA.rows.map(expandRow);
DATA.live = DATA.live.map(function(a){
return{slug:a[0],name:a[1],category:a[2]< 0 ? null:DATA.categories[a[2]],chains:a[3].map(function(i){return DATA.chains[i];}),chain_count:a[4],tvl_usd:a[5],change_7d:a[6],mcap_usd:a[7]};
});
DATA.multiples = DATA.multiples.map(function(m){
return{category:DATA.categories[m[0]],multiple:m[1],peers:m[2]};
});
var app = document.getElementById('board');
var state ={q:'',category:'all',chain:'all',tab:'pre-token',sort:'implied',dir:-1,selected:null};
var M = DATA.model;
var usd = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
function fmtUsd(n){
if(n === null || n === undefined || !isFinite(n))return 'n/a';
if(Math.abs(n)>= 1e9)return '$' +(n / 1e9).toFixed(2)+ 'B';
if(Math.abs(n)>= 1e6)return '$' +(n / 1e6).toFixed(1)+ 'M';
if(Math.abs(n)>= 1e3)return '$' + Math.round(n / 1e3)+ 'K';
return usd.format(n);
}
function fmtPct(n){
if(n === null || n === undefined || !isFinite(n))return 'n/a';
return(n > 0 ? '+':'')+ n.toFixed(2)+ '%';
}
function fmtAge(days){
if(days === null || days === undefined)return 'unknown';
if(days >= 365)return(days / 365).toFixed(1)+ 'y';
return Math.max(0,Math.round(days))+ 'd';
}
function fmtMult(n){
return 'x' + n.toFixed(3);
}
function impliedOf(row){
var growth = Math.min(M.growth_cap,Math.max(M.growth_floor,row.change_7d === null || row.change_7d === undefined ? 0:row.change_7d));
var growthMult = 1 +(growth / 100)* M.growth_weight;
var age = row.age_days === null || row.age_days === undefined ? M.unknown_age_days:row.age_days;
var maturity = M.maturity_floor +(Math.min(Math.max(age,0),M.maturity_days)/ M.maturity_days)* M.maturity_range;
return Math.max(1,Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity));
}
function growthMultOf(row){
var growth = Math.min(M.growth_cap,Math.max(M.growth_floor,row.change_7d === null || row.change_7d === undefined ? 0:row.change_7d));
return 1 +(growth / 100)* M.growth_weight;
}
function maturityMultOf(row){
var age = row.age_days === null || row.age_days === undefined ? M.unknown_age_days:row.age_days;
return M.maturity_floor +(Math.min(Math.max(age,0),M.maturity_days)/ M.maturity_days)* M.maturity_range;
}
function el(tag,attrs){
var node = document.createElement(tag);
if(attrs){
Object.keys(attrs).forEach(function(k){
if(k === 'class')node.className = attrs[k];
else if(k === 'text')node.textContent = attrs[k];
else if(k === 'html')node.innerHTML = attrs[k];
else if(k.slice(0,2)=== 'on')node.addEventListener(k.slice(2),attrs[k]);
else if(attrs[k]!== null && attrs[k]!== undefined)node.setAttribute(k,attrs[k]);
});
}
for(var i = 2;i < arguments.length;i++){
var child = arguments[i];
if(child === null || child === undefined)continue;
if(Array.isArray(child))child.forEach(function(c){if(c)node.appendChild(c);});
else if(typeof child === 'string')node.appendChild(document.createTextNode(child));
else node.appendChild(child);
}
return node;
}
function chainOf(p){return p.chains && p.chains.length > 0 ? p.chains[0]:'its main chain';}
function capitalFor(p){
if(p.tvl_usd >= 5e9)return 250;
if(p.tvl_usd >= 1e9)return 150;
if(p.tvl_usd >= 1e8)return 100;
return 50;
}
function holdDaysFor(age){
if(age === null || age === undefined)return 30;
if(age < 180)return 60;
if(age < 365)return 45;
return 30;
}
function actionFor(p,capital,chain){
var c =(p.category || '').toLowerCase();
var name = p.name;
if(c.indexOf('lend')>= 0 || c.indexOf('cdp')>= 0 || c.indexOf('collateral')>= 0)return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and leave the position open so it earns interest.';
if(c.indexOf('dex')>= 0)return 'Provide $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and keep the LP position open.';
if(c.indexOf('yield')>= 0 || c.indexOf('leveraged farm')>= 0 || c.indexOf('farm')>= 0)return 'Deposit $' + capital + " into " + name + "'s highest-yield vault on " + chain + ' and keep the shares.';
if(c.indexOf('bridge')>= 0 || c.indexOf('cross chain')>= 0)return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ' and use the bridged funds inside its app.';
if(c.indexOf('staking')>= 0 || c.indexOf('restak')>= 0)return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
if(c.indexOf('perpetual')>= 0 || c.indexOf('derivative')>= 0 || c.indexOf('options')>= 0)return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
if(c.indexOf('prediction')>= 0)return 'Fund $' + capital + ' and place one market position on ' + name + ', then leave it to settle.';
if(c.indexOf('curator')>= 0 || c.indexOf('allocator')>= 0 || c.indexOf('risk')>= 0)return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares for the whole season.';
if(c.indexOf('stable')>= 0 || c.indexOf('algo')>= 0)return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
if(c.indexOf('rwa')>= 0 || c.indexOf('reserve')>= 0)return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it in your wallet.';
if(c.indexOf('insurance')>= 0)return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
if(c.indexOf('launchpad')>= 0)return 'Stake $' + capital + " to join " + name + "'s next allocation round on " + chain + " and claim only from its own page.";
if(c.indexOf('payment')>= 0 || c.indexOf('card')>= 0)return 'Spend $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipts for the activity record.';
if(c.indexOf('synthetic')>= 0 || c.indexOf('basis')>= 0)return 'Mint $' + capital + ' of the synthetic asset on ' + name + ' and hold the position open.';
return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
}
function weeklyFor(p,chain){
var c =(p.category || '').toLowerCase();
var name = p.name;
if(c.indexOf('dex')>= 0 || c.indexOf('yield')>= 0 || c.indexOf('farm')>= 0)return 'Swap $25 through ' + name + ' on ' + chain + ' once a week to keep trading volume on your wallet.';
if(c.indexOf('lend')>= 0 || c.indexOf('cdp')>= 0 || c.indexOf('collateral')>= 0)return 'Borrow $20 against your deposit on ' + name + ' once a week, then repay it the same day.';
if(c.indexOf('bridge')>= 0 || c.indexOf('cross chain')>= 0)return 'Bridge $25 to ' + chain + ' through ' + name + ' once a week and bring it back the same day.';
if(c.indexOf('perpetual')>= 0 || c.indexOf('derivative')>= 0 || c.indexOf('options')>= 0)return 'Close and reopen a $25 position on ' + name + ' once a week to keep activity fresh.';
if(c.indexOf('prediction')>= 0)return 'Place one $10 market position on ' + name + ' each week and let it settle.';
return 'Make one qualifying action each week on ' + name + ', such as a deposit, a swap, a vote or a claim.';
}
function stepText(step){
var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
if(s.length > 600)s = s.slice(0,596)+ '...';
if(s.length < 20)s = s + " Hold the position and check the protocol's own page.";
return s;
}
function farmSteps(p){
var chain = chainOf(p);
var capital = capitalFor(p);
var hold = holdDaysFor(p.age_days);
var secondChain = p.chains && p.chains.length > 1 ? p.chains[1]:null;
var steps =[
{text:'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',cost:'under $3 of gas for the first transaction',time:'5 minutes'},
{text:actionFor(p,capital,chain),cost:'$' + capital + ' of capital and about $' +(capital >= 150 ? 8:4)+ ' of gas',time:'15 minutes to set up'},
{text:weeklyFor(p,chain),cost:'about $2 of gas a week',time:'10 minutes a week'},
secondChain === null
?{text:'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.',cost:'the $' + capital + ' stays in the position',time:hold + ' days'}
:{text:'Repeat the same position on ' + secondChain + ' with $25 so the wallet is active on two chains.',cost:'$25 of capital and about $3 of gas',time:'15 minutes'},
{text:"Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.",cost:'no fee to check, and never pay to claim',time:'10 minutes'}
];
return steps.map(stepText);
}
function readHash(){
var hash = window.location.hash.replace(/^#/,'');
if(!hash)return;
var params = new URLSearchParams(hash);
if(params.get('q'))state.q = params.get('q');
if(params.get('category'))state.category = params.get('category');
if(params.get('chain'))state.chain = params.get('chain');
if(params.get('tab'))state.tab = params.get('tab');
if(params.get('p'))state.selected = params.get('p');
}
function writeHash(){
var params = new URLSearchParams();
if(state.q)params.set('q',state.q);
if(state.category !== 'all')params.set('category',state.category);
if(state.chain !== 'all')params.set('chain',state.chain);
if(state.tab !== 'pre-token')params.set('tab',state.tab);
if(state.selected)params.set('p',state.selected);
var next = params.toString();
if(next)window.history.replaceState(null,'','#' + next);
else window.history.replaceState(null,'',window.location.pathname + window.location.search);
}
function rows(){
var q = state.q.trim().toLowerCase();
return DATA.rows.filter(function(r){
if(state.category !== 'all' &&(r.category || 'Other')!== state.category)return false;
if(state.chain !== 'all' && !(r.chains ||[]).some(function(c){return c === state.chain;}))return false;
if(!q)return true;
var hay =[r.name,r.slug,r.category,(r.chains ||[]).join(' ')].join(' ').toLowerCase();
return hay.indexOf(q)>= 0;
});
}
function sortedRows(list){
var key = state.sort;
return list.slice().sort(function(a,b){
var av,bv;
if(key === 'name'){av = a.name.toLowerCase();bv = b.name.toLowerCase();}
else if(key === 'tvl'){av = a.tvl_usd;bv = b.tvl_usd;}
else if(key === 'growth'){av = a.change_7d === null ? -Infinity:a.change_7d;bv = b.change_7d === null ? -Infinity:b.change_7d;}
else if(key === 'age'){av = a.age_days === null ? Infinity:a.age_days;bv = b.age_days === null ? Infinity:b.age_days;}
else if(key === 'multiple'){av = a.category_multiple;bv = b.category_multiple;}
else{av = a.implied_value_usd;bv = b.implied_value_usd;}
if(av < bv)return -state.dir;
if(av > bv)return state.dir;
return a.slug < b.slug ? -1:a.slug > b.slug ? 1:0;
});
}
function header(){
return el('header',{class:'top'},
el('div',{class:'brand'},el('span',{class:'mark'}),el('span',{class:'brand-name',text:'Token Radar'})),
el('div',{class:'top-meta'},
el('span',null,'Snapshot ',el('b',{text:DATA.as_of})),
el('span',null,'DefiLlama protocol index'),
el('span',null,'Model ',el('b',{text:DATA.model_version}))
)
);
}
function lede(){
return el('section',{class:'lede'},
el('div',null,
el('h1',{text:DATA.watchlist_size + ' watchlist protocols, ranked by implied value'}),
el('p',null,
'The watchlist is the floor: every protocol with at least ',el('b',{text:'$' + Math.round(DATA.floor_usd / 1e6)+ 'M'}),
' of TVL and no token on record. The early radar adds ',el('b',{text:String(DATA.early_size)}),
' pre-token protocols below that floor, and the live-token view sets aside ',el('b',{text:String(DATA.live_size)}),
' protocols whose token already trades. Implied value is a model, not a promise — and never a prediction of when, or whether, a token launches.'
)
),
el('div',{class:'facts'},
el('div',{class:'fact'},el('span',{text:'Watchlist covered'}),el('b',{text:DATA.watchlist_size + ' / ' + DATA.watchlist_size})),
el('div',{class:'fact'},el('span',{text:'Pre-token rows scored'}),el('b',{text:String(DATA.board_size)})),
el('div',{class:'fact'},el('span',{text:'Early rows below the floor'}),el('b',{text:String(DATA.early_size)})),
el('div',{class:'fact'},el('span',{text:'Top implied value'}),el('b',{text:fmtUsd(DATA.rows[0]? DATA.rows[0].implied_value_usd:0)}))
)
);
}
function controls(){
var categories = Array.from(new Set(DATA.rows.map(function(r){return r.category || 'Other';}))).sort();
var chains = Array.from(new Set(DATA.rows.reduce(function(acc,r){return acc.concat(r.chains ||[]);},[]))).sort();
var search = el('input',{type:'search',id:'q',placeholder:'Name, category or chain',value:state.q,'aria-label':'Search the board'});
search.addEventListener('input',function(){state.q = search.value;writeHash();render();});
var catSelect = el('select',{id:'category','aria-label':'Filter by category'},
el('option',{value:'all',text:'All categories'}),
categories.map(function(c){return el('option',{value:c,text:c,selected:c === state.category ? 'selected':null});})
);
catSelect.addEventListener('change',function(){state.category = catSelect.value;writeHash();render();});
var chainSelect = el('select',{id:'chain','aria-label':'Filter by chain'},
el('option',{value:'all',text:'All chains'}),
chains.map(function(c){return el('option',{value:c,text:c,selected:c === state.chain ? 'selected':null});})
);
chainSelect.addEventListener('change',function(){state.chain = chainSelect.value;writeHash();render();});
var pre = el('button',{type:'button','aria-pressed':state.tab === 'pre-token' ? 'true':'false',text:'Pre-token',onclick:function(){state.tab = 'pre-token';render();}});
var live = el('button',{type:'button','aria-pressed':state.tab === 'live' ? 'true':'false',text:'Live token',onclick:function(){state.tab = 'live';render();}});
return el('div',{class:'controls'},
el('div',{class:'field'},el('label',{for:'q',text:'Search'}),search),
el('div',{class:'field'},el('label',{for:'category',text:'Category'}),catSelect),
el('div',{class:'field'},el('label',{for:'chain',text:'Chain'}),chainSelect),
el('div',{class:'field'},el('span',{class:'sub',text:'Token status'}),el('div',{class:'tabs'},pre,live)),
el('span',{class:'count',text:state.tab === 'pre-token' ? rows().length + ' rows shown':DATA.live.length + ' live-token protocols'})
);
}
function sortHeader(key,label){
return el('th',{scope:'col'},
el('button',{type:'button',onclick:function(){if(state.sort === key)state.dir = -state.dir;else{state.sort = key;state.dir = -1;}render();}},
label,
state.sort === key ? el('span',{'aria-hidden':'true',text:state.dir < 0 ? ' v':' ^'}):null
)
);
}
function chainLabel(r){
var chains = r.chains ||[];
if(chains.length === 0)return 'an unnamed chain';
var shown = chains.slice(0,2).join(', ');
var extra =(r.chain_count || chains.length)- chains.slice(0,2).length;
return extra > 0 ? shown + ' +' + extra + ' more':shown;
}
function boardTable(){
var list = sortedRows(rows());
if(list.length === 0){
return el('div',{class:'panel'},el('div',{class:'empty'},
el('h2',{text:'No protocol matches that filter'}),
el('p',{text:'Clear the search or pick another category or chain to see the board again.'}),
el('button',{class:'button primary',type:'button',text:'Clear filters',onclick:function(){state.q = '';state.category = 'all';state.chain = 'all';writeHash();render();}})
));
}
var max = 0;
list.forEach(function(r){if(r.implied_value_usd > max)max = r.implied_value_usd;});
if(max <= 0)max = 1;
var tbody = el('tbody');
list.forEach(function(r){
var growth = r.change_7d === null ? 'n/a':fmtPct(r.change_7d);
var growthClass = r.change_7d === null ? '':r.change_7d >= 0 ? 'pos':'neg';
var tr = el('tr',{
'data-selected':state.selected === r.slug ? 'true':'false',
tabindex:'0',
onclick:function(){openDetail(r.slug);},
onkeydown:function(e){if(e.key === 'Enter' || e.key === ' '){e.preventDefault();openDetail(r.slug);}}
},
el('td',{class:'num',text:String(r.rank)}),
el('td',null,el('div',{class:'name'},
el('b',{text:r.name}),
el('span',{class:'sub',text:(r.category || 'Other')+ ' on ' + chainLabel(r)})
)),
el('td',{class:'num',text:fmtUsd(r.tvl_usd)}),
el('td',{class:'num ' + growthClass,text:growth}),
el('td',{class:'num',text:fmtAge(r.age_days)}),
el('td',{class:'num',text:fmtMult(r.category_multiple)}),
el('td',null,el('div',{class:'implied'},
el('div',{class:'bar','aria-hidden':'true'},el('i',{style:'width:' + Math.max(3,Math.round((r.implied_value_usd / max)* 100))+ '%'})),
el('span',{class:'num',text:fmtUsd(r.implied_value_usd)})
)),
el('td',null,el('span',{class:'status',text:'no token'}))
);
tbody.appendChild(tr);
});
return el('div',{class:'panel'},
el('div',{class:'table-wrap'},
el('table',null,
el('caption',{text:'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.'}),
el('thead',null,el('tr',null,
sortHeader('implied','Rank'),
sortHeader('name','Protocol'),
sortHeader('tvl','TVL'),
sortHeader('growth','7d'),
sortHeader('age','Age'),
sortHeader('multiple','Multiple'),
sortHeader('implied','Implied value'),
el('th',{scope:'col',text:'Token'})
)),
tbody
)
)
);
}
function liveTable(){
var tbody = el('tbody');
DATA.live.forEach(function(r){
tbody.appendChild(el('tr',null,
el('td',{class:'num',text:'live'}),
el('td',null,el('div',{class:'name'},el('b',{text:r.name}),el('span',{class:'sub',text:(r.category || 'Other')+ ' on ' + chainLabel(r)}))),
el('td',{class:'num',text:fmtUsd(r.tvl_usd)}),
el('td',{class:'num ' +(r.change_7d !== null && r.change_7d >= 0 ? 'pos':'neg'),text:fmtPct(r.change_7d)}),
el('td',{class:'num',text:fmtUsd(r.mcap_usd)}),
el('td',{class:'num',text:r.tvl_usd > 0 && r.mcap_usd !== null ? fmtMult(r.mcap_usd / r.tvl_usd):'n/a'}),
el('td',null,el('span',{class:'status live',text:'already trades'}))
));
});
return el('div',{class:'panel'},
el('div',{class:'table-wrap'},
el('table',null,
el('caption',{text:'Token live: these protocols already trade, so their market cap is a fact, not a model. Their market-cap / TVL ratios are the multiples the model uses — set aside from the pre-token ranking.'}),
el('thead',null,el('tr',null,el('th',{scope:'col',text:'Status'}),el('th',{scope:'col',text:'Protocol'}),el('th',{scope:'col',text:'TVL'}),el('th',{scope:'col',text:'7d'}),el('th',{scope:'col',text:'Market cap'}),el('th',{scope:'col',text:'Mcap / TVL'}),el('th',{scope:'col',text:'Token'}))),
tbody
)
)
);
}
function modelPanel(){
var m = DATA.model;
var multRows = DATA.multiples.map(function(x){
return el('tr',null,
el('td',{text:x.category}),
el('td',{class:'num',text:fmtMult(x.multiple)}),
el('td',{class:'num',text:x.peers > 0 ? String(x.peers):'global'})
);
});
return el('section',{class:'panel model'},
el('h2',{text:'How implied value is computed'}),
el('p',{class:'sub',text:'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.'}),
el('div',{class:'formula'},
'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
),
el('p',{class:'sub',text:'The category multiple is the median market-cap / TVL of the launched protocols in that category, read from this snapshot alone. A category with fewer than ' + m.multiple_min_peers + ' launched peers uses the global median (' + fmtMult(DATA.global_multiple)+ '), and every multiple is clamped to [' + m.multiple_min + ', ' + m.multiple_max + ']. Age is the time since the protocol was first listed — the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.'}),
el('table',{class:'mult-table'},
el('caption',{text:'Category multiples used by the model, with the launched peers behind each.'}),
el('thead',null,el('tr',null,el('th',{scope:'col',text:'Category'}),el('th',{scope:'col',text:'Multiple'}),el('th',{scope:'col',text:'Peers'}))),
el('tbody',null,multRows)
)
);
}
function honestyNote(){
return el('p',{class:'note'},
el('b',{text:'Read this before you farm. '}),
'“Records no token” means this snapshot’s DefiLlama record shows no token for the protocol — it is not proof the protocol has none, and a launch is never promised. Implied value is the model’s claim from TVL, growth and age, not a price and not a prediction. Farm only money you can lose, use a fresh wallet, and claim only from links the protocol itself publishes.'
);
}
var dialog = el('dialog',{class:'detail',id:'detail','aria-labelledby':'detail-title'});
dialog.addEventListener('close',function(){state.selected = null;writeHash();});
function openDetail(slug){
var row = DATA.rows.filter(function(r){return r.slug === slug;})[0];
if(!row)return;
state.selected = slug;
writeHash();
dialog.textContent = '';
var steps = farmSteps(row);
var recomputed = impliedOf(row);
var checkText = recomputed === row.implied_value_usd
? 'The page recomputes this row as ' + fmtUsd(recomputed)+ ', the same number board.json carries.'
:'The page recomputes this row as ' + fmtUsd(recomputed)+ '; the board carries ' + fmtUsd(row.implied_value_usd)+ ' after the one-dollar tie-break that keeps ranks strictly ordered.';
dialog.appendChild(el('div',{class:'detail-head'},
el('div',null,
el('span',{class:'brand-name',text:'Rank ' + row.rank + ' of ' + DATA.board_size}),
el('h2',{id:'detail-title',text:row.name}),
el('p',{class:'sub',text:(row.category || 'Other')+ ' on ' +(row.chains ||[]).join(', ')+(row.chain_count >(row.chains ||[]).length ? ' and ' +(row.chain_count -(row.chains ||[]).length)+ ' more chains':'')})
),
el('button',{class:'close',type:'button','aria-label':'Close details',text:'Close',onclick:function(){dialog.close();}})
));
dialog.appendChild(el('section',{class:'detail-section'},
el('h3',{text:'Implied value'}),
el('div',{class:'equation'},
el('div',null,el('span',{text:'TVL'}),el('b',{class:'num',text:fmtUsd(row.tvl_usd)})),
el('div',null,el('span',{text:'Category multiple'}),el('b',{class:'num',text:fmtMult(row.category_multiple)+(row.multiple_peers > 0 ? ' (' + row.multiple_peers + ' peers)':' (global median)')})),
el('div',null,el('span',{text:'Seven-day growth'}),el('b',{class:'num',text:fmtPct(row.change_7d)+ ' -> x' + growthMultOf(row).toFixed(4)})),
el('div',null,el('span',{text:'Age with no token'}),el('b',{class:'num',text:fmtAge(row.age_days)+ ' -> x' + maturityMultOf(row).toFixed(4)})),
el('div',{class:'total'},el('span',{text:'Implied value'}),el('b',{class:'num',text:fmtUsd(row.implied_value_usd)}))
),
el('p',{class:'sub',text:'Model ' + DATA.model_version + ': the same function scores every protocol. ' + checkText + ' This is an estimate, not a price.'})
));
dialog.appendChild(el('section',{class:'detail-section'},
el('h3',{text:'Farm plan'}),
el('ol',{class:'steps'},steps.map(function(s){
var at = s.indexOf(' Cost: ');
var action = at >= 0 ? s.slice(0,at):s;
var tail = at >= 0 ? s.slice(at + 1):'';
return el('li',null,el('b',{text:action}),el('span',{class:'cost',text:tail}));
}))
));
if(typeof dialog.showModal === 'function'){
if(!dialog.open)dialog.showModal();
}else{
dialog.setAttribute('open','');
}
}
function render(){
app.textContent = '';
var shell = el('div',{class:'shell'});
shell.appendChild(header());
shell.appendChild(lede());
shell.appendChild(controls());
shell.appendChild(state.tab === 'pre-token' ? boardTable():liveTable());
if(state.tab === 'pre-token')shell.appendChild(modelPanel());
shell.appendChild(honestyNote());
app.appendChild(shell);
app.setAttribute('aria-busy','false');
if(!dialog.isConnected)app.appendChild(dialog);
if(state.selected)openDetail(state.selected);
}
readHash();
render();
window.addEventListener('keydown',function(e){
if(e.key === 'Escape' && dialog.open)dialog.close();
});
})();
