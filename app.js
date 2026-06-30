
const BASE_QUESTIONS = (window.QUESTION_DATA && window.QUESTION_DATA.questions) || [];
const CUSTOM_KEY = 'aiSkillIqCustomQuestionsV1';
let customQuestions = loadCustomQuestions();
let QUESTIONS = mergeQuestionSets(BASE_QUESTIONS, customQuestions);
let parsedImport = [];
const META = (window.QUESTION_DATA && window.QUESTION_DATA.meta) || {};
const CONCEPTS = (window.CONCEPT_DATA && window.CONCEPT_DATA.concepts) || [];
const DIFFS = ['Medium','Hard','Very Hard'];
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uniq = arr => [...new Set(arr)].filter(Boolean).sort((a,b)=>String(a).localeCompare(String(b)));
const pct = (c,t) => t ? Math.round((c/t)*100) : 0;
const norm = s => String(s||'').toLowerCase();
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function sample(arr,n){ return shuffle(arr).slice(0, Math.min(n, arr.length)); }

function loadCustomQuestions(){
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch(e){ return []; }
}
function saveCustomQuestions(arr){ localStorage.setItem(CUSTOM_KEY, JSON.stringify(arr || [])); }
function mergeQuestionSets(base, custom){
  const seen = new Set();
  return [...(base||[]), ...(custom||[])].filter(q => {
    if(!q || !q.id) return false;
    const key = String(q.id);
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function refreshQuestionBankViews(){
  customQuestions = loadCustomQuestions();
  QUESTIONS = mergeQuestionSets(BASE_QUESTIONS, customQuestions);
  pruneTopicSelections();
  renderFilters();
  renderDashboard();
  updatePoolPreview();
  renderImportStats();
}
function validateQuestion(q){
  return q && q.question && Array.isArray(q.choices) && q.choices.length >= 4 && Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.choices.length;
}
function normalizeImportedQuestion(q, i, defaults={}){
  const choices = (q.choices || q.options || []).map(x => String(x).trim()).filter(Boolean).slice(0,4);
  let answerIndex = Number.isInteger(q.answerIndex) ? q.answerIndex : null;
  if(answerIndex == null && q.answerLetter){ answerIndex = 'ABCD'.indexOf(String(q.answerLetter).trim().toUpperCase()[0]); }
  const diff = ['Medium','Hard','Very Hard'].includes(q.difficulty) ? q.difficulty : defaults.difficulty;
  const obj = {
    id: q.id ? `custom_${String(q.id).replace(/^custom_/,'')}` : `custom_${Date.now()}_${i}_${Math.random().toString(36).slice(2,7)}`,
    bank: String(q.bank || defaults.bank || 'Custom Imported Questions').trim(),
    topic: String(q.topic || defaults.topic || 'Imported Practice').trim(),
    difficulty: diff || 'Hard',
    question: String(q.question || '').trim(),
    choices,
    answerIndex,
    answerLetter: answerIndex != null && answerIndex >= 0 ? 'ABCD'[answerIndex] : '',
    explanation: String(q.explanation || q.rationale || 'No explanation provided.').trim(),
    source: q.source || 'Imported by browser upload'
  };
  return validateQuestion(obj) ? obj : null;
}


function openSetupRail(){
  const rail = $('#setupRail');
  if(!rail) return;
  rail.classList.add('open');
  document.body.classList.add('rail-open');
}
function closeSetupRail(){
  const rail = $('#setupRail');
  if(!rail) return;
  rail.classList.remove('open');
  document.body.classList.remove('rail-open');
}
function scrollMainToTop(){
  try { window.scrollTo({top:0, left:0, behavior:'auto'}); } catch(e) { window.scrollTo(0,0); }
}

let state = {
  view:'dashboard', mode:'learn', banks:new Set(), topics:new Set(), diffs:new Set(DIFFS),
  session:[], idx:0, selected:null, answers:[], timer:null, endAt:null
};

function loadProgress(){ try { return JSON.parse(localStorage.getItem('aiSkillIqProgressV2') || '{"answered":{},"best":null}'); } catch(e){ return {answered:{},best:null}; } }
function saveProgress(p){ localStorage.setItem('aiSkillIqProgressV2', JSON.stringify(p)); }
function markAnswered(q, correct){ const p=loadProgress(); p.answered[q.id]={correct, t:Date.now(), topic:q.topic, bank:q.bank, difficulty:q.difficulty}; saveProgress(p); updateProgressWidget(); }
function saveBest(score){ const p=loadProgress(); p.best = p.best==null ? score : Math.max(p.best, score); saveProgress(p); updateProgressWidget(); }

function init(){
  // Start with no bank/topic filters selected. Users select what they want; topics are optional filters inside selected banks.
  state.banks = new Set();
  state.topics = new Set();
  bindEvents();
  renderFilters();
  renderDashboard();
  updateProgressWidget();
  setMode('learn');
  showView('dashboard');
  updatePoolPreview();
  renderImportStats();
}

function bindEvents(){
  $('#homeLink').addEventListener('click', e=>{e.preventDefault(); showView('dashboard');});
  $$('.nav-btn').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeSetupRail(); });
  $('#mobileFilters').addEventListener('click', openSetupRail);
  $('#closeRail').addEventListener('click', closeSetupRail);
  $('#themeToggle').addEventListener('click', () => { document.body.dataset.theme = document.body.dataset.theme === 'light' ? '' : 'light'; });
  $('#resetProgress').addEventListener('click', () => { if(confirm('Clear local answered counts and best score?')){ localStorage.removeItem('aiSkillIqProgressV2'); updateProgressWidget(); }});
  $('#modeGrid').addEventListener('click', e => { const card=e.target.closest('.mode-card'); if(card) setMode(card.dataset.mode); });
  $('#bankSearch').addEventListener('input', renderBankChips);
  $('#topicSearch').addEventListener('input', renderTopicChips);
  $('#selectedOnly').addEventListener('change', renderTopicChips);
  $('#banksAll').addEventListener('click', () => { state.banks = new Set(uniq(QUESTIONS.map(q=>q.bank))); renderBankChips(); renderTopicChips(); updatePoolPreview(); });
  $('#banksNone').addEventListener('click', () => { state.banks.clear(); state.topics.clear(); renderBankChips(); renderTopicChips(); updatePoolPreview(); });
  $('#topicsAll').addEventListener('click', () => { state.topics = new Set(getAvailableTopics()); renderTopicChips(); updatePoolPreview(); });
  $('#topicsNone').addEventListener('click', () => { state.topics.clear(); renderTopicChips(); updatePoolPreview(); });
  $('#bankList').addEventListener('click', e => { const chip=e.target.closest('.chip'); if(!chip) return; toggleSet(state.banks, chip.dataset.value); pruneTopicSelections(); renderBankChips(); renderTopicChips(); updatePoolPreview(); });
  $('#topicList').addEventListener('click', e => { const chip=e.target.closest('.chip'); if(!chip) return; toggleSet(state.topics, chip.dataset.value); renderTopicChips(); updatePoolPreview(); });
  $('#difficultyList').addEventListener('click', e => { const btn=e.target.closest('button'); if(!btn) return; toggleSet(state.diffs, btn.dataset.value); renderDifficulty(); updatePoolPreview(); });
  ['questionCount','examMinutes','shuffleOptions'].forEach(id => $('#'+id).addEventListener('change', updatePoolPreview));
  $('#startBtn').addEventListener('click', startSession);
  $('#heroStart').addEventListener('click', () => { state.banks.clear(); state.topics.clear(); renderBankChips(); renderTopicChips(); setMode('skill'); startSession(); });
  $('#heroSetup').addEventListener('click', () => showView('setup'));
  $('#openConceptsBtn').addEventListener('click', () => renderConcepts());
  $('#conceptCategory').addEventListener('change', renderConcepts);
  $('#submitAnswer').addEventListener('click', submitAnswer);
  $('#nextQuestion').addEventListener('click', nextQuestion);
  $('#finishSession').addEventListener('click', finishSession);
  const importFile = $('#importFile');
  if(importFile){
    importFile.addEventListener('change', () => { $('#importFileName').textContent = importFile.files && importFile.files[0] ? importFile.files[0].name : 'No file selected.'; parsedImport=[]; renderImportStats(); });
    $('#parseImportBtn').addEventListener('click', parseImportFile);
    $('#saveImportedBtn').addEventListener('click', saveParsedQuestions);
    $('#exportCustomBtn').addEventListener('click', exportCustomQuestions);
    $('#exportCustomTxtBtn').addEventListener('click', exportCustomQuestionsTxt);
    $('#downloadTemplateBtn').addEventListener('click', downloadQuestionTemplate);
    $('#clearCustomBtn').addEventListener('click', clearCustomQuestions);
  }
}
function toggleSet(set, value){ set.has(value) ? set.delete(value) : set.add(value); }
function showView(view){
  state.view=view;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === view+'View'));
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view===view));
  if(window.innerWidth < 980){
    const nav = $('.topnav');
    const activeNav = $(`.nav-btn[data-view="${view}"]`);
    if(activeNav && activeNav.scrollIntoView) activeNav.scrollIntoView({block:'nearest', inline:'center'});
    else if(nav) nav.scrollLeft = 0;
  }
  if(view==='concepts') renderConcepts(false);
  if(view==='setup') updatePoolPreview();
  if(window.innerWidth < 980) closeSetupRail();
  scrollMainToTop();
}
function setMode(mode){
  state.mode=mode;
  $$('.mode-card').forEach(c => c.classList.toggle('selected', c.dataset.mode===mode));
  $('#questionControls').classList.toggle('hidden', mode==='concept');
  $('#conceptControls').classList.toggle('hidden', mode!=='concept');
  if(mode==='skill') { $('#questionCount').value=20; $('#examMinutes').value=12; state.diffs = new Set(DIFFS); renderDifficulty(); }
  if(mode==='concept') showView('concepts'); else if(state.view==='concepts') showView('setup');
  updatePoolPreview();
}
function getAvailableTopics(){
  const base = state.banks.size ? QUESTIONS.filter(q=>state.banks.has(q.bank)) : QUESTIONS;
  return uniq(base.map(q=>q.topic));
}
function pruneTopicSelections(){
  const available = new Set(getAvailableTopics());
  state.topics = new Set([...state.topics].filter(t=>available.has(t)));
}
function renderFilters(){ renderBankChips(); renderTopicChips(); renderDifficulty(); const cats=['All', ...uniq(CONCEPTS.map(c=>c.category))]; $('#conceptCategory').innerHTML = cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join(''); }
function renderBankChips(){
  const search=norm($('#bankSearch').value); const banks=uniq(QUESTIONS.map(q=>q.bank)).filter(b=>norm(b).includes(search));
  $('#bankList').innerHTML = banks.length ? banks.map(b=>`<button class="chip ${state.banks.has(b)?'selected':''}" data-value="${esc(b)}" title="${esc(b)}">${esc(b)}</button>`).join('') : `<div class="empty">No banks match.</div>`;
  $('#bankCount').textContent = state.banks.size ? `${state.banks.size}/${uniq(QUESTIONS.map(q=>q.bank)).length}` : 'Choose';
}
function renderTopicChips(){
  const search=norm($('#topicSearch').value); const selectedOnly=$('#selectedOnly').checked;
  const availableTopics=getAvailableTopics();
  let topics=availableTopics.filter(t=>norm(t).includes(search));
  if(selectedOnly) topics = topics.filter(t=>state.topics.has(t));
  $('#topicList').innerHTML = topics.length ? topics.map(t=>`<button class="chip ${state.topics.has(t)?'selected':''}" data-value="${esc(t)}" title="${esc(t)}">${esc(t)}</button>`).join('') : `<div class="empty">No topics match.</div>`;
  $('#topicCount').textContent = state.topics.size ? `${state.topics.size}/${availableTopics.length}` : 'Optional';
}
function renderDifficulty(){ $('#difficultyList').innerHTML = DIFFS.map(d=>`<button class="${state.diffs.has(d)?'selected':''}" data-value="${d}">${d}</button>`).join(''); }

function getPool(){
  const diffs=[...state.diffs];
  // Normal practice starts empty until the user selects at least one question bank.
  // Topic selection is optional: no topic chips selected means all topics inside the selected bank(s).
  if(state.mode!=='skill' && state.banks.size===0) return [];

  let pool=QUESTIONS.filter(q => {
    const bankOK = state.banks.size ? state.banks.has(q.bank) : state.mode==='skill';
    const topicOK = state.topics.size ? state.topics.has(q.topic) : true;
    return bankOK && topicOK && diffs.includes(q.difficulty);
  });

  if(state.mode==='skill'){
    // Sprint can be global when launched from the dashboard, or targeted when filters are selected.
    pool=QUESTIONS.filter(q => {
      const bankOK = state.banks.size ? state.banks.has(q.bank) : true;
      const topicOK = state.topics.size ? state.topics.has(q.topic) : true;
      return bankOK && topicOK && DIFFS.includes(q.difficulty);
    });
    if(pool.length < 20) pool = QUESTIONS.filter(q => DIFFS.includes(q.difficulty));
  }
  return pool;
}
function updatePoolPreview(){
  const pool=getPool(); const byDiff=Object.fromEntries(DIFFS.map(d=>[d,pool.filter(q=>q.difficulty===d).length]));
  const bankN=uniq(pool.map(q=>q.bank)).length, topicN=uniq(pool.map(q=>q.topic)).length;
  $('#poolPreview').innerHTML = `<div class="card-head"><h2>Current pool</h2><span class="mini-badge">${pool.length} matching MCQs</span></div>
  <div class="pool-grid">
    <div class="pool-card"><span>Question pool</span><b>${pool.length}</b></div>
    <div class="pool-card"><span>Banks selected</span><b>${bankN}</b></div>
    <div class="pool-card"><span>Topics selected</span><b>${topicN}</b></div>
    <div class="pool-card"><span>Medium</span><b>${byDiff.Medium||0}</b></div>
    <div class="pool-card"><span>Hard</span><b>${byDiff.Hard||0}</b></div>
    <div class="pool-card"><span>Very Hard</span><b>${byDiff['Very Hard']||0}</b></div>
  </div>
  <p class="pool-note">${state.mode!=='skill' && state.banks.size===0 ? 'Select one or more question banks to build a targeted pool. Topics are optional filters, so you do not need to select all topics.' : 'Learning mode shows feedback after every question. Exam and Sprint modes hide explanations until the end and calculate percentage scores.'}</p>`;
}

function renderDashboard(){
  const banks=uniq(QUESTIONS.map(q=>q.bank)); const topics=uniq(QUESTIONS.map(q=>q.topic));
  $('#totalQuestionsHero').textContent=QUESTIONS.length; $('#bankTotalHero').textContent=banks.length; $('#topicTotalHero').textContent=topics.length; $('#conceptTotalHero').textContent=CONCEPTS.length;
  const hard=QUESTIONS.filter(q=>q.difficulty==='Hard').length, very=QUESTIONS.filter(q=>q.difficulty==='Very Hard').length;
  $('#statGrid').innerHTML = [
    ['Total MCQs', QUESTIONS.length, 'All previous banks preserved + new scenarios'],
    ['Hard / Very Hard', hard+very, 'Designed for high Skill IQ preparation'],
    ['Prompt scenarios', QUESTIONS.filter(q=>q.bank.includes('Prompt')).length, 'Includes harder example-based prompts'],
    ['Concept cards', CONCEPTS.length, 'Architecture, RAG, eval, agents, prompt traps']
  ].map(([a,b,c])=>`<article class="stat-card panel"><span>${a}</span><b>${b}</b><small>${c}</small></article>`).join('');
  const byBank={}; QUESTIONS.forEach(q=>byBank[q.bank]=(byBank[q.bank]||0)+1); const max=Math.max(...Object.values(byBank));
  $('#coverageBadge').textContent=`${banks.length} banks`;
  $('#coverageList').innerHTML = Object.entries(byBank).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>`<div class="coverage-row"><span title="${esc(k)}">${esc(k)}</span><div class="bar"><i style="width:${Math.round(v/max*100)}%"></i></div><span>${v}</span></div>`).join('');
}
function updateProgressWidget(){ const p=loadProgress(); $('#answeredLocal').textContent=Object.keys(p.answered||{}).length; $('#bestScore').textContent=p.best==null?'—':`${p.best}%`; }

function makeSessionQuestion(q){
  const options=q.choices.map((text,i)=>({text, originalIndex:i, correct:i===q.answerIndex}));
  const finalOptions=$('#shuffleOptions').checked ? shuffle(options) : options;
  return {...q, options:finalOptions, correctOptionIndex:finalOptions.findIndex(o=>o.correct), selectedIndex:null, isCorrect:null};
}
function startSession(){
  if(state.mode==='concept'){ renderConcepts(); return; }
  clearInterval(state.timer);
  const pool=getPool();
  if(!pool.length){
    alert(state.banks.size===0 && state.mode!=='skill' ? 'Select at least one question bank, then start the session. Topics are optional.' : 'No questions match the selected filters. Select more banks, topics, or difficulties.');
    showView('setup');
    return;
  }
  let n=Math.max(1, parseInt($('#questionCount').value || '25', 10));
  if(state.mode==='skill'){
    n=20; $('#questionCount').value=20; $('#examMinutes').value=12;
    const m=sample(pool.filter(q=>q.difficulty==='Medium'),6), h=sample(pool.filter(q=>q.difficulty==='Hard'),8), v=sample(pool.filter(q=>q.difficulty==='Very Hard'),6);
    let selected=shuffle([...m,...h,...v]);
    if(selected.length<n) selected=shuffle([...selected, ...sample(pool.filter(q=>!selected.some(s=>s.id===q.id)), n-selected.length)]);
    state.session=selected.slice(0,n).map(makeSessionQuestion);
  } else {
    state.session=sample(pool,n).map(makeSessionQuestion);
  }
  state.idx=0; state.selected=null; state.answers=[];
  const minutes=Math.max(1, parseInt($('#examMinutes').value || '12', 10));
  state.endAt=(state.mode==='exam'||state.mode==='skill') ? Date.now()+minutes*60*1000 : null;
  if(state.endAt) state.timer=setInterval(tick,250);
  $('#sessionModeLabel').textContent = state.mode==='learn' ? 'Learning Mode' : state.mode==='exam' ? 'Exam Mode' : 'Skill IQ-style Sprint';
  $('#sessionTitle').textContent = state.mode==='skill' ? 'Mixed timed practice' : 'Question Session';
  closeSetupRail();
  showView('session');
  renderQuestion();
  tick();
}
function tick(){
  if(!state.endAt){ $('#timer').textContent='Practice'; return; }
  const remain=Math.max(0, state.endAt-Date.now()); const sec=Math.ceil(remain/1000); const m=Math.floor(sec/60), s=sec%60;
  $('#timer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  if(sec<=0){ clearInterval(state.timer); finishSession(); }
}
function renderQuestion(){
  const q=state.session[state.idx];
  state.selected=null;
  if(!q){
    $('#progressText').textContent='0/0';
    $('#progressFill').style.width='0%';
    $('#liveScore').textContent='0%';
    $('#qBank').textContent='No active question';
    $('#qTopic').textContent='Check filters';
    $('#qDifficulty').textContent='';
    $('#questionText').textContent='No question could be loaded. Go back to Setup, select at least one bank, and start again.';
    $('#choices').innerHTML='';
    $('#feedback').className='feedback bad';
    $('#feedback').innerHTML='<h3>No question loaded</h3><p>This usually means the selected filters returned no usable questions or a previous mobile overlay interrupted the session. Return to Setup and start a new session.</p>';
    $('#submitAnswer').classList.add('hidden');
    $('#nextQuestion').classList.add('hidden');
    return;
  }
  $('#submitAnswer').classList.remove('hidden');
  const safeLen = Math.max(1, state.session.length);
  $('#progressText').textContent=`${state.idx+1}/${state.session.length}`;
  $('#progressFill').style.width=`${Math.round((state.idx/safeLen)*100)}%`;
  $('#liveScore').textContent=`${pct(state.answers.filter(a=>a.correct).length,state.answers.length)}%`;
  $('#qBank').textContent=q.bank; $('#qTopic').textContent=q.topic; $('#qDifficulty').textContent=q.difficulty;
  $('#questionText').textContent=q.question;
  $('#choices').innerHTML=q.options.map((o,i)=>`<button class="choice" data-i="${i}"><span class="letter">${String.fromCharCode(65+i)}</span><span>${esc(o.text)}</span></button>`).join('');
  $$('#choices .choice').forEach(btn=>btn.addEventListener('click',()=>selectChoice(parseInt(btn.dataset.i,10))));
  $('#feedback').className='feedback hidden'; $('#feedback').innerHTML='';
  $('#submitAnswer').classList.remove('hidden'); $('#submitAnswer').disabled=false; $('#nextQuestion').classList.add('hidden');
}
function selectChoice(i){ state.selected=i; $$('#choices .choice').forEach((b,idx)=>b.classList.toggle('selected',idx===i)); }
function submitAnswer(){
  if(state.selected==null){ alert('Select an answer first.'); return; }
  const q=state.session[state.idx];
  if(!q){ alert('No active question is loaded. Please return to setup and start again.'); return; }
  if(q.selectedIndex !== null){ return; }
  const correct=state.selected===q.correctOptionIndex;
  q.selectedIndex=state.selected; q.isCorrect=correct;
  state.answers.push({id:q.id, correct, selected:state.selected, correctIndex:q.correctOptionIndex, question:q}); markAnswered(q, correct);
  if(state.mode==='learn'){
    $$('#choices .choice').forEach((b,idx)=>{ b.disabled=true; if(idx===q.correctOptionIndex)b.classList.add('correct'); if(idx===state.selected && !correct)b.classList.add('wrong'); });
    $('#feedback').className=`feedback ${correct?'good':'bad'}`;
    $('#feedback').innerHTML=`<h3>${correct?'Correct':'Wrong'}</h3><p><b>Correct answer:</b> ${String.fromCharCode(65+q.correctOptionIndex)}. ${esc(q.options[q.correctOptionIndex].text)}</p><p>${esc(q.explanation)}</p>`;
    $('#submitAnswer').classList.add('hidden'); $('#nextQuestion').classList.remove('hidden');
    $('#liveScore').textContent=`${pct(state.answers.filter(a=>a.correct).length,state.answers.length)}%`;
  } else nextQuestion();
}
function nextQuestion(){ if(!state.session.length){ showView('setup'); return; } if(state.idx < state.session.length-1){ state.idx++; renderQuestion(); } else finishSession(); }
function finishSession(){
  clearInterval(state.timer); if(!state.session.length) return;
  const total=state.session.length, answered=state.answers.length, correct=state.answers.filter(a=>a.correct).length, score=pct(correct,total); saveBest(score);
  const byDiff=countBreakdown('difficulty'), byTopic=countBreakdown('topic'), byBank=countBreakdown('bank');
  const band=score>=85?'Advanced-ready':score>=72?'Strong, revise misses':score>=58?'Developing': 'Needs focused review';
  $('#resultsPanel').style.setProperty('--score', `${score}%`);
  $('#resultsPanel').innerHTML=`<div class="result-hero"><div class="big-percent">${score}%</div><div><p class="eyebrow">Session complete</p><h1>${correct}/${total} correct</h1><p>Answered ${answered}/${total}. Band: <b>${band}</b>. Use the review section to repeat weak topics in Learning Mode.</p><div class="action-row"><button class="primary" id="retryBtn">Retry random set</button><button class="secondary" id="setupBtn2">Back to setup</button></div></div></div>
  <h2>Breakdown by difficulty</h2><div class="breakdown">${breakdownCards(byDiff)}</div>
  <h2>Breakdown by topic</h2><div class="breakdown">${breakdownCards(byTopic,12)}</div>
  <h2>Breakdown by bank</h2><div class="breakdown">${breakdownCards(byBank,8)}</div>
  <h2>Review</h2><div class="review-list">${reviewList()}</div>`;
  $('#retryBtn').addEventListener('click', startSession); $('#setupBtn2').addEventListener('click', () => showView('setup'));
  showView('results');
}
function countBreakdown(field){
  const obj={}; state.session.forEach(q=>{ const k=q[field]; obj[k]=obj[k]||{c:0,t:0}; obj[k].t++; });
  state.answers.forEach(a=>{ if(a.correct){ const k=a.question[field]; obj[k].c++; }}); return obj;
}
function breakdownCards(obj,limit=99){ return Object.entries(obj).sort((a,b)=>b[1].t-a[1].t || a[0].localeCompare(b[0])).slice(0,limit).map(([k,v])=>`<div class="break-card"><b>${esc(k)}</b><p>${v.c}/${v.t} correct • ${pct(v.c,v.t)}%</p></div>`).join(''); }
function reviewList(){
  return state.session.map((q,i)=>{ const a=state.answers.find(x=>x.id===q.id); const cls=!a?'skipped':a.correct?'correct':'wrong'; const sel=a?q.options[a.selected].text:'Not answered'; return `<div class="review-item ${cls}"><p><b>${i+1}. ${esc(q.question)}</b></p><p>${!a?'Skipped':a.correct?'Correct':'Wrong'} • Your answer: ${esc(sel)}</p><p><b>Correct:</b> ${esc(q.options[q.correctOptionIndex].text)}</p><p>${esc(q.explanation)}</p></div>`; }).join('');
}

function renderConcepts(activate=true){
  const cat=$('#conceptCategory').value || 'All'; const cards=CONCEPTS.filter(c=>cat==='All'||c.category===cat);
  $('#conceptPanel').innerHTML=`<div class="concept-head panel"><div><p class="eyebrow">Concept Mode</p><h1>${esc(cat)} Knowledge Cards</h1><p>Study these before practice. Each card focuses on common reasoning traps in Skill IQ-style questions.</p></div><button class="primary" id="conceptPracticeBtn">Practice questions</button></div><div class="concept-grid">${cards.map(c=>`<article class="concept-card"><span class="mini-badge">${esc(c.category)}</span><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p><ul>${(c.keyPoints||[]).map(k=>`<li>${esc(k)}</li>`).join('')}</ul><div class="pitfall"><b>Test trap:</b> ${esc(c.pitfall||'')}</div></article>`).join('')}</div>`;
  $('#conceptPracticeBtn').addEventListener('click', () => { setMode('learn'); showView('setup'); });
  if(activate) showView('concepts');
}

async function parseImportFile(){
  const file = $('#importFile').files && $('#importFile').files[0];
  if(!file){ alert('Choose a PDF, TXT, MD, or JSON file first.'); return; }
  $('#importStatus').textContent = 'Reading file...';
  $('#saveImportedBtn').disabled = true;
  parsedImport = [];
  try {
    const defaults = getImportDefaults();
    let parsed = [];
    const name = file.name.toLowerCase();
    if(name.endsWith('.json') || file.type.includes('json')){
      const json = JSON.parse(await file.text());
      const arr = Array.isArray(json) ? json : (json.questions || []);
      parsed = arr.map((q,i)=>normalizeImportedQuestion(q,i,defaults)).filter(Boolean);
    } else {
      const text = name.endsWith('.pdf') || file.type === 'application/pdf' ? await extractPdfText(file) : await file.text();
      parsed = parseQuestionsFromText(text, defaults);
    }
    parsedImport = parsed;
    renderImportStats();
    if(parsed.length){
      $('#importStatus').innerHTML = `<b>${parsed.length}</b> questions parsed successfully. Review the preview, then save them.`;
      $('#saveImportedBtn').disabled = false;
    } else {
      $('#importStatus').innerHTML = `No valid questions were found. Use the template format, or upload a selectable-text PDF rather than a scanned image PDF.`;
    }
  } catch(err){
    console.error(err);
    $('#importStatus').innerHTML = `Could not import this file. ${esc(err.message || err)}.`;
  }
}
function getImportDefaults(){
  return {
    bank: $('#importBank').value.trim() || 'Custom Imported Questions',
    topic: $('#importTopic').value.trim() || 'Imported Practice',
    difficulty: $('#importDifficulty').value || 'Hard'
  };
}
async function extractPdfText(file){
  await ensurePdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await window.pdfjsLib.getDocument({data}).promise;
  let text = '';
  for(let pageNo=1; pageNo<=pdf.numPages; pageNo++){
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    // PDF.js often returns words/fragments, not lines. Group by visual Y-position
    // so numbered questions/options remain parseable instead of becoming one huge line.
    const rows = [];
    for(const item of content.items){
      const str = String(item.str || '').trim();
      if(!str) continue;
      const t = item.transform || [0,0,0,0,0,0];
      const x = Math.round(t[4] || 0);
      const y = Math.round(t[5] || 0);
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if(!row){ row = {y, items:[]}; rows.push(row); }
      row.items.push({x, str});
    }
    rows.sort((a,b)=>b.y-a.y);
    const pageLines = rows.map(row => row.items.sort((a,b)=>a.x-b.x).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean);
    text += `\n\n${pageLines.join('\n')}`;
  }
  return text;
}
function ensurePdfJs(){
  if(window.pdfjsLib) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; } catch(e){}
      resolve();
    };
    script.onerror = () => reject(new Error('PDF parsing needs the PDF.js library. Use internet/hosted mode for PDF import, or convert the PDF to TXT/JSON and import that offline.'));
    document.head.appendChild(script);
  });
}
function parseQuestionsFromText(text, defaults){
  const normalized = normalizeImportText(text);
  const blocks = splitQuestionBlocks(normalized);
  const out=[];
  blocks.forEach((block, i) => {
    const q = parseQuestionBlock(block, i, defaults);
    if(q) out.push(q);
  });
  return out;
}
function normalizeImportText(text){
  let cleaned = String(text || '')
    .replace(/\r/g,'\n')
    .replace(/\u00a0/g,' ')
    .replace(/[“”]/g,'"')
    .replace(/[’]/g,"'");

  // Remove common PDF headers/footers and front-matter noise that otherwise becomes question text.
  cleaned = cleaned
    .replace(/Advanced\s+LLM\/RAG\s+Question\s+Bank\s*\|\s*Page\s*\d+/gi, '\n')
    .replace(/\bPage\s+\d+\b/gi, '\n')
    .replace(/Import-ready\s+question\s+bank[\s\S]*?(?=\n?\s*(?:Q(?:uestion)?\s*)?1[\)\.\:\-]\s+)/i, '\n');

  // Force structural markers onto their own lines. This is crucial for PDF.js text extraction.
  cleaned = cleaned
    .replace(/\s+(Correct\s+Answer|Answer|Correct|Ans)\s*[:\-]/gi, '\n$1:')
    .replace(/\s+(Explanation|Rationale|Topic|Bank|Difficulty)\s*[:\-]/gi, '\n$1:')
    .replace(/\s+([A-D])[\)\.\:\-]\s+/g, '\n$1. ')
    .replace(/(^|\s)(?:Q(?:uestion)?\s*)?(\d{1,3})[\)\.\:\-]\s+(?=[A-Z0-9"'])/gi, '\n@@Q@@ $2. ')
    .replace(/\n{3,}/g,'\n\n');

  // Drop any text before the first detected question marker.
  const first = cleaned.indexOf('@@Q@@');
  if(first > -1) cleaned = cleaned.slice(first);
  return cleaned.trim();
}
function splitQuestionBlocks(cleaned){
  let blocks = cleaned.split('@@Q@@').map(x=>x.trim()).filter(Boolean);
  // Keep only blocks that look like actual MCQs.
  blocks = blocks.filter(b => /\n\s*A[\)\.\:\-]\s+/i.test(b) && /\n\s*B[\)\.\:\-]\s+/i.test(b) && /\n\s*C[\)\.\:\-]\s+/i.test(b) && /\n\s*D[\)\.\:\-]\s+/i.test(b) && /(?:Correct\s+Answer|Answer|Correct|Ans)\s*[:\-]?\s*[A-D]\b/i.test(b));
  if(blocks.length) return blocks;

  // Fallback for hand-written TXT/MD where the question number starts at line beginning.
  return cleaned
    .replace(/(^|\n)\s*(?:Q(?:uestion)?\s*)?(\d{1,3})[\)\.\:\-]\s+/gi, '\n@@Q@@ $2. ')
    .split('@@Q@@')
    .map(x=>x.trim())
    .filter(b => /\n\s*A[\)\.\:\-]\s+/i.test(b) && /\n\s*D[\)\.\:\-]\s+/i.test(b));
}
function extractField(block, labelRegex, stopLabels){
  const re = new RegExp(labelRegex + '\\s*[:\\-]\\s*([\\s\\S]*?)(?=\\n\\s*(?:' + stopLabels + ')\\s*[:\\-]|$)', 'i');
  const m = block.match(re);
  return m ? m[1].replace(/\s+/g,' ').trim() : '';
}
function parseQuestionBlock(block, index, defaults){
  if(!block || !block.trim()) return null;
  block = block.replace(/\n{2,}/g,'\n').trim();

  const answerMatch = block.match(/(?:Correct\s+Answer|Answer|Correct|Ans)\s*[:\-]?\s*([A-D])\b/i);
  if(!answerMatch) return null;
  const answerLetter = answerMatch[1].toUpperCase();
  const answerIndex = 'ABCD'.indexOf(answerLetter);

  const stopLabels = 'Correct\\s+Answer|Answer|Correct|Ans|Explanation|Rationale|Bank|Topic|Difficulty';
  const explanation = extractField(block, '(?:Explanation|Rationale)', stopLabels) || 'Imported question. Add an explanation in the source file for better learning mode feedback.';
  const bank = extractField(block, 'Bank', stopLabels) || defaults.bank;
  const topic = extractField(block, 'Topic', stopLabels) || defaults.topic;
  let difficulty = extractField(block, 'Difficulty', stopLabels) || defaults.difficulty;
  difficulty = /^very\s+hard$/i.test(difficulty) ? 'Very Hard' : (/^medium$/i.test(difficulty) ? 'Medium' : (/^hard$/i.test(difficulty) ? 'Hard' : defaults.difficulty));

  const stemAndOptions = block.slice(0, answerMatch.index).trim();
  const markerRegex = /\n\s*([A-D])[\)\.\:\-]\s*/gi;
  const markers = [];
  let m;
  while((m = markerRegex.exec(stemAndOptions)) !== null){ markers.push({letter:m[1].toUpperCase(), start:m.index, end:markerRegex.lastIndex}); }
  if(markers.length < 4) return null;

  let questionText = stemAndOptions.slice(0, markers[0].start)
    .replace(/^(?:Q(?:uestion)?\s*)?\d{1,3}[\)\.\:\-]\s*/i,'')
    .replace(/\s+/g,' ')
    .trim();

  // Defensive cleanup if a PDF title still slipped in.
  const embeddedQ = questionText.match(/(?:^|\s)(?:Q(?:uestion)?\s*)?\d{1,3}[\)\.\:\-]\s+(.+)$/i);
  if(embeddedQ && questionText.length > embeddedQ[1].length + 20) questionText = embeddedQ[1].trim();

  const optionMap = {};
  for(let i=0; i<markers.length; i++){
    const cur = markers[i];
    const next = markers[i+1];
    const raw = stemAndOptions.slice(cur.end, next ? next.start : stemAndOptions.length)
      .replace(/\s+/g,' ')
      .trim();
    if(['A','B','C','D'].includes(cur.letter) && !optionMap[cur.letter]) optionMap[cur.letter] = raw;
  }
  const choices = ['A','B','C','D'].map(l => (optionMap[l] || '').trim());
  return normalizeImportedQuestion({
    id: `import_${index}_${Date.now()}`,
    bank, topic, difficulty,
    question: questionText,
    choices,
    answerIndex,
    answerLetter,
    explanation,
    source: 'Imported from user file'
  }, index, defaults);
}
function saveParsedQuestions(){
  if(!parsedImport.length){ alert('Parse a valid file first.'); return; }
  const replace = $('#replaceCustom').checked;
  const existing = replace ? [] : loadCustomQuestions();
  const existingKeys = new Set(existing.map(q => `${q.question}__${q.choices.join('|')}`));
  const merged = [...existing];
  let added = 0, skipped = 0;
  const savedBanks = new Set();
  const savedTopics = new Set();
  parsedImport.forEach(q => {
    const key = `${q.question}__${q.choices.join('|')}`;
    if(!existingKeys.has(key)){
      merged.push(q); existingKeys.add(key); added++;
      savedBanks.add(q.bank); savedTopics.add(q.topic);
    } else { skipped++; }
  });
  saveCustomQuestions(merged);
  customQuestions = merged;
  QUESTIONS = mergeQuestionSets(BASE_QUESTIONS, customQuestions);

  // Make the newly imported bank immediately visible and usable.
  if(savedBanks.size){
    state.banks = new Set(savedBanks);
    state.topics.clear(); // topics are optional; all topics inside selected imported bank(s) are included.
    $('#bankSearch').value = '';
    $('#topicSearch').value = '';
    $('#selectedOnly').checked = false;
  }

  pruneTopicSelections();
  renderFilters();
  renderDashboard();
  updatePoolPreview();
  renderImportStats();

  const banksText = [...(savedBanks.size ? savedBanks : new Set(parsedImport.map(q=>q.bank)))].slice(0,4).map(esc).join(', ');
  const topicsText = [...(savedTopics.size ? savedTopics : new Set(parsedImport.map(q=>q.topic)))].slice(0,6).map(esc).join(', ');
  $('#importStatus').innerHTML = `<b>${added}</b> questions added to the app${skipped ? `, <b>${skipped}</b> duplicate(s) skipped` : ''}.<br>
    <span>Banks: ${banksText || 'Imported bank'}</span><br>
    <span>Topics: ${topicsText || 'Imported topics'}</span><br>
    <small>The imported bank is now selected in Practice Setup. Topics are optional filters, so leaving them unselected uses all imported topics.</small>
    <div class="action-row"><button class="primary" id="practiceImportedBtn">Practice imported bank now</button><button class="secondary" id="goSetupAfterImportBtn">Go to setup</button></div>`;
  const practiceBtn = $('#practiceImportedBtn');
  const setupBtn = $('#goSetupAfterImportBtn');
  if(practiceBtn) practiceBtn.addEventListener('click', () => { showView('setup'); startSession(); });
  if(setupBtn) setupBtn.addEventListener('click', () => showView('setup'));
}
function renderImportStats(){
  const custom = loadCustomQuestions();
  const countBadge = $('#customCountBadge');
  if(countBadge) countBadge.textContent = `${custom.length} custom`;
  const parsedBadge = $('#parsedCountBadge');
  if(parsedBadge) parsedBadge.textContent = `${parsedImport.length} parsed`;

  const summary = $('#customLibrarySummary');
  if(summary){
    if(!custom.length){
      summary.innerHTML = `<div class="empty">No saved imported questions yet. Parse a file, then click <b>Save parsed questions to app</b>.</div>`;
    } else {
      const byBank = {}; const byTopic = {}; const byDiff = {};
      custom.forEach(q=>{ byBank[q.bank]=(byBank[q.bank]||0)+1; byTopic[q.topic]=(byTopic[q.topic]||0)+1; byDiff[q.difficulty]=(byDiff[q.difficulty]||0)+1; });
      const topBanks = Object.entries(byBank).sort((a,b)=>b[1]-a[1]).slice(0,6);
      const topTopics = Object.entries(byTopic).sort((a,b)=>b[1]-a[1]).slice(0,8);
      summary.innerHTML = `<h3>Saved imported library</h3>
        <div class="mini-summary-grid">
          <div><b>${custom.length}</b><span>saved custom MCQs</span></div>
          <div><b>${Object.keys(byBank).length}</b><span>custom banks</span></div>
          <div><b>${Object.keys(byTopic).length}</b><span>custom topics</span></div>
        </div>
        <p><b>Banks:</b> ${topBanks.map(([k,v])=>`${esc(k)} (${v})`).join(', ')}</p>
        <p><b>Topics:</b> ${topTopics.map(([k,v])=>`${esc(k)} (${v})`).join(', ')}</p>`;
    }
  }

  const preview = $('#parsedPreview');
  if(preview){
    if(!parsedImport.length){ preview.className='parsed-preview empty'; preview.textContent='No parsed questions yet.'; }
    else {
      preview.className='parsed-preview';
      preview.innerHTML = parsedImport.slice(0,12).map((q,i)=>`<article class="parsed-item"><span class="mini-badge">${esc(q.difficulty)}</span><h3>${i+1}. ${esc(q.question)}</h3><p><b>Bank:</b> ${esc(q.bank)} • <b>Topic:</b> ${esc(q.topic)}</p><p><b>Answer:</b> ${esc(q.answerLetter)}. ${esc(q.choices[q.answerIndex])}</p></article>`).join('') + (parsedImport.length>12 ? `<div class="empty">Showing first 12 of ${parsedImport.length} parsed questions.</div>` : '');
    }
  }
}
function serializeQuestionsTxt(questions){
  return questions.map((q,i)=>`${i+1}. ${q.question}\nA. ${q.choices[0] || ''}\nB. ${q.choices[1] || ''}\nC. ${q.choices[2] || ''}\nD. ${q.choices[3] || ''}\nAnswer: ${q.answerLetter || 'ABCD'[q.answerIndex]}\nExplanation: ${q.explanation || ''}\nBank: ${q.bank || 'Custom Imported Questions'}\nTopic: ${q.topic || 'Imported Practice'}\nDifficulty: ${q.difficulty || 'Hard'}`).join('\n\n');
}
function exportCustomQuestions(){
  const custom = loadCustomQuestions();
  if(!custom.length){ alert('No imported questions to export yet.'); return; }
  const ok = downloadBlob(JSON.stringify({questions: custom}, null, 2), 'custom_questions_export.json', 'application/json');
  setImportStatusAfterDownload(ok, 'custom_questions_export.json');
}
function exportCustomQuestionsTxt(){
  const custom = loadCustomQuestions();
  if(!custom.length){ alert('No imported questions to export yet.'); return; }
  const ok = downloadBlob(serializeQuestionsTxt(custom), 'custom_questions_export.txt', 'text/plain');
  setImportStatusAfterDownload(ok, 'custom_questions_export.txt');
}
function downloadQuestionTemplate(){
  const template = `1. Scenario-based question text here?\nA. First option\nB. Second option\nC. Third option\nD. Fourth option\nAnswer: B\nExplanation: Explain why B is correct and why others are weaker.\nBank: Custom Prompt Engineering\nTopic: Prompt injection\nDifficulty: Very Hard\n\n2. Another question?\nA. Option A\nB. Option B\nC. Option C\nD. Option D\nAnswer: C\nExplanation: Add explanation here.\nBank: Custom LLM Evaluation\nTopic: LLM evaluation\nDifficulty: Hard\n`;
  const ok = downloadBlob(template, 'question_import_template.txt', 'text/plain');
  setImportStatusAfterDownload(ok, 'question_import_template.txt');
}
function setImportStatusAfterDownload(ok, filename){
  const status = $('#importStatus');
  if(!status) return;
  status.innerHTML = ok ? `Download started: <b>${esc(filename)}</b>. If your browser blocks downloads from local files, host the app or use another browser.` : `Could not start an automatic download. Try hosting the app, or use Export custom TXT/JSON again in a desktop browser.`;
}
function clearCustomQuestions(){
  if(confirm('Remove all imported custom questions from this browser? Built-in questions will remain.')){
    saveCustomQuestions([]); parsedImport=[]; refreshQuestionBankViews(); $('#importStatus').textContent='Imported questions cleared.';
  }
}
function downloadBlob(text, filename, type){
  try {
    const blob = new Blob([text], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
    setTimeout(() => { try{ URL.revokeObjectURL(url); a.remove(); }catch(e){} }, 1600);
    return true;
  } catch(e) {
    try {
      const dataUrl = `data:${type};charset=utf-8,${encodeURIComponent(text)}`;
      window.open(dataUrl, '_blank', 'noopener');
    } catch(_e){}
    return false;
  }
}

window.addEventListener('DOMContentLoaded', init);
